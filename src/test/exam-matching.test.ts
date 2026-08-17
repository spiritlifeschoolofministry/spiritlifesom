import { describe, it, expect } from "vitest";
import { parseMatchingQuestion, formatAnswer, isAnswered, parseQuestionCSV } from "@/lib/exam-utils";

const REAL = [
  "Match the ministry gift to its function:\nA) Evangelist\nB) Teacher\n\n1) Anointed to preach the gospel of salvation to the unsaved\n2) Has supernatural ability to open, explain, and apply the Word of God",
  "Match the Council or individual to the corresponding date or development:\nA) Bishop Athanasius\nB) Council of Carthage\n\n1) AD 397, confirms the canonical list\n2) AD 367, publishes Easter Letter listing all 27 NT books",
  "Match the gap to its definition:\nA) Historical gap\nB) Linguistic gap\n\n1) Difference in time\n2) Difference in language",
];

describe("parseMatchingQuestion", () => {
  it("parses every matching question in the live bank", () => {
    for (const raw of REAL) {
      const p = parseMatchingQuestion(raw);
      expect(p, raw.slice(0, 30)).not.toBeNull();
      expect(p!.left).toHaveLength(2);
      expect(p!.right).toHaveLength(2);
      expect(p!.stem).toMatch(/^Match/);
      expect(p!.left[0].key).toBe("A");
      expect(p!.right[0].key).toBe("1");
    }
  });

  it("keeps the AD dates inside the right-hand text", () => {
    const p = parseMatchingQuestion(REAL[1])!;
    expect(p.right[0].text).toBe("AD 397, confirms the canonical list");
  });

  it("returns null when there are no pairs to find", () => {
    expect(parseMatchingQuestion("Explain the doctrine of grace.")).toBeNull();
  });

  it("renders a matching answer readably", () => {
    expect(formatAnswer({ A: "2", B: "1" }, { question_type: "matching" })).toBe("A → 2, B → 1");
  });
});

describe("isAnswered", () => {
  const matching = { question_type: "matching", question_text: REAL[0] };

  it("does not count a half-filled matching question", () => {
    expect(isAnswered(matching, { A: "1" })).toBe(false);
    expect(isAnswered(matching, { A: "1", B: "" })).toBe(false);
  });

  it("counts a matching question once every pair is chosen", () => {
    expect(isAnswered(matching, { A: "1", B: "2" })).toBe(true);
  });

  it("still handles the ordinary types", () => {
    expect(isAnswered({ question_type: "mcq_single" }, 0)).toBe(true);
    expect(isAnswered({ question_type: "mcq_single" }, null)).toBe(false);
    expect(isAnswered({ question_type: "mcq_multi" }, [])).toBe(false);
    expect(isAnswered({ question_type: "true_false" }, false)).toBe(true);
    expect(isAnswered({ question_type: "essay" }, "")).toBe(false);
  });
});

describe("parseQuestionCSV — matching keys", () => {
  const header = "question_type,question_text,correct,points\n";
  const text = '"Match the gap to its definition:\nA) Historical gap\nB) Linguistic gap\n\n1) Difference in time\n2) Difference in language"';

  it("reads A-1, B-2 into a key object", () => {
    const rows = parseQuestionCSV(`${header}matching,${text},"A-1, B-2",2`);
    expect(rows[0].correct_answer).toEqual({ A: "1", B: "2" });
  });

  it("accepts = and : separators", () => {
    const rows = parseQuestionCSV(`${header}matching,${text},"A=2|B:1",2`);
    expect(rows[0].correct_answer).toEqual({ A: "2", B: "1" });
  });

  it("imports with no key at all, leaving it hand-marked", () => {
    const rows = parseQuestionCSV(`${header}matching,${text},,2`);
    expect(rows[0].correct_answer).toBeNull();
  });

  it("rejects a key that misses one of the prompts", () => {
    expect(() => parseQuestionCSV(`${header}matching,${text},A-1,2`)).toThrow(/no correct match given for B/);
  });

  it("rejects a malformed pair", () => {
    expect(() => parseQuestionCSV(`${header}matching,${text},"A to 1",2`)).toThrow(/look like "A-1, B-2"/);
  });
});
