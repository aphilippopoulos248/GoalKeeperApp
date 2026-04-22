import Constants from 'expo-constants';

import {
  isQuestAssistExerciseRelated,
  userWantsExerciseVisuals,
} from '../utils/exerciseGoalDetection';

const BASE = 'https://exercisedb.p.rapidapi.com';
const RAPID_HOST = 'exercisedb.p.rapidapi.com';
const ASSIST_CARD_LIMIT = 6;
/** BASIC RapidAPI tier: 180px GIF stream from GET /image */
const EXERCISE_GIF_RESOLUTION = 180;

function getRapidApiKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_RAPIDAPI_KEY;
  const trimmedProcess = typeof fromProcess === 'string' ? fromProcess.trim() : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtraRaw =
    extra && typeof extra === 'object' && extra !== null && 'rapidApiKey' in extra
      ? (extra as { rapidApiKey?: unknown }).rapidApiKey
      : undefined;
  const trimmedExtra = typeof fromExtraRaw === 'string' ? fromExtraRaw.trim() : '';

  if (trimmedProcess.length > 0) return trimmedProcess;
  if (trimmedExtra.length > 0) return trimmedExtra;
  return '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export type AssistExercise = {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl?: string;
};

export type AssistFullExercise = AssistExercise & {
  instructions: string[];
  description?: string;
  secondaryMuscles?: string[];
};

/** Map common language to ExerciseDB `bodyPart` path values. */
const BODY_PART_ALIASES: Record<string, string> = {
  chest: 'chest',
  back: 'back',
  shoulder: 'shoulders',
  shoulders: 'shoulders',
  arm: 'upper arms',
  arms: 'upper arms',
  bicep: 'upper arms',
  tricep: 'upper arms',
  forearm: 'lower arms',
  leg: 'upper legs',
  legs: 'upper legs',
  quad: 'upper legs',
  quads: 'upper legs',
  hamstring: 'upper legs',
  hamstrings: 'upper legs',
  glute: 'upper legs',
  glutes: 'upper legs',
  calf: 'lower legs',
  calves: 'lower legs',
  shin: 'lower legs',
  core: 'waist',
  abs: 'waist',
  waist: 'waist',
  oblique: 'waist',
  neck: 'neck',
  cardio: 'cardio',
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'for',
  'and',
  'with',
  'some',
  'any',
  'how',
  'what',
  'when',
  'can',
  'you',
  'me',
  'my',
  'i',
  'to',
  'do',
  'is',
  'are',
  'this',
  'that',
  'today',
  'quest',
]);

