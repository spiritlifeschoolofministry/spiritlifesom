import DOMPurify from "dompurify";

export type QuestionType =
  | "mcq_single"
  | "mcq_multi"
  | "true_false"
  | "short_answer"
  | "fill_blank"
  | "essay"
  | "matching";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq_single: "Multiple Choice (one answer)",
  mcq_multi: "Multiple Choice (multiple answers)",
  true_false: "True / False",
  short_answer: "Short Answer",
  fill_blank: "Fill in the Blank",
  essay: "Essay",
  matching: "Matching",
};

export type MatchingItem = { key: string; text: string };
export type ParsedMatching = { stem: string; left: MatchingItem[]; right: MatchingItem[] };

/**
 * Pull the two halves of a matching question out of its prompt.
 *
 * Matching questions carry no options and no answer key — the importer leaves
 * the pairs inside question_text as "A) …" prompts and "1) …" choices. Parsing
 * them is what lets the runner offer a control per left-hand item instead of
 * printing the lot as one paragraph with nothing to answer.
 *
 * Returns null when the text does not hold at least two of each, so a question
 * written some other way falls back to plain text rather than rendering an
 * empty grid.
 */
export const parseMatchingQuestion = (raw: string): ParsedMatching | null => {
  const text = (raw || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (!text) return null;

  const left: MatchingItem[] = [];
  const right: MatchingItem[] = [];
  const stem: string[] = [];

  for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
    if (!line) continue;
    const asLeft = line.match(/^([A-Za-z])[).]\s*(.+)$/);
    const asRight = line.match(/^(\d{1,2})[).]\s*(.+)$/);
    if (asLeft) left.push({ key: asLeft[1].toUpperCase(), text: asLeft[2].trim() });
    else if (asRight) right.push({ key: asRight[1], text: asRight[2].trim() });
    else if (left.length === 0 && right.length === 0) stem.push(line);
  }

  if (left.length < 2 || right.length < 2) return null;
  return { stem: stem.join(" "), left, right };
};

/**
 * Turn a stored answer into something a person can read.
 *
 * Answers are kept in the shape the runner produced — an option index, a list
 * of indices, a boolean — which is fine for scoring and unreadable on screen.
 */
/** The little bit of a question that reading an answer back actually needs. */
export type AnswerFormattable = { question_type?: string | null; options?: unknown };

export const formatAnswer = (
  value: unknown,
  question: AnswerFormattable,
): string => {
  if (value === null || value === undefined || value === "") return "";
  const options = Array.isArray(question.options) ? (question.options as unknown[]) : null;
  switch (question.question_type) {
    case "mcq_single":
      return options ? String(options[Number(value)] ?? value) : String(value);
    case "mcq_multi":
      if (!Array.isArray(value)) return String(value);
      return options
        ? value.map((i) => options[Number(i)]).filter(Boolean).join(", ")
        : value.join(", ");
    case "true_false":
      return value ? "True" : "False";
    case "matching":
      if (typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => `${k} → ${v}`)
          .join(", ");
      }
      return String(value);
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
};

/**
 * Whether a question has been fully answered.
 *
 * Matching needs every pair chosen, not just the first — a half-filled
 * matching question used to show green in the navigator and count towards
 * "answered 7/7", telling a student they were finished when they were not.
 */
export const isAnswered = (
  question: { question_type?: string | null; question_text?: string | null },
  value: unknown,
): boolean => {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;

  if (question.question_type === "matching") {
    if (typeof value !== "object") return true;
    const chosen = Object.values(value as Record<string, unknown>).filter(
      (v) => v !== null && v !== undefined && v !== "",
    ).length;
    const parsed = parseMatchingQuestion(question.question_text || "");
    // Unparseable prompts fall back to a free-text answer, where anything counts.
    return parsed ? chosen >= parsed.left.length : chosen > 0;
  }

  return true;
};

/** Question types the server marks on submission from the saved answer key. */
export const AUTO_GRADED_TYPES: QuestionType[] = [
  "mcq_single",
  "mcq_multi",
  "true_false",
  "short_answer",
  "fill_blank",
  "matching",
];

export const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "blockquote", "code", "pre",
      "a", "img", "hr", "span",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
  });

