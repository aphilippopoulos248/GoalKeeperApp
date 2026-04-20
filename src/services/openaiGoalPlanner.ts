import Constants from 'expo-constants';

export type PlannerDailyQuest = {
  title: string;
  description: string;
  points: number;
  /** 0 = start of day, 999 = late evening / before bed; compared across all goals on the menu. */
  dayOrder: number;
};

export type GoalPlannerFullResult = {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  checkpoints: Array<{ weekOffset: number; label: string }>;
  dailyQuests: PlannerDailyQuest[];
};

export type GoalPlannerBaseParams = {
  title: string;
  description: string;
  targetDateIso: string;
  todayIso: string;
  completedCheckpointCount: number;
  /** Number of daily quests to generate (2–4), from goal priority. */
  dailyQuestCount: number;
};

export type RegenerateDailyQuestsParams = GoalPlannerBaseParams & {
  checkpointTitles: string[];
};

export type GoalPlannerErrorCode =
  | 'missing_key'
  | 'network'
  | 'bad_response'
  | 'api_error';

export class GoalPlannerError extends Error {
  constructor(
    message: string,
    public readonly code: GoalPlannerErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GoalPlannerError';
  }
}

const MODEL = 'gpt-4o-mini';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

function getApiKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  const trimmedProcess = typeof fromProcess === 'string' ? fromProcess.trim() : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtraRaw =
    extra && typeof extra === 'object' && extra !== null && 'openAiApiKey' in extra
      ? (extra as { openAiApiKey?: unknown }).openAiApiKey
      : undefined;
  const trimmedExtra =
    typeof fromExtraRaw === 'string' ? fromExtraRaw.trim() : '';

  if (trimmedProcess.length > 0) return trimmedProcess;
  if (trimmedExtra.length > 0) return trimmedExtra;
  return '';
}

function clampPoints(n: number): number {
  if (!Number.isFinite(n)) return 12;
  return Math.min(25, Math.max(10, Math.round(n)));
}

function clampQuestCount(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(2, Math.round(n)));
}

function clampDayOrder(n: number): number {
  if (!Number.isFinite(n)) return 500;
  return Math.min(999, Math.max(0, Math.round(n)));
}

function buildFullSystem(dailyQuestCount: number): string {
  const n = clampQuestCount(dailyQuestCount);
  return `You are a goal-planning coach. Reply with a single JSON object only (no markdown).
Fields:
- specific: string (refined SMART Specific)
- measurable: string (SMART Measurable)
- achievable: string (SMART Achievable — short, realistic)
- relevant: string (SMART Relevant)
- timeBound: string (one clear sentence: deadline and horizon in plain language)
- timeBoundCritique: string (one short honest critique of whether the deadline is realistic for the outcome; suggest adjustment if needed)
- checkpoints: array of { "weekOffset": number, "label": string }. weekOffset is week number from start (1 = end of week 1). Space milestones evenly until the target date. label is the outcome for that week (no "Week N:" prefix).
- dailyQuests: exactly ${n} objects { "title": string, "description": string, "points": number, "dayOrder": number } with points between 10 and 25.

Rules:
- Use the user's title and description; make SMART fields concrete.
- If completedCheckpointCount is 0, daily quests must be VERY EASY (5–15 min, low friction).
- If completedCheckpointCount is higher, increase difficulty and points modestly (still safe and actionable).
- Checkpoints must align with the goal and deadline.
- dailyQuests must be specific to this goal’s title and description (not generic self-help).
- Each dailyQuest MUST include dayOrder: an integer 0–999 for when this action best fits in a typical waking day. The app sorts quests from ALL goals together by dayOrder ascending. Use low values for morning-style actions (e.g. jog, early focus block), mid values for afternoon, high values for evening or wind-down (e.g. reading before bed). Do not cluster every quest from one goal at the same number—spread them by what makes sense for each title. Still a concrete action—never “go to sleep” as a quest.
- You MUST return exactly ${n} items in dailyQuests (no fewer, no more).`;
}

