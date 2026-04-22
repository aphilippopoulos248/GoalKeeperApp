import Constants from 'expo-constants';

import { isQuestAssistFoodRelated } from '../utils/nutritionGoalDetection';

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
};

export type QuestAssistPlan = {
  intent: 'chat_only' | 'suggest_recipes' | 'nutrition_for_recipe' | 'full_recipe';
  reply: string;
  nutritionRecipeId: number | null;
  nutritionRecipeTitleHint: string | null;
  fullRecipeSpoonacularId: number | null;
  fullRecipeTitleHint: string | null;
};

const PLANNER_SYSTEM = `You are the routing brain for a short "quest assist" chat. The app may attach recipe cards, full recipes (ingredients + steps), or nutrient data from Spoonacular—you decide what is needed for this turn.

Output a single JSON object only (no markdown fences) with exactly these keys:
- "intent": one of "chat_only", "suggest_recipes", "nutrition_for_recipe", "full_recipe"
- "reply": string — plain text, no markdown. Must **directly answer** the user's latest message in a natural way.
- "nutritionRecipeId": number or null — use when intent is nutrition_for_recipe and the recipe is in "Recipes shown in this chat".
- "nutritionRecipeTitleHint": string or null — only if nutrition id is unknown: best dish name to search.
- "fullRecipeSpoonacularId": number or null — use when intent is full_recipe and the recipe is in "Recipes shown in this chat".
- "fullRecipeTitleHint": string or null — when user names a dish not in the list, or id unknown: dish name to look up.

Intent rules:
1) **full_recipe** — User wants **ingredients and/or step-by-step instructions** for a **specific** dish ("recipe for lasagna", "how do I make X", "full instructions", "what goes in…", "walk me through"). Prefer an id from the list when they refer to a shown card. **Do not** use for vague "more ideas" without a specific dish.

2) **nutrition_for_recipe** — User asks how nutritious/healthy something is, calories, macros, micronutrients, for **one** dish. Pick id from the list when they say "this recipe", etc.

3) **suggest_recipes** — User wants **new** meal/recipe **ideas** or browsing ("what should I cook", "more options"). Card grid only, not full instructions.

4) **chat_only** — Motivation, planning, generic tips without API recipe/nutrition/full detail, non-food quests.

**Critical:** Only one intent per turn. "Recipe for X" → **full_recipe**, not suggest_recipes.

Reply rules:
- **full_recipe**: 1–2 short sentences; the app will show ingredients and steps below. Do not invent ingredients.
- **nutrition_for_recipe**: 1–2 sentences; app appends nutrient list.
- **suggest_recipes**: one short intro; cards below.
- **chat_only**: complete answer in "reply".`;

function buildPlannerUserPayload(params: {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  recentRecipes: { id: number; title: string }[];
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
      return `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text.trim()}${ids}${fullId}`;
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
    intent !== 'full_recipe'
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

  return {
    intent,
    reply,
    nutritionRecipeId,
    nutritionRecipeTitleHint,
    fullRecipeSpoonacularId,
    fullRecipeTitleHint,
  };
}

const emptyHints = (): Pick<
  QuestAssistPlan,
  'nutritionRecipeId' | 'nutritionRecipeTitleHint' | 'fullRecipeSpoonacularId' | 'fullRecipeTitleHint'
> => ({
  nutritionRecipeId: null,
  nutritionRecipeTitleHint: null,
  fullRecipeSpoonacularId: null,
  fullRecipeTitleHint: null,
});

function heuristicPlan(params: {
  goalTitle: string;
  goalDescription: string;
  questTitle: string;
  questDescription: string;
  latestUserMessage: string;
  recentRecipes: { id: number; title: string }[];
}): QuestAssistPlan {
  const u = params.latestUserMessage.toLowerCase();
  const recent = params.recentRecipes;
  const lastId = recent.length > 0 ? recent[recent.length - 1]!.id : null;

  const foodContext = isQuestAssistFoodRelated({
    goalTitle: params.goalTitle,
    goalDescription: params.goalDescription,
    questTitle: params.questTitle,
    questDescription: params.questDescription,
    userMessage: params.latestUserMessage,
  });

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

  const wantsFullRecipe =
    /\b(recipe\s+for|how\s+(do\s+i|to)\s+make|how\s+to\s+cook|full\s+recipe|ingredients\s+(for|to)|step\s*by\s*step|instructions\s+for|cook\s+this|make\s+this)\b/.test(
      u,
    ) || /\bwalk\s+me\s+through\b/.test(u);

  if (wantsFullRecipe && !wantsNewRecipes) {
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

  if (wantsNutrition && lastId != null && !wantsNewRecipes) {
    return {
      intent: 'nutrition_for_recipe',
      reply: 'Here is a nutrient breakdown for that recipe (per-serving estimate):',
      ...emptyHints(),
      nutritionRecipeId: lastId,
      nutritionRecipeTitleHint: null,
    };
  }

  if (wantsNewRecipes && foodContext) {
    return {
      intent: 'suggest_recipes',
      reply: fallbackQuestAssistIntro(true),
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
