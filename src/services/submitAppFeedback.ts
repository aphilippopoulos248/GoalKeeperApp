import { supabase } from '../lib/supabase';

export class SubmitAppFeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmitAppFeedbackError';
  }
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
