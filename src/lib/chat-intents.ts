import type { Audience } from '@/lib/portal-map';

/**
 * What a question is asking for, decided by pattern rather than by a model.
 *
 * The valuable questions in a school portal are a small, knowable set — "what
 * do I owe", "who hasn't paid", "what's due this week" — and each is one query.
 * Recognising them here means the common case costs no tokens at all, answers
 * in one round trip, and cannot state a figure that isn't in the database.
 *
 * This runs in the browser, which is safe because an intent is a *hint*, not a
 * permission. `ai-chat` validates that the intent belongs to the caller's
 * audience and then scopes every read to their own token, so a client that
 * lied about its intent gets a truthful answer to the wrong question — never
 * somebody else's data. Keeping it here rather than in the edge function means
 * it is unit-testable, and that a navigational question is answered without a
 * network call at all.
 */

export const STUDENT_INTENTS = [
  'fees',
  'tasks',
  'exams',
  'attendance',
  'grades',
  'week',
] as const;

export const ADMIN_INTENTS = [
  'unpaid',
  'pending_admissions',
  'pending_payments',
  'attendance_today',
  'engagement',
  'exams_status',
  'overview',
] as const;

export type StudentIntent = (typeof STUDENT_INTENTS)[number];
export type AdminIntent = (typeof ADMIN_INTENTS)[number];
export type ChatIntent = StudentIntent | AdminIntent;

interface Rule {
  intent: ChatIntent;
  /**
   * Every pattern is anchored on a word that makes the subject unambiguous.
   * Deliberately not a bag of keywords: "how much" alone is a fee question in
   * one sentence and an attendance question in the next.
   */
  patterns: RegExp[];
}

/**
 * Order matters. The cross-cutting digests are tried first, because "what do I
 * need to do this week" mentions tasks and exams and would otherwise be
 * answered as a narrower question than it is.
 */
const STUDENT_RULES: Rule[] = [
  {
    intent: 'week',
    patterns: [
      /\b(this|next) week\b/i,
      /\bwhat (do|should) i (need to |have to )?do\b/i,
      /\bwhat'?s (coming|due|next|outstanding|left)\b/i,
      /\bcatch(ing)? up\b/i,
      /\bam i (behind|up to date|on track)\b/i,
      /\bwhere do i stand\b/i,
    ],
  },
  {
    intent: 'fees',
    patterns: [
      /\b(owe|owing|balance|outstanding)\b.*\b(fee|fees|money|much)?\b/i,
      /\bhow much\b.*\b(owe|pay|left|fee|fees|balance)\b/i,
      /\b(fee|fees|tuition)\b.*\b(owe|balance|paid|outstanding|left|much)\b/i,
      /\b(have i|did i) paid?\b/i,
      /\bmy (fee|fees|balance)\b/i,
    ],
  },
  {
    intent: 'tasks',
    patterns: [
      /\b(overdue|due)\b.*\b(task|tasks|assignment|assignments|work|essay)\b/i,
      /\b(task|tasks|assignment|assignments|homework|coursework)\b.*\b(due|left|outstanding|submit|pending|overdue)\b/i,
      /\bwhat (task|tasks|assignment|assignments)\b/i,
      /\bhave i submitted\b/i,
    ],
  },
  {
    intent: 'exams',
    patterns: [
      /\b(next|upcoming|coming)\b.*\b(exam|exams|test|paper|sitting)\b/i,
      /\b(exam|exams|test|paper|sitting)\b.*\b(when|next|upcoming|soon|date|coming)\b/i,
      /\bwhen is my exam\b/i,
      /\bdo i have (an )?exam/i,
    ],
  },
  {
    intent: 'attendance',
    patterns: [
      /\b(attendance|attended|absences|absent)\b/i,
      /\bhow many (class|classes|lectures)\b/i,
      /\bmissed\b.*\b(class|classes|lecture|lectures)\b/i,
    ],
  },
  {
    intent: 'grades',
    patterns: [
      /\b(my|latest)\b.*\b(grade|grades|mark|marks|score|scores|result|results)\b/i,
      /\b(grade|grades|mark|marks|result|results)\b.*\b(out|so far|latest|released)\b/i,
      /\bhow (am|did) i (doing|do)\b/i,
      /\bwhat did i (get|score)\b/i,
    ],
  },
];

