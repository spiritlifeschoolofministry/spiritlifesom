import { meaningfulWords, similarity } from '../../supabase/functions/_shared/question-dedupe';

/**
 * What is wrong with a question bank, found by looking rather than by asking.
 *
 * Every check here is a rule, not a judgement, so none of it costs a model call
 * and none of it can be wrong in the way a model is wrong. They are the faults
 * that quietly make an exam unfair: an answer a student can pick without
 * knowing anything, an option repeated twice, a course with too few questions
 * to set a paper from, a question nobody explained so the review screen shows a
 * red cross and nothing else.
 *
 * Deliberately advisory. Nothing is archived or altered — the list says where
 * to look, and a person decides whether the longest option being correct is a
 * giveaway or just how that answer had to be written.
 */

export interface HealthQuestion {
  id: string;
  course_id: string;
  question_type: string;
  question_text: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  status?: string;
  archived?: boolean;
}

export type IssueKind =
  | 'no_explanation'
  | 'longest_is_correct'
  | 'duplicate_options'
  | 'too_few_options'
  | 'near_duplicate'
  | 'no_key';

export interface Issue {
  kind: IssueKind;
  questionId: string;
  courseId: string;
  /** What is wrong, in words an admin can act on. */
  detail: string;
  /** The other question, where the issue is about a pair. */
  relatedId?: string;
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
  no_explanation: 'No explanation',
  longest_is_correct: 'Longest option is the answer',
  duplicate_options: 'Repeated option',
  too_few_options: 'Too few options',
  near_duplicate: 'Almost the same as another',
  no_key: 'No answer key',
};

const asOptions = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((option) => String(option)) : [];

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Past this, two questions in one course are worth looking at together.
 *
 * Looser than the 0.4 the drafter blocks at, because that one silently drops a
 * question and this one only asks a person to glance at a pair. Checked
 * against the real bank: at this setting it pairs rewordings — "who wrote X" against "who was the author of X" scores 0.5 — and leaves
 * genuinely different questions about one passage alone.
 */
const NEAR_DUPLICATE = 0.5;

export const checkQuestions = (questions: HealthQuestion[]): Issue[] => {
  const live = questions.filter((q) => !q.archived);
  const issues: Issue[] = [];

  for (const q of live) {
    const options = asOptions(q.options);
    const isMcq = q.question_type === 'mcq_single' || q.question_type === 'mcq_multi';

    // An essay has no key by design and is marked by a person, so it is exempt
    // from both of the checks that assume an automatic mark.
    if (q.question_type !== 'essay') {
      if (!q.explanation || !q.explanation.trim()) {
        issues.push({
          kind: 'no_explanation',
          questionId: q.id,
          courseId: q.course_id,
          detail: 'A student who gets this wrong sees a red cross and no reason.',
        });
      }
      if (q.correct_answer === null || q.correct_answer === undefined) {
        issues.push({
          kind: 'no_key',
          questionId: q.id,
          courseId: q.course_id,
          detail: 'Nothing to mark the answer against, so it can never be marked right.',
        });
      }
    }

    if (isMcq) {
      if (options.length < 3) {
        issues.push({
          kind: 'too_few_options',
          questionId: q.id,
          courseId: q.course_id,
          detail: `${options.length} option${options.length === 1 ? '' : 's'} — a guess is worth more than it should be.`,
        });
      }

      const seen = new Map<string, number>();
      for (const option of options) {
        const key = option.trim().toLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const repeated = [...seen.entries()].filter(([, n]) => n > 1);
      if (repeated.length) {
        issues.push({
          kind: 'duplicate_options',
          questionId: q.id,
          courseId: q.course_id,
          detail: `"${repeated[0][0]}" appears more than once, so two answers are the same answer.`,
        });
      }

      /**
       * The oldest giveaway in multiple choice: the correct option is written
       * carefully and the wrong ones are written quickly, so the true one is
       * the longest. A student who has learnt that pattern scores without
       * reading the question.
       */
      if (q.question_type === 'mcq_single' && typeof q.correct_answer === 'number' && options.length > 2) {
        const lengths = options.map((option) => option.trim().length);
        const longest = Math.max(...lengths);
        const runnerUp = [...lengths].sort((a, b) => b - a)[1] ?? 0;
        if (lengths[q.correct_answer] === longest && longest > runnerUp * 1.4) {
          issues.push({
            kind: 'longest_is_correct',
            questionId: q.id,
            courseId: q.course_id,
            detail: `The right answer is ${longest} characters and the next longest is ${runnerUp}.`,
          });
        }
      }
    }
  }

  // Near-duplicates, within a course only: two courses may legitimately ask
  // the same thing, and pairing across the whole bank would report that as a
  // fault every time.
  const byCourse = new Map<string, HealthQuestion[]>();
  for (const q of live) {
    if (!byCourse.has(q.course_id)) byCourse.set(q.course_id, []);
    byCourse.get(q.course_id)!.push(q);
  }

  for (const group of byCourse.values()) {
    const words = group.map((q) => meaningfulWords(plain(q.question_text)));
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (similarity(words[i], words[j]) < NEAR_DUPLICATE) continue;
        issues.push({
          kind: 'near_duplicate',
          questionId: group[i].id,
          courseId: group[i].course_id,
          relatedId: group[j].id,
          detail: 'Another question in this course asks nearly the same thing.',
        });
      }
    }
  }

  return issues;
};

/** How many usable questions each course has, and whether that is enough. */
export const courseDepth = (
  questions: HealthQuestion[],
  wanted: number,
): Map<string, { usable: number; short: boolean }> => {
  const depth = new Map<string, { usable: number; short: boolean }>();
  for (const q of questions) {
    if (q.archived) continue;
    if (q.status && q.status !== 'approved') continue;
    const row = depth.get(q.course_id) ?? { usable: 0, short: false };
    row.usable += 1;
    depth.set(q.course_id, row);
  }
  for (const row of depth.values()) row.short = row.usable < wanted;
  return depth;
};
