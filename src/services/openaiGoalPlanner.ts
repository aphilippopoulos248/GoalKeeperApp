import Constants from 'expo-constants';

import type { GoalType, MilestoneFrequency, Quest } from '../types';
import { parseGoalType } from '../utils/goalNormalize';
import { getJobSearchContextForGoal } from './jsearchRapidApi';
import { getNutritionContextForGoal } from './spoonacularRecipes';

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
  /** How checkpoint labels and daily framing should read; defaults to linear when omitted. */
  goalType?: GoalType;
  /** Busy intervals from other active goals; new dailies must not overlap these. */
  reservedScheduleSlots?: ReservedScheduleSlot[];
};

export type RegenerateDailyQuestsParams = GoalPlannerBaseParams & {
  checkpointTitles: string[];
  /** Checkpoints not yet done—steers dailies toward the next part of the path. */
  upcomingCheckpointTitles: string[];
  /** Total checkpoints for this goal (early vs late journey). */
  totalCheckpointCount: number;
  /**
   * When set, the model must not repeat these titles/actions (e.g. after a user refresh).
   * Omit or use [] for first-time backfill.
   */
  previousDailyQuests?: Array<{ title: string; description: string }>;
  /** User journaling / progress notes; trimmed and length-capped server-side. */
  userProgressJournal?: string;
};

export type GenerateMilestoneFromContextParams = {
  title: string;
  description: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  goalType: GoalType;
  milestoneFrequency: MilestoneFrequency;
  /** 1-based index of the milestone being unlocked. */
  milestoneIndex: number;
  totalMilestones: number;
  weekOffset: number;
  completedCheckpointCount: number;
  /** Titles of earlier milestones already revealed (avoid repeating). */
  revealedPriorTitles: string[];
  /** Counselor-style progress story; optional. */
  userProgressNarrative?: string;
  targetDateIso: string;
  todayIso: string;
};

export type GoalPlannerErrorCode =
  | 'missing_key'
  | 'network'
  | 'bad_response'
  | 'checkpoint_mismatch'
  | 'api_error';

/** Cap AI-generated milestones per goal (long horizons still get a full year of weekly steps). */
export const MAX_AI_CHECKPOINTS = 52;

export type CheckpointPlan = {
  planDurationDays: number;
  expectedCheckpointCount: number;
  expectedWeekOffsets: number[];
};

const MS_PER_DAY = 86_400_000;

/**
 * Derives milestone count and weekOffset sequence from today → target and cadence.
 * Weekly: offsets 1,2,3,… — biweekly: 2,4,6,… — monthly (~4wk): 4,8,12,…
 */
export function computeCheckpointPlan(
  todayIso: string,
  targetDateIso: string,
  milestoneFrequency: MilestoneFrequency,
): CheckpointPlan {
  const t0 = Date.parse(todayIso);
  const t1 = Date.parse(targetDateIso);
  const planDurationDays =
    Number.isFinite(t0) && Number.isFinite(t1)
      ? Math.max(1, Math.ceil((t1 - t0) / MS_PER_DAY))
      : 1;

  let stepWeeks: number;
  let periods: number;
  switch (milestoneFrequency) {
    case 'biweekly':
      stepWeeks = 2;
      periods = Math.ceil(planDurationDays / 14);
      break;
    case 'monthly':
      stepWeeks = 4;
      periods = Math.ceil(planDurationDays / 30);
      break;
    case 'weekly':
    default:
      stepWeeks = 1;
      periods = Math.ceil(planDurationDays / 7);
      break;
  }

  const expectedCheckpointCount = Math.min(
    MAX_AI_CHECKPOINTS,
    Math.max(1, periods),
  );
  const expectedWeekOffsets = Array.from(
    { length: expectedCheckpointCount },
    (_, i) => (i + 1) * stepWeeks,
  );

  return { planDurationDays, expectedCheckpointCount, expectedWeekOffsets };
}

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

/**
 * Shared by buildFullSystem and buildRegenSystem: concreteness, milestone difficulty, title vs body.
 * Keep in sync when editing either path.
 */