async function getJson(pathWithLeadingSlash: string): Promise<unknown | null> {
  const key = getRapidApiKey();
  if (!key) return null;
  const url = `${BASE}${pathWithLeadingSlash}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': RAPID_HOST,
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function pickGifUrl(raw: Record<string, unknown>): string | undefined {
  for (const k of ['gifUrl', 'gifurl', 'imageUrl', 'image']) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/**
 * Direct GIF URL for Image components (RapidAPI streams GIF; key in query is required for RN Image).
 * @see https://edb-docs.up.railway.app/docs/image-service/image
 */
export function getExerciseAnimationUrl(exerciseId: string): string | null {
  const id = exerciseId.trim();
  if (!id) return null;
  const key = getRapidApiKey();
  if (!key) return null;
  return `${BASE}/image?exerciseId=${encodeURIComponent(id)}&resolution=${EXERCISE_GIF_RESOLUTION}&rapidapi-key=${encodeURIComponent(key)}`;
}

export function withRapidApiExerciseAnimationUrls(exercises: AssistExercise[]): AssistExercise[] {
  if (!getRapidApiKey()) return exercises;
  return exercises.map((ex) => {
    if (typeof ex.gifUrl === 'string' && ex.gifUrl.length > 0) return ex;
    const url = getExerciseAnimationUrl(ex.id);
    return url ? { ...ex, gifUrl: url } : ex;
  });
}

export function withRapidApiAnimationUrl(full: AssistFullExercise): AssistFullExercise {
  if (!getRapidApiKey()) return full;
  if (typeof full.gifUrl === 'string' && full.gifUrl.length > 0) return full;
  const url = getExerciseAnimationUrl(full.id);
  return url ? { ...full, gifUrl: url } : full;
}

function coerceId(rawId: unknown): string | null {
  if (typeof rawId === 'string' && rawId.trim()) return rawId.trim();
  if (typeof rawId === 'number' && Number.isFinite(rawId)) return String(rawId);
  return null;
}

function mapToAssistExercise(raw: Record<string, unknown>): AssistExercise | null {
  const id = coerceId(raw.id);
  const name = raw.name;
  if (!id) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  const bodyPart = typeof raw.bodyPart === 'string' ? raw.bodyPart : '';
  const target = typeof raw.target === 'string' ? raw.target : '';
  const equipment = typeof raw.equipment === 'string' ? raw.equipment : '';
  const gifUrl = pickGifUrl(raw);
  return {
    id,
    name: name.trim(),
    bodyPart,
    target,
    equipment,
    ...(gifUrl ? { gifUrl } : {}),
  };
}

function asExerciseArray(data: unknown): AssistExercise[] {
  if (!Array.isArray(data)) return [];
  const out: AssistExercise[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const ex = mapToAssistExercise(item);
    if (ex) out.push(ex);
  }
  return out;
}

function resolveBodyPartFromText(text: string): string | null {
  const t = text.toLowerCase();
  for (const [alias, part] of Object.entries(BODY_PART_ALIASES)) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(t)) return part;
  }
  return null;
}

function nameSearchToken(text: string): string | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  return words[words.length - 1]!.slice(0, 48);
}

/**
 * Exercise cards for Quest Assist. Returns null when context is not exercise-related,
 * the API key is missing, or the request fails.
 */
export async function fetchExerciseSuggestionsForAssist(params: {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
}): Promise<AssistExercise[] | null> {
  if (
    !isQuestAssistExerciseRelated({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      userMessage: params.userMessage,
    })
  ) {
    return null;
  }
  if (!getRapidApiKey()) return null;

  const blob = [
    params.goalTitle,
    params.goalDescription,
    params.goalTimeBound,
    params.questTitle,
    params.questDescription,
    params.userMessage,
  ].join(' ');

  const limitQ = `limit=${ASSIST_CARD_LIMIT}`;

  const bodyPart = resolveBodyPartFromText(blob);
  if (bodyPart) {
    const path = `/exercises/bodyPart/${encodeURIComponent(bodyPart)}?${limitQ}`;
    const data = await getJson(path);
    const list = asExerciseArray(data);
    if (list.length > 0) return list.slice(0, ASSIST_CARD_LIMIT);
  }

  const token =
    nameSearchToken(params.userMessage) ||
    nameSearchToken(`${params.questTitle} ${params.questDescription}`) ||
    nameSearchToken(params.goalTitle);
  if (token) {
    const path = `/exercises/name/${encodeURIComponent(token)}?${limitQ}`;
    const data = await getJson(path);
    const list = asExerciseArray(data);
    if (list.length > 0) return list.slice(0, ASSIST_CARD_LIMIT);
  }

  const fallback = await getJson(`/exercises?${limitQ}`);
  const list = asExerciseArray(fallback);
  if (list.length > 0) return list.slice(0, ASSIST_CARD_LIMIT);
  return null;
}

export type RecentAssistExercise = { id: string; name: string };

export function assistExercisesFromRecent(recent: RecentAssistExercise[]): AssistExercise[] {
  return recent.map((r) => ({
    id: r.id,
    name: r.name,
    bodyPart: '',
    target: '',
    equipment: '',
  }));
}

/**
 * Pick exercise id from planner hints, pronouns, and exercises already shown.
 */
export function resolveAssistFullExerciseId(params: {
  explicitId: string | null | undefined;
  nameHint: string | null | undefined;
  recentExercises: RecentAssistExercise[];
  userMessage: string;
}): string | null {
  const ex = typeof params.explicitId === 'string' ? params.explicitId.trim() : '';
  if (ex.length > 0) return ex;

  const recent = params.recentExercises;
  if (recent.length === 0) return null;

  const hint = (params.nameHint ?? '').trim();
  if (hint) {
    const hl = hint.toLowerCase();
    const exact = recent.find((r) => r.name.trim().toLowerCase() === hl);
    if (exact) return exact.id;
    const partial = recent.find((r) => {
      const t = r.name.toLowerCase();
      return t.includes(hl) || hl.includes(t.slice(0, Math.min(20, t.length)));
    });
    if (partial) return partial.id;
  }

  const u = params.userMessage.toLowerCase();
  if (/\b(first|1st)\b/.test(u)) return recent[0]!.id;
  if (/\b(second|2nd)\b/.test(u) && recent.length >= 2) return recent[1]!.id;
  if (
    /\b(this|that)\s+(exercise|move|one)\b/.test(u) ||
    /\b(the\s+)?one\s+you\s+(showed|sent|listed)\b/.test(u) ||
    /\bhow\s+do\s+i\s+do\s+(this|that|it)\b/.test(u)
  ) {
    return recent[recent.length - 1]!.id;
  }

  if (userWantsExerciseVisuals(params.userMessage)) {
    if (/\b(all|each|every|those|these|them|ones)\b/.test(u)) return null;
    return recent[recent.length - 1]!.id;
  }
  return null;
}

/** First ExerciseDB hit for a free-text name (for planner title hints). */
export async function searchExerciseIdByName(name: string): Promise<string | null> {
  const q = name.trim();
  if (!q || !getRapidApiKey()) return null;
  const path = `/exercises/name/${encodeURIComponent(q.slice(0, 64))}?limit=1`;
  const data = await getJson(path);
  const list = asExerciseArray(data);
  const first = list[0];
  return first ? first.id : null;
}

export async function fetchFullExerciseInformation(
  exerciseId: string,
): Promise<AssistFullExercise | null> {
  const id = exerciseId.trim();
  if (!id || !getRapidApiKey()) return null;
  const data = await getJson(`/exercises/exercise/${encodeURIComponent(id)}`);
  if (!isRecord(data)) return null;
  const base = mapToAssistExercise(data);
  if (!base) return null;

  const instructions: string[] = [];
  const inst = data.instructions;
  if (Array.isArray(inst)) {
    for (const step of inst) {
      if (typeof step === 'string' && step.trim()) instructions.push(step.trim());
    }
  }

  const secondaryMuscles: string[] = [];
  const sec = data.secondaryMuscles;
  if (Array.isArray(sec)) {
    for (const m of sec) {
      if (typeof m === 'string' && m.trim()) secondaryMuscles.push(m.trim());
    }
  }

  const description =
    typeof data.description === 'string' && data.description.trim()
      ? data.description.trim()
      : undefined;

  return {
    ...base,
    instructions,
    ...(description ? { description } : {}),
    ...(secondaryMuscles.length > 0 ? { secondaryMuscles } : {}),
  };
}
