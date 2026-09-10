/**
 * The bank health checks, tested as the rules they are.
 *
 * These decide what an administrator is told is wrong with their exam
 * questions, so a false alarm costs them trust in the whole panel. The cases
 * below are as much about what must stay quiet as what must be caught.
 */
import { describe, expect, it } from 'vitest';
import { checkQuestions, courseDepth, type HealthQuestion } from '@/lib/question-health';

const q = (over: Partial<HealthQuestion> & { id: string }): HealthQuestion => ({
  course_id: 'c1',
  question_type: 'mcq_single',
  question_text: 'What is the canon?',
  options: ['One', 'Two', 'Three', 'Four'],
  correct_answer: 0,
  explanation: 'Because the material says so.',
  archived: false,
  status: 'approved',
  ...over,
});

const kinds = (questions: HealthQuestion[]) => checkQuestions(questions).map((i) => i.kind);

describe('question bank health', () => {
  it('says nothing about a sound question', () => {
    expect(checkQuestions([q({ id: '1' })])).toEqual([]);
  });

  it('flags a missing explanation, but never on an essay', () => {
    expect(kinds([q({ id: '1', explanation: null })])).toContain('no_explanation');
    expect(kinds([q({ id: '2', question_type: 'essay', explanation: null, correct_answer: null })]))
      .toEqual([]);
  });

  it('flags a missing answer key outside essays', () => {
    expect(kinds([q({ id: '1', correct_answer: null })])).toContain('no_key');
  });

  it('flags a repeated option', () => {
    expect(kinds([q({ id: '1', options: ['Yes', 'yes ', 'No', 'Maybe'] })]))
      .toContain('duplicate_options');
  });

  it('flags too few options', () => {
    expect(kinds([q({ id: '1', options: ['Yes', 'No'] })])).toContain('too_few_options');
  });

  it('flags the giveaway where the right answer is much the longest', () => {
    expect(kinds([q({
      id: '1',
      options: ['A carefully qualified statement that runs on at length', 'No', 'Yes', 'Maybe'],
      correct_answer: 0,
    })])).toContain('longest_is_correct');
  });

  it('does not flag a long correct answer among other long ones', () => {
    expect(kinds([q({
      id: '1',
      options: [
        'A carefully qualified statement of some length',
        'Another carefully qualified statement of length',
        'A third statement of roughly equal length here',
      ],
      correct_answer: 0,
    })])).not.toContain('longest_is_correct');
  });

  it('pairs near-duplicates inside a course and ignores them across courses', () => {
    const same = 'Who wrote the Muratorian Canon?';
    const reworded = 'Who was the author of the Muratorian Canon?';
    expect(kinds([
      q({ id: '1', question_text: same }),
      q({ id: '2', question_text: reworded }),
    ])).toContain('near_duplicate');

    expect(kinds([
      q({ id: '1', question_text: same, course_id: 'c1' }),
      q({ id: '2', question_text: reworded, course_id: 'c2' }),
    ])).not.toContain('near_duplicate');
  });

  it('ignores archived questions entirely', () => {
    expect(checkQuestions([q({ id: '1', explanation: null, archived: true })])).toEqual([]);
  });

  it('strips markup before comparing questions', () => {
    expect(kinds([
      q({ id: '1', question_text: '<p>Who wrote the <b>Muratorian Canon</b>?</p>' }),
      q({ id: '2', question_text: 'Who wrote the Muratorian Canon?' }),
    ])).toContain('near_duplicate');
  });
});

describe('courseDepth', () => {
  it('counts only approved, unarchived questions and marks short courses', () => {
    const depth = courseDepth([
      q({ id: '1' }),
      q({ id: '2', status: 'draft' }),
      q({ id: '3', archived: true }),
      q({ id: '4', course_id: 'c2' }),
    ], 2);
    expect(depth.get('c1')).toEqual({ usable: 1, short: true });
    expect(depth.get('c2')).toEqual({ usable: 1, short: true });
  });
});
