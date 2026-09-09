/**
 * The student-facing AI: a progress summary, revision guidance after results,
 * and practice questions.
 *
 * These three share a function because they share the things that make a
 * student-facing feature different from a staff one, and those are worth
 * stating once:
 *
 *   Nothing is read from the request about who is asking. The student id comes
 *   from the caller's own token via the guard, and every query below is scoped
 *   to it. A request naming another student's attempt gets that student's data
 *   only if the token belongs to them.
 *
 *   Everything expensive is cached. A dashboard is refreshed far more often
 *   than a student's grades change, so the progress summary is written once a
 *   day and the result guidance once per attempt. Without that, a free tier
 *   shared by a cohort is spent on re-writing identical paragraphs.
 *
 *   The exam lock in the guard covers all of it. A student sitting an exam
 *   cannot reach any of these, including the practice questions — which would
 *   otherwise be a way to have the bank read to you mid-paper.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { line } from "../_shared/ai-text.ts";

/** How many questions one practice round serves. */
const PRACTICE_SIZE = 10;

const PROGRESS_RULES =
  `You are writing a short progress note for one student at Spirit Life School of Ministry, a Christian Bible school. They are reading it about themselves, on their own dashboard.

Rules:
- Two or three short sentences. British English, warm and direct, second person ("you").
- Use only the figures given. Never invent a mark, a deadline, a rank or a comparison with other students.
- Lead with what is actually true rather than with encouragement. If attendance has slipped, say so plainly and without scolding; if everything is in order, say that instead of manufacturing a concern.
- Name the one thing most worth doing next, only where the figures point at one.
- No greeting, no sign-off, no scripture, no exclamation marks.
- Never predict whether they will pass, graduate or be certificated. That is not yours to say.`;

