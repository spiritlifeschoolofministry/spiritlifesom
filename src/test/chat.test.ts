import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const { askAssistant, canAnswerLocally } = await import('@/lib/chat');

/**
 * The routing is the feature. What matters is not the wording of an answer but
 * which of the three routes took it, because that decides whether the question
 * cost a network call, a database read, or a model call.
 */
describe('askAssistant routing', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: { answer: 'server said so', figures: [], items: [], page: null, source: 'records' },
      error: null,
    });
  });

  it('answers a navigational question without any network call', async () => {
    const answer = await askAssistant('where do I submit my essay', 'student');
    expect(invoke).not.toHaveBeenCalled();
    expect(answer.source).toBe('portal');
    expect(answer.page?.path).toBe('/student/assignments');
    // Phrased from the sidebar's own structure, so it is checkable.
    expect(answer.answer).toContain('Learning');
  });

  it('answers an unprefixed page name locally too', async () => {
    const answer = await askAssistant('course materials', 'student');
    expect(invoke).not.toHaveBeenCalled();
    expect(answer.source).toBe('portal');
  });

  it('sends a recognised data question to the server with its intent', async () => {
    const answer = await askAssistant('what do I owe', 'student');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1]).toMatchObject({
      body: { question: 'what do I owe', intent: 'fees' },
    });
    expect(answer.source).toBe('records');
  });

  it('prefers a location over a figure when the question asks where', async () => {
    // "my fees" alone is a data question; "where do I pay my fees" is not.
    const answer = await askAssistant('where do I pay my fees', 'student');
    expect(invoke).not.toHaveBeenCalled();
    expect(answer.page?.path).toBe('/student/fees');
  });

  it('sends an unrecognised question with no intent, so the server may use a model', async () => {
    invoke.mockResolvedValue({
      data: { answer: 'a considered reply', figures: [], items: [], page: null, source: 'model' },
      error: null,
    });
    const answer = await askAssistant('who was Barnabas in the Bible', 'student');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1]).toMatchObject({ body: { question: 'who was Barnabas in the Bible' } });
    expect((invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body.intent).toBeUndefined();
    expect(answer.source).toBe('model');
  });

  it('routes an admin question to an admin intent', async () => {
    await askAssistant('who has not paid', 'admin');
    expect(invoke.mock.calls[0][1]).toMatchObject({ body: { intent: 'unpaid' } });
  });

  it('never sends an admin intent for a student', async () => {
    await askAssistant('who has not paid', 'student');
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.intent).not.toBe('unpaid');
  });

  it('trims the question before sending it', async () => {
    await askAssistant('   what do I owe   ', 'student');
    expect(invoke.mock.calls[0][1]).toMatchObject({ body: { question: 'what do I owe' } });
  });

  it('surfaces an edge failure as an error rather than an empty answer', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(askAssistant('something novel entirely', 'student')).rejects.toThrow();
  });

  it('treats a missing source as records rather than claiming a model wrote it', async () => {
    invoke.mockResolvedValue({ data: { answer: 'x' }, error: null });
    const answer = await askAssistant('what do I owe', 'student');
    expect(answer.source).toBe('records');
    expect(answer.figures).toEqual([]);
  });
});

describe('canAnswerLocally', () => {
  it('is true for a question the portal map answers', () => {
    expect(canAnswerLocally('where is my transcript', 'student')).toBe(true);
  });

  it('is false for a data question, which needs the records', () => {
    expect(canAnswerLocally('what do I owe', 'student')).toBe(false);
  });

  it('is false for a question nothing recognises', () => {
    expect(canAnswerLocally('what is the meaning of grace', 'student')).toBe(false);
  });
});

/**
 * The bug these cover: the audience was decided server-side from the caller's
 * role, so an admin opening the chatbox on the *student* dashboard was
 * answered with the school's books — pending payments, students in arrears,
 * the week's traffic — in the one place built to show them what a student
 * sees. It also cost a model call every time, because the student intent the
 * client had classified was not on the admin allowlist and so was rejected as
 * unrecognised.
 */
describe('which portal is asking', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: { answer: 'ok', figures: [], items: [], page: null, source: 'records' },
      error: null,
    });
  });

  it('tells the server it is the student portal asking', async () => {
    await askAssistant('what do I owe', 'student');
    expect(invoke.mock.calls[0][1]).toMatchObject({
      body: { audience: 'student', intent: 'fees' },
    });
  });

  it('tells the server it is the admin portal asking', async () => {
    await askAssistant('who has not paid', 'admin');
    expect(invoke.mock.calls[0][1]).toMatchObject({
      body: { audience: 'admin', intent: 'unpaid' },
    });
  });

  it('sends a student intent from the student portal even for a staff question', async () => {
    // Asked on the student dashboard, this must be the student digest — not
    // the school-wide overview, whoever is signed in.
    await askAssistant('what needs my attention this week', 'student');
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.audience).toBe('student');
    expect(body.intent).toBe('week');
    expect(body.intent).not.toBe('overview');
  });

  it('always states an audience, so the server never has to guess', async () => {
    await askAssistant('something completely unrecognised', 'student');
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.audience).toBe('student');
  });
});
