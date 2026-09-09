/**
 * Drafts exam questions from a course material, and writes the explanations
 * that existing questions are missing.
 *
 * Writing questions is the most tedious job in the exam builder and the one
 * most often skipped, which is why a bank fills up with twenty questions for
 * one course and none for another. This does the first draft; a person does
 * the judging.
 *
 * Two things make that safe rather than alarming:
 *
 *   Everything lands as `status = 'draft'`, and the exam builder only reads
 *   approved rows. A drafted question is invisible to students and unpickable
 *   into an exam until somebody has actually read it.
 *
 *   Every draft is validated here against the exact shapes `autograde.ts`
 *   scores — an `mcq_single` key must be an in-range option index, a
 *   `short_answer` key must be a non-empty list of accepted strings — and
 *   anything that fails is dropped rather than saved. A question whose key is
 *   the wrong shape does not fail loudly at marking time; it silently marks
 *   every student wrong, so it must never reach the table at all.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { extractJson, line, tidy } from "../_shared/ai-text.ts";
import { meaningfulWords, SAME_QUESTION, similarity } from "../_shared/question-dedupe.ts";
import { draftPrompt, MAX_QUESTIONS, MAX_SHOWN_EXISTING } from "../_shared/question-prompt.ts";
import {
  DRAFTABLE,
  type Draftable,
  type DraftedQuestion,
  isRejected,
  validateDraftedQuestion as validate,
} from "../_shared/question-shapes.ts";

const explainPrompt = (question: {
  question_text: string;
  question_type: string;
  options?: unknown;
  correct_answer?: unknown;
}) =>
  `A student has just seen this exam question marked. Write the one-sentence explanation shown beside their answer, saying why the correct answer is correct.

Rules:
- One sentence, at most 300 characters. Plain British English.
- Explain the reasoning, do not merely restate the answer.
- Teach, do not scold. This is read by someone who may have got it wrong.
- No preamble and no quotes. Just the sentence.

${line("Question", question.question_text)}${line("Type", question.question_type)}${
    line("Options", Array.isArray(question.options) ? question.options.map(String) : undefined)
  }${line("Correct answer", JSON.stringify(question.correct_answer ?? null))}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_question_drafting", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service, userId } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "draft");

    // ---------------------------------------------------------------- explain
    if (action === "explain") {
      const questionId = String(body?.question_id ?? "");
      const { data } = await service
        .from("question_bank")
        .select("id, question_text, question_type, options, correct_answer")
        .eq("id", questionId)
        .maybeSingle();
      if (!data) return json({ error: "That question is gone." }, 404);

      const result = await runChain(service, explainPrompt(data as never), {
        accept: (raw) => tidy(raw, 300).length >= 15,
        maxTokens: 300,
      });
      if (!result.text) return chainFailureResponse(result.failures, result.configured);

      const explanation = tidy(result.text, 300);
      const { error } = await service
        .from("question_bank")
        .update({ explanation })
        .eq("id", questionId);
      if (error) return json({ error: error.message }, 400);

      return json({ explanation, provider: result.provider, usage: gate.usage });
    }

    // ------------------------------------------------------------------ draft
    if (action !== "draft") return json({ error: `Unknown action "${action}".` }, 400);

    const materialId = String(body?.material_id ?? "");
    const count = Math.min(Math.max(Number(body?.count) || 10, 1), MAX_QUESTIONS);

    /**
     * Which pool this draft is for.
     *
     * `exam` is `question_bank` — the real thing, used in tests and exams.
     * `practice` is `practice_questions`, which students may practise against
     * and which shows them the answer afterwards. They are different tables so
     * that a question written for one can never turn up in the other, and the
     * target is stated by the caller rather than inferred from anything.
     */
    const target = String(body?.target ?? "exam") === "practice" ? "practice" : "exam";
    const table = target === "practice" ? "practice_questions" : "question_bank";

    const asked: string[] = Array.isArray(body?.types)
      ? body.types.map((type: unknown) => String(type))
      : [...DRAFTABLE];
    const requested = asked
      .filter((type): type is Draftable => (DRAFTABLE as readonly string[]).includes(type))
      // Practice marks an answer and tells the student whether it was right,
      // which an essay cannot do — so an essay drafted for practice would be a
      // question its own page could never answer.
      .filter((type: Draftable) => target !== "practice" || type !== "essay");
    if (requested.length === 0) {
      return json({
        error: target === "practice"
          ? "Pick at least one question type. Essays cannot be practised, since practice has to be able to mark the answer."
          : "Pick at least one question type.",
      }, 400);
    }

    const { data: material } = await service
      .from("course_materials")
      .select("id, title, course_id, cohort_id, ai_excerpt")
      .eq("id", materialId)
      .maybeSingle();
    const row = material as
      | { id: string; title: string; course_id: string | null; cohort_id: string | null; ai_excerpt: string | null }
      | null;
    if (!row) return json({ error: "That material is gone." }, 404);
    if (!row.course_id) {
      return json({ error: "That material is not attached to a course, so a question has nowhere to go." }, 400);
    }

    // Without text there is nothing to ask about, and guessing from a title is
    // exactly what this refuses to do.
    if (!row.ai_excerpt || row.ai_excerpt.trim().length < 200) {
      return json({
        error:
          "No readable text was captured from this material, so there is nothing to draft from. " +
          "Text was only extracted for files uploaded since AI was switched on, and scanned PDFs have none to extract.",
      }, 422);
    }

    const { data: course } = await service
      .from("courses")
      .select("title")
      .eq("id", row.course_id)
      .maybeSingle();

    /**
     * What has already been asked on this course, in this pool.
     *
     * Scoped to the course rather than to the material: two materials on one
     * course overlap, and a student practising the course meets both sets
     * together. Drafts count as much as approved ones — a draft waiting to be
     * read is still a question somebody will approve.
     */
    const { data: alreadyAsked } = await service
      .from(table)
      .select("question_text")
      .eq("course_id", row.course_id)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300);

    const existingTexts = ((alreadyAsked ?? []) as { question_text: string }[])
      .map((q) => String(q.question_text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const existingWords = existingTexts.map(meaningfulWords);

    const allowed = new Set<string>(requested);
    const parse = (text: string) => {
      const parsed = extractJson<DraftedQuestion[]>(text);
      return Array.isArray(parsed) ? parsed : null;
    };

    const result = await runChain(
      service,
      draftPrompt(
        count,
        requested,
        { title: row.title, courseName: (course as { title?: string } | null)?.title },
        row.ai_excerpt,
        // Newest first, trimmed: the model needs to recognise them, not read
        // them in full.
        existingTexts.slice(0, MAX_SHOWN_EXISTING).map((text) =>
          text.length > 160 ? `${text.slice(0, 160)}…` : text
        ),
      ),
      {
        // At least one usable question, or this provider has not answered.
        accept: (text) => {
          const parsed = parse(text);
          return !!parsed && parsed.some((q) => validate(q, allowed).ok);
        },
        // Twenty questions with options and explanations is a lot of tokens.
        maxTokens: 8000,
      },
    );
    if (!result.text) return chainFailureResponse(result.failures, result.configured);

    const drafted = parse(result.text) ?? [];
    const rejected: string[] = [];
    // Repeats are counted apart from malformed ones. They are not a failure of
    // the model in the same way — a second batch from one excerpt has less left
    // to ask about each time — and an admin reading "8 discarded" deserves to
    // know which kind of discarding happened.
    const duplicates: string[] = [];
    // Grows as the batch is checked, so the model repeating itself inside one
    // answer is caught as well as it repeating what is already stored.
    const seen = [...existingWords];

    const rows = drafted.slice(0, count).flatMap((raw) => {
      const checked = validate(raw, allowed);
      if (isRejected(checked)) {
        rejected.push(checked.why);
        return [];
      }

      const words = meaningfulWords(checked.row.question_text);
      if (seen.some((previous) => similarity(words, previous) >= SAME_QUESTION)) {
        duplicates.push(checked.row.question_text.slice(0, 120));
        return [];
      }
      seen.push(words);
      // A rubric is the standard a person marks an answer against, and every
      // practice answer is marked by `autograde` instead — so the practice
      // table has no such column, and sending one is an error rather than a
      // value that would be ignored.
      const { rubric: _rubric, ...answerable } = checked.row;

      return [{
        ...(target === "practice" ? answerable : checked.row),
        course_id: row.course_id,
        cohort_id: row.cohort_id,
        created_by: userId,
        source_material_id: row.id,
        ai_generated: true,
        status: "draft",
        // `practice_questions` has no tags column either: tagging exists so an
        // exam can be assembled by topic, and practice assembles nothing.
        ...(target === "practice" ? {} : { tags: [] }),
      }];
    });

    if (rows.length === 0) {
      // Two quite different outcomes, said differently. "Everything was a
      // repeat" means the material is used up, and the answer to that is
      // another material, not another attempt.
      return json({
        error: duplicates.length > 0 && rejected.length === 0
          ? `Every question drafted was one this course already has. This material has little left to ask that is not already covered — try another material, or a different mix of question types.`
          : "Nothing usable came back — every drafted question was malformed.",
        rejected,
        duplicates: duplicates.length,
      }, 422);
    }

    const { data: inserted, error } = await service
      .from(table)
      .insert(rows)
      .select("id");
    if (error) return json({ error: error.message }, 400);

    return json({
      drafted: inserted?.length ?? 0,
      discarded: rejected.length,
      duplicates: duplicates.length,
      rejected,
      provider: result.provider,
      model: result.model,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
