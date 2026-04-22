import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AssistFullRecipe } from '../services/spoonacularRecipes';

const keyForUser = (userId: string) => `@goalkeeper/quest-attached-recipes/${userId}`;

function guardUser(userId: string | null): userId is string {
  return typeof userId === 'string' && userId.length > 0;
}

/** goalId -> questId -> recipe */
export type QuestAttachedRecipeMap = Record<string, Record<string, AssistFullRecipe>>;

async function readMap(userId: string): Promise<QuestAttachedRecipeMap> {
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as QuestAttachedRecipeMap;
  } catch {
    return {};
  }
}

async function writeMap(userId: string, map: QuestAttachedRecipeMap): Promise<void> {
  try {
    await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function loadAllAttachedRecipes(
  userId: string | null,
): Promise<QuestAttachedRecipeMap> {
  if (!guardUser(userId)) return {};
  return readMap(userId);
}

export async function getAttachedRecipe(
  userId: string | null,
  goalId: string,
  questId: string,
): Promise<AssistFullRecipe | null> {
  if (!guardUser(userId)) return null;
  const map = await readMap(userId);
  const g = map[goalId];
  if (!g) return null;
  const r = g[questId];
  return r ?? null;
}

export async function setAttachedRecipe(
  userId: string | null,
  goalId: string,
  questId: string,
  recipe: AssistFullRecipe,
): Promise<void> {
  if (!guardUser(userId)) return;
  const map = await readMap(userId);
  const next = { ...map, [goalId]: { ...map[goalId], [questId]: recipe } };
  await writeMap(userId, next);
}

export async function clearAttachedRecipe(
  userId: string | null,
  goalId: string,
  questId: string,
): Promise<void> {
  if (!guardUser(userId)) return;
  const map = await readMap(userId);
  const g = map[goalId];
  if (!g || !(questId in g)) return;
  const { [questId]: _removed, ...restQuests } = g;
  const next = { ...map };
  if (Object.keys(restQuests).length === 0) {
    delete next[goalId];
  } else {
    next[goalId] = restQuests;
  }
  await writeMap(userId, next);
}

export async function clearAttachedRecipesForGoal(
  userId: string | null,
  goalId: string,
): Promise<void> {
  if (!guardUser(userId)) return;
  const map = await readMap(userId);
  if (!(goalId in map)) return;
  const next = { ...map };
  delete next[goalId];
  await writeMap(userId, next);
}
