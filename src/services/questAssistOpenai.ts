import Constants from 'expo-constants';

const MODEL = 'gpt-4o-mini';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

function getOpenAiApiKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  const trimmedProcess = typeof fromProcess === 'string' ? fromProcess.trim() : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtraRaw =
    extra && typeof extra === 'object' && extra !== null && 'openAiApiKey' in extra
      ? (extra as { openAiApiKey?: unknown }).openAiApiKey
      : undefined;
  const trimmedExtra = typeof fromExtraRaw === 'string' ? fromExtraRaw.trim() : '';

  if (trimmedProcess.length > 0) return trimmedProcess;
  if (trimmedExtra.length > 0) return trimmedExtra;
  return '';
}

export type QuestAssistOpenAiParams = {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
  /** When true, the assistant should mention concrete meal ideas below. */
  hasRecipeSuggestions: boolean;
};

/**
 * Short supportive reply for quest assist. Returns null if no API key or request fails.
 */
export async function fetchQuestAssistReply(
  params: QuestAssistOpenAiParams,
): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;

  const system = `You are a friendly coach helping someone with one daily quest toward their goal.
Reply in 2–4 short sentences, plain text only (no markdown, no bullet lists).
Reference their goal, time-bound deadline, and today's quest when relevant.
Be practical and encouraging. Do not invent recipe names or URLs—if concrete recipes are provided separately, say you're sharing ideas below.`;

  const user = [
    `Goal: ${params.goalTitle}`,
    `Goal details: ${params.goalDescription}`,
    `Time-bound: ${params.goalTimeBound}`,
    `Today's quest: ${params.questTitle}`,
    `Quest details: ${params.questDescription}`,
    `User asked: ${params.userMessage}`,
    params.hasRecipeSuggestions
      ? 'Recipe suggestions from a real API will be shown under your message—mention that briefly.'
      : 'No recipe list will follow—give general actionable advice for this quest only.',
  ].join('\n');

  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.45,
        max_tokens: 280,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch {
    return null;
  }

  const raw = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    return null;
  }

  const choices = raw.choices as unknown;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const content = (choices[0] as { message?: { content?: string } })?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return null;
  return content.trim();
}

export function fallbackQuestAssistIntro(hasRecipes: boolean): string {
  return hasRecipes
    ? 'Here are some meal ideas that could fit your quest and timeline.'
    : 'Here is a quick suggestion for your quest—take what helps and adjust for your day.';
}
