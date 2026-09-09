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
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { line } from "../_shared/ai-text.ts";
import { standingOf, tallyAttendance } from "../_shared/attendance.ts";

/**
 * How many questions one practice round serves, when nobody has set otherwise.
 *
 * Read from `ai_practice_round_size` at the start of each round rather than
 * fixed here, because the right number depends on how full the course's pool
 * is — ten drawn from a pool of ten is the same round every time. Clamped
 * server-side: this decides how much of the pool one round reveals, so it is
 * not something a client gets to choose.
 */
const PRACTICE_SIZE_DEFAULT = 10;
const PRACTICE_SIZE_MIN = 3;
const PRACTICE_SIZE_MAX = 30;

const practiceRoundSize = async (service: SupabaseClient): Promise<number> => {
  const { data } = await service
    .from("system_settings")
    .select("value")
    .eq("key", "ai_practice_round_size")
    .maybeSingle();

  // jsonb, so this arrives as a real number, or as a string from anything that
  // wrote it through JSON.stringify. Both shapes are in this table already.
  const raw = (data as { value?: unknown } | null)?.value;
  const parsed = Number(String(raw ?? "").trim().replace(/^"(.*)"$/, "$1"));
  if (!Number.isFinite(parsed) || parsed <= 0) return PRACTICE_SIZE_DEFAULT;
  return Math.min(PRACTICE_SIZE_MAX, Math.max(PRACTICE_SIZE_MIN, Math.floor(parsed)));
};

const PROGRESS_RULES =
  `You are writing a short progress note for one student at Spirit Life School of Ministry, a Christian Bible school. They are reading it about themselves, on their own dashboard.

Rules:
- Three or four short sentences, at most 90 words. British English, warm and direct, second person ("you").
- Use only the figures given. Never invent a mark, a deadline, a rank or a comparison with other students.
- Lead with what is actually true rather than with encouragement. If everything is in order, say that instead of manufacturing a concern.
- No greeting, no sign-off, no scripture, no exclamation marks.
- Never predict whether they will pass, graduate or be certificated. That is not yours to say.

Attendance:
- Always say where their attendance stands, in one sentence, using the figure given. It is the thing a student can still change, so it is never the part you leave out.
- The standing is given to you. Where it is "slipping" or "serious", warn them plainly: say the figure is below where it should be, and give the consequence concretely — the classes they missed were teaching, and their exams are set from what is taught, so there is material they have not been taught yet. Say that plainly, in those terms.
- Never write that attendance "puts at risk", "jeopardises" or "threatens" anything. Those are abstractions, and a student cannot act on an abstraction. Name the actual thing: classes missed, teaching not received, material not covered. Do not scold, do not moralise, and do not soften it into a compliment.
- Where it is "serious", say plainly that it needs attention now.
- Where it is "good", say so briefly and move on. Do not manufacture a concern from good attendance, and do not warn about lateness unless the late figure given is genuinely high.
- Where it is "unknown", say that no classes have been counted yet and leave it there. Never guess a figure.
- Follow any warning with one concrete recommendation drawn from the figures — attending the next counted class, speaking to the school office about absences, or catching up on the material for classes missed. One recommendation, not a list.`;

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

      // The student's cohort, because attendance is measured against the
      // classes that cohort held rather than against the rows this student has.
      const { data: whoRow } = await service
        .from("students")
        .select("cohort_id")
        .eq("id", studentId)
        .maybeSingle();
      const cohortId = (whoRow as { cohort_id?: string | null } | null)?.cohort_id ?? null;

      const [attendance, sessions, fees, attempts, assignments] = await Promise.all([
        service
          .from("attendance")
          .select("status, schedule_id, is_verified")
          .eq("student_id", studentId)
          .limit(1000),
        cohortId
          ? service
            .from("schedule")
            .select("id")
            .eq("cohort_id", cohortId)
            .eq("counts_for_attendance", true)
            .lte("date", new Date().toISOString().slice(0, 10))
          : Promise.resolve({ data: [] as { id: string }[] }),
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

      /**
       * Attendance, counted the way the student's own attendance page counts it.
       *
       * This used to count the rows this student had, which scores everybody at
       * or near 100% — an absence is a missing row, not a row saying "absent".
       * A student could be told they had perfect attendance by this paragraph
       * and 40% by the page one click away.
       */
      const tally = tallyAttendance(
        new Set(((sessions.data ?? []) as { id: string }[]).map((row) => row.id)),
        (attendance.data ?? []) as {
          status: string | null;
          schedule_id: string | null;
          is_verified: boolean | null;
        }[],
      );
      const standing = standingOf(tally.rate);

      if (tally.total > 0) {
        facts.push(line(
          "Attendance",
          `${tally.present + tally.late} of ${tally.total} classes held (${tally.rate}%)`,
        ));
        facts.push(line("Classes missed", tally.absent));
        if (tally.late > 0) facts.push(line("Arrived late", tally.late));
      }
      // Named rather than left for the model to judge from the percentage, so
      // the warning fires on the school's own threshold every time instead of
      // on whatever the model considers low today.
      facts.push(line("Attendance standing", standing));

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

      /**
       * A fresh draw every round.
       *
       * Shuffled here rather than ordered randomly in SQL so the same pool can
       * be drawn from repeatedly without a scan of the whole table each time.
       *
       * Fisher-Yates, not `sort(() => Math.random() - 0.5)`. That idiom is not
       * a shuffle: the comparator is inconsistent, so the result depends on the
       * sort implementation and leaves items near where they started. On a pool
       * of twelve questions and a round of ten it would keep serving much the
       * same ten in much the same order, which is the opposite of the point.
       */
      const picked = [...pool];
      for (let i = picked.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [picked[i], picked[j]] = [picked[j], picked[i]];
      }
      picked.length = Math.min(picked.length, await practiceRoundSize(service));

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
