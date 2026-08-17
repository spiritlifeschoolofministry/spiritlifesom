import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gradeAnswer } from "../_shared/autograde.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_REASONS = ["manual", "timeout", "tab_switches", "fullscreen_exit", "admin", "disconnect"];

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { attempt_id, reason } = await req.json();
    if (!attempt_id) {
      return new Response(JSON.stringify({ error: "Missing attempt_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const validReason = VALID_REASONS.includes(reason) ? reason : "manual";

    // Get the attempt
    const { data: attempt, error: attemptError } = await supabase
      .from("exam_attempts")
      .select("id, student_id, submitted_at, exam_id, question_order")
      .eq("id", attempt_id)
      .single();

    if (attemptError || !attempt) {
      return new Response(JSON.stringify({ error: "Attempt not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get student to verify ownership
    const { data: student } = await supabase
      .from("students")
      .select("id, profile_id")
      .eq("profile_id", user.id)
      .single();

    if (!student || student.id !== attempt.student_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if already submitted
    if (attempt.submitted_at) {
      return new Response(
        JSON.stringify({ error: "Exam already submitted" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date();
    const isAutoSubmit = validReason !== "manual";

    // Get all answers for this attempt
    const { data: answers } = await supabase
      .from("exam_answers")
      .select("id, question_id, answer, points_awarded")
      .eq("attempt_id", attempt_id);

    // Mark every objective question now, so a lecturer only opens the paper for
    // the ones that need judgement.
    //
    // Service role, because the answer key lives in question_bank, which is
    // staff-only under RLS — the student's own token cannot read it, and it must
    // stay that way. Ownership of this attempt was verified above.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!,
    );

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

    const questionById = new Map((questions ?? []).map((q) => [q.id, q]));
    const answerByQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]));

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

    // Mark as submitted
    const { error: updateError } = await supabase
      .from("exam_attempts")
      .update({
        submitted_at: now.toISOString(),
        submission_reason: validReason,
        auto_submitted: isAutoSubmit,
        // Nothing left for a person to mark means this is finished, not pending.
        status: awaitingManual ? "submitted" : "graded",
        graded_at: awaitingManual ? null : now.toISOString(),
        score: totalScore,
      })
      .eq("id", attempt_id);

    if (updateError) {
      console.error("Submit error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to submit exam" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ success: true, submitted_at: now.toISOString() }),
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