const DAILY_QUEST_COPY_AND_TIER_RULES = `Daily quest text (critical):
- The user message includes "completedCheckpointCount" (number of milestones already completed) and a goal "title" and "description". Use them.
- **Title vs description (must differ):** Each item MUST have a separate "title" and "description".
  - "title": at most **5 words**; short imperative (e.g. "Choose one book", "Run five kilometers"). No period at the end.
  - "description": **one short sentence only** (roughly 12–22 words max). Add only what the title omits: a light time window, duration, or what "done" looks like—no lists, no multi-step paragraphs, no extra examples. **Do not** copy the title, paste the same sentence, or use a near-paraphrase of the title.
- **Cooking, meals, nutrition, meal prep:** Keep quests **category-level**, not menu-specific. **Forbidden** in title and description: naming a particular dish, cuisine specialty, or "make [named recipe]"; picking breakfast vs lunch vs dinner unless the goal itself is strictly about that one meal slot. Prefer lines like "Cook a healthy meal" / "Prep tomorrow's food" with a brief time or effort hint—the app’s AI Assist is where users get concrete meal or recipe ideas.
- **Passive + active (required):** If the quest centers on **consumption** (watch a video, listen to a podcast, read an article or tutorial mainly to learn), the **same quest** must also name a **concrete active follow-up** the user does after—still inside **one short sentence** (e.g. watch one short clip **and** jot one takeaway). **Forbidden:** passive-only lines ("watch…", "listen…", "read about…") with no output or practice step. Put the passive + active pair in **description** if the **title** must stay within 5 words (title can hint at both, e.g. "Watch clip, note takeaway").
- **Zero baseline (completedCheckpointCount is 0):** Assume the user has **not** already built the habit and may lack prior skill. No prerequisite skills—quests must be things a total beginner can do today. **Order** the dailyQuests array as a small ramp: first item = **shortest / easiest setup** (2–5 min, e.g. pick the book, find a 10-minute video, lay out shoes); later items in the list = **slightly** more (still easy: e.g. read 5 pages, then 10 pages; mirror talk for 1 minute). Forbid vague stems ("improve…", "work on…", "get better at…") unless the same line names a **concrete** action, object, and/or number.
- **Milestone / progress scale:** follow the **Outcome proximity** block below (not "just harder"—closer to the goal over time).
- **Examples (flavor only; match the user's goal):** "Read more" with 0 milestones: choose a book → read 5 pages → read 10 pages. "Socialize more" with 0: watch one short video on conversation skills **and** write two bullets you will try tomorrow → practice one of those in a mirror for 1 minute. "Get fit" with 2+ milestones: 20 push-ups in one set, run 5 km outside, etc.`;

const DAILY_QUEST_PROXIMITY_RULES = `Outcome proximity (critical—use completedCheckpointCount, goal "title"/"description", and when present "upcomingCheckpointTitles" / "totalCheckpointCount"):
- Two axes: (1) day-sized / finishable today; (2) **closeness to the user’s stated outcome** (goal title + description = north star). When completedCheckpointCount increases, raise **(2)** every tier—not only minutes, reps, or difficulty. Avoid endless repeats of the same *kind* of prep (videos, mirror work, generic group-only events) at high counts unless the goal is purely quantitative (e.g. reading pages).
- Tier guide (adapt to the goal; not a rigid script):
  - **0 milestones completed:** farthest from the outcome—skills, research, environment, private rehearsal, self-contained prep.
  - **1 milestone completed:** real-world **low-stakes** exposure in the **domain** of the goal.
  - **2+ milestones completed:** **outcome-adjacent** actions—what a reasonable person reads as *directly practicing the goal* (still one-day sized, still smaller than a full milestone; **outcome closeness is not the same as maximum one-day difficulty**—see Timeframe and realism). For relationship, dating, or romance-aligned goals when the title implies it: progress from generic socializing toward **interest-based** interaction (e.g. genuine compliment, brief one-on-one chat, express interest, low-pressure invite)—not perpetual prep. For reading, fitness, etc., move toward the measurable core of that goal.
- **Milestones:** dailies stay easier than checkpoints, but at higher completedCheckpointCount they may be **mini-versions in spirit** of the **next** upcoming milestones—same path, smaller step; never copy a milestone label verbatim.
- **Respect and safety (brief):** consent, mutual interest, appropriate public or social contexts, no pressure, no harassment; respect boundaries and "no."`;

const DAILY_QUEST_RUNWAY_REALISM_RULES = `Timeframe and realism (user message includes "todayIso" and "targetDateIso"):
- Each daily quest must stay **human-scale for one day**: doable in the described time (align with durationMinutes; do not imply an all-day ordeal or a life outcome in a single session).
- **High completedCheckpointCount does not** justify **nearly impossible** or elite one-day demands. Proximity to the goal means **relevant, direct** steps—not a fantasy jump in volume, skill, or outcome (e.g. no first-time ultra-endurance feats, no “guaranteed” relationship results, no brand-new expert-level performance unless the user’s description shows that baseline).
- Use **todayIso** vs **targetDateIso**: if the deadline is **soon**, prefer **smaller, verifiable** steps that still match the goal; if the deadline is **far**, still keep each quest a **modest single-day** action—do not assign future-level work in one day.
- Increase load **gradually** (a few more minutes, reps, pages, or one extra social step)—not jumps that assume weeks of unstated training.`;

/** Max characters sent in user JSON for userProgressJournal (token control). */
export const USER_PROGRESS_JOURNAL_MAX_CHARS = 8000;

