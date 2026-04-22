import Constants from 'expo-constants';

import { isQuestAssistFoodRelated } from '../utils/nutritionGoalDetection';
import {
  isQuestAssistExerciseRelated,
  userWantsExerciseVisuals,
} from '../utils/exerciseGoalDetection';

const MODEL = 'gpt-4o-mini';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

function getOpenAiApiKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  const trimmedProcess = typeof fromProcess === 'string' ? fromProcess.trim() : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtraRaw =
    extra && typeof extra === 'object' && extra !== null && 'openAiApiKey' in extra
      ? (extra as { openAiApiKey?: unknown }).openAiApiKey
      : undefined;
  const trimmedExtra = typeof fromExtraRaw === 'string' ? fromExtraRaw.trim() : '';

  if (trimmedProcess.length > 0) return trimmedProcess;
  if (trimmedExtra.length > 0) return trimmedExtra;
  return '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export type QuestAssistHistoryEntry = {
  role: 'user' | 'assistant';
  text: string;
  /** Spoonacular ids for cards the assistant attached (most recent turn). */
  recipeIds?: number[];
  /** When the assistant showed a full recipe card. */
  fullRecipeSpoonacularId?: number;
  /** ExerciseDB ids for exercise cards the assistant attached. */
  exerciseIds?: string[];
  /** When the assistant showed full exercise instructions. */
  fullExerciseId?: string;
};

export type QuestAssistPlan = {
  intent:
    | 'chat_only'
    | 'suggest_recipes'
    | 'nutrition_for_recipe'
    | 'full_recipe'
    | 'suggest_exercises'
    | 'full_exercise';
  reply: string;
  nutritionRecipeId: number | null;
  nutritionRecipeTitleHint: string | null;
  fullRecipeSpoonacularId: number | null;
  fullRecipeTitleHint: string | null;
  fullExerciseId: string | null;
  fullExerciseNameHint: string | null;
};

const PLANNER_SYSTEM = `You are the routing brain for a short "quest assist" chat. The app may attach recipe cards, full recipes (ingredients + steps), or nutrient data from Spoonacular, and/or exercise cards and full exercise instructions from ExerciseDB—you decide what is needed for this turn.

Output a single JSON object only (no markdown fences) with exactly these keys:
- "intent": one of "chat_only", "suggest_recipes", "nutrition_for_recipe", "full_recipe", "suggest_exercises", "full_exercise"
- "reply": string — plain text, no markdown. Must **directly answer** the user's latest message in a natural way.
- "nutritionRecipeId": number or null — use when intent is nutrition_for_recipe and the recipe is in "Recipes shown in this chat".
- "nutritionRecipeTitleHint": string or null — only if nutrition id is unknown: best dish name to search.
- "fullRecipeSpoonacularId": number or null — use when intent is full_recipe and the recipe is in "Recipes shown in this chat".
- "fullRecipeTitleHint": string or null — when user names a dish not in the list, or id unknown: dish name to look up.
- "fullExerciseId": string or null — use when intent is full_exercise and the exercise is in "Exercises shown in this chat" (string id).
- "fullExerciseNameHint": string or null — when the user names a movement not in the list, or id unknown: exercise name to look up.

Intent rules (food):
1) **full_recipe** — User wants **ingredients and/or step-by-step instructions** for a **specific** dish ("recipe for lasagna", "how do I make X", "how to cook", "what goes in…"). Prefer an id from the recipe list when they refer to a shown card. **Do not** use for vague "more ideas" without a specific dish.

2) **nutrition_for_recipe** — User asks how nutritious/healthy something is, calories, macros, for **one** dish. Pick id from the list when they say "this recipe", etc.

3) **suggest_recipes** — User wants **new** meal/recipe **ideas** ("what should I cook", food-focused "more options"). Card grid only.

Intent rules (exercise):
4) **full_exercise** — User wants **how to perform** a **specific** movement ("how do I do a squat", "proper form for deadlift", "steps for this exercise", "walk me through this move"), **or** wants a **GIF / picture / animation / demo** of one specific exercise. Prefer an id from the exercise list when they refer to a shown card. **Not** for vague "give me workout ideas".

5) **suggest_exercises** — User wants **new** exercise or workout **ideas** ("what should I do for legs", "more exercises", movement ideas). Card grid only. If they also ask for **images/GIFs** of several exercises already listed, you may answer with **chat_only** and a short line—the app can attach demos for exercises already in context.

6) **chat_only** — Motivation, planning, generic tips without needing recipe/nutrition/exercise API data.

**Critical:** Only one intent per turn. Prefer the **latest user message**: if they clearly mean food, use a food intent; if they clearly mean training/movement, use an exercise intent. "Recipe for X" → **full_recipe**. "How do I do X" (exercise) → **full_exercise**. "Show me a GIF/image of this exercise" (one movement) → **full_exercise**. "Show me GIFs for all of those" (several already listed) → **chat_only** with a brief reply.

Reply rules:
- **full_recipe**: 1–2 short sentences; the app will show ingredients and steps below. Do not invent ingredients.
- **nutrition_for_recipe**: 1–2 sentences; app appends nutrient list.
- **suggest_recipes**: one short intro; recipe cards below.
- **full_exercise**: 1–2 short sentences; app will show instructions below. Do not invent steps.
- **suggest_exercises**: one short intro; exercise cards below.
- **chat_only**: complete answer in "reply".`;

