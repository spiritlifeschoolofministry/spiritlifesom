import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      .select("id, student_id, submitted_at, exam_id")
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
      .select("question_id, answer, points_awarded")
      .eq("attempt_id", attempt_id);

    // Calculate score: sum of points_awarded (if manually graded) or auto-score if supported
    let totalScore = 0;
    if (answers) {
      for (const ans of answers) {
        // If points_awarded is set (manual grading), use it
        if (ans.points_awarded !== null) {
          totalScore += Number(ans.points_awarded) || 0;
        }
        // Otherwise, scoring happens during admin grading or auto-calculation
      }
    }

    // Mark as submitted
    const { error: updateError } = await supabase
      .from("exam_attempts")
      .update({
        submitted_at: now.toISOString(),
        submission_reason: validReason,
        auto_submitted: isAutoSubmit,
        status: "submitted",
        score: totalScore || null,
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
