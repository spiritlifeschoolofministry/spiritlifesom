/**
 * What counts as a usable marking guide, out of what a model actually sent.
 *
 * Lifted out of `ai-guide/index.ts` so it can be tested against real provider
 * output rather than trusted. The chain treats an unusable answer as that
 * provider failing and moves to the next one, so this predicate decides which
 * of ten providers ends up writing the standard a cohort is marked against —
 * too lax and the first model to return a polite sentence wins, too strict and
 * a good guide is thrown away in favour of a worse one further down the list.
 *
 * Pure TypeScript with no Deno APIs, so `src/test/guide-shapes.test.ts`
 * imports the code that actually runs rather than a copy of it.
 */
import { extractJson } from "./ai-text.ts";

/**
 * A guide long enough to be a standard, short enough to be read while marking.
 *
 * The floor is the load-bearing one. Models answer an impossible request with
 * a courteous fragment — "The material does not specify." — far more often
 * than with malformed JSON, and a fragment stored as a rubric is worse than no
 * rubric: `ai-mark` would mark thirty answers against it and report nothing
 * wrong, where a missing rubric at least makes the screen say so.
 */
export const MIN_GUIDE_CHARS = 60;

/**
 * The ceiling, and why it is not 1200.
 *
 * It was, and every guide drafted for the first six papers came back at
 * exactly 1200 characters — cut mid-word, and four of the five lost the "Do
 * not penalise" line, which is the section that stops a marker docking a
 * student for a devotional tone or shaky grammar. A clamp that silently eats
 * the most forgiving part of a standard is worse than one that refuses.
 *
 * The four-section shape this asks for runs to roughly 1500-1800 characters on
 * a 15-mark essay, so the ceiling is set well clear of it. It is still a
 * ceiling — a guide past this is no longer something read in under a minute
 * while marking — but it is now a bound on the pathological case rather than
 * on the normal one.
 */
export const MAX_GUIDE_CHARS = 2600;

export interface ParsedGuide {
  /** The guide, or null where the material could not ground one. */
  guide: string | null;
}

/**
 * The guide a model meant to send, or null if it did not send one.
 *
 * Three outcomes, deliberately distinct:
 *
 *   `{ guide: "..." }`  a usable standard.
 *   `{ guide: null }`   the model saying the material does not support one.
 *                       A correct and useful answer — the caller records it and
 *                       tells the lecturer to write that question by hand.
 *   `null`              nothing usable. Treated as this provider failing, so
 *                       the chain tries the next one.
 *
 * The middle case is why an explicit `guide` key is required rather than
 * inferred: a model that returns `{}` has not said the material is thin, it
 * has simply not answered, and those must not collapse into each other.
 */
export const parseGuide = (raw: string): ParsedGuide | null => {
  const parsed = extractJson<{ guide?: unknown }>(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (!("guide" in parsed)) return null;

  if (parsed.guide === null) return { guide: null };

  const text = String(parsed.guide ?? "").trim();
  if (text.length < MIN_GUIDE_CHARS) return null;

  return { guide: clampWhole(text) };
};

/**
 * Trims to the ceiling without cutting a sentence in half.
 *
 * A guide is read as prose by someone deciding a mark, and one ending
 * "...or merely offers personal opini" reads as a fault in the system rather
 * than as a standard. Falling back to a hard cut only when there is no break
 * to be found keeps one enormous unpunctuated block from being trimmed away
 * to nothing.
 */
const clampWhole = (text: string): string => {
  if (text.length <= MAX_GUIDE_CHARS) return text;

  const clipped = text.slice(0, MAX_GUIDE_CHARS);
  const breakAt = Math.max(
    clipped.lastIndexOf("\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("? "),
  );
  return (breakAt > MAX_GUIDE_CHARS * 0.6 ? clipped.slice(0, breakAt + 1) : clipped).trim();
};
