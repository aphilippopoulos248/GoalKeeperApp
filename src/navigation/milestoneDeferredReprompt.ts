import { navigateToGoalMilestoneCheck } from './milestoneCheckQueue';

/** How many daily quest completions for that goal after “No” before the milestone prompt returns. */
export const MILESTONE_REPROMPT_AFTER_QUEST_COMPLETIONS = 3;

type Deferred = { checkpointId: string; count: number };

const deferByGoalId = new Map<string, Deferred>();

/** While true, daily quest points must not advance this goal’s milestone bar (user declined the prompt). */
export function isGoalBarFrozenAfterMilestoneNo(goalId: string): boolean {
  return deferByGoalId.has(goalId);
}

/** Call when the user answers “No” on the milestone modal (queue head stays; prompt returns after N dailies). */
export function deferMilestoneRepromptAfterNo(goalId: string, checkpointId: string) {
  deferByGoalId.set(goalId, { checkpointId, count: 0 });
}

export function clearMilestoneRepromptDefer(goalId: string, checkpointId: string) {
  const cur = deferByGoalId.get(goalId);
  if (cur?.checkpointId === checkpointId) {
    deferByGoalId.delete(goalId);
  }
}

/**
 * Call when a daily quest for `goalId` is toggled to completed.
 * If a deferred milestone prompt for that goal has reached the threshold, navigates to the check.
 */
export function onGoalAffiliatedDailyQuestCompleted(goalId: string): void {
  const cur = deferByGoalId.get(goalId);
  if (!cur) return;
  const next = cur.count + 1;
  if (next >= MILESTONE_REPROMPT_AFTER_QUEST_COMPLETIONS) {
    deferByGoalId.delete(goalId);
    const { checkpointId } = cur;
    queueMicrotask(() => navigateToGoalMilestoneCheck(goalId, checkpointId));
  } else {
    deferByGoalId.set(goalId, { checkpointId: cur.checkpointId, count: next });
  }
}
