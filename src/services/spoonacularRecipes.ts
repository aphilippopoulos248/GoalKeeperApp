import Constants from 'expo-constants';

import {
  isNutritionFitnessGoal,
  isQuestAssistFoodRelated,
} from '../utils/nutritionGoalDetection';

const SPOONACULAR_BASE = 'https://api.spoonacular.com';

type FindByNutrientsItem = {
  id: number;
  title: string;
  image?: string;
  imageType?: string;
  calories?: number;
  protein?: string;
  fat?: string;
  carbs?: string;
};

type ComplexSearchItem = {
  id: number;
  title: string;
  image?: string;
  sourceUrl?: string;
  summary?: string;
  nutrition?: { nutrients?: Array<{ name: string; amount: number; unit: string }> };
};

function getSpoonacularApiKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY;
  const trimmedProcess = typeof fromProcess === 'string' ? fromProcess.trim() : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtraRaw =
    extra && typeof extra === 'object' && extra !== null && 'spoonacularApiKey' in extra
      ? (extra as { spoonacularApiKey?: unknown }).spoonacularApiKey
      : undefined;
  const trimmedExtra = typeof fromExtraRaw === 'string' ? fromExtraRaw.trim() : '';

  if (trimmedProcess.length > 0) return trimmedProcess;
  if (trimmedExtra.length > 0) return trimmedExtra;
  return '';
}

type SearchMode =
  | { type: 'nutrients'; params: Record<string, string> }
  | { type: 'complex'; query: string; diet?: string; cuisine?: string };

/**
 * Picks one Spoonacular strategy per call to limit quota: named diets → complex search;
 * muscle / cut / default nutrition → findByNutrients with different macro windows.
 */
function planSearch(
  text: string,
): SearchMode | null {
  const t = text.toLowerCase();

  if (/(ketogenic|keto)\b/.test(t)) {
    return { type: 'complex', query: 'dinner', diet: 'ketogenic' };
  }
  if (/\bvegan\b/.test(t)) {
    return { type: 'complex', query: 'protein', diet: 'vegan' };
  }
  if (/\bvegetarian\b/.test(t)) {
    return { type: 'complex', query: 'protein', diet: 'vegetarian' };
  }
  if (/\b(pescetarian|pescatarian)\b/.test(t)) {
    return { type: 'complex', query: 'dinner', diet: 'pescetarian' };
  }
  if (/\bpaleo\b/.test(t)) {
    return { type: 'complex', query: 'dinner', diet: 'paleo' };
  }
  if (/\bprimal\b/.test(t)) {
    return { type: 'complex', query: 'dinner', diet: 'primal' };
  }
  if (/\bwhole\s*30\b|whole30/.test(t)) {
    return { type: 'complex', query: 'dinner', diet: 'whole30' };
  }
  if (/\bmediterranean\b/.test(t)) {
    return { type: 'complex', query: 'mediterranean dinner', cuisine: 'Mediterranean' };
  }

  if (/(build muscle|muscle gain|hypertrophy|bulking|bulk\b|protein.*gain)/.test(t)) {
    return {
      type: 'nutrients',
      params: {
        minProtein: '25',
        minCalories: '250',
        number: '5',
        random: 'true',
      },
    };
  }

  if (
    /(lose weight|weight loss|fat loss|calorie deficit|cutting|cut\b|deficit|slim|lean)/.test(
      t,
    )
  ) {
    return {
      type: 'nutrients',
      params: {
        minProtein: '18',
        maxCalories: '480',
        number: '5',
        random: 'true',
      },
    };
  }

  return {
    type: 'nutrients',
    params: {
      minProtein: '16',
      maxCalories: '620',
      number: '4',
      random: 'true',
    },
  };
}

function extractSearchQueryFromGoal(title: string, description: string): string {
  const combined = `${title} ${description}`.trim();
  if (!combined) return 'healthy meal';
  const words = combined
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ''))
    .filter((w) => w.length > 2);
  const skip = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'from',
    'want',
    'goal',
    'lose',
    'gain',
    'more',
    'less',
  ]);
  const picked = words.filter((w) => !skip.has(w.toLowerCase())).slice(0, 4);
  return picked.length > 0 ? picked.join(' ') : 'healthy meal';
}

function formatFromNutrients(items: FindByNutrientsItem[]): string {
  return items
    .map((r, i) => {
      const kcal = typeof r.calories === 'number' ? ` ~${r.calories} kcal` : '';
      const p = r.protein ? ` protein ${r.protein}` : '';
      return `${i + 1}. [id ${r.id}] ${r.title}${kcal}${p}`;
    })
    .join('\n');
}

function firstNutrient(
  n: { nutrients?: Array<{ name: string; amount: number; unit: string }> } | undefined,
  name: string,
): string {
  const list = n?.nutrients;
  if (!list) return '';
  const hit = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!hit) return '';
  return `${Math.round(hit.amount)}${hit.unit || ''}`;
}

