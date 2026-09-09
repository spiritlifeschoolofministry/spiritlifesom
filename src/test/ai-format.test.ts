import { describe, expect, it } from 'vitest';
import {
  describeFromMetadata,
  extractJson,
  isBlankText,
  MAX_DESCRIPTION_CHARS,
  tidy,
} from '@/lib/ai-format';

/**
 * These pin the behaviour that both runtimes depend on.
 *
 * `src/lib/ai-format.ts` and `supabase/functions/_shared/ai-text.ts` are the
 * same functions written twice — Deno and Vite share no module path — so this
 * file is what stops the pair drifting. Vitest only sees `src/`, so it tests
 * the browser copy; the assertions are the contract the edge-function copy has
 * to keep too.
 */

describe('tidy', () => {
  it('takes the first paragraph only', () => {
    // Models add a second paragraph however firmly the prompt says not to.
    expect(tidy('The real sentence.\n\nAnd an unwanted second thought.')).toBe(
      'The real sentence.',
    );
  });

  it('strips the label a model prefixes', () => {
    expect(tidy('Description: A study of Romans.')).toBe('A study of Romans.');
    expect(tidy('Summary — A study of Romans.')).toBe('A study of Romans.');
  });

  it('strips wrapping quotes, straight and curly', () => {
    expect(tidy('"A study of Romans."')).toBe('A study of Romans.');
    expect(tidy('“A study of Romans.”')).toBe('A study of Romans.');
  });

  it('collapses whitespace', () => {
    expect(tidy('A   study\tof\nRomans.')).toBe('A study of Romans.');
  });

  it('caps at the limit, cutting on a word boundary', () => {
    const long = `${'word '.repeat(60)}end`;
    const result = tidy(long);
    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS + 1);
    // A description cut mid-word reads worse than a slightly shorter one.
    expect(result).toMatch(/…$/);
    expect(result).not.toMatch(/wor…$/);
  });

  it('hard-cuts rather than returning nothing when there is no word boundary', () => {
    // One very long token must not strip the whole string.
    const result = tidy('x'.repeat(400));
    expect(result.length).toBeGreaterThan(100);
  });

  it('leaves a sentence already within the cap untouched', () => {
    expect(tidy('A short one.')).toBe('A short one.');
  });

  it('survives empty and rubbish input', () => {
    expect(tidy('')).toBe('');
    expect(tidy('   ')).toBe('');
  });
});

describe('extractJson', () => {
  it('reads bare JSON', () => {
    expect(extractJson('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('reads a fenced block', () => {
    expect(extractJson('```json\n{"points": 3}\n```')).toEqual({ points: 3 });
  });

  it('reads an unlabelled fenced block', () => {
    expect(extractJson('```\n{"points": 3}\n```')).toEqual({ points: 3 });
  });

  it('ignores prose either side', () => {
    // The single most common thing a chatty free-tier model does.
    const raw = 'Certainly! Here are the questions:\n[{"a":1}]\nLet me know if you need more.';
    expect(extractJson(raw)).toEqual([{ a: 1 }]);
  });

  it('returns null on truncated JSON rather than guessing', () => {
    // A half-written answer must fail the chain's accept check, not be repaired
    // into something that looks complete.
    expect(extractJson('[{"question_text": "why')).toBeNull();
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJson('I cannot help with that.')).toBeNull();
    expect(extractJson('')).toBeNull();
  });

  it('prefers an array when both shapes appear', () => {
    expect(extractJson('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe('isBlankText', () => {
  it('treats markup-only content as blank', () => {
    // The rich text editor leaves these behind when a field is cleared.
    expect(isBlankText('<p></p>')).toBe(true);
    expect(isBlankText('<p>&nbsp;</p>')).toBe(true);
    expect(isBlankText('')).toBe(true);
    expect(isBlankText(null)).toBe(true);
  });

  it('recognises real content', () => {
    expect(isBlankText('<p>Something</p>')).toBe(false);
  });
});

describe('describeFromMetadata', () => {
  it('writes a true sentence from a title alone', () => {
    const result = describeFromMetadata({ title: 'Foundations of Faith' });
    expect(result).toContain('Foundations of Faith');
    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS + 1);
  });

  it('names the course when there is one', () => {
    const result = describeFromMetadata({
      title: 'Chapter 1 Notes',
      courseName: 'Romans',
      materialType: 'pdf',
    });
    expect(result).toContain('Romans');
    expect(result).toContain('PDF');
  });

  it('never exceeds the cap, however long the title', () => {
    // This is the fallback that guarantees no material saves blank, so it has
    // to hold for absurd input too.
    const result = describeFromMetadata({
      title: 'A '.repeat(200),
      courseName: 'Systematic Theology',
    });
    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS + 1);
  });
});
