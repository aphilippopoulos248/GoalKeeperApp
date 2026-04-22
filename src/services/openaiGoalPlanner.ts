import Constants from 'expo-constants';

import type { MilestoneFrequency, Quest } from '../types';

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

/** Half-open [startMinute, endMinute) in minutes from midnight; occupied by another goal’s dailies. */
export type ReservedScheduleSlot = {
  startMinute: number;
  endMinute: number;
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
  /** Busy intervals from other active goals; new dailies must not overlap these. */
  reservedScheduleSlots?: ReservedScheduleSlot[];
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

/** Allowed quest point values; missing/invalid AI output picks by quest index. */
const QUEST_POINT_TIERS = [10, 15, 20, 25] as const;

function defaultPointsForQuestIndex(index: number): number {
  return QUEST_POINT_TIERS[index % 4];
}

/** Map AI number into [10,25], then snap to nearest tier so only 10/15/20/25 appear. */
function snapToPointTier(n: number): number {
  const clamped = Math.min(25, Math.max(10, Math.round(n)));
  let best = QUEST_POINT_TIERS[0];
  let bestDist = Math.abs(clamped - best);
  for (const t of QUEST_POINT_TIERS) {
    const d = Math.abs(clamped - t);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

function resolveQuestPoints(raw: unknown, questIndex: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return snapToPointTier(raw);
  }
  return defaultPointsForQuestIndex(questIndex);
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

type BusyInterval = { start: number; end: number };

function normalizeReservedSlots(
  reserved: ReservedScheduleSlot[] | undefined,
): BusyInterval[] {
  if (!reserved || reserved.length === 0) return [];
  const out: BusyInterval[] = [];
  for (const r of reserved) {
    const s = clampStartMinute(r.startMinute);
    const e = Math.min(1440, Math.max(0, Math.round(r.endMinute)));
    if (e > s) out.push({ start: s, end: e });
  }
  return out;
}

function overlaps(aStart: number, aEnd: number, b: BusyInterval): boolean {
  return b.start < aEnd && b.end > aStart;
}

/**
 * Ensures each quest has start/duration; nudges blocks past reserved intervals and past each other (no overlap).
 */
function finalizePlannerDailyQuests(
  rows: DailyQuestParseRow[],
  reserved?: ReservedScheduleSlot[],
): PlannerDailyQuest[] {
  if (rows.length === 0) return [];
  const busy: BusyInterval[] = normalizeReservedSlots(reserved);
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
  drafted.sort((a, b) => a.startMinute - b.startMinute || a.dayOrder - b.dayOrder);
  const out: PlannerDailyQuest[] = [];
  for (const q of drafted) {
    let startMinute = Math.max(q.startMinute, WAKE_START_MINUTE);
    let durationMinutes = q.durationMinutes;
    const maxBumpIters = 64;
    for (let iter = 0; iter < maxBumpIters; iter += 1) {
      const maxDur = 1440 - startMinute;
      if (durationMinutes > maxDur) {
        durationMinutes = Math.max(15, maxDur);
      }
      if (durationMinutes < 15) {
        startMinute = Math.max(WAKE_START_MINUTE, 1440 - 15);
        durationMinutes = 15;
      }
      const endMinute = startMinute + durationMinutes;
      const conflicting = busy.filter((b) => overlaps(startMinute, endMinute, b));
      if (conflicting.length === 0) break;
      const nextStart = Math.max(
        ...conflicting.map((c) => c.end),
        WAKE_START_MINUTE,
      );
      startMinute = clampStartMinute(nextStart);
    }
    const maxDur = 1440 - startMinute;
    if (durationMinutes > maxDur) {
      durationMinutes = Math.max(15, maxDur);
    }
    if (durationMinutes < 15) {
      startMinute = Math.max(WAKE_START_MINUTE, 1440 - 15);
      durationMinutes = 15;
    }
    const endPlaced = startMinute + durationMinutes;
    busy.push({ start: startMinute, end: endPlaced });
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

/**
 * Shared by buildFullSystem and buildRegenSystem: concreteness, milestone difficulty, title vs body.
 * Keep in sync when editing either path.
 */
const DAILY_QUEST_COPY_AND_TIER_RULES = `Daily quest text (critical):
- The user message includes "completedCheckpointCount" (number of milestones already completed) and a goal "title" and "description". Use them.
- **Title vs description (must differ):** Each item MUST have a separate "title" and "description".
  - "title": at most **5 words**; short imperative (e.g. "Choose one book", "Run five kilometers"). No period at the end.
  - "description": 1–3 sentences that **add** information the title does not cover: time window, how much (count, pages, minutes, reps, distance), where, or what "done" looks like. **Do not** copy the title, paste the same sentence, or use a near-paraphrase of the title. The description is the detail; the title is the hook.
- **Zero baseline (completedCheckpointCount is 0):** Assume the user has **not** already built the habit and may lack prior skill. No prerequisite skills—quests must be things a total beginner can do today. **Order** the dailyQuests array as a small ramp: first item = **shortest / easiest setup** (2–5 min, e.g. pick the book, find a 10-minute video, lay out shoes); later items in the list = **slightly** more (still easy: e.g. read 5 pages, then 10 pages; mirror talk for 1 minute). Forbid vague stems ("improve…", "work on…", "get better at…") unless the same line names a **concrete** action, object, and/or number.
- **Milestone difficulty ladder (use completedCheckpointCount):**
  - 0: micro/foundation, minimal friction, obvious first steps only.
  - 1: light, repeatable practice—still not "milestone level."
  - 2+: noticeably harder day-sized actions (time, volume, or intensity) than at 0—still **safer and smaller** than a full checkpoint/milestone; never replace a milestone.
- **Examples (flavor only; match the user's goal):** "Read more" with 0 milestones: choose a book → read 5 pages → read 10 pages. "Socialize more" with 0: watch one specific short video on conversation skills → practice talking aloud in a mirror for 1 minute. "Get fit" with 2+ milestones: 20 push-ups in one set, run 5 km outside, etc.`;

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
- checkpoints: array of { "weekOffset": number, "label": string }. weekOffset is the week number from the start (1 = end of week 1). ${checkpointCadence} Each "label" is ONE milestone title (no "Week N:" prefix).

Milestones vs daily quests (critical):
- Milestones (checkpoint labels) are **major sub-goals**—noticeably **harder and braver** than any single daily quest. They should feel like **real progress** and often push the user **outside their comfort zone** in a way that fits the goal (e.g. for “improve social skills”: daily quests might be “practice a short conversation” or “watch a video on body language”, while a milestone might be “attend a public meetup or social event alone”). Milestones are **not** small home exercises; they are **challenge moments** the user would not do every day.
- Daily quests are **smaller, repeatable, preparatory steps** (practice, reflection, learning, low-stakes rehearsals) that **build toward** those milestones. They must **not** copy the same wording as a milestone; they prepare the user for the bigger step later.
- Each milestone label must be a **single clear, verifiable challenge** for that period; avoid vague labels like “keep going”.

${DAILY_QUEST_COPY_AND_TIER_RULES}

Rules:
- Use the user's title and description; make SMART fields concrete.
- If completedCheckpointCount is 0, daily quests must be VERY EASY (5–15 min, low friction), following the zero-baseline and ramp rules above. If higher, increase difficulty and points modestly (still safe and actionable) per the ladder above.
- Checkpoints must align with the goal, deadline, and milestoneFrequency from the user message.
- dailyQuests must be specific to this goal’s title and description (not generic self-help).
- Each dailyQuest "points" MUST be exactly one of 10, 15, 20, or 25 (use different values across quests when possible).
- Each dailyQuest MUST include dayOrder: integer 0–999. The app sorts ALL goals’ quests by dayOrder ascending (lower = earlier on the Menu, higher = later).
- Each dailyQuest MUST include startMinute: integer 0–1439 (minutes from midnight) and durationMinutes: integer 15–120 for a single-day schedule block. Space blocks within roughly 06:00–22:00, ordered consistently with dayOrder (earlier dayOrder → earlier startMinute). No overlapping time ranges within this goal’s dailyQuests array (each block’s [startMinute, startMinute+durationMinutes) must be disjoint). The user message may include reservedScheduleSlots: busy [startMinute, endMinute) ranges from OTHER goals—your new dailyQuests MUST NOT overlap those ranges (only one quest at a time on the shared day).
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
dailyQuests must have exactly ${n} items: { "title", "description", "points", "dayOrder", "startMinute", "durationMinutes" } with points exactly 10, 15, 20, or 25 only (vary across quests), dayOrder 0–999, startMinute 0–1439, durationMinutes 15–120. Blocks must not overlap within the array; prefer 06:00–22:00. If the user JSON includes reservedScheduleSlots, treat each entry as a busy half-open interval [startMinute, endMinute)—your quests must not overlap those (one quest at a time globally).

${DAILY_QUEST_COPY_AND_TIER_RULES}

Rules:
- The user JSON includes "checkpointTitles": the existing milestone names for this goal. Daily quests must be **smaller preparatory steps** (practice, study, low-stakes drills) that **support** those milestones—**not** duplicate them. Daily quests should feel **easier** than completing a milestone; milestones stay the **bold stretch** challenges. Use "completedCheckpointCount" and "checkpointTitles" to match difficulty and the **next** not-yet-done milestones to the dailies you write.
- The user message includes milestoneFrequency (weekly / biweekly / monthly). Align daily quest pacing and tone with that cadence (e.g. smaller daily steps when milestones are weekly vs monthly).
- Quests must support the user's goal and build skills toward the **next** milestones the user has not yet reached.
- If completedCheckpointCount is 0, quests are VERY EASY, following the zero-baseline and ramp rules above. Higher counts follow the difficulty ladder above—still **below** the bar of a full milestone challenge.
- Each quest must be specific to this goal’s title and description (not generic advice).
- Each quest MUST include dayOrder 0–999; the Menu sorts all goals’ quests ascending (morning first, evening last).
- Each quest MUST include startMinute and durationMinutes (non-overlapping within the batch; align start times with dayOrder).
- startMinute MUST fit the quest’s meaning: morning/wake/breakfast quests ≈ 05:00–11:30; lunch/midday ≈ 11:00–14:30; afternoon ≈ 12:00–18:00; evening/wind-down/bedtime prep ≈ 17:00–22:30. Do not put morning-themed actions at night or evening-only habits in the morning.
- Bands: morning/wake/breakfast → 0–199; lunch/midday/noon → 200–449; afternoon → 450–649; evening/night/before bed/wind-down → 750–999. Morning cues → dayOrder ≤199 and morning startMinute window; evening/bedtime cues → dayOrder ≥750 and evening startMinute window. Example triple: ≈120, ≈350, ≈900.
- Return exactly ${n} quests (no fewer, no more).`;
}

const LIFE_BUSY_PARSE_SYSTEM = `You interpret the user's natural-language availability for ONE typical weekday and merge it with any prior busy intervals. Reply with JSON only: { "busyIntervals": [ { "startMinute": number, "endMinute": number }, ... ] }.

Rules:
- Times are minutes from midnight: 0 = midnight, 540 = 9:00 AM, 1020 = 5:00 PM; endMinute may be up to 1440.
- Each interval is half-open [startMinute, endMinute): scheduled quests must not overlap these ranges.
- Interpret phrases like "work 9 to 5", "9am-5pm", "busy until noon", "school 8-3" using a single-day local clock.
- Merge priorBusyIntervals from the user JSON with the new message into one consolidated list; merge overlapping intervals.
- If the user clears constraints or says they have no fixed blocks, return [].
- If the message does not imply schedule blocks, return priorBusyIntervals unchanged (you may only normalize overlaps).`;

function buildRepositionPreservingSystem(dailyQuestCount: number): string {
  const n = clampQuestCount(dailyQuestCount);
  return `You are revising ONLY the daily schedule times for an existing goal. Reply with a single JSON object: { "dailyQuests": [ ... ] }.
The user JSON includes "quests": an ordered array of EXACTLY ${n} existing daily quests. You MUST return exactly ${n} items in dailyQuests in the SAME ORDER.

For each output item you MUST use the SAME "title", "description", and "points" as the corresponding input quest (identical strings and number). Do not rephrase titles or descriptions. You MAY change only "dayOrder", "startMinute", and "durationMinutes".

Constraints: dayOrder 0–999; startMinute 0–1439; durationMinutes 15–120; no overlapping blocks within the batch; prefer 06:00–22:00. reservedScheduleSlots are busy half-open intervals [startMinute, endMinute)—no quest block may overlap them.

Align start times with each quest's meaning (morning / afternoon / evening) when possible.`;
}

function normalizeTitleKey(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
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

/** Shown when the model only returned a title (never duplicate title as body). */
const QUEST_DESC_FALLBACK_WHEN_NO_BODY =
  'Pick a 10–15 minute window and one clear "done" signal (timer, count, or a specific outcome) before you start.';

const QUEST_DESC_FALLBACK_WHEN_DUPLICATE =
  'Set a time window and a clear finishing line (timer, count, or one concrete outcome) before you start.';

function clampTitleToFiveWords(title: string): string {
  const t = title.trim();
  if (!t) return t;
  const words = t.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 5) return t;
  return `${words.slice(0, 5).join(' ')}…`;
}

/**
 * Titles are at most 5 words; descriptions must not duplicate the title. If the model
 * merged action + detail in one string, split on em-dash or colon when helpful.
 */
function finalizeQuestTitleDescription(
  title: string,
  description: string,
): { title: string; description: string } {
  let t = clampTitleToFiveWords(title.trim());
  let d = description.trim();
  if (!d) {
    return { title: t, description: QUEST_DESC_FALLBACK_WHEN_NO_BODY };
  }
  if (normalizeTitleKey(t) === normalizeTitleKey(d)) {
    const parts = d.split(/[—:–-]/, 2);
    if (parts.length === 2) {
      const a = parts[0].trim();
      const b = parts[1].trim();
      if (a && b && normalizeTitleKey(a) !== normalizeTitleKey(b)) {
        t = clampTitleToFiveWords(a);
        d = b;
        return { title: t, description: d };
      }
    }
    d = QUEST_DESC_FALLBACK_WHEN_DUPLICATE;
  }
  return { title: t, description: d };
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
    return { title, description: QUEST_DESC_FALLBACK_WHEN_NO_BODY };
  }
  return undefined;
}

function parseFullResult(
  data: unknown,
  dailyQuestCount: number,
  reservedScheduleSlots?: ReservedScheduleSlot[],
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
    const finalized = finalizeQuestTitleDescription(paired.title, paired.description);
    title = finalized.title;
    description = finalized.description;
    const pts = resolveQuestPoints(q.points, dqIndex);
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
    reservedScheduleSlots,
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
  reservedScheduleSlots?: ReservedScheduleSlot[],
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
    const finalized = finalizeQuestTitleDescription(paired.title, paired.description);
    title = finalized.title;
    description = finalized.description;
    const pts = resolveQuestPoints(q.points, dqIndex);
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
  return finalizePlannerDailyQuests(
    normalizeDailyQuestDayOrders(out.slice(0, n)),
    reservedScheduleSlots,
  );
}

function parseRepositionPreservingResult(
  data: unknown,
  inputQuests: Quest[],
  reservedScheduleSlots?: ReservedScheduleSlot[],
): PlannerDailyQuest[] {
  const n = inputQuests.length;
  if (n === 0) return [];
  if (!isRecord(data) || !Array.isArray(data.dailyQuests)) {
    throw new GoalPlannerError('Invalid reposition response', 'bad_response');
  }
  const arr = data.dailyQuests;
  if (arr.length < n) {
    throw new GoalPlannerError(
      `Expected at least ${n} daily quests in reposition response`,
      'bad_response',
    );
  }
  const rows: DailyQuestParseRow[] = [];
  for (let i = 0; i < n; i += 1) {
    const q = arr[i];
    if (!isRecord(q)) {
      throw new GoalPlannerError('Invalid quest row in reposition response', 'bad_response');
    }
    const input = inputQuests[i];
    if (input.kind !== 'daily') {
      throw new GoalPlannerError('Reposition input must be daily quests', 'bad_response');
    }
    const aiTitle = pickQuestField(q, DAILY_QUEST_TITLE_KEYS);
    if (aiTitle && normalizeTitleKey(aiTitle) !== normalizeTitleKey(input.title)) {
      throw new GoalPlannerError(
        'Reposition response changed quest titles or order',
        'bad_response',
      );
    }
    const orderRaw = q.dayOrder;
    const dayOrder =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw)
        ? clampDayOrder(orderRaw)
        : clampDayOrder(input.dayOrder ?? 500);
    const row: DailyQuestParseRow = {
      title: input.title,
      description: input.description,
      points: resolveQuestPoints(input.points, i),
      dayOrder,
    };
    const sm = pickOptionalStartMinute(q);
    const dm = pickOptionalDurationMinutes(q);
    if (sm !== undefined) row.startMinute = clampStartMinute(sm);
    if (dm !== undefined) row.durationMinutes = clampDurationMinutes(dm);
    rows.push(row);
  }
  return finalizePlannerDailyQuests(
    normalizeDailyQuestDayOrders(rows),
    reservedScheduleSlots,
  );
}

export type RepositionDailyQuestsParams = {
  goalTitle: string;
  goalDescription: string;
  completedCheckpointCount: number;
  milestoneFrequency: MilestoneFrequency;
  checkpointTitles: string[];
  /** Existing daily quests in display order; must all be kind "daily". */
  quests: Quest[];
  reservedScheduleSlots: ReservedScheduleSlot[];
  todayIso: string;
  targetDateIso: string;
};

export async function parseLifeBusySlotsFromMessage(params: {
  message: string;
  priorBusyIntervals: ReservedScheduleSlot[];
  todayIso: string;
}): Promise<ReservedScheduleSlot[]> {
  const user = JSON.stringify({
    message: params.message.trim(),
    priorBusyIntervals: params.priorBusyIntervals,
    todayIso: params.todayIso,
  });
  const data = await postChatJson(LIFE_BUSY_PARSE_SYSTEM, user);
  if (!isRecord(data) || !Array.isArray(data.busyIntervals)) {
    throw new GoalPlannerError('Invalid busy intervals JSON', 'bad_response');
  }
  const out: ReservedScheduleSlot[] = [];
  for (const x of data.busyIntervals) {
    if (!isRecord(x)) continue;
    const sm = x.startMinute;
    const em = x.endMinute;
    if (typeof sm !== 'number' || typeof em !== 'number') continue;
    const start = Math.min(1439, Math.max(0, Math.round(sm)));
    const end = Math.min(1440, Math.max(0, Math.round(em)));
    if (end > start) out.push({ startMinute: start, endMinute: end });
  }
  return out;
}

export async function repositionDailyQuestsPreservingQuests(
  params: RepositionDailyQuestsParams,
): Promise<PlannerDailyQuest[]> {
  const dailies = params.quests.filter((q) => q.kind === 'daily');
  const n = dailies.length;
  if (n === 0) return [];
  const dailyQuestCount = clampQuestCount(n);
  const user = JSON.stringify({
    goalTitle: params.goalTitle,
    goalDescription: params.goalDescription,
    completedCheckpointCount: params.completedCheckpointCount,
    milestoneFrequency: params.milestoneFrequency,
    checkpointTitles: params.checkpointTitles,
    dailyQuestCount,
    quests: dailies.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      points: q.points,
      dayOrder: q.dayOrder,
      scheduleStartMinute: q.scheduleStartMinute,
      scheduleDurationMinutes: q.scheduleDurationMinutes,
    })),
    reservedScheduleSlots: params.reservedScheduleSlots ?? [],
    todayIso: params.todayIso,
    targetDateIso: params.targetDateIso,
  });
  const data = await postChatJson(buildRepositionPreservingSystem(dailyQuestCount), user);
  return parseRepositionPreservingResult(data, dailies, params.reservedScheduleSlots);
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
    reservedScheduleSlots: params.reservedScheduleSlots ?? [],
  });

  const data = await postChatJson(
    buildFullSystem(dailyQuestCount, milestoneFrequency),
    user,
  );
  return parseFullResult(data, dailyQuestCount, params.reservedScheduleSlots);
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
    reservedScheduleSlots: params.reservedScheduleSlots ?? [],
  });

  const data = await postChatJson(buildRegenSystem(dailyQuestCount), user);
  return parseDailyOnly(data, dailyQuestCount, params.reservedScheduleSlots);
}

