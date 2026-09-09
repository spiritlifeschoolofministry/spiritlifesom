/**
 * Reading the opening of an uploaded document, in the browser that holds it.
 *
 * This is the only place a course material's words are ever extracted. Doing it
 * server-side would mean shipping the file to an edge function — a 40MB PDF
 * against a few kilobytes of text — and doing it at read time would mean the
 * uploader is the only screen that could ever run an AI feature. So the excerpt
 * is taken once here and stored on the row (`course_materials.ai_excerpt`),
 * where describing, tagging, drafting questions and answering a student's
 * question can all reach it.
 *
 * Only the opening. A model asked to describe a whole book is being asked to
 * summarise something it cannot fit, and the first pages of a teaching document
 * are where its subject and scope are actually stated — the same reason a
 * person opens the front matter rather than page 200.
 */

/** Roughly the first few pages of prose. Past this a prompt is being padded. */
export const MAX_EXCERPT_CHARS = 12_000;

/** How many pages to read at most, whatever their length. */
const MAX_PAGES = 8;

/**
 * pdf.js needs its worker, and the bundled worker file is an ES module.
 *
 * Vite rewrites this `?url` import to the hashed asset path at build time, so
 * it keeps working in the production bundle rather than only in dev — a plain
 * CDN URL would break the moment the site is opened offline in the Android
 * shell, which is a supported way to use this app.
 */
const configureWorker = async () => {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
};

/** Whether a file is one whose text can be read at all. */
export const canExtractText = (file: File): boolean =>
  file.type === 'application/pdf' ||
  file.name.toLowerCase().endsWith('.pdf') ||
  file.type.startsWith('text/');

/**
 * The opening words of a file, or an empty string when there are none to read.
 *
 * Never throws. Every caller's next step is to describe or file the material,
 * and none of those should fail because a PDF turned out to be a scan with no
 * text layer — which is common for donated teaching notes. An empty excerpt
 * simply means the metadata is all anyone has, and the callers already handle
 * that case because it is also what an audio file gives them.
 */
export const extractExcerpt = async (file: File): Promise<string> => {
  try {
    if (file.type.startsWith('text/')) {
      const text = await file.text();
      return clean(text);
    }
    if (!canExtractText(file)) return '';

    const pdfjs = await configureWorker();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;

    const parts: string[] = [];
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      parts.push(
        content.items
          .map((item) => (typeof item === 'object' && 'str' in item ? String(item.str) : ''))
          .join(' '),
      );
      // Stop as soon as there is enough: a long book's first two pages are
      // usually already more than a prompt should carry.
      if (parts.join(' ').length >= MAX_EXCERPT_CHARS) break;
    }

    return clean(parts.join('\n'));
  } catch (err) {
    // Worth knowing while developing, never worth interrupting an upload for.
    console.warn('Could not read text from this file:', err);
    return '';
  }
};

const clean = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
