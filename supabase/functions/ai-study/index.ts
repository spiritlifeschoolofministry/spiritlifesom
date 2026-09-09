/**
 * Answers a student's question from their own cohort's materials.
 *
 * This is the feature with the most ways to go wrong, so it ships switched off
 * and is built around three refusals rather than around an answer.
 *
 * **It refuses during an exam.** The guard does this for every AI feature, but
 * this is the one it exists for. A study assistant reachable mid-paper is not a
 * study assistant.
 *
 * **It refuses outside the student's own materials.** The material list is
 * built from their cohort and their learning mode, server-side. A student on
 * the Online track cannot reach a Physical cohort's notes through this any more
 * than they can through the materials page.
 *
 * **It refuses when the material does not cover the question.** This is the one
 * that matters most here and least elsewhere. A model asked about sanctification
 * by a Bible school student will always have an answer — a fluent, plausible,
 * denominationally-specific answer that this school may not teach. Answering
 * "that isn't covered in these notes" is correct; answering from the model's own
 * training is the school appearing to teach something it never taught. So the
 * excerpt is the entire permitted source, the answer must cite the material it
 * came from, and saying nothing is an allowed outcome.
 *
 * Conversations are not stored. A question and its answer live for the length
 * of the request; there is no history table, because a transcript of what
 * students privately asked about their own understanding is not something a
 * school needs to keep.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { clampExcerpt, line } from "../_shared/ai-text.ts";

/** How much of a material to put in the prompt. */
const MAX_EXCERPT_CHARS = 14_000;

/** Beyond this a "question" is a pasted assignment, not a question. */
const MAX_QUESTION_CHARS = 600;

/**
 * The brief, with the assistant's own name in it.
 *
 * This is the only prompt in the app that carries the name, because it is the
 * only one a person actually talks to — the rest return a description or a
 * mark, where a signature belongs in the interface rather than in the text.
 *
 * The name buys one thing: a student who asks "what are you?" gets a straight
 * answer instead of "as an AI language model". It must buy nothing else, so
 * the instruction is explicit that the name is not to appear while teaching.
 * A tool that talks about itself on a ministry site is spending the student's
 * attention on the wrong subject.
 */
const rules = (name: string) =>
  `You are ${name}, the study assistant at Spirit Life School of Ministry. You are helping a student understand one of their own course materials. You have been given an extract from that material, and it is the only source you may use.

About yourself:
- If, and only if, the student asks who or what you are: say in one sentence that you are ${name}, the school's study assistant, that you answer from their course materials, and that their lecturer is the person to ask about anything the materials do not cover. Then stop.
- Otherwise never mention yourself, your name, or that you are software. Do not open with "As ${name}" or sign off. The student came for the material, not for you.
- Never claim to be a lecturer, a minister, or any kind of spiritual authority, and never suggest your answer carries the school's teaching weight. You are repeating what a document says.

Hard rules:
- Answer only from the extract. You have a great deal of theological knowledge; none of it may appear in your answer. This school teaches what its own materials say, and a student reading your answer will reasonably believe the school taught it.
- If the extract does not answer the question, say so plainly in one sentence and stop. Suggest they ask their lecturer. Do not answer from general knowledge "to be helpful" — that is the one thing you must not do here.
- If the extract partly answers it, answer that part and say which part is not covered.
- Quote or closely paraphrase the material where you can, so the student can find it themselves.
- Never state a doctrinal position the extract does not state. Never resolve a disputed question the extract leaves open.
- Do not write their assignment or essay for them. Explain the material so they can write it.
- At most 200 words. British English, plain and warm, second person.
- No greeting, no sign-off, no added scripture references.`;

/**
 * The material tags a student's own mode entitles them to.
 *
 * Kept in step with `mapStudentLearningMode` on the materials page, and worth
 * the duplication rather than a looser rule here: a Hybrid student attends both
 * ways and can already open the Online and Physical material on that page, so a
 * study assistant that offered them only the 'All' ones would be refusing to
 * discuss notes the student is looking at. The legacy spellings are mapped for
 * the same reason — a student filed as 'on-site' is a Physical student, and
 * matching on the exact string would quietly give them nothing.
 */
const modesFor = (learningMode: string | null): string[] => {
  const mode = String(learningMode ?? "").toLowerCase().trim();
  if (!mode) return ["all"];
  if (mode === "online") return ["all", "online"];
  if (mode === "hybrid" || mode === "blended") {
    return ["all", "hybrid", "online", "physical"];
  }
  if (["physical", "on-site", "onsite", "offline"].includes(mode)) {
    return ["all", "physical"];
  }
  return ["all", mode];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_study_assistant", audience: "student" });
  if (!gate.ok) return gate.response;
  const { service, studentId } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "ask");

    const { data: student } = await service
      .from("students")
      .select("cohort_id, learning_mode")
      .eq("id", studentId)
      .maybeSingle();
    const studentRow = student as { cohort_id: string | null; learning_mode: string | null } | null;
    if (!studentRow?.cohort_id) {
      return json({ error: "You are not in a cohort yet, so there are no materials to read." }, 409);
    }

    /**
     * The materials this student may actually read.
     *
     * Scoped by cohort and by learning mode, mirroring the materials page —
     * `learning_modes` containing 'All' means everyone, otherwise the student's
     * own mode must be listed. Only materials with captured text are offered,
     * since the rest have nothing to answer from.
     */
    const { data: materials } = await service
      .from("course_materials")
      .select("id, title, course_id, learning_modes, ai_excerpt")
      .eq("cohort_id", studentRow.cohort_id)
      .not("ai_excerpt", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const allowed = modesFor(studentRow.learning_mode);
    const readable = ((materials ?? []) as {
      id: string;
      title: string;
      course_id: string | null;
      learning_modes: string[] | null;
      ai_excerpt: string | null;
    }[]).filter((material) => {
      const modes = (material.learning_modes ?? []).map((m) => String(m).toLowerCase());
      return modes.length === 0 || modes.some((m) => allowed.includes(m));
    });

    // The picker, so the student chooses what they are asking about rather than
    // the server guessing from their words.
    if (action === "materials") {
      return json({
        materials: readable.map((material) => ({
          id: material.id,
          title: material.title,
          course_id: material.course_id,
        })),
      });
    }

    if (action !== "ask") return json({ error: `Unknown action "${action}".` }, 400);

    const question = String(body?.question ?? "").trim().slice(0, MAX_QUESTION_CHARS);
    if (question.length < 5) return json({ error: "Ask a question first." }, 400);

    const materialId = String(body?.material_id ?? "");
    const material = readable.find((row) => row.id === materialId);
    // Not found rather than forbidden: a material outside their cohort is one
    // this student has no way of knowing exists.
    if (!material) {
      return json({ error: "That material is not one of yours." }, 404);
    }

    const { data: course } = material.course_id
      ? await service.from("courses").select("title").eq("id", material.course_id).maybeSingle()
      : { data: null };

    const result = await runChain(
      service,
      `${rules(gate.assistantName)}

${line("Course", (course as { title?: string } | null)?.title)}${line("Material", material.title)}
The extract — your only source:
"""
${clampExcerpt(material.ai_excerpt ?? "", MAX_EXCERPT_CHARS)}
"""

The student's question:
${question}`,
      { accept: (raw) => raw.trim().length >= 20, maxTokens: 900 },
    );
    if (!result.text) return chainFailureResponse(result.failures, result.configured);

    return json({
      answer: result.text.trim(),
      // Returned so the UI can show what the answer came from. An answer whose
      // source a student cannot see is one they cannot check.
      source: { id: material.id, title: material.title },
      provider: result.provider,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
