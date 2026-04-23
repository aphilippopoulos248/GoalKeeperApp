import { supabase } from '../../lib/supabase';
import { ensurePublicProfileRow } from './ensurePublicProfile';

export type ProfileOnboardingFields = {
  name: string | null;
  background: string | null;
};

export async function fetchProfileOnboardingFields(
  userId: string,
): Promise<ProfileOnboardingFields | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, background')
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
  params: { name: string; background: string | null },
): Promise<{ error: string | null }> {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    return { error: 'Name is required.' };
  }
  const background =
    params.background == null || params.background.trim() === ''
      ? null
      : params.background.trim();

  const { error } = await supabase
    .from('profiles')
    .update({
      name: trimmedName,
      background,
      display_name: trimmedName,
    })
    .eq('id', userId);

  if (error) {
    console.error('[profileRepository] update', error.message);
    return { error: error.message };
  }
  return { error: null };
}
