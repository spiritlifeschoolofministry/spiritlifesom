/**
 * Drafts the marking guide for the written questions on one paper.
 *
 * An essay question with no rubric is marked twice over: once by whoever reads
 * it first and remembers what they wanted, and once by `ai-mark`, which — with
 * nothing to mark against — is deliberately generous and says so. Neither is a
 * standard. On a paper thirty students sat, that is thirty answers judged
 * against a moving one.
 *
 * So this proposes the guide. What keeps it from being the model marking its
 * own work, which is the reason `rubric` was lecturer-only to begin with:
 *
 *   - It drafts from the course material and is told to require nothing the
 *     material does not establish. The same rule question drafting runs under,
 *     and for the same reason: a guide drawn from the model's own theology
 *     examines the cohort on the model's theology.
 *   - With no material text it refuses. A guide invented from a question's own
 *     wording is the circle this is meant to avoid, and an empty answer is the
 *     correct one.
 *   - Everything lands in `rubric_draft`. `ai-mark` reads `rubric` and nothing
 *     else, so until a person moves a draft across it changes no mark.
 *
 * It refuses once results are released, for the same reason `ai-mark` does:
 * the standard a cohort was marked against is not a thing to be edited after
 * they have seen their grades.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { clampExcerpt, extractJson, line } from "../_shared/ai-text.ts";

/** Per question. Enough for a guide; far short of a whole book. */
const MAX_EXCERPT_CHARS = 10_000;

/** A guide long enough to be a standard, short enough to be read while marking. */
const MAX_GUIDE_CHARS = 1200;

/** Past this the material is a reading list, not a source for one question. */
const MAX_MATERIALS = 4;