function formatFromComplex(items: ComplexSearchItem[]): string {
  return items
    .map((r, i) => {
      const p = firstNutrient(r.nutrition, 'Protein');
      const c = firstNutrient(r.nutrition, 'Calories');
      const extra =
        c || p
          ? ` (${[c && `~${c} kcal`, p && `protein ${p}`].filter(Boolean).join(', ')})`
          : '';
      const url = r.sourceUrl ? ` — ${r.sourceUrl}` : '';
      return `${i + 1}. [id ${r.id}] ${r.title}${extra}${url}`;
    })
    .join('\n');
}

async function getJson(
  path: string,
  searchParams: URLSearchParams,
  apiKey: string,
): Promise<unknown> {
  const url = `${SPOONACULAR_BASE}${path}?${searchParams.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetches a small, human-readable list of real recipes (or macro-filtered ideas)
 * to inject into the OpenAI planner. Returns null on missing key, non-nutrition goals, or any failure.
 */
export async function getNutritionContextForGoal(params: {
  title: string;
  description: string;
}): Promise<string | null> {
  if (!isNutritionFitnessGoal(params.title, params.description)) {
    return null;
  }
  const apiKey = getSpoonacularApiKey();
  if (!apiKey) {
    return null;
  }

  const text = `${params.title} ${params.description}`;
  const plan = planSearch(text);

  if (plan.type === 'nutrients') {
    const sp = new URLSearchParams({ ...plan.params });
    const data = (await getJson('/recipes/findByNutrients', sp, apiKey)) as
      | FindByNutrientsItem[]
      | null;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lines = formatFromNutrients(data.slice(0, 5));
    return `Real recipe options (search: nutrients filter; use at least one in a quest, do not invent other dish names):\n${lines}`;
  }

  const q = extractSearchQueryFromGoal(params.title, params.description);
  const sp = new URLSearchParams({
    number: '4',
    addRecipeInformation: 'true',
  });
  if (plan.diet) sp.set('diet', plan.diet);
  if (plan.cuisine) sp.set('cuisine', plan.cuisine);
  sp.set('query', plan.query && plan.query.length > 0 ? plan.query : q);
  const data = (await getJson('/recipes/complexSearch', sp, apiKey)) as
    | { results?: ComplexSearchItem[] }
    | null;
  const results = data?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const lines = formatFromComplex(results.slice(0, 4));
  const searchHint = [
    plan.diet && `diet=${plan.diet}`,
    plan.cuisine && `cuisine=${plan.cuisine}`,
    'query-based',
  ]
    .filter(Boolean)
    .join(', ');
  return `Real recipe options (search: ${searchHint}; use at least one in a quest, do not invent other dish names):\n${lines}`;
}

export type AssistRecipe = {
  id: number;
  title: string;
  image?: string;
  sourceUrl?: string;
};

function nutrientsToAssistRecipes(items: FindByNutrientsItem[]): AssistRecipe[] {
  return items.map((r) => ({
    id: r.id,
    title: r.title,
    image:
      typeof r.image === 'string' && r.image.length > 0
        ? r.image
        : `https://img.spoonacular.com/recipes/${r.id}-312x231.jpg`,
  }));
}

function complexToAssistRecipes(items: ComplexSearchItem[]): AssistRecipe[] {
  return items.map((r) => ({
    id: r.id,
    title: r.title,
    image: typeof r.image === 'string' && r.image.length > 0 ? r.image : undefined,
    sourceUrl: typeof r.sourceUrl === 'string' ? r.sourceUrl : undefined,
  }));
}

/**
 * Recipe cards for the quest AI assist UI. Returns null when the context is not food-related,
 * the API key is missing, or the request fails.
 */
export async function fetchRecipeSuggestionsForAssist(params: {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
}): Promise<AssistRecipe[] | null> {
  if (
    !isQuestAssistFoodRelated({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      userMessage: params.userMessage,
    })
  ) {
    return null;
  }

  const apiKey = getSpoonacularApiKey();
  if (!apiKey) {
    return null;
  }

  const text = [
    params.goalTitle,
    params.goalDescription,
    params.goalTimeBound,
    params.questTitle,
    params.questDescription,
    params.userMessage,
  ].join(' ');

  const plan = planSearch(text);

  if (plan.type === 'nutrients') {
    const sp = new URLSearchParams({ ...plan.params });
    sp.set('number', '6');
    const data = (await getJson('/recipes/findByNutrients', sp, apiKey)) as
      | FindByNutrientsItem[]
      | null;
    if (!Array.isArray(data) || data.length === 0) return null;
    return nutrientsToAssistRecipes(data.slice(0, 6));
  }

  const q = extractSearchQueryFromGoal(
    `${params.questTitle} ${params.userMessage}`.trim() || params.goalTitle,
    `${params.questDescription} ${params.goalDescription}`.trim(),
  );
  const sp = new URLSearchParams({
    number: '6',
    addRecipeInformation: 'true',
  });
  if (plan.diet) sp.set('diet', plan.diet);
  if (plan.cuisine) sp.set('cuisine', plan.cuisine);
  sp.set('query', plan.query && plan.query.length > 0 ? plan.query : q);
  const data = (await getJson('/recipes/complexSearch', sp, apiKey)) as
    | { results?: ComplexSearchItem[] }
    | null;
  const results = data?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  return complexToAssistRecipes(results.slice(0, 6));
}

