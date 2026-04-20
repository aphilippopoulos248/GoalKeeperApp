import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { SEED_ACTIVE_GOALS } from '../data/mockGoal';
import { Goal } from '../types';

export type NewGoalInput = {
  title: string;
  description: string;
  targetDate: Date;
};

type ActiveGoalsContextValue = {
  goals: Goal[];
  addGoal: (input: NewGoalInput) => void;
  getGoalById: (id: string) => Goal | undefined;
};

const ActiveGoalsContext = createContext<ActiveGoalsContextValue | null>(null);

function buildGoalFromInput(input: NewGoalInput): Goal {
  const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const dateLabel = input.targetDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return {
    id,
    title: input.title.trim(),
    description: input.description.trim(),
    specific: input.description.trim(),
    measurable:
      'Define concrete metrics as you break this goal into smaller steps.',
    achievable: 'Adjust scope if life gets busy—progress beats perfection.',
    relevant: 'Tied to what matters to you right now.',
    timeBound: `Achieve by ${dateLabel}.`,
    checkpoints: [
      {
        id: `${id}-cp1`,
        title: 'Define your first milestone',
        done: false,
      },
    ],
  };
}

export function ActiveGoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>(() => [...SEED_ACTIVE_GOALS]);

  const addGoal = useCallback((input: NewGoalInput) => {
    setGoals((prev) => [buildGoalFromInput(input), ...prev]);
  }, []);

  const getGoalById = useCallback(
    (id: string) => goals.find((g) => g.id === id),
    [goals],
  );

  const value = useMemo(
    () => ({ goals, addGoal, getGoalById }),
    [goals, addGoal, getGoalById],
  );

  return (
    <ActiveGoalsContext.Provider value={value}>
      {children}
    </ActiveGoalsContext.Provider>
  );
}

export function useActiveGoals() {
  const ctx = useContext(ActiveGoalsContext);
  if (!ctx) {
    throw new Error('useActiveGoals must be used within ActiveGoalsProvider');
  }
  return ctx;
}