function buildPlannerUserPayload(params: {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  recentRecipes: { id: number; title: string }[];
  recentExercises: { id: string; name: string }[];
  history: QuestAssistHistoryEntry[];
  latestUserMessage: string;
}): string {
  const prior = params.history
    .filter((h) => h.text.trim().length > 0)
    .map((h) => {
      const ids =
        h.role === 'assistant' && h.recipeIds && h.recipeIds.length > 0
          ? ` [recipe card ids: ${h.recipeIds.join(', ')}]`
          : '';
      const fullId =
        h.role === 'assistant' &&
        typeof h.fullRecipeSpoonacularId === 'number' &&
        Number.isFinite(h.fullRecipeSpoonacularId)
          ? ` [full recipe id: ${h.fullRecipeSpoonacularId}]`
          : '';
      const exIds =
        h.role === 'assistant' && h.exerciseIds && h.exerciseIds.length > 0
          ? ` [exercise card ids: ${h.exerciseIds.join(', ')}]`
          : '';
      const fullEx =
        h.role === 'assistant' &&
        typeof h.fullExerciseId === 'string' &&
        h.fullExerciseId.trim().length > 0
          ? ` [full exercise id: ${h.fullExerciseId.trim()}]`
          : '';
      return `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text.trim()}${ids}${fullId}${exIds}${fullEx}`;
    })
    .join('\n');

  return [
    '## Goal context',
    `Goal: ${params.goalTitle}`,
    `Goal details: ${params.goalDescription}`,
    `Time-bound: ${params.goalTimeBound}`,
    `Today's quest: ${params.questTitle}`,
    `Quest details: ${params.questDescription}`,
    '',
    '## Recipes already shown in this chat (id → title). Use ids for nutrition_for_recipe and full_recipe when the user refers to them.',
    JSON.stringify(params.recentRecipes),
    '',
    '## Exercises already shown in this chat (id → name). Use ids for full_exercise when the user refers to them.',
    JSON.stringify(params.recentExercises),
    '',
    '## Conversation so far',
    prior.length > 0 ? prior : '(no prior messages)',
    '',
    '## Latest user message',
    params.latestUserMessage,
  ].join('\n');
}

