export type MilestoneCheckParam = { checkpointId: string };

export type GoalsStackParamList = {
  GoalList: undefined;
  GoalDetail: { goalId: string; milestoneCheck?: MilestoneCheckParam };
  AddGoal: undefined;
  NewGoalReveal: { goalId: string; milestoneTitles: string[]; goalTitle: string };
  MilestoneExplain: { goalId: string; checkpointId: string };
};
