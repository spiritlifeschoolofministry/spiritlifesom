import { supabase } from '@/integrations/supabase/client';

/**
 * Recording what gets used: page views, file downloads, and a few actions
 * worth counting.
 *
 * Everything here is deliberately fire-and-forget. A view is a nice-to-have
 * statistic and a page is not allowed to be slower, or to fail, because a
 * counter did — so nothing awaits the insert, nothing surfaces an error, and a
 * signed-out or offline caller simply records nothing.
 *
 * `activity_events` only accepts rows whose `actor_id` is the caller's own uid
 * (see 20260909160000_activity_events.sql), so these figures cannot be written
 * on somebody else's behalf.
 */

export type ActivityKind = 'view' | 'download' | 'ai' | 'exam_start' | 'login';

export type Portal = 'admin' | 'student';

export interface ActivityEvent {
  kind: ActivityKind;
  /** A route for a view; for anything else, the name of what was acted on. */
  subject: string;
  /** The row behind it, where there is one. */
  subjectId?: string | null;
  portal?: Portal;
  cohortId?: string | null;
}

/**
 * Views already counted, and when.
 *
 * Two things would otherwise inflate every figure on the page. React's strict
 * mode runs effects twice in development, and a route can re-render — with a
 * new object identity but the same path — several times while one page settles.
 * Both would post duplicate rows for a single visit, and a view count that
 * counts one visit four times is worse than no view count at all.
 */
const recently = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

/** A genuine second visit should count, so entries expire rather than persist. */
const seenRecently = (key: string) => {
  const now = Date.now();

  // Opportunistic sweep: this map would otherwise grow for the whole session.
  if (recently.size > 200) {
    for (const [existing, at] of recently) {
      if (now - at > DEDUPE_WINDOW_MS) recently.delete(existing);
    }
  }

  const last = recently.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  recently.set(key, now);
  return false;
};

/**
 * Counts one event.
 *
 * Never throws and never returns a failure: callers are UI event handlers and
 * effects, and there is nothing any of them could usefully do about a counter
 * that did not save.
 */
export const trackEvent = (event: ActivityEvent): void => {
  void (async () => {
    try {
      // getSession reads the cached session rather than calling the auth
      // server, so this costs nothing on the render path.
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;

      if (seenRecently(`${event.kind}:${event.subject}:${event.subjectId ?? ''}`)) return;

      await supabase.from('activity_events').insert({
        actor_id: user.id,
        // The role as the token holds it. Snapshotted with the event so a
        // later promotion does not rewrite last month's staff/student split.
        actor_role: (user.user_metadata?.role as string | undefined) ?? null,
        kind: event.kind,
        subject: event.subject,
        subject_id: event.subjectId ?? null,
        portal: event.portal ?? null,
        cohort_id: event.cohortId ?? null,
      });
    } catch {
      // Deliberately silent. See the note at the top of this file.
    }
  })();
};

/**
 * A page view.
 *
 * The subject is the route, with record ids stripped out — see `viewSubject`.
 */
export const trackView = (path: string, portal: Portal, cohortId?: string | null): void =>
  trackEvent({ kind: 'view', subject: viewSubject(path), portal, cohortId });

/** A file the user actually fetched, named so the chart can be read. */
export const trackDownload = (args: {
  subject: string;
  subjectId?: string | null;
  portal: Portal;
  cohortId?: string | null;
}): void => trackEvent({ kind: 'download', ...args });

/**
 * The route, reduced to the page rather than the visit.
 *
 * A uuid or numeric segment is replaced with a placeholder so that
 * /admin/students/<uuid> counts as one page rather than as one page per
 * student. Without this the "top pages" table would be a list of individual
 * student records, each with a single view, and the actual popular pages would
 * never appear in it.
 */
export const viewSubject = (path: string): string => {
  const trimmed = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return trimmed
    .split('/')
    .map((segment) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
      /^\d+$/.test(segment)
        ? ':id'
        : segment,
    )
    .join('/');
};