function capUserProgressJournal(s: string | undefined): string | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = s.trim();
  if (t.length <= USER_PROGRESS_JOURNAL_MAX_CHARS) return t;
  return `${t.slice(0, USER_PROGRESS_JOURNAL_MAX_CHARS)}…`;
}

/** Cap what we send into the synthesis prompt (token control). */
const SYNTHESIS_INPUT_WINDOW = 14_000;

function capSynthesisInputs(previousNarrative: string, newEntry: string): {
  previousNarrative: string;
  newEntry: string;
} {
  let p = previousNarrative.trim();
  let n = newEntry.trim();
  const total = p.length + n.length;
  if (total <= SYNTHESIS_INPUT_WINDOW) {
    return { previousNarrative: p, newEntry: n };
  }
  if (n.length >= SYNTHESIS_INPUT_WINDOW) {
    return { previousNarrative: '', newEntry: n.slice(0, SYNTHESIS_INPUT_WINDOW) };
  }
  const budgetForPrev = SYNTHESIS_INPUT_WINDOW - n.length;
  if (p.length > budgetForPrev) {
    p = `…${p.slice(-Math.max(0, budgetForPrev - 1))}`;
  }
  return { previousNarrative: p, newEntry: n };
}

export type ProgressNarrativeSynthesisMode = 'merge_journal' | 'advance_day';

const SYNTHESIZE_PROGRESS_NARRATIVE_SYSTEM = `You maintain a counselor-style progress story as plain text (the story itself is not JSON).
Reply with a single JSON object only (no markdown): { "narrative": string }

The user message JSON includes: "mode" ("merge_journal" or "advance_day"), "simulationDay" (positive integer), "previousNarrative" (string, may be empty), "newEntry" (string; for advance_day may be a system note).

**Required format for "narrative" (all modes):**
- Use explicit day headings: a line must start with exactly "Day 1:", "Day 2:", etc. (number matches the in-app day index). After each heading, write the paragraph(s) for that day. **One block per day number**, in ascending order. Do not use duplicate "Day N:" headings.
- Supportive, third person or neutral second person, concise. Resolve contradictions: if the user completed something, do not also treat it as still "to do."

**mode "merge_journal":** Merge "newEntry" into the block for **Day {simulationDay}** only (simulationDay tells you which day block to update or create). Preserve other day blocks unless a small fix is needed for consistency. If "previousNarrative" is empty, create "Day {simulationDay}:" with the merged content.
**mode "advance_day":** The user moved to the next simulated day without a new user-written journal. "simulationDay" is the **new** day number. Append a "Day {simulationDay}:" section (after prior days) with a short neutral line that this new day has started and there is no new check-in text yet. Preserve all previous day blocks' substance.

Max length for "narrative": under ${USER_PROGRESS_JOURNAL_MAX_CHARS} characters.`;

export type SynthesizeProgressNarrativeParams = {
  previousNarrative: string;
  newEntry: string;
  /** For merge_journal: the day block to update. For advance_day: the new day number after advancing. */
  simulationDay: number;
  mode: ProgressNarrativeSynthesisMode;
};

export async function synthesizeProgressNarrative(
  params: SynthesizeProgressNarrativeParams,
): Promise<string> {
  const mode = params.mode;
  const simulationDay = Math.max(1, Math.floor(params.simulationDay));
  if (mode === 'merge_journal' && !params.newEntry.trim()) {
    const fallback = params.previousNarrative.trim();
    return capUserProgressJournal(fallback) ?? '';
  }
  const { previousNarrative, newEntry } = capSynthesisInputs(
    params.previousNarrative,
    mode === 'advance_day'
      ? (params.newEntry.trim() ||
          `[System: User advanced to simulated day ${simulationDay} with no new journal; add a short Day ${simulationDay} placeholder.]`)
      : params.newEntry,
  );
  if (mode === 'merge_journal' && !newEntry.trim()) {
    return capUserProgressJournal(params.previousNarrative.trim()) ?? '';
  }
  const user = JSON.stringify({
    mode,
    simulationDay,
    previousNarrative,
    newEntry,
  });
  const data = await postChatJson(SYNTHESIZE_PROGRESS_NARRATIVE_SYSTEM, user, {
    temperature: 0.35,
  });
  if (!isRecord(data)) {
    throw new GoalPlannerError('Invalid synthesis JSON', 'bad_response');
  }
  const raw =
    typeof data.narrative === 'string'
      ? data.narrative
      : typeof data.story === 'string'
        ? data.story
        : '';
  const t = raw.trim();
  if (!t) {
    throw new GoalPlannerError('Empty narrative from model', 'bad_response');
  }
  return capUserProgressJournal(t) ?? t;
}

