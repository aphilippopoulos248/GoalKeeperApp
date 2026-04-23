export type GoalPriority = 'low' | 'medium' | 'high';

/** How often milestones/checkpoints are spaced for a goal. */
export type MilestoneFrequency = 'weekly' | 'biweekly' | 'monthly';

/**
 * Shapes how AI writes milestone labels and daily-quest tone.
 * - linear: predictable numeric/quota slices
 * - biological: ranges, trends, behavior—not fixed per-period body outcomes
 * - skill_based: deliberate practice / difficulty / feedback ladder
 * - outcome_based: concrete steps toward an outcome without guarantees
 */
export type GoalType =
  | 'linear'
  | 'biological'
  | 'skill_based'
  | 'outcome_based';

export interface Quest {
  id: string;
  title: string;
  description: string;
  points: number;
  /**
   * Lower = earlier in the typical day (e.g. morning exercise); higher = later (e.g. wind-down reading).
   * Set by AI (0–999) so the menu can sort dailies across all goals.
   */
  dayOrder?: number;
  /** Minutes from midnight (0–1439). Set by AI when planning; optional on legacy quests. */
  scheduleStartMinute?: number;
  /** Block length in minutes (e.g. 15–120). Defaults in UI when missing. */
  scheduleDurationMinutes?: number;
}

export interface Checkpoint {
  id: string;
  title: string;
  done: boolean;
  /**
   * When false, title was deferred for on-demand AI unlock (legacy). New goals from the planner
   * set this to true at creation with real titles. Omitted or undefined means revealed.
   */
  revealed?: boolean;
  /** Planner week offset for AI context (e.g. legacy unlock) and cadence. */
  weekOffset?: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  /** ISO date string for the user-chosen deadline (used for AI refresh). */
  targetDateIso?: string;
  /** When the goal was created (local app or Supabase `created_at`); used for bar target span. */
  createdAtIso?: string;
  /** Drives daily quest count on the Menu (2 / 3 / 4). Defaults to medium when missing. */
  priority?: GoalPriority;
  /** Milestone spacing; defaults to weekly when missing (legacy goals). */
  milestoneFrequency?: MilestoneFrequency;
  /** How milestones/dailies are framed; defaults to linear when missing (legacy). */
  goalType?: GoalType;
  /** Full-goal achievability analysis from the add-goal wizard (optional). */
  achievabilityCritique?: string;
  checkpoints: Checkpoint[];
  dailyQuests?: Quest[];
  completed: boolean;
}

export interface Friend {
  id: string;
  username: string | null;
  display_name: string | null;
  name: string | null;
  avatar_url: string | null;
}
