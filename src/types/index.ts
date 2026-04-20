export type GoalPriority = 'low' | 'medium' | 'high';

export type QuestKind = 'daily' | 'weekly';

export interface Quest {
  id: string;
  title: string;
  description: string;
  points: number;
  kind: QuestKind;
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
  checkpoints: Checkpoint[];
  dailyQuests?: Quest[];
  completed: boolean;
}

export interface Friend {
  id: string;
  name: string;
  subtitle?: string;
}
