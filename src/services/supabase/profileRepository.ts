import { supabase } from '../../lib/supabase';
import { ensurePublicProfileRow } from './ensurePublicProfile';

export type ProfileOnboardingFields = {
  name: string | null;
  background: string | null;
  avatar_url: string | null;
};

export async function fetchProfileOnboardingFields(
  userId: string,
): Promise<ProfileOnboardingFields | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, background, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[profileRepository] fetch', error.message);
    return null;
  }
  if (!data) {
    return null;
  }
  return {
    name: data.name,
    background: data.background,
    avatar_url: data.avatar_url,
  };
}

/**
 * Ensures a profile row exists, then returns whether first-time onboarding is needed (`name` unset).
 */
export async function profileNeedsOnboarding(userId: string): Promise<boolean | null> {
  const ok = await ensurePublicProfileRow(userId);
  if (!ok) {
    return null;
  }
  const fields = await fetchProfileOnboardingFields(userId);
  if (!fields) {
    return null;
  }
  return fields.name == null || fields.name.trim() === '';
}

export async function updateProfileOnboarding(
  userId: string,
  params: { name: string; background: string | null; avatar_url: string },
): Promise<{ error: string | null }> {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    return { error: 'Name is required.' };
  }
  const background =
    params.background == null || params.background.trim() === ''
      ? null
      : params.background.trim();

  const avatarUrl = params.avatar_url.trim();
  if (!avatarUrl) {
    return { error: 'Avatar is required.' };
  }
  if (!avatarUrl.startsWith('https://api.dicebear.com/')) {
    return { error: 'Invalid avatar URL.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      name: trimmedName,
      background,
      display_name: trimmedName,
      avatar_url: avatarUrl,
    })
    .eq('id', userId);

  if (error) {
    console.error('[profileRepository] update', error.message);
    return { error: error.message };
  }
  return { error: null };
}
