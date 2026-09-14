import { describe, expect, it } from 'vitest';
import {
  asPercent,
  summarisePractice,
  type PracticeSessionRecord,
} from '@/lib/practice-activity';

/**
 * The figures here end up in front of staff, so what is worth testing is that
 * they cannot quietly say something untrue about a student: a round somebody
 * abandoned must not read as a round they got wrong, and a round spanning
 * several courses must count towards each of them rather than towards none.
 */

const session = (over: Partial<PracticeSessionRecord> = {}): PracticeSessionRecord => ({
  id: 's1',
  student_id: 'stu-1',
  course_id: 'course-a',
  question_ids: ['q1', 'q2'],
  answers: {},
  created_at: '2026-09-10T09:00:00.000Z',
  ...over,
});

const answers = (pairs: Record<string, boolean | null>) =>
  Object.fromEntries(Object.entries(pairs).map(([id, correct]) => [id, { answer: 0, correct }]));

describe('summarisePractice', () => {
  it('counts nothing out of nothing without dividing by zero', () => {
    const result = summarisePractice([]);
    expect(result.rounds).toBe(0);
    expect(result.students).toBe(0);
    expect(result.accuracy).toBeNull();
    expect(result.byStudent).toEqual([]);
    expect(result.byCourse).toEqual([]);
    expect(result.hardest).toEqual([]);
  });

  it('counts rounds, students and right answers', () => {
    const result = summarisePractice([
      session({ id: 'a', answers: answers({ q1: true, q2: false }) }),
      session({ id: 'b', student_id: 'stu-2', answers: answers({ q1: true, q2: true }) }),
    ]);
    expect(result.rounds).toBe(2);
    expect(result.students).toBe(2);
    expect(result.answered).toBe(4);
    expect(result.correct).toBe(3);
    expect(result.accuracy).toBeCloseTo(0.75);
  });

  it('does not count an unanswered question as a wrong answer', () => {
    // Two questions served, one answered and right. A student who stopped
    // early is not a student who got half of it wrong.
    const result = summarisePractice([
      session({ question_ids: ['q1', 'q2'], answers: answers({ q1: true }) }),
    ]);
    expect(result.answered).toBe(1);
    expect(result.accuracy).toBe(1);
  });

  it('counts a round with no answers at all as abandoned, not as wrong', () => {
    const result = summarisePractice([session({ answers: {} })]);
    expect(result.rounds).toBe(1);
    expect(result.abandoned).toBe(1);
    expect(result.answered).toBe(0);
    expect(result.accuracy).toBeNull();
  });

  it('leaves an unmarked answer out of the accuracy but not out of the count', () => {
    const result = summarisePractice([session({ answers: answers({ q1: null, q2: true }) })]);
    expect(result.answered).toBe(2);
    expect(result.marked).toBe(1);
    expect(result.accuracy).toBe(1);
  });

  it('attributes a mixed round to each question own course', () => {
    const result = summarisePractice(
      // course_id is NULL on a round spanning courses, which is exactly when
      // the per-question map has to do the work.
      [session({ course_id: null, answers: answers({ q1: true, q2: false }) })],
      { courseOfQuestion: new Map([['q1', 'course-a'], ['q2', 'course-b']]) },
    );
    const byId = new Map(result.byCourse.map((c) => [c.courseId, c]));
    expect(byId.get('course-a')?.answered).toBe(1);
    expect(byId.get('course-a')?.correct).toBe(1);
    expect(byId.get('course-b')?.answered).toBe(1);
    expect(byId.get('course-b')?.correct).toBe(0);
    // One round, counted once against each course it touched.
    expect(byId.get('course-a')?.rounds).toBe(1);
    expect(byId.get('course-b')?.rounds).toBe(1);
  });

  it('falls back to the session course when a question has no mapping', () => {
    const result = summarisePractice([session({ answers: answers({ q1: true }) })], {
      courseOfQuestion: new Map(),
    });
    expect(result.byCourse).toHaveLength(1);
    expect(result.byCourse[0].courseId).toBe('course-a');
  });

  it('keeps a student latest round whatever order the rows arrive in', () => {
    const result = summarisePractice([
      session({ id: 'old', created_at: '2026-09-01T09:00:00.000Z', answers: answers({ q1: true }) }),
      session({ id: 'new', created_at: '2026-09-09T09:00:00.000Z', answers: answers({ q1: true }) }),
    ]);
    expect(result.byStudent).toHaveLength(1);
    expect(result.byStudent[0].rounds).toBe(2);
    expect(result.byStudent[0].lastAt).toBe('2026-09-09T09:00:00.000Z');
  });

  it('orders students by who practised most recently', () => {
    const result = summarisePractice([
      session({ student_id: 'older', created_at: '2026-09-01T09:00:00.000Z' }),
      session({ student_id: 'newer', created_at: '2026-09-08T09:00:00.000Z' }),
    ]);
    expect(result.byStudent.map((s) => s.studentId)).toEqual(['newer', 'older']);
  });

  it('reports a question as hard only once enough people have tried it', () => {
    const tried = (id: string, correct: boolean) =>
      session({ id, student_id: id, answers: answers({ q1: correct }) });
    // Two attempts, both wrong, is not yet evidence of anything.
    expect(summarisePractice([tried('a', false), tried('b', false)]).hardest).toEqual([]);
    const result = summarisePractice([tried('a', false), tried('b', false), tried('c', true)]);
    expect(result.hardest).toHaveLength(1);
    expect(result.hardest[0]).toMatchObject({ questionId: 'q1', attempts: 3, wrong: 2 });
    expect(result.hardest[0].wrongRate).toBeCloseTo(2 / 3);
  });

  it('never reports a question everybody gets right', () => {
    const right = (id: string) => session({ id, student_id: id, answers: answers({ q1: true }) });
    expect(summarisePractice([right('a'), right('b'), right('c')]).hardest).toEqual([]);
  });

  it('puts the worse-answered question first, and breaks a tie on evidence', () => {
    const rounds: PracticeSessionRecord[] = [
      // q1: 3 of 3 wrong. q2: 3 of 6 wrong. q3: 3 of 3 wrong, on fewer sittings.
      session({ id: '1', student_id: '1', answers: answers({ q1: false, q2: false, q3: false }) }),
      session({ id: '2', student_id: '2', answers: answers({ q1: false, q2: false, q3: false }) }),
      session({ id: '3', student_id: '3', answers: answers({ q1: false, q2: false, q3: false }) }),
      session({ id: '4', student_id: '4', answers: answers({ q1: true, q2: true }) }),
      session({ id: '5', student_id: '5', answers: answers({ q2: true }) }),
      session({ id: '6', student_id: '6', answers: answers({ q2: true }) }),
    ];
    const hardest = summarisePractice(rounds).hardest;
    expect(hardest[0].questionId).toBe('q3');
    expect(hardest.map((h) => h.questionId)).toEqual(['q3', 'q1', 'q2']);
  });

  it('survives an answers object that is not the shape it should be', () => {
    const result = summarisePractice([
      session({ answers: null }),
      session({ id: 'b', answers: { q1: 'nonsense' } }),
    ]);
    expect(result.rounds).toBe(2);
    expect(result.answered).toBe(1);
    expect(result.marked).toBe(0);
    expect(result.accuracy).toBeNull();
  });
});

describe('asPercent', () => {
  it('rounds to a whole percent', () => {
    expect(asPercent(0.666)).toBe('67%');
    expect(asPercent(1)).toBe('100%');
    expect(asPercent(0)).toBe('0%');
  });

  it('shows a dash rather than a nought when there is nothing to divide', () => {
    expect(asPercent(null)).toBe('—');
  });
});
