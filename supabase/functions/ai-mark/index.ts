/**
 * Proposes a mark for the answers a person has to read.
 *
 * A mark is the most consequential number this application holds. It decides a
 * grade, a transcript and eventually a certificate, and unlike a description or
 * a tag it cannot be quietly corrected later without the correction itself
 * being a thing that happened. So this function is built to be unable to award
 * one:
 *
 *   - It writes to `ai_suggested_points` and `ai_suggested_feedback`, never to
 *     `points_awarded` or `manual_feedback`. Those two are written only by the
 *     existing marking screen, by a person, saving as they always have.
 *   - It refuses while the attempt is unsubmitted, so nobody is marked on a
 *     half-finished answer, and refuses once results are released, because a
 *     suggestion arriving after a student has seen their grade has no honest
 *     use.
 *   - It is given the rubric as the standard and told to mark against it
 *     rather than against its own opinion of the subject. Where there is no
 *     rubric it says so and marks conservatively, because a Bible school's
 *     essay questions are exactly the place where a model's own theology would
 *     otherwise fill the gap.
 *
 * What it saves an examiner is the reading and the arithmetic on thirty
 * answers, not the judgement on any one of them.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { extractJson, line, tidy } from "../_shared/ai-text.ts";

/** Beyond this an answer is being pasted from somewhere, not written. */
const MAX_ANSWER_CHARS = 8000;

interface Suggestion {
  points: number;
  feedback: string;
}

const prompt = (args: {
  questionText: string;
  questionType: string;
  rubric: string | null;
  modelAnswer: string | null;
  maxPoints: number;
  answer: string;
}) =>
  `You are helping an examiner at a Christian Bible school mark one written answer. You are proposing a mark for a person to check — you are not awarding it.

Rules:
- Mark against the rubric below, and nothing else. Where the rubric is silent, do not invent a requirement.
- ${
    args.rubric
      ? "The rubric is the standard. An answer meeting it earns full marks even if you would have written it differently."
      : "There is no rubric. Mark only on whether the answer addresses the question coherently, be generous rather than strict, and say in your feedback that no rubric was set."
  }
- This is a school of ministry. Do not mark an answer down for holding a theological position you disagree with, for denominational vocabulary, or for a devotional rather than academic tone, unless the rubric asks for something else.
- Do not reward length. A short answer that meets the rubric is a full-marks answer.
- English may not be the writer's first language. Mark the substance, not the grammar.
- Feedback is read by the student. Address them directly, say what earned the marks and what was missing, in at most two sentences. Never sarcastic, never scolding.
- The mark must be a number between 0 and ${args.maxPoints}, in steps of 0.5.

Answer with JSON and nothing else: {"points": <number>, "feedback": "<at most two sentences>"}

${line("Question", args.questionText)}${line("Question type", args.questionType)}${
    line("Marks available", args.maxPoints)
  }${args.rubric ? `\nRubric — the standard to mark against:\n"""\n${args.rubric}\n"""\n` : ""}${
    args.modelAnswer ? `\nAccepted answers on file: ${args.modelAnswer}\n` : ""
  }
The student's answer:
"""
${args.answer.slice(0, MAX_ANSWER_CHARS)}
"""`;

