import { supabase } from '../../lib/supabase';
import type { Checkpoint, Goal, Quest } from '../../types';

import { parseGoalType } from '../../utils/goalNormalize';
import { parseGoalPriority } from '../../utils/goalPriority';

import { ensurePublicProfileRow } from './ensurePublicProfile';

type GoalRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  time_bound: string;
  target_date_iso: string | null;
  priority: string;
  milestone_frequency: string;
  goal_type: string;
  achievability_critique: string | null;
  completed: boolean;
};

type CheckpointRow = {
  id: string;
  goal_id: string;
  title: string;
  done: boolean;
  sort_order: number;
};

type QuestRow = {
  id: string;
  goal_id: string | null;
  title: string;
  description: string;
  points: number;
  kind: 'daily' | 'weekly';
  day_order: number | null;
  schedule_start_minute: number | null;
  schedule_duration_minutes: number | null;
};

function rowToCheckpoint(r: CheckpointRow): Checkpoint {
  return {
    id: r.id,
    title: r.title,
    done: r.done,
  };
}

function rowToQuest(r: QuestRow): Quest {
  const q: Quest = {
    id: r.id,
    title: r.title,
    description: r.description,
    points: r.points,
    kind: r.kind,
  };
  if (r.day_order != null) q.dayOrder = r.day_order;
  if (r.schedule_start_minute != null) q.scheduleStartMinute = r.schedule_start_minute;
  if (r.schedule_duration_minutes != null) q.scheduleDurationMinutes = r.schedule_duration_minutes;
  return q;
}

function goalRowFromGoal(userId: string, g: Goal): GoalRow {
  return {
    id: g.id,
    user_id: userId,
    title: g.title,
    description: g.description,
    specific: g.specific,
    measurable: g.measurable,
    achievable: g.achievable,
    relevant: g.relevant,
    time_bound: g.timeBound,
    target_date_iso: g.targetDateIso?.trim() ? g.targetDateIso.trim() : null,
    priority: parseGoalPriority(g.priority),
    milestone_frequency:
      g.milestoneFrequency === 'biweekly' || g.milestoneFrequency === 'monthly'
        ? g.milestoneFrequency
        : 'weekly',
    goal_type: parseGoalType(g.goalType),
    achievability_critique: g.achievabilityCritique?.trim() || null,
    completed: g.completed,
  };
}

