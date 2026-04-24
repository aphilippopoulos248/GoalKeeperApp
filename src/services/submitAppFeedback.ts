import { FunctionsHttpError } from '@supabase/functions-js';

import { supabase } from '../lib/supabase';

export class SubmitAppFeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmitAppFeedbackError';
  }
}

async function errorBodyFromFunctionsHttpError(
  err: FunctionsHttpError,
): Promise<string | null> {
  const res = err.context as Response | undefined;
  if (!res || typeof res.json !== 'function') return null;
  try {
    const body = (await res.json()) as unknown;
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function submitAppFeedback(message: string): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new SubmitAppFeedbackError('Please enter your feedback.');
  }

  const { data, error } = await supabase.functions.invoke('submit-app-feedback', {
    body: { message: trimmed },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const fromBody = await errorBodyFromFunctionsHttpError(error);
      if (fromBody) {
        throw new SubmitAppFeedbackError(fromBody);
      }
    }
    throw new SubmitAppFeedbackError(
      error.message || 'Could not send feedback. Try again later.',
    );
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  ) {
    throw new SubmitAppFeedbackError((data as { error: string }).error);
  }
}
