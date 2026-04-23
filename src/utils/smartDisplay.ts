/**
 * Strips the AI-appended time-bound deadline critique from display.
 * Storage keeps the full string for sync; SMART UI only shows the main time-bound line.
 */
export function stripTimeBoundDisplay(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\n\nCritique:\s*/i);
  if (m && m.index != null) {
    return t.slice(0, m.index).trim();
  }
  return t;
}