const QUANTIFY_CLASSIFY_SYSTEM = `You help users turn fuzzy goals into measurable targets. Reply with JSON only (no markdown):
{ "needsQuantification": boolean, "suggestedQuestion": string }

Decide whether to ask ONE short follow-up so the goal has a clear measurable target (a number, amount, frequency, or concrete trackable outcome).

Set needsQuantification to true when:
- The user uses vague language ("more", "less", "better", "a lot") without a number but the goal can reasonably be measured (examples: reading → books/pages per month; weight/fitness → pounds/kg or body-fat %; money → dollar amounts; study → hours per week; running → distance or pace; language learning → hours or level; etc.).
- The user gives partial context (e.g. current weight) but not the target change or end state you would track.

Set needsQuantification to false when:
- The goal already states a concrete measurable target (counts, dollar amounts, distances, hours, deadlines with clear numbers, etc.).
- The goal should NOT be forced into a numeric box: romantic relationships, dating, "get a girlfriend/boyfriend", making friends, grief, self-worth, general happiness, spirituality without metrics — in those cases do not ask for a measurement.

When needsQuantification is true, suggestedQuestion must be exactly one conversational sentence, tailored to their wording (e.g. "How many books would you like to finish by then?", "How much weight would you like to lose?", "How much would you like to earn or save each month?"). When needsQuantification is false, suggestedQuestion must be "".`;

