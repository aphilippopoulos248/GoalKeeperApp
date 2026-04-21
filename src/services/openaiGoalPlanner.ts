import Constants from 'expo-constants';

import type { MilestoneFrequency } from '../types';

export type PlannerDailyQuest = {
  title: string;
  description: string;
  points: number;
  /** 0 = start of day, 999 = late evening / before bed; compared across all goals on the menu. */
  dayOrder: number;
  /** Minutes from midnight (0–1439). Non-overlapping within this goal’s daily batch when possible. */
  startMinute: number;
  /** Block length in minutes (15–120). */
  durationMinutes: number;
};

/** Pre-finalize row while parsing / normalizing dayOrder (schedule filled in `finalizePlannerDailyQuests`). */
type DailyQuestParseRow = Omit<PlannerDailyQuest, 'startMinute' | 'durationMinutes'> & {
  startMinute?: number;
  durationMinutes?: number;
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
  /** Milestone spacing for checkpoints; defaults to weekly when omitted. */
  milestoneFrequency?: MilestoneFrequency;
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

const WAKE_START_MINUTE = 6 * 60;
const WAKE_END_MINUTE = 22 * 60;
const DEFAULT_BLOCK_MINUTES = 45;

function clampStartMinute(n: number): number {
  if (!Number.isFinite(n)) return WAKE_START_MINUTE;
  return Math.min(1439, Math.max(0, Math.round(n)));
}

function clampDurationMinutes(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_BLOCK_MINUTES;
  return Math.min(120, Math.max(15, Math.round(n)));
}

function deriveStartMinuteFromDayOrder(dayOrder: number, durationMinutes: number): number {
  const d = clampDurationMinutes(durationMinutes);
  const span = Math.max(1, WAKE_END_MINUTE - WAKE_START_MINUTE - d);
  const t = WAKE_START_MINUTE + Math.round((clampDayOrder(dayOrder) / 999) * span);
  return clampStartMinute(Math.min(t, WAKE_END_MINUTE - d));
}

/**
 * Ensures each quest has start/duration, resolves overlaps within this batch by nudging later blocks forward.
 */
function finalizePlannerDailyQuests(rows: DailyQuestParseRow[]): PlannerDailyQuest[] {
  if (rows.length === 0) return [];
  const drafted = rows.map((r) => {
    const durationMinutes = clampDurationMinutes(r.durationMinutes);
    const hasStart =
      typeof r.startMinute === 'number' && Number.isFinite(r.startMinute);
    const startMinute = hasStart
      ? clampStartMinute(r.startMinute as number)
      : deriveStartMinuteFromDayOrder(r.dayOrder, durationMinutes);
    return {
      title: r.title,
      description: r.description,
      points: r.points,
      dayOrder: r.dayOrder,
      startMinute,
      durationMinutes,
    };
  });
  drafted.sort((a, b) => a.startMinute - b.startMinute);
  let cursor = WAKE_START_MINUTE;
  const out: PlannerDailyQuest[] = [];
  for (const q of drafted) {
    let startMinute = Math.max(q.startMinute, cursor, WAKE_START_MINUTE);
    let durationMinutes = q.durationMinutes;
    const maxDur = 1440 - startMinute;
    if (durationMinutes > maxDur) {
      durationMinutes = Math.max(15, maxDur);
    }
    if (durationMinutes < 15) {
      startMinute = Math.max(WAKE_START_MINUTE, 1440 - 15);
      durationMinutes = 15;
    }
    cursor = startMinute + durationMinutes;
    out.push({ ...q, startMinute, durationMinutes });
  }
  return out;
}

/** Lower = earlier in day; 4 = unknown (sort by model dayOrder among unknowns). */
type TimeOfDayRank = 0 | 1 | 2 | 3 | 4;

function textMatchesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((w) => haystack.includes(w));
}

function inferTimeOfDayRank(title: string, description: string): TimeOfDayRank {
  const t = `${title} ${description}`.toLowerCase();
  let r = -1;
  if (
    textMatchesAny(t, [
      'morning',
      'wake',
      'waking',
      'after waking',
      'breakfast',
      'sunrise',
      'early',
      'before noon',
    ])
  ) {
    r = Math.max(r, 0);
  }
  if (textMatchesAny(t, ['lunch', 'noon', 'midday'])) {
    r = Math.max(r, 1);
  }
  if (textMatchesAny(t, ['afternoon', 'after work', 'after school'])) {
    r = Math.max(r, 2);
  }
  if (
    textMatchesAny(t, [
      'evening',
      'night',
      'tonight',
      'before bed',
      'bedtime',
      'wind-down',
      'wind down',
      'sunset',
      'dusk',
    ])
  ) {
    r = Math.max(r, 3);
  }
  return (r === -1 ? 4 : r) as TimeOfDayRank;
}