function buildRegenSystem(dailyQuestCount: number): string {
  const n = clampQuestCount(dailyQuestCount);
  return `You are a goal-planning coach. Reply with a single JSON object only: { "dailyQuests": [ ... ] }.
dailyQuests must have exactly ${n} items: { "title", "description", "points", "dayOrder" } with points 10–25 and dayOrder an integer 0–999.

Rules:
- Quests must support the user's goal and current milestones.
- If completedCheckpointCount is 0, quests are VERY EASY.
- Higher completedCheckpointCount means noticeably harder (longer or more demanding) daily actions, still realistic.
- Each quest must be specific to this goal’s title and description (not generic advice).
- Each quest MUST include dayOrder (0–999): lower = earlier in the day, higher = later; the menu merges quests from every goal and sorts by this value (e.g. morning run ≈ low, reading before bed ≈ high). Spread values to match each quest’s nature.
- Return exactly ${n} quests (no fewer, no more).`;
}

async function postChatJson(system: string, user: string): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new GoalPlannerError(
      'Missing OpenAI API key. Create a .env file in the project root with EXPO_PUBLIC_OPENAI_API_KEY=your_key and restart Expo (see .env.example).',
      'missing_key',
    );
  }

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
        temperature: 0.55,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch {
    throw new GoalPlannerError('Network error calling OpenAI', 'network');
  }

  const raw = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const msg =
      typeof raw.error === 'object' &&
      raw.error &&
      typeof (raw.error as { message?: string }).message === 'string'
        ? (raw.error as { message: string }).message
        : `OpenAI error (${res.status})`;
    throw new GoalPlannerError(msg, 'api_error', res.status);
  }

  const choices = raw.choices as unknown;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new GoalPlannerError('Empty choices from OpenAI', 'bad_response');
  }
  const content = (choices[0] as { message?: { content?: string } })?.message
    ?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new GoalPlannerError('No message content from OpenAI', 'bad_response');
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new GoalPlannerError('OpenAI returned non-JSON content', 'bad_response');
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseFullResult(
  data: unknown,
  dailyQuestCount: number,
): GoalPlannerFullResult {
  const n = clampQuestCount(dailyQuestCount);
  if (!isRecord(data)) {
    throw new GoalPlannerError('Invalid JSON shape', 'bad_response');
  }

  const strings = ['specific', 'measurable', 'achievable', 'relevant', 'timeBound', 'timeBoundCritique'] as const;
  for (const k of strings) {
    if (k === 'timeBoundCritique') continue;
    if (typeof data[k] !== 'string' || !data[k].trim()) {
      throw new GoalPlannerError(`Missing or invalid field: ${k}`, 'bad_response');
    }
  }

  const critique =
    typeof data.timeBoundCritique === 'string' && data.timeBoundCritique.trim()
      ? data.timeBoundCritique.trim()
      : '';
  const timeBoundMain = (data.timeBound as string).trim();
  const timeBound = critique
    ? `${timeBoundMain}\n\nCritique: ${critique}`
    : timeBoundMain;

  if (!Array.isArray(data.checkpoints)) {
    throw new GoalPlannerError('Invalid checkpoints', 'bad_response');
  }

  const checkpoints: GoalPlannerFullResult['checkpoints'] = [];
  for (const c of data.checkpoints) {
    if (!isRecord(c)) continue;
    const weekOffset = c.weekOffset;
    const label = c.label;
    if (typeof weekOffset !== 'number' || !Number.isFinite(weekOffset)) continue;
    if (typeof label !== 'string' || !label.trim()) continue;
    checkpoints.push({
      weekOffset: Math.max(1, Math.round(weekOffset)),
      label: label.trim(),
    });
  }

  if (checkpoints.length === 0) {
    throw new GoalPlannerError('No valid checkpoints', 'bad_response');
  }

  if (!Array.isArray(data.dailyQuests)) {
    throw new GoalPlannerError('Invalid dailyQuests', 'bad_response');
  }

  const dailyQuests: GoalPlannerFullResult['dailyQuests'] = [];
  let dqIndex = 0;
  for (const q of data.dailyQuests) {
    if (!isRecord(q)) continue;
    const title = q.title;
    const description = q.description;
    const points = q.points;
    if (typeof title !== 'string' || !title.trim()) continue;
    if (typeof description !== 'string' || !description.trim()) continue;
    const pts = typeof points === 'number' ? clampPoints(points) : 12;
    const defaultOrder =
      n <= 1 ? 500 : Math.round((dqIndex / Math.max(n - 1, 1)) * 999);
    const orderRaw = q.dayOrder;
    const dayOrder =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw)
        ? clampDayOrder(orderRaw)
        : defaultOrder;
    dailyQuests.push({
      title: title.trim(),
      description: description.trim(),
      points: pts,
      dayOrder,
    });
    dqIndex += 1;
  }

  if (dailyQuests.length < n) {
    throw new GoalPlannerError(
      `Expected at least ${n} daily quests`,
      'bad_response',
    );
  }

  return {
    specific: (data.specific as string).trim(),
    measurable: (data.measurable as string).trim(),
    achievable: (data.achievable as string).trim(),
    relevant: (data.relevant as string).trim(),
    timeBound,
    checkpoints,
    dailyQuests: dailyQuests.slice(0, n),
  };
}