export type ClassifyQuantificationResult = {
  needsQuantification: boolean;
  suggestedQuestion: string;
};

export async function classifyQuantificationNeed(params: {
  shortTitle: string;
  specifics: string;
}): Promise<ClassifyQuantificationResult> {
  const user = JSON.stringify({
    shortTitle: params.shortTitle.trim(),
    specifics: params.specifics.trim(),
  });
  const data = await postChatJson(QUANTIFY_CLASSIFY_SYSTEM, user);
  if (!isRecord(data)) {
    throw new GoalPlannerError('Invalid quantification JSON', 'bad_response');
  }
  const needs =
    typeof data.needsQuantification === 'boolean' ? data.needsQuantification : false;
  const suggested =
    typeof data.suggestedQuestion === 'string' ? data.suggestedQuestion.trim() : '';
  return {
    needsQuantification: needs,
    suggestedQuestion: suggested,
  };
}

const ACHIEVABILITY_CRITIQUE_SYSTEM = `You are a concise goal coach. Reply with JSON only (no markdown):
{ "summary": string, "risks": string[], "suggestions": string[] }

Assess how realistic the goal is versus the stated deadline. Be honest but supportive. summary: 2-4 sentences. risks: 0-3 short strings. suggestions: 1-3 actionable strings.`;

