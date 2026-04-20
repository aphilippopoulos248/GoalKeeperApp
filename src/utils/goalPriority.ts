import type { GoalPriority } from '../types';

export function dailyQuestCountForPriority(p: GoalPriority): number {
  switch (p) {
    case 'low':
      return 2;
    case 'medium':
      return 3;
    case 'high':
      return 4;
    default:
      return 3;
  }
}

export function parseGoalPriority(raw: unknown): GoalPriority {
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  return 'medium';
}