const DAILY_QUEST_USER_JOURNAL_RULES = `User-reported progress (applies when the user JSON field "userProgressJournal" is a non-empty string):
- This field is a **single reconciled counselor-style story** of the user’s recent progress, **not** a list of raw journal lines. It may be structured with **"Day 1:", "Day 2:",** etc.—give more weight to **open threads** in the **latest** day sections when planning dailies, while still honoring completed vs pending across the whole story.
- Use **concrete names** the story mentions (event titles, people, books, places, products, skills). Treat the story as the source of truth for what is **settled** vs what is an **open thread**.
- **Do not** assign daily quests for actions the story describes as **already completed** or no longer needed. Propose only **sensible next small steps** for **open threads** that still fit this goal.
- The story may include unrelated life detail: prioritize what fits this goal’s title and description; ignore what does not.
- You must still obey all other system rules: one-day scale, no verbatim milestone text, reservedScheduleSlots, Outcome proximity, and replace-mode anti-repetition when applicable.`;

const REGEN_ANTI_REPETITION_RULES = `Replace mode (applies when user JSON has "replacePreviousQuests": true and a non-empty "previousDailyQuests" array):
- That array lists the **old** daily quests being **fully replaced**. You must output a **new** set of quests, not a light revision.
- New titles and descriptions must be **substantively different** from every previous title and every previous description: use **different** core verbs, nouns, objects, and *kinds* of action (e.g. if the old set was all "read N pages", switch to a mix: select material, time-boxed session, note one takeaway, audio, new location, etc.—whatever fits the goal but **not** the same three beats).
- **Forbidden:** reusing a previous title; minor word swaps ("5" vs "five"); the same main action with a different number; the same three-step story with tweaked wording; overlapping first three words of any previous title.
- **Required:** at least one quest should feel like a **different angle** on the goal (preparation, reflection, environment, social, measurement, or recovery—not only "more of the same primary behavior").
- **Do not** reset to early-journey prep-only quests: match the current **completedCheckpointCount** outcome proximity and **upcomingCheckpointTitles** so variety does not undo the proximity ladder.
- If "replacePreviousQuests" is false or "previousDailyQuests" is empty, ignore this block.
- "regenerationRequestId" in the user JSON is unique per request; each id must produce an independent new batch, not a small edit of the last output.`;

/** goalType still steers SMART fields and daily quests; checkpoint labels are deferred (empty). */
function goalTypeDeferredCheckpointNote(goalType: GoalType): string {
  return `Goal type "${goalType}" applies to SMART fields and daily quests below. Checkpoint "label" strings are always "" (deferred).`;
}

function goalTypeDailyQuestGuidance(goalType: GoalType): string {
  switch (goalType) {
    case 'biological':
      return `Goal type (daily quests): "biological". Do **not** set fixed "X lbs this week" or similar precise per-period body outcomes in titles/descriptions. Prefer **process, ranges, trends, adherence, recovery, and measurement habits**—still one-day sized and smaller than milestones.`;
    case 'skill_based':
      return `Goal type (daily quests): "skill_based". Emphasize **practice, feedback, and small escalations**; dailies stay easier than milestones but follow a skill ladder.`;
    case 'outcome_based':
      return `Goal type (daily quests): "outcome_based". Prefer **concrete actions** toward the outcome (prep, outreach, reflection, portfolio work); no guaranteed relationship/job outcomes in copy.`;
    case 'linear':
    default:
      return `Goal type (daily quests): "linear". Dailies can track **clear numeric or quota steps** when they match the goal, still smaller than milestones.`;
  }
}

