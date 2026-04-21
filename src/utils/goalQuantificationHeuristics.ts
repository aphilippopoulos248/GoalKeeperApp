/**
 * Fast local check: the user already gave a concrete measurable target, so we skip
 * the measurement follow-up (no AI call). If this returns false, we ask the model
 * whether a tailored measurement question is needed (reading, weight, money, etc.).
 */
export function measurementTargetAlreadySpecified(combined: string): boolean {
  const t = combined.trim();
  if (!t) return false;

  // Weight / body — target change already stated
  if (
    /\b(lose|gain|drop|shed|cut)\s+\d+(\.\d+)?\s*(kg|kgs|kilos?|lb|lbs|pounds|stone)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bweigh\s+\d+(\.\d+)?\s*(kg|kgs|kilos?|lb|lbs|pounds)\b.*\b(lose|gain)\s+\d+/i.test(t)) {
    return true;
  }

  // Money — amount present
  if (/\$\s*[\d,]+|[\d,]+\s*\$|\b(save|earn|make|raise)\s+(\$?\s*[\d,]+|[\d,]+\s*k)\b/i.test(t)) {
    return true;
  }

  // Reading — book count or explicit numeric reading goal
  if (/\b(read|finish|complete|read)\s+\d+\s*(books?|novels?)\b/i.test(t)) {
    return true;
  }
  if (/\b\d+\s+(books?|novels?)\b/i.test(t) && /\b(read|year|month|deadline|finish)\b/i.test(t)) {
    return true;
  }

  // Distance / running
  if (/\b\d+(\.\d+)?\s*(km|miles?|mi|m)\b/i.test(t) && /\b(run|jog|race|5k|10k|marathon)\b/i.test(t)) {
    return true;
  }

  // Time blocks with numbers (study hours, etc.)
  if (/\b\d+\s*(hours?|hrs|minutes?|mins)\s+(per|a|each|daily|weekly)\b/i.test(t)) {
    return true;
  }

  return false;
}
