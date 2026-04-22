/**
 * Heuristic: goals and quests that should receive ExerciseDB-backed movement context
 * in Quest Assist.
 */
const EXERCISE_GOAL_TRIGGERS: readonly string[] = [
  'workout',
  'exercise',
  'exercises',
  'gym',
  'fitness',
  'cardio',
  'strength',
  'hypertrophy',
  'lifting',
  'lift weights',
  'weight training',
  'resistance',
  'stretch',
  'stretching',
  'mobility',
  'flexibility',
  'yoga',
  'pilates',
  'running',
  'runner',
  'jog',
  'walk ',
  'walking',
  'steps',
  'hike',
  'hiit',
  'circuit',
  'training session',
  'active recovery',
  'bodyweight',
  'calisthenics',
  'push-up',
  'pushup',
  'pull-up',
  'pullup',
  'squat',
  'deadlift',
  'plank',
  'core work',
  'abs',
  'endurance',
  'athletic',
];

const EXERCISE_ASSIST_HINTS: readonly string[] = [
  'workout',
  'exercise',
  'gym',
  'cardio',
  'strength',
  'stretch',
  'run',
  'walk',
  'lift',
  'squat',
  'push',
  'pull',
  'muscle',
  'training',
  'movement',
  'mobility',
  'hiit',
  'reps',
  'sets',
  'warm up',
  'cool down',
];

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isExerciseFitnessGoal(title: string, description: string): boolean {
  const normalized = normalizeForMatch(`${title} ${description}`);
  for (const t of EXERCISE_GOAL_TRIGGERS) {
    const needle = t.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (normalized.includes(needle)) return true;
  }
  return false;
}

/**
 * User is asking to see demos / GIFs / photos of movements (ExerciseDB streams GIFs from /image).
 */
export function userWantsExerciseVisuals(userMessage: string): boolean {
  const u = userMessage.toLowerCase();
  return (
    /\b(gif|gifs|picture|pictures|pic|pics|photo|photos|image|images|thumbnail|thumbnails)\b/.test(
      u,
    ) ||
    /\b(animation|animations|animated|demo|demos|clip|clips)\b/.test(u) ||
    /\b(visual|visuals|diagram|illustration)\b/.test(u) ||
    /\bwhat\s+.*\s+look\s+like\b/.test(u) ||
    /\bshow\s+me\s+(a|an|the|some)?\s*(gif|picture|pic|photo|image|animation|demo)\b/.test(u) ||
    /\bshow\s+me\s+what\s+it\s+looks\s+like\b/.test(u) ||
    /\b(can|could)\s+i\s+see\s+(a|an|the|it|this|that|them|gif|picture|photo|image)\b/.test(u)
  );
}

export function isQuestAssistExerciseRelated(params: {
  goalTitle: string;
  goalDescription: string;
  questTitle: string;
  questDescription: string;
  userMessage: string;
}): boolean {
  if (isExerciseFitnessGoal(params.goalTitle, params.goalDescription)) {
    return true;
  }
  const blob = normalizeForMatch(
    `${params.questTitle} ${params.questDescription} ${params.userMessage}`,
  );
  for (const h of EXERCISE_ASSIST_HINTS) {
    if (blob.includes(h)) return true;
  }
  return false;
}
