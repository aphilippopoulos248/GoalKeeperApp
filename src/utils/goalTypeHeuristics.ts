import type { GoalType } from '../types';

/**
 * Strips phrasing that uses "run/running" in a business sense so exercise-related
 * keywords do not misfire (e.g. "running a startup").
 */
function maskNonPhysicalRunVocabulary(s: string): string {
  let t = s;
  t = t.replace(
    /\b(?:run|running) a (?:business|company|startup|meeting|workshop|event|errand|script|the\s+numbers)\b/gi,
    ' ',
  );
  t = t.replace(/\b(?:run|manage|operate) the (?:business|team|shop|meeting|show)\b/gi, ' ');
  t = t.replace(/\brunning (?:my|our|the) (?:business|company|department|team)\b/gi, ' ');
  return t;
}

/**
 * Heuristic: fitness, health, and other body-related goals. Not a model call.
 */
export function textSuggestsBiologicalGoal(text: string): boolean {
  const t = maskNonPhysicalRunVocabulary(text).trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  if (
    /\b(?:weight|body)\s*fat\b|\blose\s+weight\b|\bgain\s+(?:weight|muscle)\b|\bget\s+fit\b|\bget\s+in\s+shape\b|\bget\s+healthy\b/.test(
      lower,
    )
  ) {
    return true;
  }

  if (/\bwork(?:ing)?\s*out\b|\bhome\s*gym\b|\bgo\s+to\s+the\s+gym\b/.test(lower)) {
    return true;
  }

  if (/\b(?:5k|10k|half\s*marathon|marathon|triathlon|ultra)\b/i.test(t)) {
    return true;
  }

  if (
    /\b(?:jog(ging)?|sprint(ing)?|jumprope|jump\s*rope|burpees?|plank|push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|sit[- ]?ups?|crunches?|reps?|sets?|deadlift|squat(ting)?|bench\s+press|calisthenics|stretch(ing|es)?|flexibility|mobility|recovery\s+day)\b/.test(
      lower,
    )
  ) {
    return true;
  }

  if (/\b(?:swimming|cycling|rowing|hiking|crossfit|spin\s*class|peloton)\b/.test(lower)) {
    return true;
  }

  if (
    /\b(?:\d+\s*(?:km|miles?|mi)\b.*\b(?:run|walk|jog|bike|cycle)\b|\b(?:run|walk|jog|bike|cycle)\b.*\b\d+\s*(?:km|miles?|mi)\b)/.test(
      lower,
    )
  ) {
    return true;
  }

  if (/\b(?:go\s+for\s+a\s+run|daily\s+run|morning\s+run|evening\s+run|parkrun)\b/.test(lower)) {
    return true;
  }

  const isNonExerciseRunning = /\brunning (?:costs?|totals?|balance|jokes?|commentary|mates?|heads?|average|tally|lists?|invoices?|late|on\s+empty|smooth|tab)\b/i.test(
    lower,
  );
  if (/\brunning\b/.test(lower) && !isNonExerciseRunning) {
    return true;
  }
  if (/\brun\b/.test(lower)) {
    if (/\b(?:every|each|daily|weekly|5k|10k|race|jog|kilometer|km|miles?|track|trail|long\s+run|start\s+running)\b/.test(lower)) {
      return true;
    }
  }

  if (
    /\b(?:fitness|wellness|wellbeing|gym|exercise[ds]?|cardio|aerobics?|yoga|pilates|barre|zumba|hiit|tabata|strength\s*training|muscle|physique|lean|bulk|shred|recomp|rest\s*day|active\s*recovery|hydration|electrolyte|kcal|calories?|macros?|diet(ing|ary)?\b|nutrition(ist|al)?|protein|supplement|intermittent\s+fasting|fast(ing|ed)\b|vegan\W*nutrition|keto|paleo|sleep\s*hygiene|insomnia|circadian|steps\b|pedometer|fitbit|watch\s*ring|heart\s*rate|blood\s*pressure|cholesterol|glucose|a1c|bmi|sick|illness|injury|healing|rehab|physio(?:therapy)?|doctor|hospital|clinic|dental|dentist|therapy\s*session|physical\s*therapy|mental\s*health|anxiety|depression|mood|meditation|mindfulness|pregnancy|prenatal|postpartum|fertility|hormone|gut\s*health|skincare?|acne|dermat|dermatol|vaccin|allergy|migraine|chronic\s+pain|sleep\s*apnea|sober|sobriety|alcohol-free|smoking\s*cessation|quit\s+smoking|nicotine|substance|detox)\b/.test(
      lower,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Social / life outcomes (find people, build relationships) rather than a metric ladder or pure practice.
 */
function textSuggestsOutcomeBasedGoal(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;

  if (/\b(?:girlfriend|boyfriend|romantic|get\s+married|wedding|find\s+love|start\s+a\s+family|on\s+bumble|on\s+hinge|on\s+tinder|dating(?:\s+life|\s+more|\s+again|\s+apps?)?|go\s+on\s+more\s+dates?|meet\s+someone\s+(?:new|special)?)\b/.test(lower)) {
    return true;
  }

  if (/\b(?:get|find|have|make|meet|earn|gain)\s+(?:a\s+)?(?:new\s+)?(?:close\s+)?friend(?:s|ship)?\b/.test(lower)) {
    return true;
  }
  if (/\b(?:make|build|form|create)\s+friend(?:s|ships)?\b/.test(lower)) {
    return true;
  }
  if (/\bfind\s+a\s+(?:\w+\s+)?(?:group|club|team|community|squad|scene|tribe|circle)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:find|join|build)\s+(?:my\s+)?community\b/.test(lower)) {
    return true;
  }
  if (/\bconnect\s+with\s+more\s+people\b|\bmeet\s+new\s+people\b|\bexpand\s+my\s+social\s+(?:circle|life)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:a\s+)?(?:better|richer|deeper)\s+social\s+life\b|\bsocial\s+life\b/.test(lower)) {
    return true;
  }
  if (/\bbe\s+more\s+social\b|\bless\s+lonely\b|\bbeat\s+loneliness\b|\bloneliness\b/.test(lower)) {
    return true;
  }
  if (/\b(?:get|land|find|nail|ace)\s+(?:a|the|my)\s+job\b|\bget\s+hired\b|\bjob\s+offer\b|\bget\s+into\s+(?:med\s*school|law\s*school|college|grad\s*school|university)\b|\bget\s+accepted\s+into\b/.test(lower)) {
    return true;
  }
  if (/\blearn\s+to\s+(?:make|find|get|have|meet)\s+(?:friends?|a\s+friend|a\s+group|people|community)\b/.test(lower)) {
    return true;
  }
  if (/\bget\s+promot(?:ed|ion)\b|\bclimb(?:ing)?\s+the\s+corporate|land\s+clients?|sign\s+more\s+clients?|get\s+more\s+customers?|close\s+more\s+deals?\b/.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Acquiring a capability: study, practice, produce—reading, cooking, communication, tools, art, language, etc.
 */
function textSuggestsSkillBasedGoal(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;

  if (
    /\b(?:learn|learning|relearn|teach\s+myself|self[- ]?taught|get\s+good\s+at|get\s+better\s+at|improve\s+at|improve\s+my|improve\s+on)\b/.test(
      lower,
    )
  ) {
    if (/\b(?:learn|learning)\s+to\s+(?:make|find|get|have|meet)\s+(?:friends?|a\s+friend|a\s+group|love)\b/.test(lower)) {
      return false;
    }
    if (/\blearn(?:ing)?\s+to\s+(?:invest|save|budget|day\s*trade|trade\s+stocks?)\b/.test(lower)) {
      return false;
    }
    return true;
  }

  if (/\b(?:take|enroll\s+in|signed\s+up\s+for)\s+(?:a\s+)?(?:course|class|workshop|boot\s*camp|lessons?|tutorial)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:practice|practicing|rehears|drills?|training\s+session|study\s+for|preparing?\s+for)\s+/.test(lower)) {
    if (/\b(?:practice|practicing)\s+(?:law|medicine)\b/.test(lower)) return false; // job sense
    return true;
  }

  if (/\b(?:read\s+more|read\s+every|reading\s+habit|read\s+\d+\s*books?|books?\s+per|speed\s*reading|read\s+for\s+pleasure|fin(?:ish|ishing)\s+\d+\s*books?)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:cook(ing|)?|culinary|recipes?|bake(ing|)?|learn\s+to\s+cook|in\s+the\s+kitchen|knife\s*skills?)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:communicat\w*|public\s+speak\w*|presentation\s*skills?|small\s*talk|story\s*tell\w*|listen(?:ing|)\s+skills?|convers(ation|al)\s+skills?|speak(?:ing|)\s+more\s+clearly|express\s+myself|writ(?:e|ing)\s+better|writ(?:e|ing)\s+more)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:language|bilingual|multilingual|fluency|fluent|speak\s+(?:spanish|french|german|japanese|chinese|korean|italian|portuguese|arabic|russian|hindi|mandarin|cantonese)|duolingo)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:code|coding|programm(?:e|ing)|python|javascript|typescript|\bjava\b|\brust\b|ruby|rails?|react|swift\w*|sql|leetcode|developer|software\s*engineer(?:ing|)?)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:guitar|piano|ukulele|violin|sax(?:ophone)?|flute|clarinet|music\s+theory|vocals?|play(?:ing|)\s+drums?|drum\s*kit|drumm(?:ing|er|s))\b/.test(lower)) {
    return true;
  }
  if (/\b(?:dance|danc(?:e|ing)|learn\s+to\s+dance|singing|vocal\s+lessons?)\b/.test(lower)) {
    return true;
  }

  if (/\b(?:draw(ing|)|paint(?:ing|)|sketch|illustrat|sculpt|pottery|calligraphy|photograph(?:y|),?\s*edit|figma|adobe|design\s*skills?)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:type\s*fast\w*|touch\s*typ|wpm|typing\s*speed|keyboard(?:\s*shortcuts)?)\b/.test(lower)) {
    return true;
  }
  if (/\b(?:get\s+)?certified|pass\s+the\s+(?:pmp|cfa|comptia|a\+)\b|\bbar\s*exam|license\s*exam\w*\b/.test(lower)) {
    return true;
  }
  if (/\b(?:improve|build|strengthen|develop|hone)\s+my\s+(?:skills?|craft|ability|abilities)\b/.test(lower)) {
    if (/\bsocial\s*skills?|people\s*skills?|emotional|eq\b|self[- ]?awareness|leadership|management\s+skills?\b/.test(lower)) {
      return true;
    }
    if (/\b(?:technical|soft)\s*skills?\b/.test(lower)) {
      return true;
    }
  }
  if (/\bskill(?:s|)[\s-]based\b|\bnew\s*skill|pick\s*up\s+a\s*skill|mastering\s+/.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Local-only recommendation order: **biological** (body/health) → **outcome_based** (people,
 * relationships, key life/social or career results) → **skill_based** (learning and practice) →
 * **linear** (default, including money and clear metric ladders).
 */
export function recommendedGoalTypeFromText(text: string): GoalType {
  if (!text.trim()) return 'linear';
  if (textSuggestsBiologicalGoal(text)) return 'biological';
  if (textSuggestsOutcomeBasedGoal(text)) return 'outcome_based';
  if (textSuggestsSkillBasedGoal(text)) return 'skill_based';
  return 'linear';
}
