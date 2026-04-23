import type { Checkpoint, Goal, GoalType, MilestoneFrequency, Quest } from '../types';

import { parseGoalPriority } from './goalPriority';

export function parseMilestoneFrequency(raw: unknown): MilestoneFrequency {
  if (raw === 'weekly' || raw === 'biweekly' || raw === 'monthly') {
    return raw;
  }
  return 'weekly';
}

export function parseGoalType(raw: unknown): GoalType {
  if (
    raw === 'linear' ||
    raw === 'biological' ||
    raw === 'skill_based' ||
    raw === 'outcome_based'
  ) {
    return raw;
  }
  return 'linear';
}

/** Strict parse for model output; invalid or missing returns null (caller supplies fallback). */
export function parseGoalTypeFromModel(raw: unknown): GoalType | null {
  if (
    raw === 'linear' ||
    raw === 'biological' ||
    raw === 'skill_based' ||
    raw === 'outcome_based'
  ) {
    return raw;
  }
  return null;
}

export function normalizeQuest(raw: unknown): Quest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  if (typeof o.description !== 'string') return null;
  const points = o.points;
  if (typeof points !== 'number' || !Number.isFinite(points)) return null;
  const dayOrderRaw = o.dayOrder;
  const dayOrder =
    typeof dayOrderRaw === 'number' && Number.isFinite(dayOrderRaw)
      ? Math.min(999, Math.max(0, Math.round(dayOrderRaw)))
      : undefined;
  const scheduleStartRaw = o.scheduleStartMinute;
  const scheduleStartMinute =
    typeof scheduleStartRaw === 'number' && Number.isFinite(scheduleStartRaw)
      ? Math.min(1439, Math.max(0, Math.round(scheduleStartRaw)))
      : undefined;
  const scheduleDurRaw = o.scheduleDurationMinutes;
  const scheduleDurationMinutes =
    typeof scheduleDurRaw === 'number' && Number.isFinite(scheduleDurRaw)
      ? Math.min(120, Math.max(15, Math.round(scheduleDurRaw)))
      : undefined;
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    points,
    ...(dayOrder !== undefined ? { dayOrder } : {}),
    ...(scheduleStartMinute !== undefined ? { scheduleStartMinute } : {}),
    ...(scheduleDurationMinutes !== undefined ? { scheduleDurationMinutes } : {}),
  };
}

export function normalizeCheckpoint(raw: unknown): Checkpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  const cp: Checkpoint = {
    id: o.id,
    title: o.title,
    done: typeof o.done === 'boolean' ? o.done : false,
  };
  if (o.revealed === false) cp.revealed = false;
  const wo = o.weekOffset;
  if (typeof wo === 'number' && Number.isFinite(wo)) {
    cp.weekOffset = Math.max(1, Math.round(wo));
  }
  return cp;
}

export function normalizeGoal(raw: unknown): Goal | null {
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
  const checkpoints = o.checkpoints
    .map(normalizeCheckpoint)
    .filter((c): c is Checkpoint => c !== null);

  let dailyQuests: Quest[] | undefined;
  if (Array.isArray(o.dailyQuests)) {
    const dq = o.dailyQuests.map(normalizeQuest).filter((q): q is Quest => q !== null);
    if (dq.length > 0) dailyQuests = dq;
  }

  return {
    id: o.id,
    title: o.title,
    description: o.description,
    specific: o.specific,
    measurable: o.measurable,
    achievable: o.achievable,
    relevant: o.relevant,
    timeBound: o.timeBound,
    targetDateIso: typeof o.targetDateIso === 'string' ? o.targetDateIso : undefined,
    createdAtIso: typeof o.createdAtIso === 'string' ? o.createdAtIso : undefined,
    priority: parseGoalPriority(o.priority),
    milestoneFrequency: parseMilestoneFrequency(o.milestoneFrequency),
    goalType: parseGoalType(o.goalType),
    achievabilityCritique:
      typeof o.achievabilityCritique === 'string' && o.achievabilityCritique.trim()
        ? o.achievabilityCritique.trim()
        : undefined,
    checkpoints,
    dailyQuests,
    completed: typeof o.completed === 'boolean' ? o.completed : false,
  };
}
