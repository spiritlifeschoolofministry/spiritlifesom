import { describe, expect, it } from 'vitest';
import {
  DRAFTABLE,
  isRejected,
  validateDraftedQuestion,
} from '../../supabase/functions/_shared/question-shapes';

/**
 * The validator that stands between a model's output and the question bank.
 *
 * Imported straight out of the Deno tree — `question-shapes.ts` has no imports
 * for exactly this reason, so the code that actually runs in production is the
 * code under test rather than a copy of it.
 *
 * What these tests are really protecting is the marking path. `autograde.ts`
 * compares an answer to `correct_answer` with `Number()`, `Boolean()` and a
 * normalised string match, and none of those throw on a wrong-shaped key —
 * they just quietly return "wrong" for every student who ever sits the
 * question. So a malformed draft has to be refused here, before it is saved,
 * because nothing downstream will ever complain about it.
 */

const ALL = [...DRAFTABLE];

const ok = (raw: Parameters<typeof validateDraftedQuestion>[0]) => {
  const result = validateDraftedQuestion(raw, ALL);
  if (isRejected(result)) throw new Error(`expected valid, got: ${result.why}`);
  return result.row;
};

/** The rejection reason, so a test can assert on which rule caught it. */
const rejected = (raw: Parameters<typeof validateDraftedQuestion>[0]) => {
  const result = validateDraftedQuestion(raw, ALL);
  if (!isRejected(result)) throw new Error('expected this to be rejected, but it was accepted');
  return result.why;
};

const QUESTION = 'What does Paul say about grace here?';

describe('mcq_single', () => {
  it('accepts an in-range index and keeps it a number', () => {
    const row = ok({
      question_type: 'mcq_single',
      question_text: QUESTION,
      options: ['Alpha', 'Beta', 'Gamma'],
      correct_answer: 1,
      points: 2,
    });
    expect(row.correct_answer).toBe(1);
    expect(row.options).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(row.points).toBe(2);
  });

  it('rejects an out-of-range index', () => {
    // autograde would compare Number(answer) === Number(3) and never match.
    expect(
      rejected({
        question_type: 'mcq_single',
        question_text: QUESTION,
        options: ['Alpha', 'Beta'],
        correct_answer: 3,
      }),
    ).toMatch(/out of range/);
  });

  it('rejects the option text in place of its index', () => {
    // The single likeliest way a model gets this wrong.
    expect(
      rejected({
        question_type: 'mcq_single',
        question_text: QUESTION,
        options: ['Alpha', 'Beta'],
        correct_answer: 'Alpha',
      }),
    ).toMatch(/out of range/);
  });

  it('rejects a missing key', () => {
    expect(
      rejected({
        question_type: 'mcq_single',
        question_text: QUESTION,
        options: ['Alpha', 'Beta'],
      }),
    ).toMatch(/missing or out of range/);
  });

  it('rejects fewer than two options', () => {
    expect(
      rejected({
        question_type: 'mcq_single',
        question_text: QUESTION,
        options: ['Alpha'],
        correct_answer: 0,
      }),
    ).toMatch(/needs options/);
  });

  it('rejects duplicate options', () => {
    // Whichever is keyed, the other is wrong for no reason a student can see.
    expect(
      rejected({
        question_type: 'mcq_single',
        question_text: QUESTION,
        options: ['Grace', 'grace', 'Law'],
        correct_answer: 0,
      }),
    ).toMatch(/the same/);
  });
});

describe('mcq_multi', () => {
  it('accepts indices, de-duplicated and sorted', () => {
    const row = ok({
      question_type: 'mcq_multi',
      question_text: QUESTION,
      options: ['A', 'B', 'C', 'D'],
      correct_answer: [2, 0, 2],
    });
    // autograde's sameSet sorts both sides, but storing them tidy means the
    // saved row reads the way a person would write it.
    expect(row.correct_answer).toEqual([0, 2]);
  });

  it('drops out-of-range indices but keeps the valid ones', () => {
    const row = ok({
      question_type: 'mcq_multi',
      question_text: QUESTION,
      options: ['A', 'B'],
      correct_answer: [0, 7],
    });
    expect(row.correct_answer).toEqual([0]);
  });

  it('rejects when no index is in range', () => {
    expect(
      rejected({
        question_type: 'mcq_multi',
        question_text: QUESTION,
        options: ['A', 'B'],
        correct_answer: [5, 6],
      }),
    ).toMatch(/in range/);
  });

  it('rejects a single number where a list belongs', () => {
    expect(
      rejected({
        question_type: 'mcq_multi',
        question_text: QUESTION,
        options: ['A', 'B'],
        correct_answer: 1,
      }),
    ).toMatch(/in range/);
  });
});

