import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PAGES,
  STUDENT_PAGES,
  isNavigationalQuestion,
  matchPage,
  type Audience,
} from '@/lib/portal-map';

// The layouts are imported only for their exported nav paths, but importing a
// component pulls its whole module graph — including the Supabase client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { STUDENT_NAV_PATHS } = await import('@/components/StudentLayout');
const { ADMIN_NAV_PATHS } = await import('@/components/AdminLayout');

/**
 * The map is the assistant's whole basis for navigational answers, so the
 * thing worth testing is not the wording but the coverage: a page added to a
 * sidebar without a description here would make the assistant silently unable
 * to find it, and a description left behind after a page was removed would
 * send people to a dead route.
 */
describe.each([
  ['student', STUDENT_PAGES, STUDENT_NAV_PATHS],
  ['admin', ADMIN_PAGES, ADMIN_NAV_PATHS],
] as const)('%s portal map', (_name, pages, navPaths) => {
  const mapped = pages.map((page) => page.path);

  it('describes every page its sidebar navigates to', () => {
    expect([...navPaths].sort()).toEqual([...mapped].sort());
  });

  it('describes no page that is not in the sidebar', () => {
    mapped.forEach((path) => expect(navPaths).toContain(path));
  });

  it('gives every page a group, a label and something you can do there', () => {
    pages.forEach((page) => {
      expect(page.label.trim().length).toBeGreaterThan(0);
      expect(page.group.trim().length).toBeGreaterThan(0);
      // Long enough to be a real sentence rather than a restated label.
      expect(page.what.length).toBeGreaterThan(15);
    });
  });

  it('has no duplicate paths', () => {
    expect(new Set(mapped).size).toBe(mapped.length);
  });
});

describe('matchPage', () => {
  const asks = (question: string, audience: Audience = 'student') =>
    matchPage(question, audience)?.page.path ?? null;

  it('finds the page from a word in its label', () => {
    expect(asks('where is my transcript')).toBe('/student/transcript');
  });

  it('finds a page from how people actually say it, not its label', () => {
    // "Tasks" is the label; nobody types that.
    expect(asks('where do I submit my essay')).toBe('/student/assignments');
    expect(asks('how do I check in for class')).toBe('/student/attendance');
    expect(asks('where can I download the notes')).toBe('/student/materials');
  });

  it('prefers the page matching more of the question', () => {
    expect(asks('download my course notes')).toBe('/student/materials');
  });

  it('reads a multi-word alias as a phrase, not as its surviving keyword', () => {
    // "check in" and "when is class" each reduce to one significant word, which
    // once made this a tie between Attendance and Calendar.
    expect(asks('how do I check in for class')).toBe('/student/attendance');
    expect(asks('when is class')).toBe('/student/calendar');
  });

  it('scores a multi-word alias above a stray single word', () => {
    expect(asks('I want to change the name on certificate')).toBe('/student/certificate');
  });

  it('answers from the right portal for the person asking', () => {
    expect(asks('where do I verify receipts', 'admin')).toBe('/admin/payments');
    expect(asks('where do I upload a receipt', 'student')).toBe('/student/fees');
  });

  it('returns nothing for a question about no page in particular', () => {
    expect(asks('what is the meaning of grace')).toBeNull();
    expect(asks('hello')).toBeNull();
    expect(asks('')).toBeNull();
  });

  it('refuses to guess between two equally good matches', () => {
    // Rather than confidently sending someone to the wrong one of the two.
    const match = matchPage('exams and tasks', 'student');
    expect(match).toBeNull();
  });

  it('is not fooled by filler words alone', () => {
    expect(asks('how do I see my page')).toBeNull();
  });
});

describe('isNavigationalQuestion', () => {
  it.each([
    'where do I submit a task',
    'How do I check in?',
    'how can I pay my fees',
    'which page shows my marks',
    'take me to my grades',
  ])('treats "%s" as navigational', (question) => {
    expect(isNavigationalQuestion(question)).toBe(true);
  });

  it.each(['what do I owe', 'am I passing', 'when is my next exam', 'how much is left'])(
    'treats "%s" as not navigational',
    (question) => {
      expect(isNavigationalQuestion(question)).toBe(false);
    },
  );
});
