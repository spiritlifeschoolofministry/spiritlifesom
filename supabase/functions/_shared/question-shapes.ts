/**
 * Whether a drafted question is one the marker could actually score.
 *
 * This is the gate that matters most in the whole AI feature set, and it has no
 * imports so that it can be tested directly from Vitest despite living in the
 * Deno tree — one definition, exercised by `src/test/question-shapes.test.ts`,
 * rather than a copy on each side.
 *
 * Everything here mirrors `autograde.ts` exactly, because a key of the wrong
 * shape is not a visible bug. A question whose `correct_answer` is a string
 * where an index belongs does not fail loudly at marking time; it silently
 * marks every student wrong. So a malformed draft is dropped rather than saved,
 * and the reason is reported to the admin who asked for it.
 */

/** The types a draft may produce. */
export const DRAFTABLE = [
  "mcq_single",
  "mcq_multi",
  "true_false",
  "short_answer",
  "essay",
] as const;

export type Draftable = (typeof DRAFTABLE)[number];

export interface DraftedQuestion {
  question_type?: unknown;
  question_text?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  explanation?: unknown;
  rubric?: unknown;
  points?: unknown;
}

/** The columns a validated draft contributes to a `question_bank` insert. */
export interface ValidatedQuestion {
  question_type: string;
  question_text: string;
  explanation: string | null;
  points: number;
  options: string[] | null;
  correct_answer: number | number[] | boolean | string[] | null;
  rubric: string | null;
}

export interface ValidationPassed {
  ok: true;
  row: ValidatedQuestion;
}

export interface ValidationFailed {
  ok: false;
  /** Why it was dropped, in words an admin can act on. */
  why: string;
}

export type ValidationResult = ValidationPassed | ValidationFailed;

/**
 * Narrows a result to its failure branch.
 *
 * An explicit type predicate rather than a plain `!result.ok` check, because
 * the app's `tsconfig.app.json` runs with `strict: false` — which switches off
 * `strictNullChecks`, and with it the discriminated-union narrowing that would
 * otherwise make `result.why` reachable after an `ok` test.
 */
export const isRejected = (result: ValidationResult): result is ValidationFailed => !result.ok;

/** The explanation cap. Long enough to teach, short enough to sit beside a mark. */
const MAX_EXPLANATION_CHARS = 300;

/** A model's answer, trimmed to one line and capped. */
const oneLine = (value: unknown, maxChars: number): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);

export const validateDraftedQuestion = (
  raw: DraftedQuestion,
  allowed: Iterable<string>,
): ValidationResult => {
  const permitted = new Set(allowed);
  const type = String(raw?.question_type ?? "");
  if (!permitted.has(type)) return { ok: false, why: `type "${type}" was not asked for` };
  if (!(DRAFTABLE as readonly string[]).includes(type)) {
    return { ok: false, why: `type "${type}" cannot be drafted` };
  }

  const text = String(raw?.question_text ?? "").trim();
  // Ten characters is below any real question and above the empty strings and
  // stray punctuation a truncated answer produces.
  if (text.length < 10) return { ok: false, why: "the question text was empty or too short" };

  const points = Number(raw?.points);
  const row: ValidatedQuestion = {
    question_type: type,
    question_text: text,
    explanation: raw?.explanation ? oneLine(raw.explanation, MAX_EXPLANATION_CHARS) : null,
    // A model proposing 0 or 900 marks has still written a usable question;
    // the weighting is a lecturer's call, so it is clamped rather than refused.
    points: Number.isFinite(points) && points > 0 ? Math.min(points, 50) : 1,
    options: null,
    correct_answer: null,
    rubric: null,
  };

  if (type === "essay") {
    // No key by design — an essay is marked by a person, against the rubric.
    row.rubric = raw?.rubric ? String(raw.rubric).trim().slice(0, 2000) : null;
    return { ok: true, row };
  }

  if (type === "true_false") {
    // Strictly boolean: "true" as a string would be compared with Boolean()
    // downstream, where every non-empty string is true — including "false".
    if (typeof raw?.correct_answer !== "boolean") {
      return { ok: false, why: "a true/false question needs a true or false key" };
    }
    row.correct_answer = raw.correct_answer;
    return { ok: true, row };
  }

  if (type === "short_answer") {
    const accepted = (Array.isArray(raw?.correct_answer)
      ? raw.correct_answer
      : [raw?.correct_answer])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (accepted.length === 0) {
      return { ok: false, why: "a short answer question needs at least one accepted answer" };
    }
    row.correct_answer = accepted;
    return { ok: true, row };
  }

  // Both MCQ shapes need real options before their key means anything.
  const options = (Array.isArray(raw?.options) ? raw.options : [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (options.length < 2) return { ok: false, why: "a multiple choice question needs options" };
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    // Two identical options make one of them wrong for no reason a student can
    // see, whichever is keyed.
    return { ok: false, why: "two of its options were the same" };
  }
  row.options = options;

  const inRange = (value: unknown) =>
    Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < options.length;

  if (type === "mcq_single") {
    if (!inRange(raw?.correct_answer)) {
      return { ok: false, why: "its correct option index was missing or out of range" };
    }
    row.correct_answer = Number(raw.correct_answer);
    return { ok: true, row };
  }

  const indices = (Array.isArray(raw?.correct_answer) ? raw.correct_answer : [])
    .filter(inRange)
    .map(Number);
  if (indices.length === 0) {
    return { ok: false, why: "none of its correct option indices were in range" };
  }
  row.correct_answer = [...new Set(indices)].sort((a, b) => a - b);
  return { ok: true, row };
};
