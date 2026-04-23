/**
 * Build DiceBear v7 PNG URLs for use with React Native <Image source={{ uri }} />.
 * @see https://www.dicebear.com/how-to-use/http-api/
 */

const DICEBEAR_API = 'https://api.dicebear.com/7.x';

export type DiceBearStyleId = (typeof DICEBEAR_STYLE_OPTIONS)[number]['id'];

/** Curated list for the onboarding avatar picker. */
export const DICEBEAR_STYLE_OPTIONS = [
  { id: 'lorelei' as const, label: 'Lorelei' },
  { id: 'avataaars' as const, label: 'Avataaars' },
  { id: 'notionists' as const, label: 'Notionists' },
  { id: 'open-peeps' as const, label: 'Open peeps' },
] as const;

export const DEFAULT_DICEBEAR_STYLE: DiceBearStyleId = 'lorelei';

const DEFAULT_PNG_SIZE = 256;

export function randomDiceBearSeed(): string {
  return `s${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildDiceBearPngUrl(params: {
  style: string;
  seed: string;
  size?: number;
}): string {
  const size = params.size ?? DEFAULT_PNG_SIZE;
  const u = new URL(
    `${DICEBEAR_API}/${encodeURIComponent(params.style)}/png`,
  );
  u.searchParams.set('seed', params.seed);
  u.searchParams.set('size', String(size));
  return u.toString();
}