const DAY_ORDER_BAND: Record<Exclude<TimeOfDayRank, 4>, { lo: number; hi: number }> = {
  0: { lo: 0, hi: 199 },
  1: { lo: 200, hi: 449 },
  2: { lo: 450, hi: 649 },
  3: { lo: 750, hi: 999 },
};

/** Re-sort each AI batch by time-of-day cues, then assign dayOrder inside prompt bands (cross-goal safe). */
function normalizeDailyQuestDayOrders(quests: DailyQuestParseRow[]): DailyQuestParseRow[] {
  if (quests.length === 0) return [];
  const scored = quests.map((q, originalIndex) => ({
    q,
    originalIndex,
    rank: inferTimeOfDayRank(q.title, q.description),
  }));
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.q.dayOrder !== b.q.dayOrder) return a.q.dayOrder - b.q.dayOrder;
    const tc = a.q.title.localeCompare(b.q.title);
    if (tc !== 0) return tc;
    return a.originalIndex - b.originalIndex;
  });

  const byRank = new Map<TimeOfDayRank, typeof scored>();
  for (const s of scored) {
    const arr = byRank.get(s.rank) ?? [];
    arr.push(s);
    byRank.set(s.rank, arr);
  }

  return scored.map((s) => {
    if (s.rank === 4) {
      return { ...s.q, dayOrder: clampDayOrder(s.q.dayOrder) };
    }
    const band = DAY_ORDER_BAND[s.rank];
    const group = byRank.get(s.rank)!;
    const idx = group.indexOf(s);
    const gLen = group.length;
    const dayOrder =
      gLen === 1
        ? Math.round((band.lo + band.hi) / 2)
        : Math.round(band.lo + (idx / (gLen - 1)) * (band.hi - band.lo));
    return { ...s.q, dayOrder };
  });
}

function checkpointSpacingInstruction(freq: MilestoneFrequency): string {
  switch (freq) {
    case 'biweekly':
      return `Milestone frequency is BI-WEEKLY: use weekOffset 2, 4, 6, … only (every two weeks from the start) through the target date. Space milestones evenly on that cadence. Do not use odd week numbers for checkpoints.`;
    case 'monthly':
      return `Milestone frequency is MONTHLY: use weekOffset 4, 8, 12, … only (approximately every four weeks) through the target date. Space milestones evenly on that cadence.`;
    case 'weekly':
    default:
      return `Milestone frequency is WEEKLY: use weekOffset 1, 2, 3, … (consecutive weeks from the start) through the target date. Space milestones evenly—one checkpoint per week.`;
  }
}

function buildFullSystem(
  dailyQuestCount: number,
  milestoneFrequency: MilestoneFrequency,
): string {
  const n = clampQuestCount(dailyQuestCount);
  const checkpointCadence = checkpointSpacingInstruction(milestoneFrequency);
  return `You are a goal-planning coach. Reply with a single JSON object only (no markdown).
Fields:
- specific: string (refined SMART Specific)
- measurable: string (SMART Measurable)
- achievable: string (SMART Achievable — short, realistic)
- relevant: string (SMART Relevant)
- timeBound: string (one clear sentence: deadline and horizon in plain language)
- timeBoundCritique: string (one short honest critique of whether the deadline is realistic for the outcome; suggest adjustment if needed)
- checkpoints: array of { "weekOffset": number, "label": string }. weekOffset is the week number from the start (1 = end of week 1). ${checkpointCadence} label is the outcome for that period (no "Week N:" prefix).

Rules:
- Use the user's title and description; make SMART fields concrete.
- If completedCheckpointCount is 0, daily quests must be VERY EASY (5–15 min, low friction).
- If completedCheckpointCount is higher, increase difficulty and points modestly (still safe and actionable).
- Checkpoints must align with the goal, deadline, and milestoneFrequency from the user message.
- dailyQuests must be specific to this goal’s title and description (not generic self-help).
- Each dailyQuest MUST include dayOrder: integer 0–999. The app sorts ALL goals’ quests by dayOrder ascending (lower = earlier on the Menu, higher = later).
- Each dailyQuest MUST include startMinute: integer 0–1439 (minutes from midnight) and durationMinutes: integer 15–120 for a single-day schedule block. Space blocks within roughly 06:00–22:00, ordered consistently with dayOrder (earlier dayOrder → earlier startMinute). No overlapping time ranges within this goal’s dailyQuests array (each block’s [startMinute, startMinute+durationMinutes) must be disjoint).
- startMinute MUST match the real-world time of day implied by that quest’s title and description: morning / wake / breakfast / early work → about 05:00–11:30 (startMinute roughly 300–690); lunch / midday → about 11:00–14:30 (660–870); afternoon / after school / after work → about 12:00–18:00 (720–1080); evening / wind-down / before bed / night prep → about 17:00–22:30 (1020–1350). Never schedule a clearly morning-themed quest in late evening or a bedtime task in the morning.
- dayOrder bands (follow strictly): morning / wake / breakfast → 0–199; lunch / midday / noon → 200–449; afternoon → 450–649; evening / night / before bed / wind-down → 750–999. Spread multiple quests across the right band; do not reuse the same integer for every quest.
- Hard rule: if title or description clearly means morning or right after waking, dayOrder MUST be ≤199 and startMinute MUST fall in the morning window above. If it clearly means evening or before bed, dayOrder MUST be ≥750 and startMinute MUST fall in the evening window above.
- Example for 3 quests: a morning habit ≈120, a lunch-related task ≈350, an evening wind-down ≈900; example schedule: startMinute 480 durationMinutes 30, 780/45, 1260/40.
- Still a concrete action—never “go to sleep” as a quest.
- You MUST return exactly ${n} items in dailyQuests (no fewer, no more).`;
}

