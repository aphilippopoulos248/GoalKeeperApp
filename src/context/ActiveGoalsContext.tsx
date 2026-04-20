import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { SEED_ACTIVE_GOALS } from '../data/mockGoal';
import { Checkpoint, Goal } from '../types';

const GOALS_STORAGE_KEY = '@goalkeeper/active-goals-v1';

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

function normalizeCheckpoint(raw: unknown): Checkpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  return {
    id: o.id,
    title: o.title,
    done: typeof o.done === 'boolean' ? o.done : false,
  };
}

function normalizeGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.title !== 'string' ||
    typeof o.description !== 'string' ||
    typeof o.specific !== 'string' ||
    typeof o.measurable !== 'string' ||
    typeof o.achievable !== 'string' ||
    typeof o.relevant !== 'string' ||
    typeof o.timeBound !== 'string'
  ) {
    return null;
  }
  if (!Array.isArray(o.checkpoints)) return null;
  const checkpoints = o.checkpoints.map(normalizeCheckpoint).filter((c): c is Checkpoint => c !== null);
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    specific: o.specific,
    measurable: o.measurable,
    achievable: o.achievable,
    relevant: o.relevant,
    timeBound: o.timeBound,
    checkpoints,
    completed: typeof o.completed === 'boolean' ? o.completed : false,
  };
}

async function loadGoalsFromStorage(): Promise<Goal[] | null> {
  try {
    const raw = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const goals = parsed.map(normalizeGoal).filter((g): g is Goal => g !== null);
    return goals;
  } catch {
    return null;
  }
}

async function saveGoalsToStorage(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
}

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
    completed: false,
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
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadGoalsFromStorage();
      if (cancelled) return;
      if (loaded !== null) {
        setGoals(loaded);
      }
      setStorageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    void saveGoalsToStorage(goals);
  }, [goals, storageReady]);

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