const ADMIN_RULES: Rule[] = [
  {
    intent: 'overview',
    patterns: [
      /\bwhat (needs|requires)\b.*\b(attention|doing|action|me)\b/i,
      /\bwhat'?s (outstanding|waiting|pending|left)\b/i,
      /\banything (waiting|pending|outstanding|to do)\b/i,
      /\bsummar(y|ise|ize)\b/i,
      /\bhow are (we|things)\b/i,
    ],
  },
  {
    intent: 'unpaid',
    patterns: [
      /\bwho\b.*\b(has ?n'?t|have ?n'?t|not)\b.*\b(paid|pay)\b/i,
      /\b(unpaid|outstanding|owing|debtors?|arrears)\b/i,
      /\bwho owes\b/i,
      /\b(students?)\b.*\b(owe|owing|unpaid)\b/i,
      /\bhow much\b.*\b(outstanding|owed|uncollected)\b/i,
    ],
  },
  {
    intent: 'pending_payments',
    patterns: [
      /\b(receipt|receipts)\b.*\b(verify|verified|review|waiting|pending|approve)\b/i,
      /\b(verify|review|approve)\b.*\b(receipt|receipts|payment|payments)\b/i,
      /\bpending payments?\b/i,
    ],
  },
  {
    intent: 'pending_admissions',
    patterns: [
      /\b(pending|waiting|new)\b.*\b(admission|admissions|application|applications|student|students)\b/i,
      /\b(admission|admissions|application|applications)\b.*\b(pending|waiting|approve|review)\b/i,
      /\bwho (has|have) applied\b/i,
      /\bany new (student|students|application|applications)\b/i,
    ],
  },
  {
    intent: 'attendance_today',
    patterns: [
      /\b(attendance|register|check[- ]?in)\b/i,
      /\bwho('s| is| was)\b.*\b(present|absent|in class)\b/i,
      /\bclass today\b/i,
    ],
  },
  {
    intent: 'engagement',
    patterns: [
      /\b(views?|downloads?|traffic|engagement|active users?)\b/i,
      /\bis anyone (using|opening|reading|downloading)\b/i,
      /\bhow (much|many)\b.*\b(used|using|visits?|views?)\b/i,
    ],
  },
  {
    intent: 'exams_status',
    patterns: [
      /\b(exam|exams)\b.*\b(progress|ongoing|open|release|released|status|sitting|marking)\b/i,
      /\b(release|releasing)\b.*\b(result|results)\b/i,
      /\bwho is sitting\b/i,
    ],
  },
];

const rulesFor = (audience: Audience): Rule[] =>
  audience === 'admin' ? ADMIN_RULES : STUDENT_RULES;

/**
 * The intent behind a question, or null when none is recognised.
 *
 * Null is a normal, expected answer and not a failure: it is what routes a
 * question to a model instead. Guessing an intent for an unrecognised question
 * would answer something the person did not ask, which is worse than thinking
 * about it properly.
 */
export const classifyIntent = (question: string, audience: Audience): ChatIntent | null => {
  const text = question.trim();
  if (!text) return null;
  for (const rule of rulesFor(audience)) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.intent;
  }
  return null;
};

/** Whether an intent is one this audience is allowed to ask for. */
export const isIntentFor = (intent: string, audience: Audience): boolean =>
  (audience === 'admin' ? (ADMIN_INTENTS as readonly string[]) : (STUDENT_INTENTS as readonly string[]))
    .includes(intent);

/**
 * Questions worth offering as buttons, so the first thing someone sees is
 * something that works. Each maps to an intent answered with no model call.
 */
export const SUGGESTIONS: Record<Audience, string[]> = {
  student: [
    'What do I need to do this week?',
    'What do I owe?',
    'When is my next exam?',
    'How is my attendance?',
  ],
  admin: [
    'What needs my attention?',
    'Who has not paid?',
    'Any receipts to verify?',
    'How much is the portal being used?',
  ],
};