function buildRegenSystem(dailyQuestCount: number): string {
  const n = clampQuestCount(dailyQuestCount);
  return `You are a goal-planning coach. Reply with a single JSON object only: { "dailyQuests": [ ... ] }.
dailyQuests must have exactly ${n} items: { "title", "description", "points", "dayOrder", "startMinute", "durationMinutes" } with points 10–25, dayOrder 0–999, startMinute 0–1439, durationMinutes 15–120. Blocks must not overlap within the array; prefer 06:00–22:00.

Rules:
- The user message includes milestoneFrequency (weekly / biweekly / monthly). Align daily quest pacing and tone with that milestone cadence (e.g. smaller steps for weekly checkpoints vs monthly).
- Quests must support the user's goal and current milestones.
- If completedCheckpointCount is 0, quests are VERY EASY.
- Higher completedCheckpointCount means noticeably harder (longer or more demanding) daily actions, still realistic.
- Each quest must be specific to this goal’s title and description (not generic advice).
- Each quest MUST include dayOrder 0–999; the Menu sorts all goals’ quests ascending (morning first, evening last).
- Each quest MUST include startMinute and durationMinutes (non-overlapping within the batch; align start times with dayOrder).
- startMinute MUST fit the quest’s meaning: morning/wake/breakfast quests ≈ 05:00–11:30; lunch/midday ≈ 11:00–14:30; afternoon ≈ 12:00–18:00; evening/wind-down/bedtime prep ≈ 17:00–22:30. Do not put morning-themed actions at night or evening-only habits in the morning.
- Bands: morning/wake/breakfast → 0–199; lunch/midday/noon → 200–449; afternoon → 450–649; evening/night/before bed/wind-down → 750–999. Morning cues → dayOrder ≤199 and morning startMinute window; evening/bedtime cues → dayOrder ≥750 and evening startMinute window. Example triple: ≈120, ≈350, ≈900.
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
        temperature: 0.35,
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

/** Models sometimes omit `title`/`description` or use alternate keys; coerce finite numbers. */
const DAILY_QUEST_TITLE_KEYS = [
  'title',
  'Title',
  'name',
  'Name',
  'label',
  'task',
  'questTitle',
  'summary',
  'headline',
  'action',
] as const;

const DAILY_QUEST_DESC_KEYS = [
  'description',
  'details',
  'body',
  'desc',
  'instruction',
  'instructions',
  'text',
  'content',
  'Content',
  'note',
  'notes',
] as const;

/** Flat string, number, or one-level nested object with common text keys (models often nest). */
function coerceQuestText(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (isRecord(v)) {
    const innerKeys = [
      'text',
      'content',
      'title',
      'description',
      'body',
      'label',
      'value',
      'name',
      'message',
    ] as const;
    for (const ik of innerKeys) {
      const inner = v[ik];
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
      if (typeof inner === 'number' && Number.isFinite(inner)) return String(inner);
    }
  }
  return undefined;
}

function pickQuestField(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const coerced = coerceQuestText(record[key]);
    if (coerced) return coerced;
  }
  return undefined;
}

/** If only one of title/description exists, derive the other so we still accept the row. */
function pickOptionalStartMinute(record: Record<string, unknown>): number | undefined {
  const keys = ['startMinute', 'start_minute', 'startMins', 'start'] as const;
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pickOptionalDurationMinutes(record: Record<string, unknown>): number | undefined {
  const keys = [
    'durationMinutes',
    'duration_minutes',
    'duration',
    'lengthMinutes',
  ] as const;
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pairTitleDescription(
  title: string | undefined,
  description: string | undefined,
): { title: string; description: string } | undefined {
  if (title && description) return { title, description };
  if (!title && description) {
    const line = description.split('\n')[0]?.trim() ?? description;
    return {
      title: line.slice(0, 120) || 'Daily quest',
      description,
    };
  }
  if (title && !description) {
    return { title, description: title };
  }
  return undefined;
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

  const dailyQuests: DailyQuestParseRow[] = [];
  let dqIndex = 0;
  for (const q of data.dailyQuests) {
    if (!isRecord(q)) {
      continue;
    }
    let title = pickQuestField(q, DAILY_QUEST_TITLE_KEYS);
    let description = pickQuestField(q, DAILY_QUEST_DESC_KEYS);
    const paired = pairTitleDescription(title, description);
    if (!paired) {
      continue;
    }
    title = paired.title;
    description = paired.description;
    const points = q.points;
    const pts = typeof points === 'number' ? clampPoints(points) : 12;
    const defaultOrder =
      n <= 1 ? 500 : Math.round((dqIndex / Math.max(n - 1, 1)) * 999);
    const orderRaw = q.dayOrder;
    const dayOrder =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw)
        ? clampDayOrder(orderRaw)
        : defaultOrder;
    const row: DailyQuestParseRow = {
      title,
      description,
      points: pts,
      dayOrder,
    };
    const sm = pickOptionalStartMinute(q);
    const dm = pickOptionalDurationMinutes(q);
    if (sm !== undefined) row.startMinute = clampStartMinute(sm);
    if (dm !== undefined) row.durationMinutes = clampDurationMinutes(dm);
    dailyQuests.push(row);
    dqIndex += 1;
  }

  if (dailyQuests.length < n) {
    throw new GoalPlannerError(
      `Expected at least ${n} daily quests`,
      'bad_response',
    );
  }

  const normalizedDaily = finalizePlannerDailyQuests(
    normalizeDailyQuestDayOrders(dailyQuests.slice(0, n)),
  );

  return {
    specific: (data.specific as string).trim(),
    measurable: (data.measurable as string).trim(),
    achievable: (data.achievable as string).trim(),
    relevant: (data.relevant as string).trim(),
    timeBound,
    checkpoints,
    dailyQuests: normalizedDaily,
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
  const out: DailyQuestParseRow[] = [];
  let dqIndex = 0;
  for (const q of data.dailyQuests) {
    if (!isRecord(q)) continue;
    let title = pickQuestField(q, DAILY_QUEST_TITLE_KEYS);
    let description = pickQuestField(q, DAILY_QUEST_DESC_KEYS);
    const paired = pairTitleDescription(title, description);
    if (!paired) continue;
    title = paired.title;
    description = paired.description;
    const pts = typeof q.points === 'number' ? clampPoints(q.points) : 12;
    const defaultOrder =
      n <= 1 ? 500 : Math.round((dqIndex / Math.max(n - 1, 1)) * 999);
    const orderRaw = q.dayOrder;
    const dayOrder =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw)
        ? clampDayOrder(orderRaw)
        : defaultOrder;
    const row: DailyQuestParseRow = {
      title,
      description,
      points: pts,
      dayOrder,
    };
    const sm = pickOptionalStartMinute(q);
    const dm = pickOptionalDurationMinutes(q);
    if (sm !== undefined) row.startMinute = clampStartMinute(sm);
    if (dm !== undefined) row.durationMinutes = clampDurationMinutes(dm);
    out.push(row);
    dqIndex += 1;
  }
  if (out.length < n) {
    throw new GoalPlannerError(
      `Expected at least ${n} daily quests`,
      'bad_response',
    );
  }
  return finalizePlannerDailyQuests(normalizeDailyQuestDayOrders(out.slice(0, n)));
}

export async function planNewGoal(
  params: GoalPlannerBaseParams,
): Promise<GoalPlannerFullResult> {
  const dailyQuestCount = clampQuestCount(params.dailyQuestCount);
  const milestoneFrequency = params.milestoneFrequency ?? 'weekly';
  const user = JSON.stringify({
    title: params.title,
    description: params.description,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    completedCheckpointCount: params.completedCheckpointCount,
    dailyQuestCount,
    milestoneFrequency,
  });

  const data = await postChatJson(
    buildFullSystem(dailyQuestCount, milestoneFrequency),
    user,
  );
  return parseFullResult(data, dailyQuestCount);
}

export async function regenerateDailyQuests(
  params: RegenerateDailyQuestsParams,
): Promise<GoalPlannerFullResult['dailyQuests']> {
  const dailyQuestCount = clampQuestCount(params.dailyQuestCount);
  const milestoneFrequency = params.milestoneFrequency ?? 'weekly';
  const user = JSON.stringify({
    title: params.title,
    description: params.description,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    completedCheckpointCount: params.completedCheckpointCount,
    checkpointTitles: params.checkpointTitles,
    dailyQuestCount,
    milestoneFrequency,
  });

  const data = await postChatJson(buildRegenSystem(dailyQuestCount), user);
  return parseDailyOnly(data, dailyQuestCount);
}
