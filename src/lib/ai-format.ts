/**
 * Turning what a model returns into something a field can hold — the browser's
 * copy.
 *
 * Mirrors `supabase/functions/_shared/ai-text.ts`. Deno and Vite are separate
 * runtimes with no shared module path, so this is a deliberate copy rather
 * than an import; `src/test/ai-format.test.ts` pins the behaviour both sides
 * rely on.
 *
 * The browser needs its own copy because the fallbacks live here. A model can
 * be unreachable for a dozen ordinary reasons — no key yet, a spent free tier,
 * a rotated key, the edge function itself down — and every one of them has to
 * end somewhere sensible rather than in an empty field.
 */

/**
 * Search engines truncate a meta description near 160 characters, and a
 * material's description is the only one it has, so it is written to fit
 * rather than to be cut.
 */
export const MAX_DESCRIPTION_CHARS = 160;

/** See the note in `_shared/ai-text.ts`. */
export const tidy = (raw: string, maxChars = MAX_DESCRIPTION_CHARS): string => {
  let text = (raw || '').trim();
  text = text.split(/\n{2,}/)[0].replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:description|summary|answer)\s*[:\-—]\s*/i, '');
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  if (text.length <= maxChars) return text;

  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return cut.replace(/[\s,;:.\-—]+$/, '') + '…';
};

/** See the note in `_shared/ai-text.ts`. */
export const extractJson = <T = unknown>(raw: string): T | null => {
  const text = (raw || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    for (const [open, close] of [['[', ']'], ['{', '}']] as const) {
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

/** True when a description field holds nothing worth keeping. */
export const isBlankText = (value: string | null | undefined): boolean =>
  !String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();

// ---------------------------------------------------------------------------
// The description fallback
// ---------------------------------------------------------------------------

/** What is known about a material before any model has seen it. */
export interface MaterialMeta {
  title: string;
  courseName?: string | null;
  materialType?: string | null;
  fileType?: string | null;
  /** The document's opening, where it could be read. See `pdf-excerpt.ts`. */
  excerpt?: string;
}

/** Reads better than "pdf" or "application/pdf" in a sentence. */
const KIND_WORDS: Record<string, string> = {
  pdf: 'PDF',
  doc: 'document',
  docx: 'document',
  ppt: 'slide deck',
  pptx: 'slide deck',
  video: 'video',
  audio: 'audio recording',
  link: 'linked resource',
  note: 'set of notes',
  notes: 'set of notes',
  slides: 'slide deck',
  handout: 'handout',
};

const kindWord = (materialType?: string | null, fileType?: string | null): string => {
  const key = String(materialType || fileType || '').toLowerCase().replace(/^\./, '');
  return KIND_WORDS[key] ?? (key ? key : 'resource');
};

/**
 * A plain, true sentence from the metadata alone.
 *
 * Deliberately dull. It says only what the uploader typed, which is the one
 * thing that cannot be wrong, and it is what a material keeps when no model
 * ever answers for it.
 */
export const describeFromMetadata = (meta: MaterialMeta): string => {
  const kind = kindWord(meta.materialType, meta.fileType);
  const course = meta.courseName?.trim();
  const sentence = course
    ? `${meta.title.trim()} — a ${kind} for the ${course} course at Spirit Life School of Ministry.`
    : `${meta.title.trim()} — a ${kind} in the Spirit Life School of Ministry course library.`;
  return tidy(sentence, MAX_DESCRIPTION_CHARS);
};

