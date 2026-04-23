import { rootNavigationRef } from './rootNavigationRef';

export type MilestoneCheckQueueItem = { goalId: string; checkpointId: string };

const queue: MilestoneCheckQueueItem[] = [];

const sameItem = (a: MilestoneCheckQueueItem, b: MilestoneCheckQueueItem) =>
  a.goalId === b.goalId && a.checkpointId === b.checkpointId;

/** Append unique items. Returns `true` if a first prompt should be shown (queue was empty and new items were added). */
export function enqueueMilestoneChecks(items: MilestoneCheckQueueItem[]): boolean {
  if (items.length === 0) {
    return false;
  }
  const wasEmpty = queue.length === 0;
  let added = 0;
  for (const it of items) {
    if (!queue.some((q) => sameItem(q, it))) {
      queue.push(it);
      added += 1;
    }
  }
  return wasEmpty && added > 0;
}

/** Current head without mutating (e.g. re-prompt after “No” once user returns). */
export function peekMilestoneCheckQueue(): MilestoneCheckQueueItem | undefined {
  return queue[0];
}

/** Remove the current head (user answered the prompt for this one). */
export function shiftMilestoneCheck(): MilestoneCheckQueueItem | undefined {
  return queue.shift();
}

/** If anything remains, navigate to the next first item. */
export function navigateToNextMilestoneInQueue(): void {
  if (queue.length === 0) {
    return;
  }
  const next = queue[0];
  navigateToGoalMilestoneCheck(next.goalId, next.checkpointId);
}

export function navigateToGoalMilestoneCheck(goalId: string, checkpointId: string): void {
  if (!rootNavigationRef.isReady()) {
    return;
  }
  rootNavigationRef.navigate('Main', {
    screen: 'RootTabs',
    params: {
      screen: 'ActiveGoals',
      params: {
        screen: 'GoalDetail',
        params: { goalId, milestoneCheck: { checkpointId } },
      },
    },
  });
}

export function tryNavigateToFirstMilestoneInQueueAfterEnqueue(): void {
  if (queue.length === 0) {
    return;
  }
  const first = queue[0];
  navigateToGoalMilestoneCheck(first.goalId, first.checkpointId);
}