function parseDailyOnly(
  data: unknown,
  dailyQuestCount: number,
): GoalPlannerFullResult['dailyQuests'] {
  const n = clampQuestCount(dailyQuestCount);
  if (!isRecord(data) || !Array.isArray(data.dailyQuests)) {
    throw new GoalPlannerError('Invalid dailyQuests-only response', 'bad_response');
  }
  const out: GoalPlannerFullResult['dailyQuests'] = [];
  let dqIndex = 0;
  for (const q of data.dailyQuests) {
    if (!isRecord(q)) continue;
    if (typeof q.title !== 'string' || !q.title.trim()) continue;
    if (typeof q.description !== 'string' || !q.description.trim()) continue;
    const pts = typeof q.points === 'number' ? clampPoints(q.points) : 12;
    const defaultOrder =
      n <= 1 ? 500 : Math.round((dqIndex / Math.max(n - 1, 1)) * 999);
    const orderRaw = q.dayOrder;
    const dayOrder =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw)
        ? clampDayOrder(orderRaw)
        : defaultOrder;
    out.push({
      title: q.title.trim(),
      description: q.description.trim(),
      points: pts,
      dayOrder,
    });
    dqIndex += 1;
  }
  if (out.length < n) {
    throw new GoalPlannerError(
      `Expected at least ${n} daily quests`,
      'bad_response',
    );
  }
  return out.slice(0, n);
}

export async function planNewGoal(
  params: GoalPlannerBaseParams,
): Promise<GoalPlannerFullResult> {
  const dailyQuestCount = clampQuestCount(params.dailyQuestCount);
  const user = JSON.stringify({
    title: params.title,
    description: params.description,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    completedCheckpointCount: params.completedCheckpointCount,
    dailyQuestCount,
  });

  const data = await postChatJson(buildFullSystem(dailyQuestCount), user);
  return parseFullResult(data, dailyQuestCount);
}

export async function regenerateDailyQuests(
  params: RegenerateDailyQuestsParams,
): Promise<GoalPlannerFullResult['dailyQuests']> {
  const dailyQuestCount = clampQuestCount(params.dailyQuestCount);
  const user = JSON.stringify({
    title: params.title,
    description: params.description,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    completedCheckpointCount: params.completedCheckpointCount,
    checkpointTitles: params.checkpointTitles,
    dailyQuestCount,
  });

  const data = await postChatJson(buildRegenSystem(dailyQuestCount), user);
  return parseDailyOnly(data, dailyQuestCount);
}