function goalFromRow(row: GoalRow, checkpoints: CheckpointRow[], quests: QuestRow[]): Goal {
  const cps = [...checkpoints].sort((a, b) => a.sort_order - b.sort_order).map(rowToCheckpoint);
  const qst = [...quests].sort((a, b) => {
    const da = a.day_order ?? 999;
    const db = b.day_order ?? 999;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  const dailyQuests = qst.length > 0 ? qst.map(rowToQuest) : undefined;
  const milestoneFrequency =
    row.milestone_frequency === 'biweekly' || row.milestone_frequency === 'monthly'
      ? row.milestone_frequency
      : 'weekly';
  const goalType = parseGoalType(row.goal_type);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    specific: row.specific,
    measurable: row.measurable,
    achievable: row.achievable,
    relevant: row.relevant,
    timeBound: row.time_bound,
    targetDateIso: row.target_date_iso
      ? new Date(row.target_date_iso).toISOString()
      : undefined,
    priority: parseGoalPriority(row.priority),
    milestoneFrequency,
    goalType,
    achievabilityCritique: row.achievability_critique ?? undefined,
    checkpoints: cps,
    dailyQuests,
    completed: row.completed,
  };
}

export async function fetchGoalsForUser(userId: string): Promise<Goal[]> {
  const { data: goalRows, error: gErr } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (gErr) {
    console.error('[goalsRepository] fetch goals', gErr.message);
    return [];
  }
  const goals = (goalRows ?? []) as GoalRow[];
  if (goals.length === 0) return [];

  const goalIds = goals.map((g) => g.id);

  const [{ data: cpRows, error: cErr }, { data: qRows, error: qErr }] = await Promise.all([
    supabase.from('checkpoints').select('*').eq('user_id', userId).in('goal_id', goalIds),
    supabase.from('quests').select('*').eq('user_id', userId).in('goal_id', goalIds),
  ]);

  if (cErr) console.error('[goalsRepository] fetch checkpoints', cErr.message);
  if (qErr) console.error('[goalsRepository] fetch quests', qErr.message);

  const cps = (cpRows ?? []) as CheckpointRow[];
  const qsts = (qRows ?? []) as QuestRow[];

  const cpByGoal = new Map<string, CheckpointRow[]>();
  for (const c of cps) {
    const arr = cpByGoal.get(c.goal_id) ?? [];
    arr.push(c);
    cpByGoal.set(c.goal_id, arr);
  }
  const qByGoal = new Map<string, QuestRow[]>();
  for (const q of qsts) {
    if (!q.goal_id) continue;
    const arr = qByGoal.get(q.goal_id) ?? [];
    arr.push(q);
    qByGoal.set(q.goal_id, arr);
  }

  return goals.map((row) =>
    goalFromRow(row, cpByGoal.get(row.id) ?? [], qByGoal.get(row.id) ?? []),
  );
}

async function upsertGoalTree(userId: string, g: Goal): Promise<void> {
  const goalRow = goalRowFromGoal(userId, g);
  const { error: upErr } = await supabase.from('goals').upsert(goalRow, { onConflict: 'id' });
  if (upErr) {
    console.error('[goalsRepository] upsert goal', upErr.message);
    return;
  }

  const cpIds = g.checkpoints.map((c) => c.id);
  const { data: existingCp } = await supabase.from('checkpoints').select('id').eq('goal_id', g.id);
  const staleCp = (existingCp ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id) => !cpIds.includes(id));
  if (staleCp.length) {
    await supabase.from('checkpoints').delete().in('id', staleCp);
  }

  const cpUpserts = g.checkpoints.map((c, i) => ({
    id: c.id,
    user_id: userId,
    goal_id: g.id,
    title: c.title,
    done: c.done,
    sort_order: i,
  }));

  if (cpUpserts.length) {
    const { error: cpErr } = await supabase.from('checkpoints').upsert(cpUpserts, {
      onConflict: 'id',
    });
    if (cpErr) console.error('[goalsRepository] upsert checkpoints', cpErr.message);
  }

  const quests = g.dailyQuests ?? [];
  const qIds = quests.map((q) => q.id);
  const { data: existingQ } = await supabase.from('quests').select('id').eq('goal_id', g.id);
  const staleQ = (existingQ ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id) => !qIds.includes(id));
  if (staleQ.length) {
    await supabase.from('quests').delete().in('id', staleQ);
  }

  const qUpserts = quests.map((q) => ({
    id: q.id,
    user_id: userId,
    goal_id: g.id,
    title: q.title,
    description: q.description,
    points: q.points,
    kind: q.kind,
    day_order: q.dayOrder ?? null,
    schedule_start_minute: q.scheduleStartMinute ?? null,
    schedule_duration_minutes: q.scheduleDurationMinutes ?? null,
  }));

  if (qUpserts.length) {
    const { error: qErr } = await supabase.from('quests').upsert(qUpserts, { onConflict: 'id' });
    if (qErr) console.error('[goalsRepository] upsert quests', qErr.message);
  }
}

/** Full sync: deletes goals removed locally, upserts each goal subtree. */
export async function syncGoalsForUser(userId: string, goals: Goal[]): Promise<void> {
  const profileOk = await ensurePublicProfileRow(userId);
  if (!profileOk) return;
  const { data: existingRows, error: exErr } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId);
  if (exErr) {
    console.error('[goalsRepository] list goals for sync', exErr.message);
    return;
  }
  const nextIds = new Set(goals.map((g) => g.id));
  const toRemove = (existingRows ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id) => !nextIds.has(id));
  if (toRemove.length) {
    const { error: delErr } = await supabase.from('goals').delete().in('id', toRemove);
    if (delErr) console.error('[goalsRepository] delete goals', delErr.message);
  }

  for (const g of goals) {
    await upsertGoalTree(userId, g);
  }
}
