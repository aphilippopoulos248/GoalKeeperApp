import { Quest } from '../types';

export const mockDailyQuests: Quest[] = [
  {
    id: 'dq-1',
    title: 'Morning focus block',
    description: 'Spend 25 minutes on your top milestone with no distractions.',
    points: 15,
    dayOrder: 120,
  },
  {
    id: 'dq-2',
    title: 'Log one win',
    description: 'Write a single sentence about progress you made today.',
    points: 10,
    dayOrder: 480,
  },
  {
    id: 'dq-3',
    title: 'Prep tomorrow',
    description: 'Pick the next tiny action you will take tomorrow.',
    points: 10,
    dayOrder: 880,
  },
];

export const mockWeeklyQuests: Quest[] = [
  {
    id: 'wq-1',
    title: 'Checkpoint review',
    description: 'Review each checkpoint and adjust dates if needed.',
    points: 40,
  },
  {
    id: 'wq-2',
    title: 'Accountability ping',
    description: 'Tell a friend one goal update for the week.',
    points: 25,
  },
];

export const allMockQuests: Quest[] = [...mockDailyQuests, ...mockWeeklyQuests];
