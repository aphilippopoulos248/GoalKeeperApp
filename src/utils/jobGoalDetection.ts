/**
 * Heuristic: career / job-search goals that should receive JSearch-backed market context
 * for planning and Quest Assist.
 */
const JOB_GOAL_TRIGGERS: readonly string[] = [
  'get a job',
  'find a job',
  'job search',
  'job hunting',
  'looking for work',
  'new job',
  'change jobs',
  'career change',
  'switch careers',
  'land a role',
  'get hired',
  'job offer',
  'full-time job',
  'full time job',
  'part-time job',
  'internship',
  'entry-level',
  'entry level',
  'apply for',
  'application ',
  'resume',
  'résumé',
  'curriculum vitae',
  'cover letter',
  'linkedin',
  'recruiter',
  'interview prep',
  'job interview',
  'technical interview',
  'salary negotiation',
  'promotion',
  'break into',
  'breaking into',
  'first role',
  'freelance client',
  'contract role',
  'remote job',
  'on-site role',
  'onsite role',
];

const JOB_ASSIST_HINTS: readonly string[] = [
  'job',
  'jobs',
  'career',
  'hiring',
  'interview',
  'resume',
  'cv',
  'apply',
  'application',
  'linkedin',
  'recruiter',
  'salary',
  'offer',
  'role at',
  'position at',
  'openings',
  'listing',
];

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isJobSearchCareerGoal(title: string, description: string): boolean {
  const normalized = normalizeForMatch(`${title} ${description}`);
  for (const t of JOB_GOAL_TRIGGERS) {
    const needle = t.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (normalized.includes(needle)) return true;
  }
  return false;
}

export function isQuestAssistJobRelated(params: {
  goalTitle: string;
  goalDescription: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
}): boolean {
  if (isJobSearchCareerGoal(params.goalTitle, params.goalDescription)) {
    return true;
  }
  const blob = normalizeForMatch(
    `${params.questTitle} ${params.questDescription} ${params.userMessage}`,
  );
  for (const h of JOB_ASSIST_HINTS) {
    if (blob.includes(h)) return true;
  }
  return false;
}
