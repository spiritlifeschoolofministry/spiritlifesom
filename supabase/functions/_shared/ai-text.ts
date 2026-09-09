/**
 * Turning what a model actually returns into something the app can store.
 *
 * Mirrored by `src/lib/ai-format.ts`, which the browser needs for the same job
 * on the same strings. Deno and Vite are separate runtimes with no shared
 * module path, so this is a deliberate copy rather than an import — the pair
 * are kept in step by `src/test/ai-format.test.ts`, which asserts the
 * behaviour both sides depend on.
 */

/** Search engines truncate a meta description near 160 characters. */
export const MAX_DESCRIPTION_CHARS = 160;

/**
 * Trims a model's answer to something that can go straight into a field.
 *
 * Models like to wrap a one-liner in quotes, prefix it with "Description:", or
 * add a second paragraph however firmly the prompt says not to. Rather than
 * fight that in the prompt alone, the first paragraph is taken and the cap is
 * enforced here — at a word boundary, because a description cut mid-word reads
 * worse than a slightly shorter one.
 */
export const tidy = (raw: string, maxChars = MAX_DESCRIPTION_CHARS): string => {
  let text = (raw || "").trim();
  text = text.split(/\n{2,}/)[0].replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:description|summary|answer)\s*[:\-—]\s*/i, "");
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (text.length <= maxChars) return text;

  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only fall back to a hard cut if there is no space in the last stretch —
  // otherwise one very long token would strip the whole thing.
  const cut = lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return cut.replace(/[\s,;:.\-—]+$/, "") + "…";
};

/**
 * The JSON a model meant to send, out of the prose it actually sent.
 *
 * Every provider in the chain has its own habits: a fenced ```json block, a
 * sentence of preamble, a trailing "Let me know if you'd like more". Asking
 * for bare JSON in the prompt gets it most of the time, and the rest of the
 * time this is the difference between a working feature and a parse error the
 * admin sees. The outermost bracketed span is taken, since a truncated answer
 * is better detected by `JSON.parse` failing than by a clever partial repair.
 */
export const extractJson = <T = unknown>(raw: string): T | null => {
  const text = (raw || "").trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    for (const [open, close] of [["[", "]"], ["{", "}"]] as const) {
      const start = trimmed.indexOf(open);
      const end = trimmed.lastIndexOf(close);
      if (start === -1 || end <= start) continue;
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch { /* try the next shape */ }
    }
  }
  return null;
};

/** Collapses whitespace and caps an excerpt, so a whole book can't fill a prompt. */
export const clampExcerpt = (text: string, maxChars: number): string =>
  (text || "").replace(/\s+/g, " ").trim().slice(0, maxChars);

/** `Label: value` when there is a value, nothing when there isn't. */
export const line = (label: string, value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value);
  return text.trim() ? `${label}: ${text.trim()}\n` : "";
};