describe('true_false', () => {
  it('accepts a real boolean', () => {
    expect(ok({ question_type: 'true_false', question_text: QUESTION, correct_answer: false }).correct_answer)
      .toBe(false);
  });

  it('rejects the string "false"', () => {
    // This is the dangerous one: autograde does Boolean(answer) === Boolean(key),
    // and Boolean("false") is true — so a keyed "false" marks every student who
    // correctly answered false as wrong.
    expect(
      rejected({ question_type: 'true_false', question_text: QUESTION, correct_answer: 'false' }),
    ).toMatch(/true or false/);
  });

  it('rejects the string "true" too', () => {
    expect(
      rejected({ question_type: 'true_false', question_text: QUESTION, correct_answer: 'true' }),
    ).toMatch(/true or false/);
  });

  it('rejects a missing key', () => {
    expect(rejected({ question_type: 'true_false', question_text: QUESTION }))
      .toMatch(/true or false/);
  });
});

describe('short_answer', () => {
  it('accepts a list of accepted answers', () => {
    expect(
      ok({
        question_type: 'short_answer',
        question_text: QUESTION,
        correct_answer: ['Grace', 'unmerited favour'],
      }).correct_answer,
    ).toEqual(['Grace', 'unmerited favour']);
  });

  it('wraps a single string into a list', () => {
    // autograde treats a non-array key as a one-element list anyway, so this
    // normalises rather than refuses.
    expect(
      ok({
        question_type: 'short_answer',
        question_text: QUESTION,
        correct_answer: 'Grace',
      }).correct_answer,
    ).toEqual(['Grace']);
  });

  it('rejects an empty list', () => {
    expect(
      rejected({
        question_type: 'short_answer',
        question_text: QUESTION,
        correct_answer: [],
      }),
    ).toMatch(/at least one accepted answer/);
  });

  it('rejects a list of blanks', () => {
    expect(
      rejected({
        question_type: 'short_answer',
        question_text: QUESTION,
        correct_answer: ['', '   '],
      }),
    ).toMatch(/at least one accepted answer/);
  });
});

describe('essay', () => {
  it('has no key, and keeps the rubric', () => {
    const row = ok({
      question_type: 'essay',
      question_text: QUESTION,
      rubric: 'Must cover both covenants.',
      points: 10,
    });
    expect(row.correct_answer).toBeNull();
    expect(row.rubric).toBe('Must cover both covenants.');
    expect(row.points).toBe(10);
  });

  it('is valid with no rubric at all', () => {
    // A missing rubric costs the essay a trustworthy suggested mark, not its
    // existence — the lecturer can add one later.
    expect(ok({ question_type: 'essay', question_text: QUESTION }).rubric).toBeNull();
  });
});

describe('across every type', () => {
  it('rejects a type that was not asked for', () => {
    expect(
      validateDraftedQuestion(
        { question_type: 'essay', question_text: QUESTION },
        ['mcq_single'],
      ).ok,
    ).toBe(false);
  });

  it('rejects `matching`, which is never draftable', () => {
    // Its key is a map of pairs and it is scored proportionally, so a subtly
    // wrong key marks every student partly wrong — quietly.
    expect(
      rejected({
        question_type: 'matching',
        question_text: QUESTION,
        correct_answer: { A: '1' },
      }),
    ).toMatch(/not asked for/);
  });

  it('rejects question text that is empty or a fragment', () => {
    expect(rejected({ question_type: 'true_false', question_text: '', correct_answer: true }))
      .toMatch(/empty or too short/);
    expect(rejected({ question_type: 'true_false', question_text: 'why', correct_answer: true }))
      .toMatch(/empty or too short/);
  });

  it('defaults absent or nonsensical points to 1', () => {
    expect(ok({ question_type: 'true_false', question_text: QUESTION, correct_answer: true }).points)
      .toBe(1);
    expect(
      ok({
        question_type: 'true_false',
        question_text: QUESTION,
        correct_answer: true,
        points: -5,
      }).points,
    ).toBe(1);
  });

  it('clamps absurd points rather than refusing the question', () => {
    expect(
      ok({
        question_type: 'true_false',
        question_text: QUESTION,
        correct_answer: true,
        points: 9000,
      }).points,
    ).toBe(50);
  });

  it('collapses an explanation to one capped line', () => {
    const row = ok({
      question_type: 'true_false',
      question_text: QUESTION,
      correct_answer: true,
      explanation: `Because\n\n  Paul  says so. ${'x'.repeat(400)}`,
    });
    expect(row.explanation).not.toContain('\n');
    expect(row.explanation!.length).toBeLessThanOrEqual(300);
  });

  it('survives entirely junk input without throwing', () => {
    expect(validateDraftedQuestion({}, ALL).ok).toBe(false);
    expect(
      validateDraftedQuestion(
        { question_type: null, question_text: undefined, options: 'not an array' },
        ALL,
      ).ok,
    ).toBe(false);
  });
});