function parseQuestAssistPlan(content: string): QuestAssistPlan | null {
  let s = content.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(s) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const intent = raw.intent;
  if (
    intent !== 'chat_only' &&
    intent !== 'suggest_recipes' &&
    intent !== 'nutrition_for_recipe' &&
    intent !== 'full_recipe' &&
    intent !== 'suggest_exercises' &&
    intent !== 'full_exercise'
  ) {
    return null;
  }
  const reply = typeof raw.reply === 'string' ? raw.reply.trim() : '';
  let nutritionRecipeId: number | null = null;
  if (typeof raw.nutritionRecipeId === 'number' && Number.isFinite(raw.nutritionRecipeId)) {
    nutritionRecipeId = raw.nutritionRecipeId;
  }
  const nutritionRecipeTitleHint =
    typeof raw.nutritionRecipeTitleHint === 'string' && raw.nutritionRecipeTitleHint.trim()
      ? raw.nutritionRecipeTitleHint.trim()
      : null;

  let fullRecipeSpoonacularId: number | null = null;
  if (
    typeof raw.fullRecipeSpoonacularId === 'number' &&
    Number.isFinite(raw.fullRecipeSpoonacularId)
  ) {
    fullRecipeSpoonacularId = raw.fullRecipeSpoonacularId;
  }
  const fullRecipeTitleHint =
    typeof raw.fullRecipeTitleHint === 'string' && raw.fullRecipeTitleHint.trim()
      ? raw.fullRecipeTitleHint.trim()
      : null;

  let fullExerciseId: string | null = null;
  if (typeof raw.fullExerciseId === 'string' && raw.fullExerciseId.trim()) {
    fullExerciseId = raw.fullExerciseId.trim();
  } else if (typeof raw.fullExerciseId === 'number' && Number.isFinite(raw.fullExerciseId)) {
    fullExerciseId = String(raw.fullExerciseId);
  }
  const fullExerciseNameHint =
    typeof raw.fullExerciseNameHint === 'string' && raw.fullExerciseNameHint.trim()
      ? raw.fullExerciseNameHint.trim()
      : null;

  return {
    intent,
    reply,
    nutritionRecipeId,
    nutritionRecipeTitleHint,
    fullRecipeSpoonacularId,
    fullRecipeTitleHint,
    fullExerciseId,
    fullExerciseNameHint,
  };
}

const emptyHints = (): Pick<
  QuestAssistPlan,
  | 'nutritionRecipeId'
  | 'nutritionRecipeTitleHint'
  | 'fullRecipeSpoonacularId'
  | 'fullRecipeTitleHint'
  | 'fullExerciseId'
  | 'fullExerciseNameHint'
> => ({
  nutritionRecipeId: null,
  nutritionRecipeTitleHint: null,
  fullRecipeSpoonacularId: null,
  fullRecipeTitleHint: null,
  fullExerciseId: null,
  fullExerciseNameHint: null,
});

export function fallbackExerciseAssistIntro(hasExercises: boolean): string {
  return hasExercises
    ? 'Here are some exercise ideas that could fit your quest.'
    : 'Here is a quick thought for your quest—tell me if you want movement ideas or details.';
}

