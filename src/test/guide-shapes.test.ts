import { describe, expect, it } from 'vitest';
import {
  MAX_GUIDE_CHARS,
  MIN_GUIDE_CHARS,
  parseGuide,
} from '../../supabase/functions/_shared/guide-shapes';

/**
 * The gate between a model's answer and the standard a cohort is marked by.
 *
 * Imported straight out of the Deno tree, like question-shapes: the point is to
 * test the code that runs, not a copy that can drift from it.
 *
 * What these tests protect is the marking path. A rubric reaches `ai-mark`,
 * which marks every written answer against it and reports nothing unusual
 * whatever it says — so a fragment stored as a rubric is silently worse than no
 * rubric at all, because a missing one makes the screen warn the examiner and a
 * useless one does not. Everything below is about refusing the answers that
 * look like guides without being one.
 */

/** A guide of realistic shape, comfortably over the floor. */
const REAL_GUIDE = [
  'Full marks (15) — the answer identifies the canon as the list of books the church',
  'recognised as Scripture, and names recognition rather than creation as the point.',
  'Partial — describes the canon but treats the church as conferring authority.',
  'No marks — an answer about translation rather than canonisation.',
  'Do not penalise — denominational vocabulary, or a devotional tone.',
].join(' ');

describe('parseGuide', () => {
  it('takes a plain JSON answer', () => {
    const result = parseGuide(JSON.stringify({ guide: REAL_GUIDE }));
    expect(result?.guide).toBe(REAL_GUIDE);
  });

  it('takes one wrapped in a fenced block, which most providers send', () => {
    const raw = '```json\n' + JSON.stringify({ guide: REAL_GUIDE }) + '\n```';
    expect(parseGuide(raw)?.guide).toBe(REAL_GUIDE);
  });

  it('takes one buried in preamble and sign-off', () => {
    const raw = `Certainly! Here is the marking guide:\n\n${
      JSON.stringify({ guide: REAL_GUIDE })
    }\n\nLet me know if you would like it adjusted.`;
    expect(parseGuide(raw)?.guide).toBe(REAL_GUIDE);
  });

  /**
   * The distinction the whole parser exists for. "The material cannot ground a
   * guide" is an answer; "I did not answer" is a failure, and the caller does
   * opposite things with them — records a note for the lecturer, or moves to
   * the next provider.
   */
  it('treats an explicit null as the model declining, not as a failure', () => {
    const result = parseGuide(JSON.stringify({ guide: null }));
    expect(result).not.toBeNull();
    expect(result?.guide).toBeNull();
  });

  it('treats a missing guide key as no answer at all', () => {
    expect(parseGuide(JSON.stringify({}))).toBeNull();
    expect(parseGuide(JSON.stringify({ rubric: REAL_GUIDE }))).toBeNull();
  });

  /**
   * The failure mode that actually happens. Asked for a guide the material
   * cannot support, a model is far likelier to answer courteously in prose than
   * to return malformed JSON — and that sentence, stored, would be marked
   * against.
   */
  it('refuses a courteous fragment offered as a guide', () => {
    expect(parseGuide(JSON.stringify({ guide: 'The material does not specify.' })))
      .toBeNull();
    expect(parseGuide(JSON.stringify({ guide: 'Award marks as appropriate.' })))
      .toBeNull();
  });

  it('refuses an empty or whitespace guide', () => {
    expect(parseGuide(JSON.stringify({ guide: '' }))).toBeNull();
    expect(parseGuide(JSON.stringify({ guide: '   \n  ' }))).toBeNull();
  });

  it('holds the floor exactly where it says it does', () => {
    const justUnder = 'x'.repeat(MIN_GUIDE_CHARS - 1);
    const justOver = 'x'.repeat(MIN_GUIDE_CHARS);
    expect(parseGuide(JSON.stringify({ guide: justUnder }))).toBeNull();
    expect(parseGuide(JSON.stringify({ guide: justOver }))?.guide).toBe(justOver);
  });

  it('measures the floor after trimming, so padding cannot buy a pass', () => {
    const padded = ' '.repeat(200) + 'Too short.' + ' '.repeat(200);
    expect(parseGuide(JSON.stringify({ guide: padded }))).toBeNull();
  });

  it('clamps a runaway guide rather than refusing it', () => {
    const long = 'A specific requirement drawn from the material. '.repeat(200);
    const result = parseGuide(JSON.stringify({ guide: long }));
    // A model that over-explains has still read the material; the ceiling is
    // about what a marker can read, so it is trimmed rather than thrown away.
    expect(result?.guide).toBeTruthy();
    expect(result!.guide!.length).toBeLessThanOrEqual(MAX_GUIDE_CHARS);
  });

  /**
   * The regression. The ceiling was 1200, and every guide drafted for the first
   * six papers came back at exactly that — cut mid-word, four of five losing
   * the "Do not penalise" line that stops a marker docking a student for a
   * devotional tone. A standard that ends "...or merely offers personal opini"
   * is not a standard.
   */
  it('never ends a clamped guide mid-word', () => {
    const long = 'A specific requirement drawn from the material. '.repeat(200);
    const guide = parseGuide(JSON.stringify({ guide: long }))!.guide!;
    expect(guide).toMatch(/[.?\n]$/);
  });

  it('leaves a guide of realistic length completely alone', () => {
    // The four-section shape runs to roughly 1500-1800 characters on a 15-mark
    // essay. All of it must survive, tail included.
    const full = [
      REAL_GUIDE,
      'Partial — an answer covering only one of the two required points.',
      'No marks — an answer about translation rather than canonisation.',
      'Do not penalise — a devotional tone, or shaky grammar from a second-language writer.',
    ].join('\n\n');
    expect(full.length).toBeGreaterThan(400);
    expect(parseGuide(JSON.stringify({ guide: full }))?.guide).toBe(full);
  });

  it('refuses prose that is not JSON at all', () => {
    expect(parseGuide('Here is how I would mark this question: give 15 marks for...'))
      .toBeNull();
    expect(parseGuide('')).toBeNull();
  });

  it('refuses a truncated answer rather than repairing it', () => {
    // A cut-off response is better caught here than half-stored: the tail of a
    // guide is where "do not penalise" lives.
    expect(parseGuide('{"guide": "Full marks (15) — the answer identifies the can'))
      .toBeNull();
  });

  it('refuses a guide sent as the wrong type', () => {
    expect(parseGuide(JSON.stringify({ guide: 15 }))).toBeNull();
    expect(parseGuide(JSON.stringify({ guide: { full: 'marks' } }))).toBeNull();
  });
});
