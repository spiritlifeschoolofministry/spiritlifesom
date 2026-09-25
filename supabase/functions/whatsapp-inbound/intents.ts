/**
 * Working out what somebody meant, without asking a model first.
 *
 * The questions people send a school's number are a small, knowable set, and
 * each of them has one right answer that lives in the database. Matching them
 * here means the common case is a query rather than a model call: free,
 * instant, and incapable of inventing a figure.
 *
 * The patterns are generous on purpose. "how much do i owe", "wetin i dey owe",
 * "my balance abeg" and "fees?" are the same question, and a student who has to
 * phrase things exactly right is being asked to use a command line.
 *
 * Only what matches nothing here reaches the model, and what it gets is a
 * question about the school rather than about a person.
 */

export type Intent =
  | "human"
  | "help"
  | "stop"
  | "start"
  | "verify"
  | "fees"
  | "results"
  | "assignments"
  | "timetable"
  | null;

const PATTERNS: [Intent, RegExp][] = [
  // Asking for a person comes first, ahead of every other reading. Somebody
  // who says "I need to speak to someone about my fees" is asking for a
  // person, and answering with a fee balance would be a machine talking over
  // a request to stop talking to a machine.
  [
    "human",
    /\b(human|real person|speak to (someone|somebody|a person|an admin|the office)|talk to (someone|somebody|a person|an admin|the office)|customer (care|service)|agent|call me|complain|complaint|urgent|emergency)\b/,
  ],

  ["stop", /\b(stop|unsubscribe|opt ?out|don'?t message|no more messages)\b/],
  ["start", /\b(start|resume|subscribe|opt ?in)\b/],
  ["verify", /\b(verify|certificate|cert)\b/],

  // Money. "owe", "balance" and "fees" carry it in every phrasing seen here,
  // including Pidgin, which is how a good half of these will be written.
  [
    "fees",
    /\b(fee|fees|owe|owing|balance|payment|paid|pay|school fees|how much|debt|outstanding)\b/,
  ],

  ["results", /\b(result|results|score|scores|grade|grades|exam result|marks)\b/],
  ["assignments", /\b(assignment|assignments|task|tasks|homework|submission|due)\b/],
  ["timetable", /\b(timetable|time ?table|schedule|class|classes|event|events|when is|lecture)\b/],

  ["help", /\b(help|menu|options|commands|what can you do|hi|hello|hey|good morning|good afternoon|good evening)\b/],
];

export function classify(text: string): Intent {
  const body = text.trim().toLowerCase();

  // An exam result and an exam timetable share most of their words, so the
  // more specific reading wins wherever both match.
  for (const [intent, pattern] of PATTERNS) {
    if (pattern.test(body)) return intent;
  }
  return null;
}
