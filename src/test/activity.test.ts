import { describe, expect, it, vi } from 'vitest';

// activity.ts reaches for the Supabase client at module load; the tests here
// only exercise pure route-shaping, so the client is stubbed rather than
// configured with real credentials.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

import { viewSubject } from '@/lib/activity';

/**
 * `viewSubject` is what stops "top pages" turning into a list of individual
 * student records with one view each.
 */
describe('viewSubject', () => {
  it('leaves a plain route alone', () => {
    expect(viewSubject('/admin/dashboard')).toBe('/admin/dashboard');
  });

  it('collapses a uuid segment so a detail route counts as one page', () => {
    expect(viewSubject('/admin/students/39b51ec8-ff50-48df-8ea3-cd645112ae6a')).toBe(
      '/admin/students/:id',
    );
  });

  it('collapses a uuid in the middle of a route', () => {
    expect(viewSubject('/student/exams/39b51ec8-ff50-48df-8ea3-cd645112ae6a/lobby')).toBe(
      '/student/exams/:id/lobby',
    );
  });

  it('collapses numeric ids too', () => {
    expect(viewSubject('/admin/courses/42')).toBe('/admin/courses/:id');
  });

  it('drops query strings and hashes, which are not different pages', () => {
    expect(viewSubject('/admin/fees?tab=manual')).toBe('/admin/fees');
    expect(viewSubject('/admin/fees#section')).toBe('/admin/fees');
  });

  it('treats a trailing slash as the same page', () => {
    expect(viewSubject('/admin/students/')).toBe('/admin/students');
  });

  it('keeps the root path addressable', () => {
    expect(viewSubject('/')).toBe('/');
  });

  it('does not mistake a real word for an id', () => {
    expect(viewSubject('/admin/exams/new')).toBe('/admin/exams/new');
    expect(viewSubject('/student/materials')).toBe('/student/materials');
  });
});
