import { Goal } from '../types';

/** Initial goals when the app loads (seed data). */
export const SEED_ACTIVE_GOALS: Goal[] = [
  {
    id: 'g-1',
    title: 'Run a 5K without stopping',
    description:
      'Build endurance with a structured plan so race day feels achievable.',
    specific: 'Complete a local 5K fun run in under 40 minutes.',
    measurable: 'Track three runs per week and weekly longest distance.',
    achievable: 'Start from walk/run intervals; increase volume slowly.',
    relevant: 'Supports long-term health and energy for work.',
    timeBound: 'Race day in 10 weeks; longest run milestone at week 8.',
    priority: 'medium',
    completed: false,
    checkpoints: [
      { id: 'c1', title: 'Week 2: 15 min continuous jog', done: true },
      { id: 'c2', title: 'Week 4: 2.5K without walking', done: false },
      { id: 'c3', title: 'Week 6: 4K at easy pace', done: false },
      { id: 'c4', title: 'Week 8: 5K practice on course', done: false },
    ],
  },
  {
    id: 'g-2',
    title: 'Read 12 books this year',
    description:
      'Rebuild a daily reading habit and finish one book per month on average.',
    specific: 'Read fiction and nonfiction across topics I care about.',
    measurable: 'Log each finished book and total pages per month.',
    achievable: 'Minimum 20 minutes per day; audiobooks count.',
    relevant: 'Reduces screen time before bed and expands perspective.',
    timeBound: '12 books by December 31; quarterly check-ins.',
    priority: 'medium',
    completed: false,
    checkpoints: [
      { id: 'g2-c1', title: 'Q1: Finish 3 books', done: true },
      { id: 'g2-c2', title: 'Q2: Finish 3 books', done: false },
      { id: 'g2-c3', title: 'Q3: Finish 3 books', done: false },
      { id: 'g2-c4', title: 'Q4: Finish 3 books', done: false },
    ],
  },
];