/** Resolve a Spoonacular recipe id from a free-text title (first search hit). */
export async function searchRecipeIdByTitle(title: string): Promise<number | null> {
  const q = title.trim();
  if (!q) return null;
  const apiKey = getSpoonacularApiKey();
  if (!apiKey) return null;
  const sp = new URLSearchParams({
    query: q,
    number: '1',
    addRecipeInformation: 'false',
  });
  const data = (await getJson('/recipes/complexSearch', sp, apiKey)) as
    | { results?: Array<{ id?: number }> }
    | null;
  const id = data?.results?.[0]?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function formatNutritionWidgetJson(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const lines: string[] = [];

  const nutrients = o.nutrients;
  if (Array.isArray(nutrients) && nutrients.length > 0) {
    for (const n of nutrients) {
      if (!n || typeof n !== 'object') continue;
      const r = n as Record<string, unknown>;
      const name = r.name;
      if (typeof name !== 'string' || !name.trim()) continue;
      const amount = r.amount;
      const unit = typeof r.unit === 'string' ? r.unit : '';
      const pct = r.percentOfDailyNeeds;
      let line: string;
      if (typeof amount === 'number' && Number.isFinite(amount)) {
        line = `• ${name}: ${amount}${unit ? ` ${unit}` : ''}`;
        if (typeof pct === 'number' && Number.isFinite(pct)) {
          line += ` (${Math.round(pct)}% daily)`;
        }
      } else if (typeof r.percentOfDailyNeeds === 'number') {
        line = `• ${name}: ${Math.round(r.percentOfDailyNeeds as number)}% daily`;
      } else {
        continue;
      }
      lines.push(line);
    }
    if (lines.length > 0) {
      return ['Per serving (Spoonacular estimate):', ...lines].join('\n');
    }
  }

  const cal = o.calories;
  const protein = o.protein;
  const fat = o.fat;
  const carbs = o.carbs;
  if (typeof cal === 'string' && cal.trim()) lines.push(`• Calories: ${cal.trim()}`);
  if (typeof protein === 'string' && protein.trim()) lines.push(`• Protein: ${protein.trim()}`);
  if (typeof fat === 'string' && fat.trim()) lines.push(`• Fat: ${fat.trim()}`);
  if (typeof carbs === 'string' && carbs.trim()) lines.push(`• Carbs: ${carbs.trim()}`);
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Human-readable nutrient list for a recipe id (nutritionWidget.json).
 */
export async function fetchRecipeNutritionSummary(recipeId: number): Promise<string | null> {
  const apiKey = getSpoonacularApiKey();
  if (!apiKey) return null;
  const data = await getJson(
    `/recipes/${recipeId}/nutritionWidget.json`,
    new URLSearchParams(),
    apiKey,
  );
  return formatNutritionWidgetJson(data);
}

export type RecentAssistRecipe = { id: number; title: string };

/**
 * Pick recipe id from planner hints, pronouns in the user message, and recipes already shown.
 */
export function resolveAssistNutritionRecipeId(params: {
  explicitId: number | null | undefined;
  titleHint: string | null | undefined;
  recentRecipes: RecentAssistRecipe[];
  userMessage: string;
}): number | null {
  if (typeof params.explicitId === 'number' && Number.isFinite(params.explicitId)) {
    return params.explicitId;
  }
  const recent = params.recentRecipes;
  if (recent.length === 0) return null;

  const hint = (params.titleHint ?? '').trim();
  if (hint) {
    const hl = hint.toLowerCase();
    const exact = recent.find((r) => r.title.trim().toLowerCase() === hl);
    if (exact) return exact.id;
    const partial = recent.find((r) => {
      const t = r.title.toLowerCase();
      return t.includes(hl) || hl.includes(t.slice(0, Math.min(16, t.length)));
    });
    if (partial) return partial.id;
  }

  const u = params.userMessage.toLowerCase();
  if (/\b(first|1st)\b/.test(u)) return recent[0]!.id;
  if (/\b(second|2nd)\b/.test(u) && recent.length >= 2) return recent[1]!.id;
  if (
    /\b(this|that)\s+(recipe|one)\b/.test(u) ||
    /\bi\s+like\s+this\b/.test(u) ||
    /\b(the\s+)?one\s+i\s+(picked|chose)\b/.test(u) ||
    /\bhow\s+nutritious\b.*\b(it|this)\b/.test(u) ||
    /\b(tell me|what).*\b(nutrition|nutrients|calories|macros)\b.*\b(it|this|that)\b/.test(u)
  ) {
    return recent[recent.length - 1]!.id;
  }
  return null;
}
