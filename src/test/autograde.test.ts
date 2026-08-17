import { describe, it, expect } from "vitest";
// The edge functions import this file directly; it is plain TS with no Deno APIs.
import { gradeAnswer } from "../../supabase/functions/_shared/autograde";

const q = (question_type: string, correct_answer: unknown, points = 2) => ({
  id: "q",
  question_type,
  correct_answer,
  points,
});

describe("gradeAnswer", () => {
  it("marks single choice against the option index", () => {
    expect(gradeAnswer(q("mcq_single", 1), 1)).toMatchObject({ pointsAwarded: 2, isCorrect: true });
    expect(gradeAnswer(q("mcq_single", 1), 3)).toMatchObject({ pointsAwarded: 0, isCorrect: false });
  });

  it("ignores the order of a multi-answer selection", () => {
    expect(gradeAnswer(q("mcq_multi", [0, 1, 3]), [3, 1, 0])).toMatchObject({ isCorrect: true });
    expect(gradeAnswer(q("mcq_multi", [0, 1, 3]), [0, 1])).toMatchObject({ isCorrect: false });
  });

  it("marks true/false", () => {
    expect(gradeAnswer(q("true_false", false), false)).toMatchObject({ isCorrect: true });
    expect(gradeAnswer(q("true_false", false), true)).toMatchObject({ isCorrect: false });
  });

  it("accepts any listed wording, ignoring case and spacing", () => {
    const key = ["The Law of First Mention"];
    expect(gradeAnswer(q("short_answer", key), "  the law of first mention ")).toMatchObject({ isCorrect: true });
    expect(gradeAnswer(q("short_answer", key), "law of first mention")).toMatchObject({ isCorrect: false });
  });

  it("gives matching questions partial credit, pair by pair", () => {
    const key = { A: "1", B: "2" };
    expect(gradeAnswer(q("matching", key), { A: "1", B: "2" })).toMatchObject({ pointsAwarded: 2, isCorrect: true });
    expect(gradeAnswer(q("matching", key), { A: "1", B: "1" })).toMatchObject({ pointsAwarded: 1, isCorrect: false });
    expect(gradeAnswer(q("matching", key), { A: "2", B: "1" })).toMatchObject({ pointsAwarded: 0, isCorrect: false });
  });

  it("scores an unanswered matching question zero rather than sending it to a marker", () => {
    expect(gradeAnswer(q("matching", { A: "1", B: "2" }), null)).toMatchObject({
      pointsAwarded: 0,
      needsManual: false,
    });
  });

  it("sends essays to a human", () => {
    expect(gradeAnswer(q("essay", null), "a long answer")).toMatchObject({ needsManual: true });
  });

  it("sends a keyless question to a human rather than marking it wrong", () => {
    expect(gradeAnswer(q("mcq_single", null), 1)).toMatchObject({ needsManual: true });
    expect(gradeAnswer(q("matching", {}), { A: "1" })).toMatchObject({ needsManual: true });
  });

  it("scores a blank objective answer zero", () => {
    expect(gradeAnswer(q("mcq_single", 1), null)).toMatchObject({ pointsAwarded: 0, needsManual: false });
  });
});
