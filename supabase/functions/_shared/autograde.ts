/**
 * Scoring for question types whose answer key is set when the question is
 * written, so a lecturer only ever hand-marks the ones that genuinely need
 * judgement.
 *
 * Shapes, as stored by the question bank and the runner:
 *   mcq_single   key: option index (number)        answer: option index
 *   mcq_multi    key: array of option indices      answer: array of indices
 *   true_false   key: boolean                      answer: boolean
 *   short_answer key: array of accepted strings    answer: string
 *   fill_blank   key: array of accepted strings    answer: string
 *   matching     key: {A: "1", B: "2"}             answer: same shape
 *   essay        no key — manual
 *
 * Matching is scored proportionally: get one pair of two right and half the
 * marks follow. A lecturer can still change any mark afterwards.
 */

export const AUTO_GRADED_TYPES = [
  "mcq_single",
  "mcq_multi",
  "true_false",
  "short_answer",
  "fill_blank",
  "matching",
] as const;

export type Question = {
  id: string;
  question_type: string;
  correct_answer: unknown;
  points: number | string | null;
};

export type GradeResult = {
  /** null when the type needs a human, or the question has no key set. */
  pointsAwarded: number | null;
  isCorrect: boolean | null;
  /** True when a person still has to look at this one. */
  needsManual: boolean;
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Order-insensitive comparison of two index lists. */
const sameSet = (a: unknown, b: unknown) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const left = [...a].map(Number).sort((x, y) => x - y);
  const right = [...b].map(Number).sort((x, y) => x - y);
  return left.every((v, i) => v === right[i]);
};

export function gradeAnswer(question: Question, answer: unknown): GradeResult {
  const manual: GradeResult = { pointsAwarded: null, isCorrect: null, needsManual: true };

  if (!(AUTO_GRADED_TYPES as readonly string[]).includes(question.question_type)) return manual;

  // A question of an auto-gradable type but with no key saved still needs a
  // human — silently scoring it zero would be worse than asking.
  const key = question.correct_answer;
  if (key === null || key === undefined) return manual;

  const points = Number(question.points) || 0;
  // Unanswered is a definite zero, not something to hand to a marker.
  const blank = answer === null || answer === undefined || answer === "";

  // Matching earns marks pair by pair, so it cannot use the all-or-nothing
  // path below.
  if (question.question_type === "matching") {
    const expected = (key ?? {}) as Record<string, unknown>;
    const given = (blank || typeof answer !== "object" || Array.isArray(answer)
      ? {}
      : answer) as Record<string, unknown>;
    const pairs = Object.keys(expected);
    if (pairs.length === 0) return manual;

    const hits = pairs.filter((k) => norm(given[k]) !== "" && norm(given[k]) === norm(expected[k])).length;
    return {
      pointsAwarded: Math.round((points * hits) / pairs.length * 100) / 100,
      isCorrect: hits === pairs.length,
      needsManual: false,
    };
  }

  let correct = false;
  if (!blank) {
    switch (question.question_type) {
      case "mcq_single":
        correct = Number(answer) === Number(key);
        break;
      case "mcq_multi":
        correct = sameSet(answer, key);
        break;
      case "true_false":
        correct = Boolean(answer) === Boolean(key);
        break;
      case "short_answer":
      case "fill_blank": {
        const accepted = Array.isArray(key) ? key : [key];
        correct = accepted.some((k) => norm(k) === norm(answer));
        break;
      }
    }
  }

  return {
    pointsAwarded: correct ? points : 0,
    isCorrect: correct,
    needsManual: false,
  };
}