export type CritiqueGoalAchievabilityParams = {
  shortTitle: string;
  specifics: string;
  quantificationAnswer?: string;
  targetDateIso: string;
  whyHelpful: string;
  todayIso: string;
};

function flattenAchievabilityCritique(data: Record<string, unknown>): string {
  const summary =
    typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : '';
  const risksRaw = data.risks;
  const suggestionsRaw = data.suggestions;
  const risks =
    Array.isArray(risksRaw) && risksRaw.length > 0
      ? risksRaw
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => `• ${x.trim()}`)
          .join('\n')
      : '';
  const suggestions =
    Array.isArray(suggestionsRaw) && suggestionsRaw.length > 0
      ? suggestionsRaw
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => `• ${x.trim()}`)
          .join('\n')
      : '';
  const parts: string[] = [];
  if (summary) parts.push(summary);
  if (risks) parts.push(`Risks:\n${risks}`);
  if (suggestions) parts.push(`Suggestions:\n${suggestions}`);
  const out = parts.join('\n\n').trim();
  return out || 'No critique returned.';
}

export async function critiqueGoalAchievability(
  params: CritiqueGoalAchievabilityParams,
): Promise<string> {
  const user = JSON.stringify({
    shortTitle: params.shortTitle.trim(),
    specifics: params.specifics.trim(),
    quantificationAnswer:
      params.quantificationAnswer && params.quantificationAnswer.trim()
        ? params.quantificationAnswer.trim()
        : null,
    targetDateIso: params.targetDateIso,
    whyHelpful: params.whyHelpful.trim(),
    todayIso: params.todayIso,
  });
  const data = await postChatJson(ACHIEVABILITY_CRITIQUE_SYSTEM, user);
  if (!isRecord(data)) {
    throw new GoalPlannerError('Invalid critique JSON', 'bad_response');
  }
  return flattenAchievabilityCritique(data);
}
