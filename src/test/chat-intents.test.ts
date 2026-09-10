import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_INTENTS,
  STUDENT_INTENTS,
  SUGGESTIONS,
  classifyIntent,
  isIntentFor,
} from '@/lib/chat-intents';

/**
 * Classification decides whether a question costs a model call, so the two
 * things worth testing are that real phrasings land on the right intent, and
 * that an unrecognised question returns null rather than being forced into the
 * nearest bucket — answering a question nobody asked is the failure mode here.
 */
describe('classifyIntent — students', () => {
  const asks = (question: string) => classifyIntent(question, 'student');

  it.each([
    ['What do I owe?', 'fees'],
    ['how much do I still have to pay', 'fees'],
    ['my fees balance', 'fees'],
    ['have I paid?', 'fees'],
    ['what tasks are due', 'tasks'],
    ['do I have any overdue assignments', 'tasks'],
    ['have I submitted everything', 'tasks'],
    ['when is my next exam', 'exams'],
    ['do I have an exam coming up', 'exams'],
    ['how is my attendance', 'attendance'],
    ['how many classes have I missed', 'attendance'],
    ['what are my latest marks', 'grades'],
    ['how am I doing', 'grades'],
  ])('reads "%s" as %s', (question, intent) => {
    expect(asks(question)).toBe(intent);
  });

  it.each([
    'what do I need to do this week',
    "what's coming up",
    'am I behind',
    'where do I stand',
  ])('routes the cross-cutting question "%s" to the week digest', (question) => {
    expect(asks(question)).toBe('week');
  });

  it('prefers the digest over a narrower intent for a compound question', () => {
    // Mentions exams and tasks, but is asking for the whole picture.
    expect(asks('what do I need to do this week for my exams and tasks')).toBe('week');
  });

  it('returns null rather than forcing an unrecognised question into a bucket', () => {
    expect(asks('who was Barnabas in the Bible')).toBeNull();
    expect(asks('what is the meaning of grace')).toBeNull();
    expect(asks('hello')).toBeNull();
    expect(asks('   ')).toBeNull();
  });

  it('does not answer an admin question for a student', () => {
    expect(asks('who has not paid')).not.toBe('unpaid');
  });
});

describe('classifyIntent — admins', () => {
  const asks = (question: string) => classifyIntent(question, 'admin');

  it.each([
    ['who has not paid', 'unpaid'],
    ["who hasn't paid this session", 'unpaid'],
    ['show me the debtors', 'unpaid'],
    ['how much is outstanding', 'unpaid'],
    ['are there receipts to verify', 'pending_payments'],
    ['pending payments', 'pending_payments'],
    ['any new applications', 'pending_admissions'],
    ['pending admissions', 'pending_admissions'],
    ['is anyone using the portal', 'engagement'],
    ['how many downloads', 'engagement'],
    ['release results status', 'exams_status'],
  ])('reads "%s" as %s', (question, intent) => {
    expect(asks(question)).toBe(intent);
  });

  it.each(['what needs my attention', "what's outstanding", 'anything waiting'])(
    'routes "%s" to the overview digest',
    (question) => {
      expect(asks(question)).toBe('overview');
    },
  );

  it('returns null for a question about no known subject', () => {
    expect(asks('what should our fee policy be')).toBeNull();
  });
});

describe('isIntentFor', () => {
  it('keeps the two audiences separate', () => {
    expect(isIntentFor('unpaid', 'admin')).toBe(true);
    expect(isIntentFor('unpaid', 'student')).toBe(false);
    expect(isIntentFor('fees', 'student')).toBe(true);
    expect(isIntentFor('fees', 'admin')).toBe(false);
  });

  it('rejects anything not on the list at all', () => {
    expect(isIntentFor('drop_table', 'admin')).toBe(false);
    expect(isIntentFor('', 'student')).toBe(false);
  });
});

describe('SUGGESTIONS', () => {
  it.each(['student', 'admin'] as const)(
    'only offers %s questions the classifier actually recognises',
    (audience) => {
      const known: readonly string[] =
        audience === 'admin' ? ADMIN_INTENTS : STUDENT_INTENTS;
      SUGGESTIONS[audience].forEach((question) => {
        const intent = classifyIntent(question, audience);
        // A suggestion that fell through to a model would be a button that
        // silently costs a call, which defeats the point of offering it.
        expect(intent, `"${question}" matched no intent`).not.toBeNull();
        expect(known).toContain(intent);
      });
    },
  );
});

/**
 * The edge function keeps its own copy of these lists, because a Deno function
 * cannot import from `src/`. That duplication is unavoidable, so it is checked
 * rather than trusted: an intent added here but not there would be sent by the
 * client, silently rejected as unknown by the server, and fall through to a
 * model call — a feature that looks like it works while quietly costing a call
 * per question. Failing the build is much easier to notice.
 */
describe('questions about the school itself', () => {
  it('recognises them from either portal', () => {
    const asked = [
      'Tell me about the school',
      'When was the school founded?',
      'Who is the director?',
      'What is the mission?',
      'What is the address of the school?',
      'How do I contact the office?',
      'What is the difference between the basic and advanced module?',
      'Where are the classes held?',
    ];
    for (const question of asked) {
      expect(classifyIntent(question, 'student'), question).toBe('school');
      expect(classifyIntent(question, 'admin'), question).toBe('school');
    }
  });

  /**
   * The school rule is tried first, so these are the ones that prove it did not
   * swallow the questions people actually ask most. "How is my attendance" must
   * stay an attendance question however many times the word school appears
   * elsewhere in the rules.
   */
  it('does not swallow questions about the person asking', () => {
    expect(classifyIntent('How is my attendance?', 'student')).toBe('attendance');
    expect(classifyIntent('What do I owe?', 'student')).toBe('fees');
    expect(classifyIntent('When is my next exam?', 'student')).toBe('exams');
    expect(classifyIntent('What do I need to do this week?', 'student')).toBe('week');
    expect(classifyIntent('Who has not paid?', 'admin')).toBe('unpaid');
  });
});

describe('the edge function\'s copy of the intent lists', () => {
  const source = readFileSync('supabase/functions/ai-chat/index.ts', 'utf8');

  const listInEdge = (name: string): string[] => {
    const match = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`, 's'));
    expect(match, `${name} not found in ai-chat/index.ts`).toBeTruthy();
    return [...(match![1].matchAll(/"(\w+)"/g))].map((m) => m[1]);
  };

  it('matches STUDENT_INTENTS exactly, in the same order', () => {
    expect(listInEdge('STUDENT_INTENTS')).toEqual([...STUDENT_INTENTS]);
  });

  it('matches ADMIN_INTENTS exactly, in the same order', () => {
    expect(listInEdge('ADMIN_INTENTS')).toEqual([...ADMIN_INTENTS]);
  });

  it('handles every intent it accepts, so none is accepted and then ignored', () => {
    [...STUDENT_INTENTS, ...ADMIN_INTENTS].forEach((intent) => {
      expect(source, `no branch for "${intent}"`).toContain(`intent === "${intent}"`);
    });
  });
});
