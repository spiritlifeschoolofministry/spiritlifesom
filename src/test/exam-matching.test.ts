import { describe, it, expect } from "vitest";
import { parseMatchingQuestion, formatAnswer } from "@/lib/exam-utils";

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