function buildFullSystem(
  dailyQuestCount: number,
  milestoneFrequency: MilestoneFrequency,
  checkpointPlan: CheckpointPlan,
  goalType: GoalType,
): string {
  const n = clampQuestCount(dailyQuestCount);
  const offsetsList = checkpointPlan.expectedWeekOffsets.join(', ');
  const milestoneBlock = `Checkpoints (critical):
- The user JSON includes planDurationDays, expectedCheckpointCount, expectedWeekOffsets, milestoneFrequency ("${milestoneFrequency}"), goalType ("${goalType}"), todayIso, and targetDateIso.
- You MUST return exactly ${checkpointPlan.expectedCheckpointCount} objects in "checkpoints" (no fewer, no more).
- For each index i, checkpoints[i].weekOffset MUST equal expectedWeekOffsets[i]. Required sequence: [${offsetsList}]. weekOffset is the week number from goal start (1 = end of week 1).
- Each checkpoint "label" MUST be the empty string "" (no milestone wording here). The app shows numbered placeholders until the user unlocks each milestone later.
- **Progression (for your mental model only):** Early checkpoints correspond to first slices toward the outcome; the **last** checkpoint aligns with completing the stated goal by targetDateIso—interpret via goalType when you write SMART fields and dailies (linear = metric progress; biological = systems/trends; skill = practice ladder; outcome = meaningful steps without guarantees).

${goalTypeDeferredCheckpointNote(goalType)}

Milestones vs daily quests:
- Milestones are the **cadence-sized slice** of the outcome for that period—not necessarily a single dramatic leap. They remain **larger** than any one daily quest.
- Daily quests are **smaller**, **build toward** upcoming checkpoints, and must **not** copy milestone wording. At **low** completedCheckpointCount they are mostly preparatory; later they move closer to the outcome (see Outcome proximity below).
- Apply **goalType** to daily quest tone per **Goal type (daily quests)** in Rules below.`;

  return `You are a goal-planning coach. Reply with a single JSON object only (no markdown).
Fields:
- specific: string (refined SMART Specific)
- measurable: string (SMART Measurable)
- achievable: string (SMART Achievable — short, realistic)
- relevant: string (SMART Relevant)
- timeBound: string (one clear sentence: deadline and horizon in plain language)
- timeBoundCritique: string (one short honest critique of whether the deadline is realistic for the outcome; suggest adjustment if needed)
- checkpoints: array of { "weekOffset": number, "label": string } — every "label" must be "".

${milestoneBlock}

${DAILY_QUEST_COPY_AND_TIER_RULES}

${DAILY_QUEST_PROXIMITY_RULES}

${DAILY_QUEST_RUNWAY_REALISM_RULES}

Rules:
- Use the user's title and description; make SMART fields concrete.
- If completedCheckpointCount is 0, daily quests must be VERY EASY (5–15 min, low friction), following the zero-baseline and ramp rules above. If higher, increase **proximity to the goal outcome** and difficulty/points modestly (still safe and actionable) per the Outcome proximity and **Timeframe and realism** blocks above—never near-impossible single-day quests.
- Checkpoints must match expectedCheckpointCount and expectedWeekOffsets from the user message exactly, and align with the goal, deadline, and **goalType**.
- ${goalTypeDailyQuestGuidance(goalType)}
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

const SPOONACULAR_PLANNER_RULES = `Spoonacular context (applies when the user message includes a non-empty string "spoonacularContext"):
- That string lists **real** recipe or nutrition-filtered ideas from a food API—use it only to **inform** realistic habits (macros, timing, prep level). **Do not** paste dish names, recipe titles, or ingredient lists into any daily quest **title** or **description**.
- Write food-related dailies as **generic actions** (e.g. cook one balanced meal, batch-prep vegetables, log meals, grocery run for staples). Users get **specific** meal ideas inside the app’s AI Assist, not in the quest card.
- Do not invent recipe names, chain restaurants, or branded products not in "spoonacularContext" (and do not put list items verbatim into quests).
- Keep the usual **goalType** rules: for "biological", do not promise a fixed per-week body-weight or body-fat outcome in quest text.
- You may use other quest slots for complementary habits (timing, logging, prep environment) if they still fit the goal.`;

const JSEARCH_PLANNER_RULES = `JSearch job market context (applies when the user message includes a non-empty string "jsearchContext"):
- That string summarizes **real** recent job listings from a search API—use it only to **inform** realistic job-search progression: skills to highlight, pipeline habits, interview prep, networking, application cadence.
- **Do not** paste job titles, employer names, or listing text verbatim into daily quest **titles** or **descriptions**. Write quests as **generic actions** (e.g. "Tailor resume to one target role family", "Complete one mock interview question", "Identify three companies to research").
- **Do not** promise the user will be hired at any specific employer or role named in jsearchContext.
- Checkpoint "label" strings remain "" where required; SMART fields and dailies should still feel credible for **job search** when the goal is career-related.
- You may refer **abstractly** to skills or role families suggested by the sample (e.g. "roles in this lane often emphasize communication") without quoting listings.`;

function appendSpoonacularRules(
  system: string,
  spoonacularContext: string | null,
): string {
  if (typeof spoonacularContext === 'string' && spoonacularContext.trim().length > 0) {
    return `${system}

${SPOONACULAR_PLANNER_RULES}`;
  }
  return system;
}

function appendJSearchRules(system: string, jsearchContext: string | null): string {
  if (typeof jsearchContext === 'string' && jsearchContext.trim().length > 0) {
    return `${system}

${JSEARCH_PLANNER_RULES}`;
  }
  return system;
}

function appendPlannerExternalContext(
  system: string,
  spoonacularContext: string | null,
  jsearchContext: string | null,
): string {
  return appendJSearchRules(appendSpoonacularRules(system, spoonacularContext), jsearchContext);
}

function buildRegenSystem(dailyQuestCount: number, goalType: GoalType): string {
  const n = clampQuestCount(dailyQuestCount);
  return `You are a goal-planning coach. Reply with a single JSON object only: { "dailyQuests": [ ... ] }.
dailyQuests must have exactly ${n} items: { "title", "description", "points", "dayOrder", "startMinute", "durationMinutes" } with points exactly 10, 15, 20, or 25 only (vary across quests), dayOrder 0–999, startMinute 0–1439, durationMinutes 15–120. Blocks must not overlap within the array; prefer 06:00–22:00. If the user JSON includes reservedScheduleSlots, treat each entry as a busy half-open interval [startMinute, endMinute)—your quests must not overlap those (one quest at a time globally).

${DAILY_QUEST_COPY_AND_TIER_RULES}

${DAILY_QUEST_PROXIMITY_RULES}

${DAILY_QUEST_RUNWAY_REALISM_RULES}

${REGEN_ANTI_REPETITION_RULES}

${DAILY_QUEST_USER_JOURNAL_RULES}

Rules:
- The user JSON includes "goalType" (linear / biological / skill_based / outcome_based). ${goalTypeDailyQuestGuidance(goalType)}
- The user JSON includes "checkpointTitles" and (when present) "upcomingCheckpointTitles" and "totalCheckpointCount". Daily quests must be **smaller** than full milestones, **support** the path to upcoming milestones, and **increase closeness to the goal** as completedCheckpointCount rises (see Outcome proximity). They must **not** duplicate a milestone’s wording. Use completedCheckpointCount, upcoming checkpoints, and **not** only generic "prep" at high progress. Always respect **Timeframe and realism**: one-day achievable, not nearly impossible even at high milestones.
- The user message includes milestoneFrequency (weekly / biweekly / monthly). Align daily quest pacing and tone with that cadence (e.g. smaller daily steps when milestones are weekly vs monthly).
- Quests must support the user's goal and build skills toward the **next** milestones the user has not yet reached.
- If completedCheckpointCount is 0, quests are VERY EASY, following the zero-baseline and ramp rules above. Higher counts follow **Outcome proximity**—still **below** the bar of a full milestone challenge.
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

type PostChatOptions = { temperature?: number };

async function postChatJson(
  system: string,
  user: string,
  options?: PostChatOptions,
): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new GoalPlannerError(
      'Missing OpenAI API key. Create a .env file in the project root with EXPO_PUBLIC_OPENAI_API_KEY=your_key and restart Expo (see .env.example).',
      'missing_key',
    );
  }

  const temperature =
    typeof options?.temperature === 'number' && Number.isFinite(options.temperature)
      ? Math.min(2, Math.max(0, options.temperature))
      : 0.35;

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
        temperature,
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
  'Block 10–15 minutes and decide one simple “done” signal before you start.';