function heuristicPlan(params: {
  goalTitle: string;
  goalDescription: string;
  questTitle: string;
  questDescription: string;
  latestUserMessage: string;
  recentRecipes: { id: number; title: string }[];
  recentExercises: { id: string; name: string }[];
}): QuestAssistPlan {
  const u = params.latestUserMessage.toLowerCase();
  const recent = params.recentRecipes;
  const lastId = recent.length > 0 ? recent[recent.length - 1]!.id : null;
  const recentEx = params.recentExercises;
  const lastExerciseId =
    recentEx.length > 0 ? recentEx[recentEx.length - 1]!.id : null;

  const foodContext = isQuestAssistFoodRelated({
    goalTitle: params.goalTitle,
    goalDescription: params.goalDescription,
    questTitle: params.questTitle,
    questDescription: params.questDescription,
    userMessage: params.latestUserMessage,
  });

  const exerciseContext = isQuestAssistExerciseRelated({
    goalTitle: params.goalTitle,
    goalDescription: params.goalDescription,
    questTitle: params.questTitle,
    questDescription: params.questDescription,
    userMessage: params.latestUserMessage,
  });

  const foodLean =
    /\b(cook|eat|meal|recipe|food|dinner|lunch|breakfast|snack|ingredients)\b/.test(u);
  const exerciseLean =
    /\b(workout|exercise|exercises|lift|lifting|squat|deadlift|pushup|push-up|pullup|pull-up|rep|reps|set|sets|gym|run|cardio|muscle|stretch|mobility|legs|chest|back|core|arms)\b/.test(
      u,
    );

  const wantsNutrition =
    /\b(nutrit|nutrition|nutrients|calorie|calories|kcal|macro|macros|protein|carbs|carbohydrate|fat\b|vitamin|mineral|sodium|fiber|sugar)\b/.test(
      u,
    ) ||
    /\bhow\s+(healthy|nutritious)\b/.test(u) ||
    /\b(is it|is this)\s+(healthy|good for me|ok for)\b/.test(u);

  const wantsNewRecipes =
    /\b(what\s+should\s+i\s+(cook|eat|make)|meal\s+ideas?|recipe\s+ideas?|more\s+(ideas|options|recipes)|something\s+else|other\s+(ideas|recipes)|alternativ|give\s+me\s+(some\s+)?(recipes|ideas)|any\s+ideas)\b/.test(
      u,
    );

  const wantsNewExercises =
    /\b(workout\s+ideas?|exercise\s+ideas?|movement\s+ideas?|what\s+should\s+i\s+do\b|what\s+exercises?\b|more\s+(exercises|workouts|movements)|give\s+me\s+(some\s+)?(exercises|workouts|movements))\b/.test(
      u,
    ) ||
    /\bmore\s+(options|ideas)\b/.test(u) ||
    (exerciseContext && /\b(any|some)\s+ideas\b/.test(u) && !foodLean);

  const wantsExerciseVisuals =
    userWantsExerciseVisuals(params.latestUserMessage) &&
    exerciseContext &&
    !foodLean &&
    (exerciseLean || recentEx.length > 0);

  const wantsAllExerciseVisuals =
    wantsExerciseVisuals &&
    !wantsNewExercises &&
    /\b(all|each|every|those|these|them|ones|listed)\b/.test(u) &&
    recentEx.length > 1;

  if (wantsAllExerciseVisuals) {
    return {
      intent: 'chat_only',
      reply: '',
      ...emptyHints(),
    };
  }

  if (
    wantsExerciseVisuals &&
    !wantsNewExercises &&
    lastExerciseId != null &&
    recentEx.length >= 1
  ) {
    return {
      intent: 'full_exercise',
      reply: 'Here is the animated demo:',
      ...emptyHints(),
      fullExerciseId: lastExerciseId,
      fullExerciseNameHint: null,
    };
  }

  if (
    wantsExerciseVisuals &&
    !wantsNewExercises &&
    lastExerciseId == null &&
    exerciseLean
  ) {
    const hint = params.latestUserMessage.trim().slice(0, 120);
    return {
      intent: 'full_exercise',
      reply: 'Here is an animated demo:',
      ...emptyHints(),
      fullExerciseId: null,
      fullExerciseNameHint: hint || null,
    };
  }

  const wantsFullRecipe =
    /\b(recipe\s+for|how\s+(do\s+i|to)\s+make|how\s+to\s+cook|full\s+recipe|ingredients\s+(for|to)|step\s*by\s*step|instructions\s+for|cook\s+this|make\s+this)\b/.test(
      u,
    ) ||
    (/\bwalk\s+me\s+through\b/.test(u) && (foodContext || foodLean) && !exerciseLean);

  const wantsFullExercise =
    exerciseContext &&
    !wantsNewExercises &&
    (/\b(how\s+do\s+i\s+do|how\s+to\s+do|proper\s+form|form\s+for|technique|show\s+me\s+how(\s+to)?\s+do)\b/.test(
      u,
    ) ||
      /\b(full\s+)?(instructions?|breakdown)\s+for\s+(this|that|the\s+(exercise|move))\b/.test(
        u,
      ) ||
      (/\binstructions\s+for\b/.test(u) && !foodLean) ||
      (/\bwalk\s+me\s+through\b/.test(u) && (exerciseLean || exerciseContext) && !foodLean));

  if (wantsFullExercise) {
    if (lastExerciseId != null) {
      return {
        intent: 'full_exercise',
        reply: 'Here is how to perform the movement:',
        ...emptyHints(),
        fullExerciseId: lastExerciseId,
        fullExerciseNameHint: null,
      };
    }
    const hint = params.latestUserMessage.trim().slice(0, 120);
    return {
      intent: 'full_exercise',
      reply: 'Here are instructions that match what you asked for:',
      ...emptyHints(),
      fullExerciseId: null,
      fullExerciseNameHint: hint || null,
    };
  }

  if (wantsFullRecipe && !wantsNewRecipes && foodContext) {
    if (lastId != null) {
      return {
        intent: 'full_recipe',
        reply: 'Here is the full recipe with ingredients and steps:',
        ...emptyHints(),
        fullRecipeSpoonacularId: lastId,
        fullRecipeTitleHint: null,
      };
    }
    const hint = params.latestUserMessage.trim().slice(0, 120);
    return {
      intent: 'full_recipe',
      reply: 'Here is a recipe that matches what you asked for:',
      ...emptyHints(),
      fullRecipeSpoonacularId: null,
      fullRecipeTitleHint: hint || null,
    };
  }

  if (wantsNutrition && lastId != null && !wantsNewRecipes && foodContext) {
    return {
      intent: 'nutrition_for_recipe',
      reply: 'Here is a nutrient breakdown for that recipe (per-serving estimate):',
      ...emptyHints(),
      nutritionRecipeId: lastId,
      nutritionRecipeTitleHint: null,
    };
  }

  if (wantsNewRecipes && foodContext) {
    if (foodContext && exerciseContext && wantsNewExercises && exerciseLean && !foodLean) {
      return {
        intent: 'suggest_exercises',
        reply: fallbackExerciseAssistIntro(true),
        ...emptyHints(),
      };
    }
    return {
      intent: 'suggest_recipes',
      reply: fallbackQuestAssistIntro(true),
      ...emptyHints(),
    };
  }

  if (wantsNewExercises && exerciseContext) {
    if (foodContext && exerciseContext && foodLean && !exerciseLean) {
      return {
        intent: 'suggest_recipes',
        reply: fallbackQuestAssistIntro(true),
        ...emptyHints(),
      };
    }
    return {
      intent: 'suggest_exercises',
      reply: fallbackExerciseAssistIntro(true),
      ...emptyHints(),
    };
  }

  return {
    intent: 'chat_only',
    reply: '',
    ...emptyHints(),
  };
}

