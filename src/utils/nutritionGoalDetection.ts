/**
 * Heuristic: goals that should receive Spoonacular-backed recipe / macro context
 * for daily quest generation. Tuned for recall on eating and body-composition language.
 */
const NUTRITION_TRIGGERS: readonly string[] = [
  'dieting',
  'diet',
  'nutrition',
  'nutritional',
  'macros',
  'macro',
  'cico',
  'calories',
  'calorie',
  'meal prep',
  'meal-prep',
  'meal plan',
  'recipe',
  'cook',
  'cooking',
  'healthy eating',
  'eat healthier',
  'lose weight',
  'weight loss',
  'shed',
  'slim',
  'body fat',
  'fat loss',
  'lean body',
  'recomp',
  'gain weight',
  'bulking',
  'bulk',
  'cutting',
  ' build muscle',
  'muscle mass',
  'muscle gain',
  'hypertrophy',
  'protein',
  'keto',
  'ketogenic',
  'vegan',
  'vegetarian',
  'pescetarian',
  'pescatarian',
  'paleo',
  'primal',
  'whole30',
  'whole 30',
  'mediterranean',
  'intermittent fast',
  'counting cal',
  'track food',
  'tracking food',
  'grocery',
  'ingredients',
  'snack',
  'breakfast',
  'lunch',
  'dinner',
  'portion',
  'sugar',
  'fiber',
  'sodium',
  'deficit',
  'surplus',
  'overeat',
  'eat clean',
  'low carb',
  'low-carb',
  'high protein',
  'body composition',
];

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isNutritionFitnessGoal(title: string, description: string): boolean {
  const normalized = normalizeForMatch(`${title} ${description}`);
  for (const t of NUTRITION_TRIGGERS) {
    const needle = t.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (normalized.includes(needle)) return true;
  }
  return false;
}

/** Food / meal assist: nutrition goals or quest + user text that clearly implies cooking or meals. */
const FOOD_ASSIST_HINTS: readonly string[] = [
  'cook',
  'cooking',
  'meal',
  'recipe',
  'eat',
  'eating',
  'food',
  'dinner',
  'lunch',
  'breakfast',
  'snack',
  'healthy meal',
  'grocery',
  'nutrition',
  'diet',
  'calories',
  'protein',
];

export function isQuestAssistFoodRelated(params: {
  goalTitle: string;
  goalDescription: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
}): boolean {
  if (isNutritionFitnessGoal(params.goalTitle, params.goalDescription)) {
    return true;
  }
  const blob = normalizeForMatch(
    `${params.questTitle} ${params.questDescription} ${params.userMessage}`,
  );
  for (const h of FOOD_ASSIST_HINTS) {
    if (blob.includes(h)) return true;
  }
  return false;
}
