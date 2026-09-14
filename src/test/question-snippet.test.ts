import { describe, expect, it } from 'vitest';
import { questionSnippet } from '@/lib/question-snippet';

/**
 * Every case here is one that actually appeared on the admin screens: a word
 * cut in half, a stray asterisk, and markup shown to a reader as text.
 */
describe('questionSnippet', () => {
  it('cuts on a word boundary and says that it cut', () => {
    const long =
      'Name the two Old Testament Hebrew verbs mentioned in the material that relate to profession and honour';
    const out = questionSnippet(long, 80);
    expect(out.endsWith('…')).toBe(true);
    // The failure this replaces ended "…relate to professio".
    expect(out).not.toMatch(/professio…$/);
    expect(out.length).toBeLessThanOrEqual(81);
  });

  it('leaves a short question exactly as it is', () => {
    expect(questionSnippet('How does the material define honour?')).toBe(
      'How does the material define honour?',
    );
  });

  it('strips the markup rather than showing it', () => {
    expect(questionSnippet('<p>What is <strong>doctrine</strong>?</p>')).toBe(
      'What is doctrine ?',
    );
  });

  it('keeps a space where a tag separated two words', () => {
    expect(questionSnippet('one<br>two')).toBe('one two');
  });

  it('drops emphasis marks a model left behind', () => {
    expect(questionSnippet('the Greek term *exegeo* is used')).toBe(
      'the Greek term exegeo is used',
    );
  });

  it('keeps an asterisk that is not emphasis', () => {
    expect(questionSnippet('what does 2 * 3 equal?')).toBe('what does 2 * 3 equal?');
  });

  it('decodes the entities that turn up in stored text', () => {
    expect(questionSnippet('Paul &amp; Silas &quot;sang&quot;')).toBe('Paul & Silas "sang"');
  });

  it('gives an empty string for nothing rather than throwing', () => {
    expect(questionSnippet(null)).toBe('');
    expect(questionSnippet(undefined)).toBe('');
    expect(questionSnippet('   ')).toBe('');
  });
});