export const generateSessionId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const generateFingerprint = () => {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}`,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || "?",
    ];
    return btoa(parts.join("|")).slice(0, 64);
  } catch {
    return "unknown";
  }
};

export const formatDuration = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
};

/** Collapse a label to a comparison key: "Multiple Choice (one answer)" -> "multiplechoiceoneanswer". */
const typeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every spelling of a question type we accept in a CSV: the slug, the UI label, and common shorthands. */
const QUESTION_TYPE_ALIASES: Record<string, QuestionType> = (() => {
  const map: Record<string, QuestionType> = {};
  for (const slug of Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]) {
    map[typeKey(slug)] = slug;
    map[typeKey(QUESTION_TYPE_LABELS[slug])] = slug;
  }
  Object.assign(map, {
    mcq: "mcq_single",
    multiplechoice: "mcq_single",
    multiplechoicesingle: "mcq_single",
    singlechoice: "mcq_single",
    multiplechoicemultipleanswer: "mcq_multi",
    multiplechoicemultiple: "mcq_multi",
    multiselect: "mcq_multi",
    tf: "true_false",
    fillintheblanks: "fill_blank",
    blank: "fill_blank",
  } satisfies Record<string, QuestionType>);
  return map;
})();

const ACCEPTED_TYPES = Object.entries(QUESTION_TYPE_LABELS)
  .map(([slug, label]) => `"${label}" (or ${slug})`)
  .join(", ");

/** Matches an inline option line such as "A) Apostle" or "b. Prophet". */
const INLINE_OPTION_RE = /^\s*([A-Za-z])[).:]\s+(\S.*)$/;

/**
 * Pull "A) ...", "B) ..." lines out of a question body and return them as options.
 * Only trailing runs starting at A are treated as options, so prose containing an
 * incidental "A)" mid-question is left alone.
 */
const extractInlineOptions = (text: string) => {
  const lines = text.split(/\r?\n/);
  let start = -1;
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(INLINE_OPTION_RE);
    if (!m) {
      if (start >= 0) break; // run ended
      continue;
    }
    const expected = String.fromCharCode(97 + found.length); // a, b, c, ...
    if (m[1].toLowerCase() !== expected) {
      if (start >= 0) break;
      continue;
    }
    if (start < 0) start = i;
    found.push(m[2].trim());
  }
  if (found.length < 2) return { text, options: [] as string[] };
  const remaining = [...lines.slice(0, start), ...lines.slice(start + found.length)];
  return { text: remaining.join("\n").trim(), options: found };
};

/** Resolve one `correct` token for an MCQ to an option index: either a letter or the option's own text. */
const resolveOptionIndex = (token: string, options: string[]) => {
  const t = token.trim();
  if (/^[A-Za-z]$/.test(t)) {
    const byLetter = t.toLowerCase().charCodeAt(0) - 97;
    if (byLetter >= 0 && byLetter < options.length) return byLetter;
  }
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return options.findIndex((o) => norm(o) === norm(t));
};

/** CSV import format:
 * question_type,question_text,option_a,option_b,option_c,option_d,correct,points,explanation
 * Only question_type and question_text are required.
 *
 * question_type accepts the slug (mcq_single) or the label shown in the app
 * ("Multiple Choice (one answer)").
 *
 * Options may be given as option_a..option_d columns, or written inline in the
 * question text as "A) ...", "B) ..." lines — inline options are moved out of the
 * text and become the answer choices.
 *
 * correct:
 *   MCQ                    letters or the option text, separated by | or comma ("a|c", "Pastor", "Apostle, Prophet")
 *   true_false             "true" or "false"
 *   short_answer/fill_blank  accepted answers separated by | (commas are kept as-is)
 *   essay/matching         ignored; matching is graded manually
 */
/** One question parsed out of an import CSV, in insert-ready form. */
export type ParsedQuestion = {
  question_type: QuestionType;
  question_text: string;
  options: string[] | null;
  correct_answer: unknown;
  points: number;
  explanation: string | null;
};

export const parseQuestionCSV = (csv: string): ParsedQuestion[] => {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const cellAt = (cells: string[], key: string) => {
    const i = headers.indexOf(key);
    return i < 0 ? "" : (cells[i] ?? "");
  };
  const out: ParsedQuestion[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((c) => !c.trim())) continue;
    const rowNo = i + 1;

    const rawType = cellAt(cells, "question_type").trim();
    const type = QUESTION_TYPE_ALIASES[typeKey(rawType || "mcq_single")];
    if (!type) {
      throw new Error(`Row ${rowNo}: unknown question_type "${rawType}". Use one of: ${ACCEPTED_TYPES}`);
    }

    let text = cellAt(cells, "question_text").trim();
    let opts = ["option_a", "option_b", "option_c", "option_d"]
      .map((k) => cellAt(cells, k).trim())
      .filter(Boolean);

    const isMcq = type === "mcq_single" || type === "mcq_multi";
    if (isMcq && !opts.length) {
      const extracted = extractInlineOptions(text);
      text = extracted.text;
      opts = extracted.options;
    }

    if (!text) throw new Error(`Row ${rowNo}: question_text is empty.`);

    const correctRaw = cellAt(cells, "correct").trim();
    let correct_answer: unknown = null;
    let options: string[] | null = null;

    if (isMcq) {
      if (opts.length < 2) {
        throw new Error(
          `Row ${rowNo}: multiple-choice questions need at least 2 options. ` +
            `Provide option_a/option_b columns, or list them in the question text as "A) ...", "B) ...".`,
        );
      }
      options = opts;
      const tokens = correctRaw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      const indices: number[] = [];
      for (const token of tokens) {
        const at = resolveOptionIndex(token, opts);
        if (at < 0) {
          throw new Error(
            `Row ${rowNo}: correct answer "${token}" does not match any option. ` +
              `Use the option letter (a, b, ...) or its exact text.`,
          );
        }
        if (!indices.includes(at)) indices.push(at);
      }
      if (!indices.length) throw new Error(`Row ${rowNo}: correct answer is required for multiple-choice questions.`);
      if (type === "mcq_single") {
        if (indices.length > 1) {
          throw new Error(`Row ${rowNo}: "${QUESTION_TYPE_LABELS.mcq_single}" accepts one correct answer, got ${indices.length}.`);
        }
        correct_answer = indices[0];
      } else {
        correct_answer = indices.sort((a, b) => a - b);
      }
    } else if (type === "true_false") {
      const v = correctRaw.toLowerCase();
      if (v !== "true" && v !== "false") {
        throw new Error(`Row ${rowNo}: true/false questions need correct set to "true" or "false", got "${correctRaw}".`);
      }
      correct_answer = v === "true";
    } else if (type === "short_answer" || type === "fill_blank") {
      correct_answer = correctRaw.split("|").map((s) => s.trim()).filter(Boolean);
    } else if (type === "matching") {
      // "A-1, B-2" (also A=1 or A:1). Left with the key blank, the question
      // still imports and is simply marked by hand.
      if (correctRaw) {
        const pairs: Record<string, string> = {};
        for (const token of correctRaw.split(/[|,]/).map((s) => s.trim()).filter(Boolean)) {
          const m = token.match(/^([A-Za-z])\s*[-=:>]+\s*(\d{1,2})$/);
          if (!m) {
            throw new Error(
              `Row ${rowNo}: matching answers look like "A-1, B-2". "${token}" does not.`,
            );
          }
          pairs[m[1].toUpperCase()] = m[2];
        }
        const prompts = parseMatchingQuestion(text);
        if (prompts) {
          const missing = prompts.left.map((l) => l.key).filter((k) => !(k in pairs));
          if (missing.length) {
            throw new Error(`Row ${rowNo}: no correct match given for ${missing.join(", ")}.`);
          }
        }
        correct_answer = pairs;
      }
      if (opts.length) options = opts;
    } else if (opts.length) {
      // essay: keep any supplied options for reference, answer is graded by hand
      options = opts;
    }

    const pointsRaw = cellAt(cells, "points").trim();
    out.push({
      question_type: type,
      question_text: text,
      options,
      correct_answer,
      points: Number(pointsRaw) > 0 ? Number(pointsRaw) : 1,
      explanation: cellAt(cells, "explanation").trim() || null,
    });
  }
  return out;
};

/** Tokenize a whole CSV document into rows of cells. Quoted fields may span newlines. */
const parseCSV = (csv: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const text = csv.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\r") {
      // handled by the \n branch; bare \r also ends a row
      if (text[i + 1] !== "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      }
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
};

/**
 * When entry to an exam closes.
 *
 * Two rules were tangled together here, and both were wrong at the edges.
 * "Allow late entry" off refused entry from the instant after start_at, so an
 * exam saved with the builder's default could not be started at all — the
 * student who clicked Start a second after it opened was already late. And the
 * cutoff was enforced only on the server, so the lobby offered an enabled Start
 * button, sent the student to the runner, and let the runner bounce them back
 * to the list with no usable explanation.
 *
 * One rule now, expressed once: entry closes a number of minutes after the exam
 * opens, and never later than the exam itself closes. Late entry off means a
 * short grace rather than none, which is what "students must be here at the
 * start" can actually mean when the clock is a wall clock.
 *
 * exam-start applies the same rule and is the authority; this copy is what lets
 * the lobby say so before the student commits to a sitting. Keep the two in
 * step — supabase/functions/exam-start/index.ts.
 */
export const NO_LATE_ENTRY_GRACE_MINUTES = 5;

export type ExamWindow = {
  start_at: string;
  end_at: string;
  allow_late_entry?: boolean | null;
  late_entry_cutoff_minutes?: number | null;
};

export const entryClosesAt = (exam: ExamWindow): number => {
  const startMs = new Date(exam.start_at).getTime();
  const endMs = new Date(exam.end_at).getTime();
  // A cutoff of zero or nothing, with late entry allowed, means no cutoff of
  // its own: the exam's own closing time is the only limit.
  const cutoff = exam.allow_late_entry
    ? Number(exam.late_entry_cutoff_minutes) || 0
    : NO_LATE_ENTRY_GRACE_MINUTES;
  if (!cutoff) return endMs;
  return Math.min(startMs + cutoff * 60 * 1000, endMs);
};
