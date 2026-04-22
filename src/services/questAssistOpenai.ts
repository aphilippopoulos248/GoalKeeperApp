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
};

export type QuestAssistPlan = {
  intent: 'chat_only' | 'suggest_recipes' | 'nutrition_for_recipe';
  reply: string;
  nutritionRecipeId: number | null;
  nutritionRecipeTitleHint: string | null;
};

const PLANNER_SYSTEM = `You are the routing brain for a short "quest assist" chat. The app may attach recipe cards OR nutrient data from Spoonacular—you decide what is needed for this turn.

Output a single JSON object only (no markdown fences) with exactly these keys:
- "intent": one of "chat_only", "suggest_recipes", "nutrition_for_recipe"
- "reply": string — plain text, no markdown. Must **directly answer** the user's latest message in a natural way.
- "nutritionRecipeId": number or null — use when intent is nutrition_for_recipe and the recipe is in "Recipes shown in this chat" (match by title or what they refer to).
- "nutritionRecipeTitleHint": string or null — only if you need nutrition but id is unknown: put the exact or best dish name to search (e.g. user names something not in the list).

Intent rules (read carefully):
1) **nutrition_for_recipe** — User asks how nutritious/healthy something is, wants calories, macros, micronutrients, a nutrition breakdown, "is this good for me?", etc., for **one** dish they are already discussing or that appeared in the chat. If they say "this recipe", "that one", "the first", "I like this", "tell me how nutritious it is", pick the right id from the list (most recent card is usually what "this" means after they expressed a preference).

2) **suggest_recipes** — User clearly wants **new** meal/recipe **ideas** or alternatives ("what should I cook", "more ideas", "something else"). **Do not** use if they already chose one and are only asking a follow-up (nutrition, timing, how to cook it) unless they also explicitly ask for more options.

3) **chat_only** — Motivation, planning, how to do the quest, generic cooking tips without needing new API recipes or a full nutrient label, non-food quests, clarifying questions.

**Critical:** Only one intent per turn. If the user only wants nutrition info for a recipe they like, use **nutrition_for_recipe**, not suggest_recipes.

Reply rules:
- For **nutrition_for_recipe**: start with 1–2 friendly sentences; the app will append a nutrient list. Do not invent numbers.
- For **suggest_recipes**: short intro only (e.g. one sentence); recipe cards may appear below.
- For **chat_only**: complete answer in "reply" only.`;

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
      return `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text.trim()}${ids}`;
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
    '## Recipes already shown in this chat (id → title). Use these ids for nutrition_for_recipe when the user refers to them.',
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
    intent !== 'nutrition_for_recipe'
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
  return {
    intent,
    reply,
    nutritionRecipeId,
    nutritionRecipeTitleHint,
  };
}

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

  if (wantsNutrition && lastId != null && !wantsNewRecipes) {
    return {
      intent: 'nutrition_for_recipe',
      reply: 'Here is a nutrient breakdown for that recipe (per-serving estimate):',
      nutritionRecipeId: lastId,
      nutritionRecipeTitleHint: null,
    };
  }

  if (wantsNewRecipes && foodContext) {
    return {
      intent: 'suggest_recipes',
      reply: fallbackQuestAssistIntro(true),
      nutritionRecipeId: null,
      nutritionRecipeTitleHint: null,
    };
  }

  return {
    intent: 'chat_only',
    reply: '',
    nutritionRecipeId: null,
    nutritionRecipeTitleHint: null,
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
