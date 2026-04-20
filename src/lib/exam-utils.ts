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

/** CSV import format:
 * question_type,question_text,option_a,option_b,option_c,option_d,correct,points,explanation
 * For MCQ correct = letter(s) joined with | (e.g. "a" or "a|c").
 * For true_false correct = "true" or "false".
 * For short_answer/fill_blank correct = accepted answers joined with |.
 * For essay leave correct empty.
 */
export const parseQuestionCSV = (csv: string) => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  const out: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const type = (cells[idx("question_type")] || "mcq_single").trim();
    const text = cells[idx("question_text")] || "";
    const opts = ["option_a", "option_b", "option_c", "option_d"]
      .map((k) => cells[idx(k)])
      .filter((v) => v && v.trim());
    const correctRaw = (cells[idx("correct")] || "").trim();
    let correct_answer: unknown = null;
    let options: string[] | null = null;
    if (type === "mcq_single" || type === "mcq_multi") {
      options = opts;
      const letters = correctRaw.split("|").map((s) => s.trim().toLowerCase());
      const indices = letters.map((l) => "abcd".indexOf(l)).filter((n) => n >= 0);
      correct_answer = type === "mcq_single" ? indices[0] ?? 0 : indices;
    } else if (type === "true_false") {
      correct_answer = correctRaw.toLowerCase() === "true";
    } else if (type === "short_answer" || type === "fill_blank") {
      correct_answer = correctRaw.split("|").map((s) => s.trim()).filter(Boolean);
    } else {
      correct_answer = null;
    }
    out.push({
      question_type: type,
      question_text: text,
      options,
      correct_answer,
      points: Number(cells[idx("points")] || 1) || 1,
      explanation: cells[idx("explanation")] || null,
    });
  }
  return out;
};

const splitCSVLine = (line: string) => {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += ch;
  }
  result.push(cur);
  return result;
};