const QUEST_DESC_FALLBACK_WHEN_DUPLICATE =
  'Choose a short time window and one clear finish line before you start.';

function clampTitleToFiveWords(title: string): string {
  const t = title.trim();
  if (!t) return t;
  const words = t.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 5) return t;
  return `${words.slice(0, 5).join(' ')}…`;
}

/** Keep menu copy short even if the model returns a long paragraph. */
const QUEST_DESC_MAX_WORDS = 26;

function clampShortQuestDescription(description: string): string {
  const words = description.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= QUEST_DESC_MAX_WORDS) return words.join(' ');
  return `${words.slice(0, QUEST_DESC_MAX_WORDS).join(' ')}…`;
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
  d = clampShortQuestDescription(d);
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
  reservedScheduleSlots: ReservedScheduleSlot[] | undefined,
  checkpointPlan: CheckpointPlan,
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
    const labelRaw = c.label;
    if (typeof weekOffset !== 'number' || !Number.isFinite(weekOffset)) continue;
    const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
    checkpoints.push({
      weekOffset: Math.max(1, Math.round(weekOffset)),
      label,
    });
  }

  if (checkpoints.length === 0) {
    throw new GoalPlannerError('No valid checkpoints', 'bad_response');
  }

  checkpoints.sort((a, b) => a.weekOffset - b.weekOffset);

  if (checkpoints.length !== checkpointPlan.expectedCheckpointCount) {
    throw new GoalPlannerError(
      `Checkpoints: expected exactly ${checkpointPlan.expectedCheckpointCount}, got ${checkpoints.length}`,
      'checkpoint_mismatch',
    );
  }
  for (let i = 0; i < checkpoints.length; i++) {
    if (checkpoints[i].weekOffset !== checkpointPlan.expectedWeekOffsets[i]) {
      throw new GoalPlannerError(
        `Checkpoints: at index ${i} expected weekOffset ${checkpointPlan.expectedWeekOffsets[i]}, got ${checkpoints[i].weekOffset}`,
        'checkpoint_mismatch',
      );
    }
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

const MILESTONE_REVEAL_TITLE_MAX = 160;

const JSEARCH_MILESTONE_RULES = `JSearch context (applies when user JSON has non-empty "jsearchContext"):
- The string is a **sample** of real job listings—use only to shape a **credible** job-search milestone (pipeline, skills, prep). **Do not** name specific employers or job titles from the list. **Do not** imply a guaranteed offer.`;

const GENERATE_MILESTONE_FROM_CONTEXT_SYSTEM = `You write ONE milestone title for a goal-tracking app. Reply with JSON only: { "title": string }.

Rules:
- "title": one clear, verifiable outcome for this checkpoint period (no "Week N:" prefix; no surrounding quotes). Aim under ${MILESTONE_REVEAL_TITLE_MAX} characters.
- Respect the user JSON "goalType":
  - linear: concrete increments when the goal has numbers or quotas.
  - biological: process, adherence, trends, recovery—no guaranteed fixed weekly body outcomes.
  - skill_based: deliberate-practice or feedback step appropriate to the period.
  - outcome_based: concrete action toward the outcome; no guaranteed relationship/job/personal results.
- Scale the milestone to "milestoneFrequency" (weekly vs biweekly vs monthly): one meaningful slice for that cadence, larger than a single-day task.
- If "userProgressNarrative" is non-empty, weight it heavily: open threads, names, and settled vs pending from the story. Skip actions the story says are already done.
- If "userProgressNarrative" is empty or very thin, infer a fitting milestone from the goal title, description, SMART fields, and progressSummary.
- Do not copy or lightly rephrase any string in "revealedPriorTitles"; advance the path.
- Never output an empty "title".`;

export async function generateMilestoneFromContext(
  params: GenerateMilestoneFromContextParams,
): Promise<string> {
  const narrative = capUserProgressJournal(params.userProgressNarrative?.trim() || undefined);
  const revealedPriorTitles = params.revealedPriorTitles
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  let jsearchContext: string | null = null;
  try {
    jsearchContext = await getJobSearchContextForGoal({
      title: params.title,
      description: params.description,
    });
  } catch {
    jsearchContext = null;
  }

  const user = JSON.stringify({
    goalTitle: params.title.trim(),
    goalDescription: params.description.trim(),
    specific: params.specific.trim(),
    measurable: params.measurable.trim(),
    achievable: params.achievable.trim(),
    relevant: params.relevant.trim(),
    timeBound: params.timeBound.trim(),
    goalType: parseGoalType(params.goalType),
    milestoneFrequency: params.milestoneFrequency,
    milestoneIndex: params.milestoneIndex,
    totalMilestones: params.totalMilestones,
    weekOffset: params.weekOffset,
    completedCheckpointCount: params.completedCheckpointCount,
    revealedPriorTitles,
    userProgressNarrative: narrative ?? '',
    progressSummary: `Unlocking milestone ${params.milestoneIndex} of ${params.totalMilestones}. Completed checkpoints so far: ${params.completedCheckpointCount}.`,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    ...(jsearchContext ? { jsearchContext } : {}),
  });

  let system = GENERATE_MILESTONE_FROM_CONTEXT_SYSTEM;
  if (typeof jsearchContext === 'string' && jsearchContext.trim().length > 0) {
    system = `${system}

${JSEARCH_MILESTONE_RULES}`;
  }

  const data = await postChatJson(system, user, {
    temperature: 0.45,
  });
  if (!isRecord(data)) {
    throw new GoalPlannerError('Invalid milestone JSON', 'bad_response');
  }
  const raw = typeof data.title === 'string' ? data.title.trim() : '';
  if (!raw) {
    throw new GoalPlannerError('Empty milestone title from model', 'bad_response');
  }
  const capped =
    raw.length > MILESTONE_REVEAL_TITLE_MAX
      ? `${raw.slice(0, MILESTONE_REVEAL_TITLE_MAX).trim()}…`
      : raw;
  return capped || raw;
}

export async function planNewGoal(
  params: GoalPlannerBaseParams,
): Promise<GoalPlannerFullResult> {
  const dailyQuestCount = clampQuestCount(params.dailyQuestCount);
  const milestoneFrequency = params.milestoneFrequency ?? 'weekly';
  const goalType = parseGoalType(params.goalType);
  const checkpointPlan = computeCheckpointPlan(
    params.todayIso,
    params.targetDateIso,
    milestoneFrequency,
  );

  let spoonacularContext: string | null = null;
  try {
    spoonacularContext = await getNutritionContextForGoal({
      title: params.title,
      description: params.description,
    });
  } catch {
    spoonacularContext = null;
  }

  let jsearchContext: string | null = null;
  try {
    jsearchContext = await getJobSearchContextForGoal({
      title: params.title,
      description: params.description,
    });
  } catch {
    jsearchContext = null;
  }

  const user = JSON.stringify({
    title: params.title,
    description: params.description,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    completedCheckpointCount: params.completedCheckpointCount,
    dailyQuestCount,
    milestoneFrequency,
    goalType,
    planDurationDays: checkpointPlan.planDurationDays,
    expectedCheckpointCount: checkpointPlan.expectedCheckpointCount,
    expectedWeekOffsets: checkpointPlan.expectedWeekOffsets,
    reservedScheduleSlots: params.reservedScheduleSlots ?? [],
    ...(spoonacularContext ? { spoonacularContext } : {}),
    ...(jsearchContext ? { jsearchContext } : {}),
  });

  const runOnce = async (isRetry: boolean): Promise<GoalPlannerFullResult> => {
    let system = appendPlannerExternalContext(
      buildFullSystem(
        dailyQuestCount,
        milestoneFrequency,
        checkpointPlan,
        goalType,
      ),
      spoonacularContext,
      jsearchContext,
    );
    if (isRetry) {
      system += `

RETRY — Your previous reply failed validation. checkpoints must contain exactly ${checkpointPlan.expectedCheckpointCount} items, and each checkpoints[i].weekOffset must equal expectedWeekOffsets[i] in order: [${checkpointPlan.expectedWeekOffsets.join(', ')}]. Reply with a single valid JSON object; follow all other rules unchanged.`;
    }
    const data = await postChatJson(system, user, {
      temperature: isRetry ? 0.35 : undefined,
    });
    return parseFullResult(
      data,
      dailyQuestCount,
      params.reservedScheduleSlots,
      checkpointPlan,
    );
  };

  try {
    return await runOnce(false);
  } catch (e) {
    if (e instanceof GoalPlannerError && e.code === 'checkpoint_mismatch') {
      return await runOnce(true);
    }
    throw e;
  }
}

export async function regenerateDailyQuests(
  params: RegenerateDailyQuestsParams,
): Promise<GoalPlannerFullResult['dailyQuests']> {
  const dailyQuestCount = clampQuestCount(params.dailyQuestCount);
  const milestoneFrequency = params.milestoneFrequency ?? 'weekly';
  const goalType = parseGoalType(params.goalType);
  const previousDailyQuests = (params.previousDailyQuests ?? [])
    .filter((q) => (q.title?.trim() ?? '') !== '' || (q.description?.trim() ?? '') !== '')
    .map((q) => ({
      title: (q.title ?? '').trim(),
      description: (q.description ?? '').trim(),
    }));
  const replacePreviousQuests = previousDailyQuests.length > 0;
  const userProgressJournal = capUserProgressJournal(params.userProgressJournal);

  let spoonacularContext: string | null = null;
  try {
    spoonacularContext = await getNutritionContextForGoal({
      title: params.title,
      description: params.description,
    });
  } catch {
    spoonacularContext = null;
  }

  let jsearchContext: string | null = null;
  try {
    jsearchContext = await getJobSearchContextForGoal({
      title: params.title,
      description: params.description,
    });
  } catch {
    jsearchContext = null;
  }

  const user = JSON.stringify({
    title: params.title,
    description: params.description,
    targetDateIso: params.targetDateIso,
    todayIso: params.todayIso,
    completedCheckpointCount: params.completedCheckpointCount,
    checkpointTitles: params.checkpointTitles,
    upcomingCheckpointTitles: params.upcomingCheckpointTitles,
    totalCheckpointCount: params.totalCheckpointCount,
    dailyQuestCount,
    milestoneFrequency,
    goalType,
    reservedScheduleSlots: params.reservedScheduleSlots ?? [],
    previousDailyQuests: replacePreviousQuests ? previousDailyQuests : [],
    replacePreviousQuests,
    userProgressJournal: userProgressJournal ?? null,
    /** Unique per request so the model treats each refresh as a new generation, not a tweak of the last. */
    regenerationRequestId: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    ...(spoonacularContext ? { spoonacularContext } : {}),
    ...(jsearchContext ? { jsearchContext } : {}),
  });

  const data = await postChatJson(
    appendPlannerExternalContext(buildRegenSystem(dailyQuestCount, goalType), spoonacularContext, jsearchContext),
    user,
    { temperature: replacePreviousQuests ? 0.72 : 0.35 },
  );
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
  achievementDifficulty?: string;
}): Promise<ClassifyQuantificationResult> {
  const diff = params.achievementDifficulty?.trim();
  const user = JSON.stringify({
    shortTitle: params.shortTitle.trim(),
    specifics: params.specifics.trim(),
    ...(diff ? { achievementDifficulty: diff } : {}),
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
  achievementDifficulty?: string;
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
  const diff =
    params.achievementDifficulty && params.achievementDifficulty.trim()
      ? params.achievementDifficulty.trim()
      : null;
  const user = JSON.stringify({
    shortTitle: params.shortTitle.trim(),
    specifics: params.specifics.trim(),
    achievementDifficulty: diff,
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
