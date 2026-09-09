/**
 * The proctoring ranking, tested as the arithmetic it is.
 *
 * This decides whose exam an administrator is asked to look at, so it is
 * exactly the kind of logic that must not be tuned by eye in production. The
 * cases below are the ones that matter: an ordinary attempt must stay quiet,
 * and a genuine signal must survive.
 */
import { describe, expect, it } from 'vitest';
import {
  answerAgreement,
  median,
  reviewAttempts,
  type AttemptFacts,
} from '../../supabase/functions/_shared/integrity';

const attempt = (over: Partial<AttemptFacts> & { attemptId: string; studentId: string }): AttemptFacts => ({
  studentName: `Student ${over.studentId}`,
  durationSeconds: 1200,
  tabSwitches: 0,
  fullscreenExits: 0,
  submissionReason: 'manual',
  autoSubmitted: false,
  ipAddress: null,
  deviceFingerprint: null,
  browserInstallId: null,
  answers: {},
  scorePercent: 60,
  snapshots: 10,
  audioClips: 5,
  ...over,
});

const quietCohort = () => [
  attempt({ attemptId: 'a1', studentId: 's1' }),
  attempt({ attemptId: 'a2', studentId: 's2' }),
  attempt({ attemptId: 'a3', studentId: 's3' }),
];

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('answer agreement', () => {
  it('counts only questions both answered', () => {
    const result = answerAgreement({ q1: 'a', q2: 'b', q3: 'c' }, { q1: 'a', q2: 'x' });
    expect(result.shared).toBe(2);
    expect(result.same).toBe(1);
    expect(result.rate).toBe(0.5);
  });

  it('is zero rather than NaN when nothing overlaps', () => {
    expect(answerAgreement({ q1: 'a' }, { q9: 'b' }).rate).toBe(0);
  });
});

