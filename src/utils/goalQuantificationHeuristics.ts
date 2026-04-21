/**
 * Fast local hints for whether to ask a concrete numeric follow-up (weight / money).
 * Returns `unclear` when both dimensions might apply — caller may call OpenAI.
 */
export type HeuristicQuantification =
  | 'weight'
  | 'money'
  | 'skip'
  | 'unclear';

const WEIGHT_SPECIFIC =
  /\b\d+(\.\d+)?\s*(kg|kgs|kilos?|lb|lbs|pounds|stone)\b|\b(lose|gain|drop|shed)\s+\d+/i;
const MONEY_SPECIFIC =
  /\$|€|£|\b\d+\s*k\b|\d{2,}\s*(usd|eur|dollars?)\b|\b(save|earn|make)\s+\$?\d+/i;

const WEIGHT_VAGUE =
  /\b(lose weight|lose fat|weight loss|drop weight|shed weight|gain weight|bulk up|get fit(ter)?|get in shape)\b/i;
const MONEY_VAGUE =
  /\b(make more money|earn more|extra income|raise(\s+my)?\s+salary|save money|financial freedom|more income)\b/i;

export function heuristicQuantificationNeed(combined: string): HeuristicQuantification {
  const t = combined.trim();
  if (!t) return 'skip';
  if (WEIGHT_SPECIFIC.test(t) || MONEY_SPECIFIC.test(t)) return 'skip';

  const w = WEIGHT_VAGUE.test(t);
  const m = MONEY_VAGUE.test(t);
  if (w && m) return 'unclear';
  if (w) return 'weight';
  if (m) return 'money';
  return 'skip';
}
