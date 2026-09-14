/**
 * What students have done with the practice questions, counted.
 *
 * No new table and no new writing. `practice_sessions` already records every
 * round: who sat it, which questions were served, and whether each answer was
 * right. That is the record — this only reads it back, so there is nothing to
 * keep in step and nothing that can drift from what actually happened.
 *
 * Pure, and separate from the panel that shows it, for the same reason
 * `question-health` is: the counting is the part worth testing, and a function
 * over plain rows can be tested without a database or a render.
 *
 * Practice counts towards nothing — not a grade, not a transcript, not
 * attendance. These figures are for reference: which courses are being
 * practised, who is practising, and which questions are being got wrong. Read
 * as anything else they would be a mark nobody agreed to be given.
 */

/** One `practice_sessions` row, as much of it as the counting needs. */
export interface PracticeSessionRecord {
  id: string;
  student_id: string;
  /** NULL for a round drawn from several courses at once. */
  course_id: string | null;
  question_ids: unknown;
  /** `{ [question_id]: { answer, correct } }`, written as each answer is marked. */
  answers: unknown;
  created_at: string;
}

export interface PracticeStudentRow {
  studentId: string;
  rounds: number;
  /** Answers given. A round left half-finished contributes the half that was. */
  answered: number;
  /** Of those, the ones that came back with a verdict. */
  marked: number;
  correct: number;
  /** Right out of marked, or null when nothing of theirs was marked. */
  accuracy: number | null;
  /** ISO timestamp of their most recent round. */
  lastAt: string;
}

export interface PracticeCourseRow {
  /** NULL only when a question's course could not be established. */
  courseId: string | null;
  /** Rounds that included at least one question from this course. */
  rounds: number;
  students: number;
  answered: number;
  marked: number;
  correct: number;
  accuracy: number | null;
}

export interface PracticeQuestionRow {
  questionId: string;
  attempts: number;
  wrong: number;
  /** Wrong out of attempts. */
  wrongRate: number;
}

export interface PracticeActivity {
  rounds: number;
  students: number;
  answered: number;
  marked: number;
  correct: number;
  accuracy: number | null;
  /** Rounds where the student answered nothing at all. */
  abandoned: number;
  byStudent: PracticeStudentRow[];
  byCourse: PracticeCourseRow[];
  /** The questions most often got wrong, hardest first. */
  hardest: PracticeQuestionRow[];
}

export interface SummariseOptions {
  /**
   * Which course each question belongs to.
   *
   * A round can span several courses, and then the session's own course_id is
   * NULL because there is no single honest answer. Given this map each answer
   * is attributed to its own question's course, so a mixed round still counts
   * towards the right courses rather than towards none.
   */
  courseOfQuestion?: Map<string, string>;
  /** How many attempts a question needs before its wrong rate means anything. */
  minAttempts?: number;
  /** How many of the hardest questions to return. */
  hardestLimit?: number;
}

/** One entry of the `answers` object, however much of it survived. */
const verdictOf = (value: unknown): boolean | null => {
  if (!value || typeof value !== 'object') return null;
  const correct = (value as { correct?: unknown }).correct;
  return typeof correct === 'boolean' ? correct : null;
};

const rate = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

/**
 * Counts a set of practice sessions.
 *
 * Only answers actually marked count towards an accuracy — a question served
 * and never answered is not a wrong answer, and treating it as one would make
 * a student who stopped early look like a student who got things wrong.
 */
export const summarisePractice = (
  sessions: PracticeSessionRecord[],
  options: SummariseOptions = {},
): PracticeActivity => {
  const { courseOfQuestion, minAttempts = 3, hardestLimit = 5 } = options;

  let answered = 0;
  let marked = 0;
  let correct = 0;
  let abandoned = 0;

  const students = new Map<string, PracticeStudentRow>();
  const courses = new Map<string | null, PracticeCourseRow & { studentIds: Set<string> }>();
  const questions = new Map<string, { attempts: number; wrong: number }>();

  for (const session of sessions) {
    const answers = (session.answers ?? {}) as Record<string, unknown>;
    const entries = answers && typeof answers === 'object' ? Object.entries(answers) : [];
    if (entries.length === 0) abandoned += 1;

    const student = students.get(session.student_id) ?? {
      studentId: session.student_id,
      rounds: 0,
      answered: 0,
      marked: 0,
      correct: 0,
      accuracy: null,
      lastAt: session.created_at,
    };
    student.rounds += 1;
    // Sessions arrive in no guaranteed order, so the latest is whichever is
    // latest rather than whichever came last.
    if (session.created_at > student.lastAt) student.lastAt = session.created_at;

    // The courses this round touched, so a mixed round counts as one round
    // against each rather than as one round against nothing.
    const touched = new Set<string | null>();

    for (const [questionId, entry] of entries) {
      const verdict = verdictOf(entry);
      answered += 1;
      student.answered += 1;
      if (verdict !== null) {
        marked += 1;
        student.marked += 1;
      }
      if (verdict === true) {
        correct += 1;
        student.correct += 1;
      }

      const courseId = courseOfQuestion?.get(questionId) ?? session.course_id ?? null;
      touched.add(courseId);
      const course = courses.get(courseId) ?? {
        courseId,
        rounds: 0,
        students: 0,
        answered: 0,
        marked: 0,
        correct: 0,
        accuracy: null,
        studentIds: new Set<string>(),
      };
      course.answered += 1;
      if (verdict !== null) course.marked += 1;
      if (verdict === true) course.correct += 1;
      course.studentIds.add(session.student_id);
      courses.set(courseId, course);

      const question = questions.get(questionId) ?? { attempts: 0, wrong: 0 };
      // Only a marked answer is an attempt: an unmarked one says nothing about
      // whether the question is hard.
      if (verdict !== null) {
        question.attempts += 1;
        if (!verdict) question.wrong += 1;
        questions.set(questionId, question);
      }
    }

    for (const courseId of touched) {
      const course = courses.get(courseId);
      if (course) course.rounds += 1;
    }

    students.set(session.student_id, student);
  }

  const byStudent = [...students.values()]
    .map((row) => ({ ...row, accuracy: rate(row.correct, row.marked) }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const byCourse = [...courses.values()]
    .map(({ studentIds, ...row }) => ({
      ...row,
      students: studentIds.size,
      accuracy: rate(row.correct, row.marked),
    }))
    .sort((a, b) => b.answered - a.answered);

  const hardest = [...questions.entries()]
    .filter(([, q]) => q.attempts >= minAttempts && q.wrong > 0)
    .map(([questionId, q]) => ({
      questionId,
      attempts: q.attempts,
      wrong: q.wrong,
      wrongRate: q.wrong / q.attempts,
    }))
    // Worst rate first, and the more-attempted of two equal rates first: it is
    // the better evidenced of the two.
    .sort((a, b) => b.wrongRate - a.wrongRate || b.attempts - a.attempts)
    .slice(0, hardestLimit);

  return {
    rounds: sessions.length,
    students: students.size,
    answered,
    marked,
    correct,
    accuracy: rate(correct, marked),
    abandoned,
    byStudent,
    byCourse,
    hardest,
  };
};

/** "72%", or a dash where there is nothing to take a percentage of. */
export const asPercent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;