describe('reviewAttempts', () => {
  it('leaves an ordinary cohort with nothing to review', () => {
    const ranked = reviewAttempts(quietCohort());
    expect(ranked.every((r) => r.signals.length === 0)).toBe(true);
    expect(ranked.every((r) => r.concern === 0)).toBe(true);
  });

  it('raises tab switching in proportion to how much of it there was', () => {
    const [once, lots] = [1, 6].map((n) =>
      reviewAttempts([attempt({ attemptId: 'a', studentId: 's', tabSwitches: n }), ...quietCohort()])
        .find((r) => r.attemptId === 'a')!
    );
    expect(once.signals[0].weight).toBe(1);
    expect(lots.signals[0].weight).toBe(3);
    expect(lots.concern).toBeGreaterThan(once.concern);
  });

  it('flags an attempt far faster than its own cohort, not a fast cohort', () => {
    const fastInSlowCohort = reviewAttempts([
      attempt({ attemptId: 'quick', studentId: 's9', durationSeconds: 200 }),
      ...quietCohort(),
    ]).find((r) => r.attemptId === 'quick')!;
    expect(fastInSlowCohort.signals.map((s) => s.kind)).toContain('unusually_fast');

    // The same 200 seconds, where everybody took about that long, is normal.
    const wholeCohortFast = reviewAttempts([
      attempt({ attemptId: 'quick', studentId: 's9', durationSeconds: 200 }),
      attempt({ attemptId: 'b', studentId: 's1', durationSeconds: 210 }),
      attempt({ attemptId: 'c', studentId: 's2', durationSeconds: 190 }),
    ]).find((r) => r.attemptId === 'quick')!;
    expect(wholeCohortFast.signals.map((s) => s.kind)).not.toContain('unusually_fast');
  });

  it('names the other student on both sides of a matching pair', () => {
    const answers = { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'e', q6: 'f' };
    const ranked = reviewAttempts([
      attempt({ attemptId: 'a1', studentId: 's1', studentName: 'Ada', answers }),
      attempt({ attemptId: 'a2', studentId: 's2', studentName: 'Ben', answers }),
      ...quietCohort(),
    ]);
    const ada = ranked.find((r) => r.attemptId === 'a1')!;
    const ben = ranked.find((r) => r.attemptId === 'a2')!;
    expect(ada.signals.find((s) => s.kind === 'matching_answers')?.detail).toContain('Ben');
    expect(ben.signals.find((s) => s.kind === 'matching_answers')?.detail).toContain('Ada');
  });

  it('does not call two short overlapping papers a match', () => {
    const answers = { q1: 'a', q2: 'b' };
    const ranked = reviewAttempts([
      attempt({ attemptId: 'a1', studentId: 's1', answers }),
      attempt({ attemptId: 'a2', studentId: 's2', answers }),
    ]);
    expect(ranked.flatMap((r) => r.signals).some((s) => s.kind === 'matching_answers')).toBe(false);
  });

  it('treats a shared network as a note, not an accusation', () => {
    const ranked = reviewAttempts([
      attempt({ attemptId: 'a1', studentId: 's1', ipAddress: '10.0.0.1' }),
      attempt({ attemptId: 'a2', studentId: 's2', ipAddress: '10.0.0.1' }),
    ]);
    const network = ranked.find((r) => r.attemptId === 'a1')!.signals
      .find((s) => s.kind === 'shared_network')!;
    expect(network.weight).toBe(1);
    expect(network.detail).toMatch(/normal/i);
  });

  /**
   * The fingerprint identifies a device model, not a device — same handset,
   * browser and timezone gives one value. Against this school's real data it
   * marked ten students per exam as sharing a device. It must stay silent.
   */
  it('never draws a conclusion from a matching device fingerprint', () => {
    const shared = Array.from({ length: 10 }, (_, i) =>
      attempt({ attemptId: `a${i}`, studentId: `s${i}`, deviceFingerprint: 'same-model' }));
    const ranked = reviewAttempts(shared);
    expect(ranked.every((r) => r.signals.length === 0)).toBe(true);
  });

  it('does not flag one student who sat twice from their own network', () => {
    const ranked = reviewAttempts([
      attempt({ attemptId: 'a1', studentId: 'same', ipAddress: '10.0.0.1' }),
      attempt({ attemptId: 'a2', studentId: 'same', ipAddress: '10.0.0.1' }),
    ]);
    expect(ranked.flatMap((r) => r.signals).some((s) => s.kind === 'shared_network')).toBe(false);
  });

  it('notes one browser used by two students, with the innocent reading attached', () => {
    const ranked = reviewAttempts([
      attempt({ attemptId: 'shared-1', studentId: 'x1', browserInstallId: 'b-1' }),
      attempt({ attemptId: 'shared-2', studentId: 'x2', browserInstallId: 'b-1' }),
      ...quietCohort(),
    ]);
    const signal = ranked.find((r) => r.attemptId === 'shared-1')!.signals
      .find((s) => s.kind === 'same_browser')!;
    expect(signal.weight).toBe(2);
    // It must never read as an accusation on its own.
    expect(signal.detail).toMatch(/question to ask rather than a finding/i);
    expect(signal.detail.toLowerCase()).not.toMatch(/cheat|suspicious|guilty/);
  });

  it('says nothing when one student sits twice on their own browser', () => {
    const ranked = reviewAttempts([
      attempt({ attemptId: 'a1', studentId: 'same', browserInstallId: 'b-1' }),
      attempt({ attemptId: 'a2', studentId: 'same', browserInstallId: 'b-1' }),
    ]);
    expect(ranked.flatMap((r) => r.signals).some((s) => s.kind === 'same_browser')).toBe(false);
  });

  it('treats a missing browser id as unremarkable, not as evasion', () => {
    const ranked = reviewAttempts([
      attempt({ attemptId: 'a1', studentId: 's1', browserInstallId: null }),
      attempt({ attemptId: 'a2', studentId: 's2', browserInstallId: null }),
    ]);
    expect(ranked.every((r) => r.signals.length === 0)).toBe(true);
  });

  it('says when there is no footage to review at all', () => {
    const ranked = reviewAttempts([attempt({ attemptId: 'a', studentId: 's', snapshots: 0, audioClips: 0 })]);
    expect(ranked[0].signals.map((s) => s.kind)).toContain('no_footage');
  });

  it('puts the most concerning attempt first', () => {
    const ranked = reviewAttempts([
      attempt({ attemptId: 'calm', studentId: 's1' }),
      attempt({ attemptId: 'busy', studentId: 's2', tabSwitches: 9, fullscreenExits: 4 }),
      attempt({ attemptId: 'one', studentId: 's3', tabSwitches: 1 }),
    ]);
    expect(ranked[0].attemptId).toBe('busy');
    expect(ranked[ranked.length - 1].attemptId).toBe('calm');
  });
});