/**
 * Decide intent, reply text, and optional nutrition recipe id using conversation context.
 */
export async function planQuestAssistTurn(params: {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  recentRecipes: { id: number; title: string }[];
  recentExercises: { id: string; name: string }[];
  history: QuestAssistHistoryEntry[];
  latestUserMessage: string;
}): Promise<QuestAssistPlan> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return heuristicPlan({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      latestUserMessage: params.latestUserMessage,
      recentRecipes: params.recentRecipes,
      recentExercises: params.recentExercises,
    });
  }

  const userContent = buildPlannerUserPayload(params);

  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PLANNER_SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
    });
  } catch {
    return heuristicPlan({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      latestUserMessage: params.latestUserMessage,
      recentRecipes: params.recentRecipes,
      recentExercises: params.recentExercises,
    });
  }

  const raw = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    return heuristicPlan({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      latestUserMessage: params.latestUserMessage,
      recentRecipes: params.recentRecipes,
      recentExercises: params.recentExercises,
    });
  }

  const choices = raw.choices as unknown;
  if (!Array.isArray(choices) || choices.length === 0) {
    return heuristicPlan({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      latestUserMessage: params.latestUserMessage,
      recentRecipes: params.recentRecipes,
      recentExercises: params.recentExercises,
    });
  }
  const content = (choices[0] as { message?: { content?: string } })?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return heuristicPlan({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      latestUserMessage: params.latestUserMessage,
      recentRecipes: params.recentRecipes,
      recentExercises: params.recentExercises,
    });
  }

  const parsed = parseQuestAssistPlan(content);
  if (!parsed) {
    return heuristicPlan({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      latestUserMessage: params.latestUserMessage,
      recentRecipes: params.recentRecipes,
      recentExercises: params.recentExercises,
    });
  }
  return parsed;
}

export function fallbackQuestAssistIntro(hasRecipes: boolean): string {
  return hasRecipes
    ? 'Here are some meal ideas that could fit your quest and timeline.'
    : 'Here is a quick thought for your quest—tell me if you want to go deeper on any part.';
}

export function fallbackChatOnlyReply(): string {
  return 'What part of this quest do you want to tackle—timing, motivation, or something specific you’re stuck on?';
}
