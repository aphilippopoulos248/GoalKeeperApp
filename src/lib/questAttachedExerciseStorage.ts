import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AssistFullExercise } from '../services/exerciseDbRapidApi';

const keyForUser = (userId: string) => `@goalkeeper/quest-attached-exercises/${userId}`;

function guardUser(userId: string | null): userId is string {
  return typeof userId === 'string' && userId.length > 0;
}

/** goalId -> questId -> exercise */
export type QuestAttachedExerciseMap = Record<string, Record<string, AssistFullExercise>>;

async function readMap(userId: string): Promise<QuestAttachedExerciseMap> {
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as QuestAttachedExerciseMap;
  } catch {
    return {};
  }
}

async function writeMap(userId: string, map: QuestAttachedExerciseMap): Promise<void> {
  try {
    await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function loadAllAttachedExercises(
  userId: string | null,
): Promise<QuestAttachedExerciseMap> {
  if (!guardUser(userId)) return {};
  return readMap(userId);
}

export async function getAttachedExercise(
  userId: string | null,
  goalId: string,
  questId: string,
): Promise<AssistFullExercise | null> {
  if (!guardUser(userId)) return null;
  const map = await readMap(userId);
  const g = map[goalId];
  if (!g) return null;
  const r = g[questId];
  return r ?? null;
}

export async function setAttachedExercise(
  userId: string | null,
  goalId: string,
  questId: string,
  exercise: AssistFullExercise,
): Promise<void> {
  if (!guardUser(userId)) return;
  const { clearAttachedRecipe } = await import('./questAttachedRecipeStorage');
  await clearAttachedRecipe(userId, goalId, questId);
  const map = await readMap(userId);
  const next = { ...map, [goalId]: { ...map[goalId], [questId]: exercise } };
  await writeMap(userId, next);
}

export async function clearAttachedExercise(
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

export async function clearAttachedExercisesForGoal(
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
