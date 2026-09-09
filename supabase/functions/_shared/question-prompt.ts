/**
 * The brief a question is drafted from.
 *
 * Lifted out of the function so there is one copy of it. The prompt is the
 * whole safeguard against a model writing excellent questions about doctrine
 * this school never taught, so a second copy drifting quietly out of step with
 * this one is not a cosmetic problem.
 */
import { clampExcerpt, line } from "./ai-text.ts";

const MAX_EXCERPT_CHARS = 12_000;

/** What one call may draft. Past this the excerpt is being stretched. */
export const MAX_QUESTIONS = 20;

/**
 * The house brief.
 *
 * The standing instruction is the one about staying inside the material. A
 * model asked for questions on "the doctrine of grace" will cheerfully write
 * excellent questions about things this particular lecturer never taught, and
 * a student examined on those is being examined on the model's theology rather
 * than the school's. So the material is the whole permitted source, and where
 * it does not support a question the correct output is fewer questions.
 */
export const RULES = `You are drafting exam questions for a Bible school, from one course material.

Hard rules:
- Ask only about what the material below actually says. Never draw on outside knowledge, however standard — if the material does not establish it, do not ask it.
- If the material supports fewer questions than requested, return fewer. Fewer good questions is the correct answer; padding is not.
- Do not ask about contested doctrine as though it were settled, and do not write questions whose answer depends on a theological position the material does not itself take.
- Every question must be answerable by someone who has read this material and nothing else.
- Write in British English, plainly. No trick questions.

Answer with a JSON array and nothing else — no prose, no code fence. Each element:
{
  "question_type": one of "mcq_single" | "mcq_multi" | "true_false" | "short_answer" | "essay",
  "question_text": the question,
  "options": for mcq_single and mcq_multi only — an array of 3 to 6 answer strings,
  "correct_answer":
     mcq_single   -> the index (a number) of the correct option,
     mcq_multi    -> an array of indices of the correct options,
     true_false   -> true or false,
     short_answer -> an array of accepted answers, spelling variants included,
     essay        -> omit it entirely,
  "explanation": one sentence saying why the answer is right, for the student's review afterwards,
  "rubric": for essay only — what a full-marks answer must contain,
  "points": a number; 1 for recall, 2 to 5 for short answers, 5 to 15 for an essay
}`;

/** How many previous questions to show the model. Past this the prompt is
    mostly a list of what not to do, at the cost of the material itself. */
export const MAX_SHOWN_EXISTING = 60;

export const draftPrompt = (
  count: number,
  types: string[],
  meta: { title?: string; courseName?: string },
  excerpt: string,
  existing: string[],
) =>
  `${RULES}

Draft up to ${count} questions. Use only these types: ${types.join(", ")}.
${
    existing.length
      ? `
These questions already exist for this course. Do not ask any of them again, and do not ask a reworded version of one — a question that tests the same point in different words is a repeat.

${existing.map((text, i) => `${i + 1}. ${text}`).join("\n")}

Ask about parts of the material these have not covered. If the material has nothing left worth asking that is not already covered above, return fewer questions, or an empty array. An empty array is a correct answer here.
`
      : ""
  }
The material:
${line("Title", meta.title)}${line("Course", meta.courseName)}
"""
${clampExcerpt(excerpt, MAX_EXCERPT_CHARS)}
"""`;



