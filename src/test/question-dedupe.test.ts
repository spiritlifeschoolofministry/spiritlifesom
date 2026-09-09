/**
 * The repeat detector, tested against real pairs.
 *
 * The module lives under supabase/functions/_shared because an edge function
 * uses it, but it is plain TypeScript with no Deno APIs, so it is imported
 * directly rather than copied. A threshold picked by eye and never checked is
 * how a drafter ends up either dropping good questions or storing the same one
 * six times, and neither shows up until a student is practising.
 */
import { describe, expect, it } from 'vitest';
import {
  meaningfulWords,
  SAME_QUESTION,
  similarity,
} from '../../supabase/functions/_shared/question-dedupe';

const score = (a: string, b: string) => similarity(meaningfulWords(a), meaningfulWords(b));
const isRepeat = (a: string, b: string) => score(a, b) >= SAME_QUESTION;

describe('question repeat detection', () => {
  it('catches a question reworded', () => {
    const repeats: [string, string][] = [
      [
        'Marcion rejected the entire Old Testament.',
        'Did Marcion reject the whole of the Old Testament?',
      ],
      ['Who wrote the Muratorian Canon?', 'Who was the author of the Muratorian Canon?'],
      ['Define honour as the material describes it.', 'How does the material define honour?'],
      [
        'The church did not create the canon; it recognised it.',
        'According to the text, did the church create the canon or recognise it?',
      ],
      ['Eli honoured his sons before God.', 'Whom did Eli honour before God?'],
    ];
    for (const [a, b] of repeats) {
      expect(isRepeat(a, b), `should be a repeat: "${a}" vs "${b}"`).toBe(true);
    }
  });

  it('lets a genuinely different question about the same passage through', () => {
    const different: [string, string][] = [
      [
        'What are the five principles for discovering canonicity?',
        'In which year did Montanus begin claiming new prophecy?',
      ],
      [
        'Define honour as the material describes it.',
        'Which biblical figure is given as an example of honour towards God?',
      ],
      [
        'Who wrote the Muratorian Canon?',
        'Which two books does the Muratorian Canon include that were later excluded?',
      ],
      [
        'Which criterion asks whether a book has life-transforming power?',
        'Which criterion asks whether a book was written by a prophet or apostle?',
      ],
      ['Honour begins with God.', 'Children are commanded to honour their parents.'],
    ];
    for (const [a, b] of different) {
      expect(isRepeat(a, b), `should not be a repeat: "${a}" vs "${b}"`).toBe(false);
    }
  });

  it('ignores markup, case and punctuation', () => {
    expect(score('<p>Who wrote the <b>Muratorian Canon</b>?</p>', 'who wrote the muratorian canon'))
      .toBe(1);
  });

  it('treats a question as identical to itself', () => {
    expect(score('Define honour.', 'Define honour.')).toBe(1);
  });

  it('scores nothing in common as zero rather than throwing', () => {
    expect(score('', '')).toBe(0);
    expect(score('the a of to', 'is are was')).toBe(0);
  });

  /**
   * The known limit, written down as a test so it is a decision rather than a
   * surprise: a true synonym rewrite shares no words and is not caught here.
   * The prompt is what guards against that — the model is shown what has
   * already been asked. If this ever starts passing, the threshold has moved
   * and the false-positive tests above are what to check.
   */
  it('does not catch a full synonym rewrite, which the prompt handles instead', () => {
    expect(isRepeat(
      'What are the five principles for discovering canonicity?',
      'List the five criteria used to decide that a book is canonical.',
    )).toBe(false);
  });
});
