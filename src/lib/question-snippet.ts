/**
 * A question, shortened to fit on one line of a list.
 *
 * Question text is stored as HTML, and some of it carries markdown a model
 * left behind — an asterisk meant as emphasis reads as an asterisk. Cutting
 * that at a fixed number of characters produced "…the Greek term *exegeo",
 * which is a word broken in half and a stray asterisk: it looks like the
 * question is damaged rather than merely abbreviated.
 *
 * So: strip the markup, drop the emphasis marks, then cut on a word boundary
 * with an ellipsis to say that it was cut.
 *
 * `tidy` in ai-format does a similar cut and is deliberately not reused: it
 * also strips quotation marks from both ends, which is right for a meta
 * description and wrong here, where a question may legitimately end in one.
 */
export const questionSnippet = (raw: string | null | undefined, maxChars = 110): string => {
  const text = (raw ?? '')
    // Tags first: a <br> between two words must become a space, not nothing.
    .replace(/<[^>]*>/g, ' ')
    // The handful of entities that actually turn up in question text.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Emphasis marks around a word, left in by a model writing markdown into a
    // field that renders HTML. Only stripped where they hug a word, so a
    // question genuinely about an asterisk keeps it.
    .replace(/(^|\s)[*_`]+(\S)/g, '$1$2')
    .replace(/(\S)[*_`]+(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxChars) return text;

  // Back to the last space, unless that would throw away most of the line —
  // then a hard cut is the lesser evil.
  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${cut.replace(/[\s,;:.\-—]+$/, '')}…`;
};
