import type { Goal } from '../types';
import type { GreetingAccountKind } from './greetingIntent';

const MAX_GOAL_TITLE_LEN = 48;

function truncateTitle(title: string): string {
  const t = title.trim();
  if (t.length <= MAX_GOAL_TITLE_LEN) return t;
  return `${t.slice(0, MAX_GOAL_TITLE_LEN - 1)}…`;
}

function pickGoalForSpotlight(goals: Goal[]): Goal | null {
  const active = goals.filter((g) => !g.completed);
  if (active.length === 0) return null;
  const scored = active.map((g) => {
    const total = Math.max(1, g.checkpoints.length);
    const done = g.checkpoints.filter((c) => c.done).length;
    return { g, score: done / total };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.g ?? active[0];
}

function praiseForGoal(goal: Goal): string {
  const done = goal.checkpoints.filter((c) => c.done).length;
  const total = goal.checkpoints.length;
  if (total > 0 && done > 0) {
    return `You've already nailed ${done} of ${total} milestones on that path—that steady effort really shows.`;
  }
  if ((goal.dailyQuests?.length ?? 0) > 0) {
    return 'Showing up for those daily quests is exactly how big goals get closer, little by little.';
  }
  return "You're putting real attention on something that matters—that's worth celebrating.";
}

export function buildGreetingMessage(
  kind: GreetingAccountKind,
  displayName: string,
  goals: Goal[],
): string {
  const name = displayName.trim() || 'there';

  if (kind === 'new_account') {
    return `Welcome, ${name}! We're thrilled you're here. Thanks for trusting us with your goals—we'll ease you in and help you find steps that feel right for you.`;
  }

  const active = goals.filter((g) => !g.completed);
  const goal = pickGoalForSpotlight(active);

  if (!goal) {
    return `Welcome back, ${name}! It's wonderful to see you again. However your week is going, you're still in the game—whenever you're ready, we'll be right here to help you pick your next win.`;
  }

  const title = truncateTitle(goal.title);
  const praise = praiseForGoal(goal);

  return `Welcome back, ${name}! So good to see you staying with your goals. On "${title}": ${praise} Keep going—you're doing better than you think.`;
}
