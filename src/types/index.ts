export type GoalPriority = 'low' | 'medium' | 'high';

/** How often milestones/checkpoints are spaced for a goal. */
export type MilestoneFrequency = 'weekly' | 'biweekly' | 'monthly';

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
  checkpoints: Checkpoint[];
  dailyQuests?: Quest[];
  completed: boolean;
}

export interface Friend {
  id: string;
  name: string;
  subtitle?: string;
}
