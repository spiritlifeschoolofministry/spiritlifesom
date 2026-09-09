/**
 * Telling a repeated question from a new one.
 *
 * Drafting a second batch from one material means asking a model to write about
 * a passage it has already written about. Left alone it will happily reword
 * what it produced last time, and a practice pool full of the same question in
 * six outfits teaches a student one point six times.
 *
 * Kept apart from the function that uses it so the threshold below can be
 * tested against real pairs rather than tuned by guesswork in production.
 */
/**
 * A question reduced to the words that carry its meaning.
 *
 * Markup, case, punctuation and the words every question shares tell nothing
 * apart, so they go. What is left is compared as a set: two questions asking
 * the same thing in a different order still overlap almost entirely.
 */
export const FILLER = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or", "that", "which",
  "what", "who", "whom", "whose", "how", "why", "when", "where", "does", "do", "did", "for",
  "on", "at", "by", "with", "as", "it", "this", "these", "those", "be", "been", "from", "not",
  "true", "false", "following", "statement", "according", "material", "text", "passage",
]);

/**
 * A crude stem, enough to see "canonical" and "canonicity" as one word.
 *
 * Not a real stemmer — a real one is a dependency and a lot of rules for a
 * comparison that only has to be roughly right. The suffixes below are the
 * ones that actually differ between a question and its reworded twin: plurals,
 * tense, and the noun/adjective pairs that theological writing is full of.
 */
const stem = (word: string): string => {
  let out = word;
  for (const suffix of ["ications", "ication", "ities", "ity", "ally", "al", "ations", "ation", "ing", "ies", "ied", "es", "ed", "ly", "s"]) {
    if (out.length > suffix.length + 3 && out.endsWith(suffix)) {
      out = out.slice(0, -suffix.length);
      break;
    }
  }
  return out;
};

export const meaningfulWords = (text: string): Set<string> =>
  new Set(
    String(text)
      .replace(/<[^>]*>/g, " ")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !FILLER.has(word))
      .map(stem),
  );

/**
 * How alike two questions are, 0 to 1, by shared meaningful words.
 *
 * Jaccard rather than a string distance: a model rewording a question keeps
 * the nouns and changes the frame, which a character-level comparison scores
 * as different and this scores as the repeat it is.
 */
export const similarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/**
 * Past this, two questions are asking the same thing.
 *
 * Tuned against real pairs rather than chosen: near-verbatim rewordings land
 * between 0.45 and 0.75, while genuinely different questions drawn from the
 * same paragraph sit under 0.2. 0.4 sits in that gap with room either side.
 *
 * What this cannot catch is a true synonym rewrite — "the five principles for
 * discovering canonicity" and "the five criteria for deciding a book is
 * canonical" share almost no words and are the same question. Nothing lexical
 * will see that. The prompt is the real defence there: the model is shown what
 * has already been asked and told not to repeat it. This is the backstop for
 * when it does so anyway, in its own words.
 */
export const SAME_QUESTION = 0.4;
