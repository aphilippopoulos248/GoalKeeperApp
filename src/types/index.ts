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

export type QuestKind = 'daily' | 'weekly';

export interface Quest {
  id: string;
  title: string;
  description: string;
  points: number;
  kind: QuestKind;
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
   * When false, title is a placeholder ("Milestone N") until the user unlocks and generates copy.
   * Omitted or undefined means true (legacy checkpoints).
   */
  revealed?: boolean;
  /** Planner week offset for AI context when revealing milestone text. */
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
  name: string;
  subtitle?: string;
}
