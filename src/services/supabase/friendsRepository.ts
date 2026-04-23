import { supabase } from '../../lib/supabase';
import type { Friend } from '../../types';

const SEARCH_LIMIT = 30;

/** Escape `%`, `_`, and `\` for PostgreSQL ILIKE (default escape `\`). */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Must match DB check `user_low::text < user_high::text`. */
export function canonicalFriendPair(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

function mapRow(row: {
  id: string;
  username: string | null;
  display_name: string | null;
  name: string | null;
  avatar_url: string | null;
}): Friend {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    name: row.name,
    avatar_url: row.avatar_url,
  };
}

export async function searchUsersByUsername(
  query: string,
  currentUserId: string,
): Promise<Friend[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const safe = escapeIlikePattern(trimmed);
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, name, avatar_url')
    .neq('id', currentUserId)
    .or(
      `username.ilike.${pattern},display_name.ilike.${pattern},name.ilike.${pattern}`,
    )
    .limit(SEARCH_LIMIT);

  if (error) {
    console.error('[friendsRepository] search', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function listFriends(userId: string): Promise<Friend[]> {
  const { data: edges, error: edgeError } = await supabase
    .from('friendships')
    .select('user_low, user_high, created_at')
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (edgeError) {
    console.error('[friendsRepository] list edges', edgeError.message);
    return [];
  }
  if (!edges?.length) {
    return [];
  }

  const orderedIds = edges.map((e) =>
    e.user_low === userId ? e.user_high : e.user_low,
  );

  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, username, display_name, name, avatar_url')
    .in('id', orderedIds);

  if (profError) {
    console.error('[friendsRepository] list profiles', profError.message);
    return [];
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, mapRow(p)]));
  return orderedIds.map((id) => byId.get(id)).filter((f): f is Friend => f != null);
}

export async function addFriend(
  userId: string,
  friendUserId: string,
): Promise<{ error: string | null }> {
  if (userId === friendUserId) {
    return { error: 'Invalid friend.' };
  }
  const [low, high] = canonicalFriendPair(userId, friendUserId);
  const { error } = await supabase.from('friendships').insert({
    user_low: low,
    user_high: high,
  });
  if (error) {
    if (error.code === '23505') {
      return { error: null };
    }
    console.error('[friendsRepository] add', error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function removeFriend(userId: string, friendUserId: string): Promise<void> {
  const [low, high] = canonicalFriendPair(userId, friendUserId);
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_low', low)
    .eq('user_high', high);
  if (error) {
    console.error('[friendsRepository] remove', error.message);
  }
}

export function friendTitle(f: Friend): string {
  const a = f.display_name?.trim();
  if (a) return a;
  const b = f.name?.trim();
  if (b) return b;
  const c = f.username?.trim();
  if (c) return c;
  return 'User';
}

export function friendSubtitle(f: Friend): string | undefined {
  const u = f.username?.trim();
  if (u) return `@${u}`;
  return undefined;
}