const prompt = (args: {
  questionText: string;
  questionType: string;
  maxPoints: number;
  courseName: string;
  excerpt: string;
}) =>
  `You are writing the marking guide a lecturer at a Christian Bible school will mark one exam question against. The exam has been sat. You are proposing the guide for the lecturer to adopt, edit or reject — you are not marking anything.

Hard rules:
- Build the guide only from the course material below. If the material does not establish a point, it may not be required of a student, however standard the point is elsewhere.
- Where the material does not cover enough of the question to support a guide, answer with {"guide": null}. That is a correct answer and a useful one.
- This is a school of ministry. Do not require a particular denominational position, a particular vocabulary, or an academic rather than devotional tone. Require understanding.
- Do not require length, structure, or a set number of points. A short answer containing the substance is a full-marks answer.
- Mark bands must add up to exactly ${args.maxPoints}.

Write the guide as plain prose a marker reads in under a minute, in British English, in this shape:

Full marks (${args.maxPoints}) — what an answer must contain, as two or three specific points drawn from the material.
Partial — what a half-marks answer typically has and is missing.
No marks — what is not an answer to this question.
Do not penalise — what a marker should let pass.

Answer with JSON and nothing else: {"guide": "<the guide, or null>"}

${line("Course", args.courseName)}${line("Question", args.questionText)}${
    line("Question type", args.questionType)
  }${line("Marks available", args.maxPoints)}
The course material this was taught from:
"""
${clampExcerpt(args.excerpt, MAX_EXCERPT_CHARS)}
"""`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_marking_guide", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const examId = String(body?.exam_id ?? "");
    // One question, or every written question on the paper still without a guide.
    const only = body?.question_id ? String(body.question_id) : null;

    const { data: exam } = await service
      .from("exams")
      .select("id, course_id, results_released")
      .eq("id", examId)
      .maybeSingle();
    const examRow = exam as
      | { id: string; course_id: string | null; results_released: boolean | null }
      | null;
    if (!examRow) return json({ error: "That exam is gone." }, 404);

    if (examRow.results_released) {
      return json({
        error:
          "Results for this exam are already released. The standard it was marked against is not something to change now.",
      }, 409);
    }

    const { data: links } = await service
      .from("exam_questions")
      .select("question_id, display_order")
      .eq("exam_id", examId)
      .order("display_order");
    const questionIds = ((links ?? []) as { question_id: string }[]).map((l) => l.question_id);
    if (questionIds.length === 0) {
      return json({ error: "This exam has no questions on it." }, 404);
    }

    const { data: questions } = await service
      .from("question_bank")
      .select("id, course_id, question_text, question_type, points, rubric, source_material_id")
      .in("id", only ? questionIds.filter((id) => id === only) : questionIds);

    const rows = ((questions ?? []) as {
      id: string;
      course_id: string | null;
      question_text: string;
      question_type: string;
      points: number | null;
      rubric: string | null;
      source_material_id: string | null;
    }[])
      // Only the questions a person has to judge. An auto-graded question has a
      // key; a guide for it would be a second, vaguer answer to the same thing.
      .filter((q) => q.question_type === "essay" || q.question_type === "short_answer")
      // A question that already has a standard keeps it. Redrafting over a
      // lecturer's own wording is the one thing this must never do.
      .filter((q) => only !== null || !q.rubric?.trim());

    if (rows.length === 0) {
      return json({ guides: {}, considered: 0, failures: [], usage: gate.usage });
    }

    // An all-courses paper has no course_id of its own, and asking for one by
    // empty string is a uuid cast error rather than an empty result. The name
    // is context for the prompt, not a source, so having none is survivable.
    const { data: course } = examRow.course_id
      ? await service
        .from("courses")
        .select("title")
        .eq("id", examRow.course_id)
        .maybeSingle()
      : { data: null };
    const courseName = String((course as { title?: string } | null)?.title ?? "");

    /**
     * The material each question is drafted from.
     *
     * A question written by the drafting feature names the material it came
     * from, which is the exact right source. One typed by hand names nothing,
     * so the course's own materials stand in — every one of them, because
     * which lecture covered a given question is not recorded anywhere and
     * guessing wrongly is worse than reading a little too much.
     */
    const courseIds = [...new Set(rows.map((q) => q.course_id).filter(Boolean))] as string[];
    const { data: materials } = courseIds.length
      ? await service
        .from("course_materials")
        .select("id, course_id, title, ai_excerpt")
        .in("course_id", courseIds)
        .not("ai_excerpt", "is", null)
      : { data: [] };

    const materialRows = ((materials ?? []) as {
      id: string;
      course_id: string | null;
      title: string;
      ai_excerpt: string | null;
    }[]).filter((m) => (m.ai_excerpt ?? "").trim().length >= 200);

    const byMaterialId = new Map(materialRows.map((m) => [m.id, m]));

    const sourceFor = (question: { course_id: string | null; source_material_id: string | null }) => {
      const named = question.source_material_id
        ? byMaterialId.get(question.source_material_id)
        : undefined;
      if (named) return [named];
      return materialRows
        .filter((m) => m.course_id === question.course_id)
        .slice(0, MAX_MATERIALS);
    };

    const guides: Record<string, { guide: string | null; note?: string }> = {};
    const failures: string[] = [];

    for (const question of rows) {
      const sources = sourceFor(question);
      // No text, no guide. Writing one from the question's own wording is the
      // circle this whole function exists to stay out of.
      if (sources.length === 0) {
        guides[question.id] = {
          guide: null,
          note:
            "No readable text was captured from this course's materials, so there is nothing to " +
            "ground a guide in. Write this one yourself.",
        };
        continue;
      }

      const excerpt = sources
        .map((m) => `--- ${m.title} ---\n${m.ai_excerpt ?? ""}`)
        .join("\n\n");

      const parse = (raw: string): { guide: string | null } | null => {
        const parsed = extractJson<{ guide?: unknown }>(raw);
        if (!parsed || !("guide" in parsed)) return null;
        if (parsed.guide === null) return { guide: null };
        const text = String(parsed.guide ?? "").trim();
        // Anything shorter is a sentence of throat-clearing, not a standard.
        if (text.length < 60) return null;
        return { guide: text.slice(0, MAX_GUIDE_CHARS) };
      };

      const result = await runChain(
        service,
        prompt({
          questionText: String(question.question_text ?? "").replace(/<[^>]*>/g, " ").trim(),
          questionType: question.question_type,
          maxPoints: Number(question.points) || 0,
          courseName,
          excerpt,
        }),
        { accept: (raw) => parse(raw) !== null, maxTokens: 900 },
      );

      if (!result.text) {
        if (!result.configured) return chainFailureResponse(result.failures, false);
        failures.push(result.failures.map((f) => f.detail).join("; "));
        continue;
      }

      const parsed = parse(result.text)!;
      if (parsed.guide === null) {
        guides[question.id] = {
          guide: null,
          note:
            "The material does not cover enough of this question to ground a guide. Write this " +
            "one yourself.",
        };
        continue;
      }

      guides[question.id] = { guide: parsed.guide };

      const { error } = await service
        .from("question_bank")
        .update({ rubric_draft: parsed.guide })
        .eq("id", question.id);
      if (error) failures.push(error.message);
    }

    return json({
      guides,
      considered: Object.keys(guides).length,
      failures,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
