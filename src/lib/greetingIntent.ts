export type GreetingAccountKind = 'new_account' | 'returning';

let pending: GreetingAccountKind | null = null;

export function setGreetingIntentNewAccount(): void {
  pending = 'new_account';
}

export function setGreetingIntentReturning(): void {
  pending = 'returning';
}

/** Read and clear the intent set by Register or Login before the next SIGNED_IN. */
export function consumeGreetingIntent(): GreetingAccountKind | null {
  const v = pending;
  pending = null;
  return v;
}
