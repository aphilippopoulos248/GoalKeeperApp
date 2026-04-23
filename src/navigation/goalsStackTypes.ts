export type MilestoneCheckParam = { checkpointId: string };

export type GoalsStackParamList = {
  GoalList: undefined;
  GoalDetail: { goalId: string; milestoneCheck?: MilestoneCheckParam };
  AddGoal: undefined;
};
