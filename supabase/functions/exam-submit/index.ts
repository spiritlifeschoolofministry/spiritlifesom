import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gradeAnswer, type Question } from "../_shared/autograde.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Must match what the runner actually sends AND the submission_reason CHECK
// constraint on exam_attempts. "tab_switch_exceeded" used to be missing here,
// so an exam auto-submitted for tab switching was filed as a manual
// submission — the record showed a student choosing to finish when they had
// been cut off. It was then added here but not to the constraint, which was
// worse: Postgres rejected the whole update, this function answered 500, and
// the attempt stayed in_progress for the student to resume. Keep the two lists
// in step.
const VALID_REASONS = [
  "manual",
  "timeout",
  "tab_switches",
  "tab_switch_exceeded",
  "fullscreen_exit",
  "fullscreen_exceeded",
  "camera_blocked",
  "microphone_blocked",
  "admin",
  "disconnect",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Service role, because the answer key lives in question_bank, which is
    // staff-only under RLS — a student's own token cannot read it, and it must
    // stay that way.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Two callers, one closing routine.
    //
    // A student submits their own paper. exam-close-attempts finishes off
    // sittings nobody came back to, and it presents the service key rather than
    // a student's token — the marking, the score and the closing write have to
    // be identical whichever route ends the exam, so both come through here
    // instead of a second copy of this logic living elsewhere.
    const isTrustedCaller = authHeader.replace(/^Bearer\s+/i, "").trim() === serviceKey;

    let authedUserId: string | null = null;
    if (!isTrustedCaller) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      authedUserId = user.id;
    }

    const { attempt_id, reason, submitted_at } = await req.json();
    if (!attempt_id) {
      return new Response(JSON.stringify({ error: "Missing attempt_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const validReason = VALID_REASONS.includes(reason) ? reason : "manual";

    // Read through the service role so the trusted path does not depend on the
    // caller having row access of their own.
    const { data: attempt, error: attemptError } = await admin
      .from("exam_attempts")
      .select("id, student_id, submitted_at, exam_id, question_order")
      .eq("id", attempt_id)
      .single();

    if (attemptError || !attempt) {
      return new Response(JSON.stringify({ error: "Attempt not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (authedUserId) {
      // Get student to verify ownership
      const { data: student } = await supabase
        .from("students")
        .select("id, profile_id")
        .eq("profile_id", authedUserId)
        .single();

      if (!student || student.id !== attempt.student_id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Check if already submitted
    if (attempt.submitted_at) {
      return new Response(
        JSON.stringify({ error: "Exam already submitted" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // A swept attempt ended when its student's browser last spoke, not when the
    // sweep happened to run. Only a trusted caller may say so.
    const closedAt = isTrustedCaller && typeof submitted_at === "string" && !isNaN(Date.parse(submitted_at))
      ? new Date(submitted_at).toISOString()
      : new Date().toISOString();
    const isAutoSubmit = validReason !== "manual";

    // Get all answers for this attempt
    const { data: answers } = await admin
      .from("exam_answers")
      .select("id, question_id, answer, points_awarded")
      .eq("attempt_id", attempt_id);

    // Mark every objective question now, so a lecturer only opens the paper for
    // the ones that need judgement.
    //
    // Walk the questions this attempt was served, not the rows the student
    // saved. A question left blank has no exam_answers row, so scoring off the
    // saved rows skipped it entirely — an unanswered essay then looked like
    // "nothing to mark" and the attempt filed itself as graded before anyone
    // had read it.
    const servedIds: string[] = Array.isArray(attempt.question_order)
      ? (attempt.question_order as string[])
      : (answers ?? []).map((a) => a.question_id);

    const { data: questions } = servedIds.length
      ? await admin
          .from("question_bank")
          .select("id, question_type, correct_answer, points")
          .in("id", servedIds)
      : { data: [] };

    // Shapes of the two selects above; the edge client carries no generated
    // Database types, so these arrive untyped.
    type AnswerRow = {
      id: string;
      question_id: string;
      answer: unknown;
      points_awarded: number | null;
    };

    const questionById = new Map<string, Question>(
      (questions ?? []).map((q: Question) => [q.id, q]),
    );
    const answerByQuestion = new Map<string, AnswerRow>(
      (answers ?? []).map((a: AnswerRow) => [a.question_id, a]),
    );

    let totalScore = 0;
    let awaitingManual = false;

    for (const questionId of servedIds) {
      const question = questionById.get(questionId);
      if (!question) continue;
      const ans = answerByQuestion.get(questionId);
      const value = ans?.answer ?? null;
      const blank = value === null || value === undefined || value === "";
      const graded = gradeAnswer(question, value);

      if (graded.needsManual) {
        if (ans && ans.points_awarded !== null) {
          // A mark already entered by hand stands.
          totalScore += Number(ans.points_awarded) || 0;
        } else if (blank) {
          // Nothing written is nothing to read: score it zero rather than
          // sending a lecturer to look at an empty box.
          if (ans) {
            await admin
              .from("exam_answers")
              .update({ points_awarded: 0, is_correct: false })
              .eq("id", ans.id);
          } else {
            await admin.from("exam_answers").insert({
              attempt_id,
              question_id: questionId,
              answer: null,
              points_awarded: 0,
              is_correct: false,
            });
          }
        } else {
          awaitingManual = true;
        }
        continue;
      }

      totalScore += graded.pointsAwarded ?? 0;
      if (ans) {
        const { error: markError } = await admin
          .from("exam_answers")
          .update({ points_awarded: graded.pointsAwarded, is_correct: graded.isCorrect })
          .eq("id", ans.id);
        if (markError) console.error("Auto-grade write error:", markError);
      } else {
        // Record the zero so the marking screen and the student's breakdown
        // both show the question rather than silently omitting it.
        const { error: insertError } = await admin.from("exam_answers").insert({
          attempt_id,
          question_id: questionId,
          answer: null,
          points_awarded: graded.pointsAwarded,
          is_correct: graded.isCorrect,
        });
        if (insertError) console.error("Auto-grade insert error:", insertError);
      }
    }

    // Mark as submitted.
    //
    // Closing the attempt is the part that must not fail: while submitted_at is
    // null the paper is resumable, so a failed write here hands a student who
    // was cut off for cheating their exam straight back. Written with the
    // service role for that reason, and the real error is reported rather than a
    // generic one — a rejected write here was invisible for a long time.
    const status = awaitingManual ? "submitted" : "graded";
    const { error: updateError } = await admin
      .from("exam_attempts")
      .update({
        submitted_at: closedAt,
        submission_reason: validReason,
        auto_submitted: isAutoSubmit,
        // Nothing left for a person to mark means this is finished, not pending.
        status,
        graded_at: awaitingManual ? null : closedAt,
        score: totalScore,
      })
      .eq("id", attempt_id);

    if (updateError) {
      console.error("Submit error:", updateError);
      return new Response(
        JSON.stringify({ error: `Failed to submit exam: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, submitted_at: closedAt, status, score: totalScore }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("exam-submit error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