const GUIDANCE_RULES =
  `You are writing revision guidance for one student at a Bible school, from the questions they got wrong in an exam they have just had marked.

Rules:
- British English, second person, warm and practical. At most 120 words.
- Group what they got wrong into topics and name those topics. The point is what to revise, not a list of mistakes.
- Use only the questions given. Never introduce doctrine, reading or terminology that is not in them.
- Do not restate their marks; they can already see those.
- Do not comment on their ability or effort. Address the material only.
- No greeting, no sign-off, no scripture.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  // Each action has its own switch and its own daily allowance, so a student
  // spending their practice budget still gets their progress summary.
  const feature = action === "progress"
    ? "ai_progress_summary"
    : action === "guidance"
      ? "ai_result_guidance"
      : "ai_practice_quizzes";

  // Practice reaches no model: questions come from the bank and are marked
  // against their stored key by `autograde`. It passes every other part of the
  // gate — including the exam lock — but does not spend a model allowance.
  const gate = await guard(req, {
    feature,
    audience: "student",
    countsQuota: !action.startsWith("practice"),
  });
  if (!gate.ok) return gate.response;
  const { service, studentId } = gate;

  try {
    // ------------------------------------------------------------- progress
    if (action === "progress") {
      const today = new Date().toISOString().slice(0, 10);
      const { data: cached } = await service
        .from("ai_summaries")
        .select("body, created_at")
        .eq("student_id", studentId)
        .eq("scope", "progress")
        .eq("scope_key", today)
        .maybeSingle();
      if (cached) return json({ body: (cached as { body: string }).body, cached: true });

      const [attendance, fees, attempts, assignments] = await Promise.all([
        service.from("attendance").select("status").eq("student_id", studentId).limit(500),
        service
          .from("fees")
          .select("amount_due, amount_paid, fee_type")
          .eq("student_id", studentId)
          .eq("waived", false),
        service
          .from("exam_attempts")
          .select("id, exam_id, submitted_at")
          .eq("student_id", studentId)
          .not("submitted_at", "is", null)
          .limit(50),
        service
          .from("assignment_submissions")
          .select("id, grade")
          .eq("student_id", studentId)
          .limit(200),
      ]);

      const facts: string[] = [];

      const marks = (attendance.data ?? []) as { status: string | null }[];
      if (marks.length) {
        const present = marks.filter((row) => /present|late/i.test(String(row.status ?? ""))).length;
        facts.push(line("Attendance", `${present} of ${marks.length} classes (${
          Math.round((present / marks.length) * 100)
        }%)`));
      }

      const feeRows = (fees.data ?? []) as { amount_due: number | null; amount_paid: number | null }[];
      const owing = feeRows
        .map((row) => Number(row.amount_due ?? 0) - Number(row.amount_paid ?? 0))
        .filter((balance) => balance > 0)
        .reduce((sum, balance) => sum + balance, 0);
      facts.push(
        line(
          "Fees",
          owing > 0
            ? `₦${Math.round(owing).toLocaleString("en-NG")} outstanding`
            : "nothing outstanding",
        ),
      );

      facts.push(line("Exams sat", (attempts.data ?? []).length));

      const submissions = (assignments.data ?? []) as { grade: number | null }[];
      const graded = submissions.filter((row) => row.grade !== null);
      facts.push(line("Tasks submitted", submissions.length));
      if (graded.length) {
        const average = graded.reduce((sum, row) => sum + Number(row.grade), 0) / graded.length;
        facts.push(line("Average task mark", `${Math.round(average)}%`));
      }

      const result = await runChain(
        service,
        `${PROGRESS_RULES}\n\nThe figures:\n${facts.filter(Boolean).join("")}`,
        { accept: (raw) => raw.trim().length >= 40, maxTokens: 400 },
      );
      if (!result.text) return chainFailureResponse(result.failures, result.configured);

      const summary = result.text.trim();
      await service.from("ai_summaries").upsert({
        student_id: studentId,
        scope: "progress",
        scope_key: today,
        body: summary,
        provider: result.provider,
        model: result.model,
      }, { onConflict: "student_id,scope,scope_key" });

      return json({ body: summary, cached: false, usage: gate.usage });
    }

    // ------------------------------------------------------------- guidance
    if (action === "guidance") {
      const attemptId = String(body?.attempt_id ?? "");

      // Scoped to this student, so an attempt id belonging to somebody else
      // simply is not found.
      const { data: attempt } = await service
        .from("exam_attempts")
        .select("id, exam_id")
        .eq("id", attemptId)
        .eq("student_id", studentId)
        .maybeSingle();
      const attemptRow = attempt as { id: string; exam_id: string } | null;
      if (!attemptRow) return json({ error: "That attempt is not yours." }, 404);

      const { data: exam } = await service
        .from("exams")
        .select("title, results_released")
        .eq("id", attemptRow.exam_id)
        .maybeSingle();
      const examRow = exam as { title: string; results_released: boolean } | null;
      // Before release a student has not been told their marks, and guidance
      // built on them would be telling them sideways.
      if (!examRow?.results_released) {
        return json({ error: "Results for this exam have not been released yet." }, 409);
      }

      const { data: cached } = await service
        .from("ai_summaries")
        .select("body")
        .eq("student_id", studentId)
        .eq("scope", "result")
        .eq("scope_key", attemptId)
        .maybeSingle();
      if (cached) return json({ body: (cached as { body: string }).body, cached: true });

      const { data: answers } = await service
        .from("exam_answers")
        .select("question_id, points_awarded, is_correct")
        .eq("attempt_id", attemptId);

      const wrong = ((answers ?? []) as {
        question_id: string;
        points_awarded: number | null;
        is_correct: boolean | null;
      }[]).filter((row) => row.is_correct === false || Number(row.points_awarded ?? 0) === 0);

      if (wrong.length === 0) {
        return json({
          body:
            "You answered everything on this paper correctly, so there is nothing here to revise.",
          cached: false,
        });
      }

      const { data: questions } = await service
        .from("question_bank")
        .select("question_text, explanation, tags")
        .in("id", wrong.map((row) => row.question_id));

      const missed = ((questions ?? []) as {
        question_text: string;
        explanation: string | null;
        tags: string[] | null;
      }[])
        .map((q, index) =>
          `${index + 1}. ${q.question_text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}${
            q.explanation ? `\n   Why the right answer is right: ${q.explanation}` : ""
          }${q.tags?.length ? `\n   Topic: ${q.tags.join(", ")}` : ""}`
        )
        .join("\n");

      const result = await runChain(
        service,
        `${GUIDANCE_RULES}\n\n${line("Exam", examRow.title)}\nThe questions they got wrong:\n${missed}`,
        { accept: (raw) => raw.trim().length >= 40, maxTokens: 600 },
      );
      if (!result.text) return chainFailureResponse(result.failures, result.configured);

      const guidance = result.text.trim();
      await service.from("ai_summaries").upsert({
        student_id: studentId,
        scope: "result",
        scope_key: attemptId,
        body: guidance,
        provider: result.provider,
        model: result.model,
      }, { onConflict: "student_id,scope,scope_key" });

      return json({ body: guidance, cached: false, usage: gate.usage });
    }

    // ------------------------------------------------------------- practice
    /**
     * Serves practice questions without their answers.
     *
     * `question_bank` is staff-only under RLS, and it stays that way — this is
     * why practice needs a function at all rather than a client query. The
     * answer key never leaves the server until the student has answered, which
     * is the difference between practising and reading the answers.
     */
    if (action === "practice_start") {
      const courseId = String(body?.course_id ?? "");
      if (!courseId) return json({ error: "Pick a course to practise." }, 400);

      // `practice_questions`, never `question_bank`. The bank holds the real
      // exam and test questions, and practice shows the correct answer after
      // every one — drawing from it would hand a student their own paper in
      // advance. The two pools are separate tables so that no filter here can
      // ever be the only thing standing between them.
      const { data: bank } = await service
        .from("practice_questions")
        .select("id, question_text, question_type, options, points")
        .eq("course_id", courseId)
        .eq("archived", false)
        .eq("status", "approved")
        .limit(200);

      const pool = (bank ?? []) as Record<string, unknown>[];
      if (pool.length === 0) {
        return json({
          error: "There are no practice questions for this course yet.",
        }, 404);
      }

      // Shuffled here rather than ordered randomly in SQL so the same pool can
      // be drawn from repeatedly without a scan of the whole table each time.
      const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, PRACTICE_SIZE);

      const { data: session, error } = await service
        .from("practice_sessions")
        .insert({
          student_id: studentId,
          course_id: courseId,
          question_ids: picked.map((q) => q.id),
        })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 400);

      return json({
        session_id: (session as { id: string }).id,
        questions: picked.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          points: q.points,
        })),
      });
    }

    /** Marks one practice answer and returns the truth about it. */
    if (action === "practice_answer") {
      const sessionId = String(body?.session_id ?? "");
      const questionId = String(body?.question_id ?? "");

      const { data: session } = await service
        .from("practice_sessions")
        .select("id, question_ids, answers")
        .eq("id", sessionId)
        .eq("student_id", studentId)
        .maybeSingle();
      const sessionRow = session as
        | { id: string; question_ids: unknown; answers: Record<string, unknown> }
        | null;
      if (!sessionRow) return json({ error: "That practice session is not yours." }, 404);

      // A question not served in this session cannot be asked about — otherwise
      // this would answer any question in the bank on request.
      const served = Array.isArray(sessionRow.question_ids)
        ? sessionRow.question_ids.map(String)
        : [];
      if (!served.includes(questionId)) {
        return json({ error: "That question is not part of this session." }, 400);
      }

      const { data: question } = await service
        .from("practice_questions")
        .select("id, question_type, correct_answer, explanation, points")
        .eq("id", questionId)
        .maybeSingle();
      if (!question) return json({ error: "That question is gone." }, 404);

      const { gradeAnswer } = await import("../_shared/autograde.ts");
      const graded = gradeAnswer(question as never, body?.answer);

      await service
        .from("practice_sessions")
        .update({
          answers: {
            ...sessionRow.answers,
            [questionId]: { answer: body?.answer ?? null, correct: graded.isCorrect },
          },
        })
        .eq("id", sessionId);

      return json({
        correct: graded.isCorrect,
        correct_answer: (question as { correct_answer: unknown }).correct_answer,
        explanation: (question as { explanation: string | null }).explanation,
      });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
