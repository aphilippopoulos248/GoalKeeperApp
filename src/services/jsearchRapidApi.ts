import Constants from 'expo-constants';

import { isJobSearchCareerGoal, isQuestAssistJobRelated } from '../utils/jobGoalDetection';

const BASE = 'https://jsearch.p.rapidapi.com';
const RAPID_HOST = 'jsearch.p.rapidapi.com';

function getRapidApiKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_RAPIDAPI_KEY;
  const trimmedProcess = typeof fromProcess === 'string' ? fromProcess.trim() : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtraRaw =
    extra && typeof extra === 'object' && extra !== null && 'rapidApiKey' in extra
      ? (extra as { rapidApiKey?: unknown }).rapidApiKey
      : undefined;
  const trimmedExtra = typeof fromExtraRaw === 'string' ? fromExtraRaw.trim() : '';

  if (trimmedProcess.length > 0) return trimmedProcess;
  if (trimmedExtra.length > 0) return trimmedExtra;
  return '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export type AssistJob = {
  jobId: string;
  title: string;
  employerName: string;
  applyUrl?: string;
  location?: string;
  employmentType?: string;
  isRemote?: boolean;
};

function buildSearchQuery(text: string): string {
  const q = text.replace(/\s+/g, ' ').trim();
  if (q.length <= 120) return q;
  return `${q.slice(0, 117)}…`;
}

async function jsearchSearch(query: string): Promise<unknown | null> {
  const key = getRapidApiKey();
  if (!key || !query.trim()) return null;
  const params = new URLSearchParams({
    query: query.trim(),
    page: '1',
    num_pages: '1',
  });
  const url = `${BASE}/search?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': RAPID_HOST,
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function pickString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function mapRowToAssistJob(raw: Record<string, unknown>): AssistJob | null {
  const jobId = pickString(raw, ['job_id', 'jobId']);
  const title = pickString(raw, ['job_title', 'jobTitle', 'title']);
  const employerName = pickString(raw, ['employer_name', 'employerName', 'company_name']);
  if (!jobId || !title) return null;
  const applyUrl = pickString(raw, ['job_apply_link', 'jobApplyLink', 'apply_link']);
  const city = pickString(raw, ['job_city', 'jobCity']);
  const state = pickString(raw, ['job_state', 'jobState']);
  const country = pickString(raw, ['job_country', 'jobCountry']);
  const location = [city, state, country].filter(Boolean).join(', ') || undefined;
  let employmentType: string | undefined;
  const emp = raw.job_employment_types ?? raw.job_employment_type;
  if (Array.isArray(emp) && emp.length > 0 && typeof emp[0] === 'string') {
    employmentType = emp.join(', ');
  } else if (typeof emp === 'string' && emp.trim()) {
    employmentType = emp.trim();
  }
  let isRemote: boolean | undefined;
  const jr = raw.job_is_remote ?? raw.job_is_remote_flag;
  if (typeof jr === 'boolean') isRemote = jr;
  else if (jr === 1 || jr === '1' || jr === 'true') isRemote = true;

  return {
    jobId,
    title,
    employerName: employerName || 'Employer',
    ...(applyUrl ? { applyUrl } : {}),
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(typeof isRemote === 'boolean' ? { isRemote } : {}),
  };
}

function parseSearchResults(data: unknown): AssistJob[] {
  if (!isRecord(data)) return [];
  let arr: unknown = data.data;
  if (!Array.isArray(arr)) {
    const alt = data.jobs;
    if (Array.isArray(alt)) arr = alt;
  }
  if (!Array.isArray(arr)) return [];
  const out: AssistJob[] = [];
  for (const item of arr) {
    if (!isRecord(item)) continue;
    const j = mapRowToAssistJob(item);
    if (j) out.push(j);
  }
  return out;
}

function formatJobsForPlannerContext(jobs: AssistJob[]): string {
  return jobs
    .slice(0, 5)
    .map((j, i) => {
      const loc = j.location ? ` — ${j.location}` : '';
      const remote = j.isRemote ? ' (remote)' : '';
      const type = j.employmentType ? ` [${j.employmentType}]` : '';
      return `${i + 1}. ${j.title} at ${j.employerName}${loc}${remote}${type} [job_id: ${j.jobId}]`;
    })
    .join('\n');
}

/**
 * Short market snapshot for OpenAI goal planning (new goals, regen, milestones).
 */
export async function getJobSearchContextForGoal(params: {
  title: string;
  description: string;
}): Promise<string | null> {
  if (!isJobSearchCareerGoal(params.title, params.description)) {
    return null;
  }
  if (!getRapidApiKey()) return null;
  const query = buildSearchQuery(`${params.title} ${params.description}`);
  const data = await jsearchSearch(query);
  const jobs = parseSearchResults(data);
  if (jobs.length === 0) return null;
  const lines = formatJobsForPlannerContext(jobs);
  return `Recent job market sample from search (“${query.slice(0, 80)}${query.length > 80 ? '…' : ''}”). Use to **inform** realistic job-search milestones and daily quests (skills, pipeline, prep)—do **not** promise the user will get these specific roles or employers:\n${lines}`;
}

const ASSIST_LIMIT = 6;

/**
 * Job cards for Quest Assist.
 */
export async function fetchJobSuggestionsForAssist(params: {
  goalTitle: string;
  goalDescription: string;
  goalTimeBound: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
}): Promise<AssistJob[] | null> {
  if (
    !isQuestAssistJobRelated({
      goalTitle: params.goalTitle,
      goalDescription: params.goalDescription,
      questTitle: params.questTitle,
      questDescription: params.questDescription,
      userMessage: params.userMessage,
    })
  ) {
    return null;
  }
  if (!getRapidApiKey()) return null;
  const primary = buildSearchQuery(
    `${params.userMessage} ${params.questTitle} ${params.goalTitle}`.trim(),
  );
  let data = await jsearchSearch(primary);
  let jobs = parseSearchResults(data);
  if (jobs.length === 0) {
    const fallback = buildSearchQuery(`${params.goalTitle} ${params.goalDescription}`);
    data = await jsearchSearch(fallback);
    jobs = parseSearchResults(data);
  }
  if (jobs.length === 0) return null;
  return jobs.slice(0, ASSIST_LIMIT);
}

export type RecentAssistJob = { id: string; title: string; employerName: string };

export function assistJobsFromRecent(recent: RecentAssistJob[]): AssistJob[] {
  return recent.map((r) => ({
    jobId: r.id,
    title: r.title,
    employerName: r.employerName,
  }));
}