/** How an answer's JSONB reads as text for a prompt. */
const answerText = (answer: unknown): string => {
  if (answer === null || answer === undefined) return "";
  if (typeof answer === "string") return answer;
  if (Array.isArray(answer)) return answer.map(String).join(", ");
  return JSON.stringify(answer);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_essay_marking", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const attemptId = String(body?.attempt_id ?? "");
    // A specific answer, or every one still needing a human on this attempt.
    const only = body?.answer_id ? String(body.answer_id) : null;

    const { data: attempt } = await service
      .from("exam_attempts")
      .select("id, exam_id, submitted_at")
      .eq("id", attemptId)
      .maybeSingle();
    const attemptRow = attempt as { id: string; exam_id: string; submitted_at: string | null } | null;
    if (!attemptRow) return json({ error: "That attempt is gone." }, 404);

    // Marking an answer still being written would mark a student on a sentence
    // they were halfway through.
    if (!attemptRow.submitted_at) {
      return json({ error: "This attempt has not been submitted yet." }, 409);
    }

    const { data: exam } = await service
      .from("exams")
      .select("results_released")
      .eq("id", attemptRow.exam_id)
      .maybeSingle();
    if ((exam as { results_released?: boolean } | null)?.results_released) {
      return json({
        error: "Results for this exam are already released, so a suggested mark has no use here.",
      }, 409);
    }

    let query = service
      .from("exam_answers")
      .select("id, question_id, answer, points_awarded")
      .eq("attempt_id", attemptId);
    if (only) query = query.eq("id", only);
    const { data: answers } = await query;

    const rows = (answers ?? []) as {
      id: string;
      question_id: string;
      answer: unknown;
      points_awarded: number | null;
    }[];
    if (rows.length === 0) return json({ error: "There are no answers on this attempt." }, 404);

    const { data: questions } = await service
      .from("question_bank")
      .select("id, question_text, question_type, points, rubric, correct_answer")
      .in("id", rows.map((row) => row.question_id));
    const byId = new Map(
      ((questions ?? []) as Record<string, unknown>[]).map((q) => [String(q.id), q]),
    );

    const suggestions: Record<string, Suggestion & { note?: string }> = {};
    const failures: string[] = [];

    for (const row of rows) {
      const question = byId.get(row.question_id);
      if (!question) continue;

      const type = String(question.question_type ?? "");
      // Only the types a person actually has to read. An auto-graded question
      // with a key already has a right answer; a suggestion there would be
      // second-guessing arithmetic.
      if (type !== "essay" && type !== "short_answer") continue;
      // An answer already marked is left alone — the examiner has decided.
      if (row.points_awarded !== null && !only) continue;

      const text = answerText(row.answer).trim();
      const maxPoints = Number(question.points) || 0;

      // A blank answer is a definite zero and needs no model to say so.
      if (!text) {
        suggestions[row.id] = {
          points: 0,
          feedback: "No answer was given for this question.",
          note: "blank",
        };
        continue;
      }

      const parse = (raw: string): Suggestion | null => {
        const parsed = extractJson<{ points?: unknown; feedback?: unknown }>(raw);
        if (!parsed) return null;
        const points = Number(parsed.points);
        if (!Number.isFinite(points)) return null;
        const feedback = tidy(String(parsed.feedback ?? ""), 400);
        if (!feedback) return null;
        // Clamped rather than rejected: a model proposing 12 out of 10 has
        // still read the answer, and the ceiling is not its call to make.
        return {
          points: Math.max(0, Math.min(maxPoints, Math.round(points * 2) / 2)),
          feedback,
        };
      };

      const result = await runChain(
        service,
        prompt({
          questionText: String(question.question_text ?? ""),
          questionType: type,
          rubric: question.rubric ? String(question.rubric) : null,
          modelAnswer: Array.isArray(question.correct_answer)
            ? question.correct_answer.map(String).join(", ")
            : null,
          maxPoints,
          answer: text,
        }),
        { accept: (raw) => parse(raw) !== null, maxTokens: 600 },
      );

      if (!result.text) {
        if (!result.configured) return chainFailureResponse(result.failures, false);
        failures.push(result.failures.map((f) => f.detail).join("; "));
        continue;
      }

      const suggestion = parse(result.text)!;
      suggestions[row.id] = suggestion;

      const { error } = await service
        .from("exam_answers")
        .update({
          ai_suggested_points: suggestion.points,
          ai_suggested_feedback: suggestion.feedback,
          ai_marked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) failures.push(error.message);
    }

    return json({
      suggestions,
      considered: Object.keys(suggestions).length,
      failures,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
