import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "teacher"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Unauthorized: only teachers and admins can release results" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { exam_id } = await req.json();
    if (!exam_id) {
      return new Response(JSON.stringify({ error: "Missing exam_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get all submitted attempts with student info
    const [{ data: allAttempts, error: attemptsError }, { data: previewRows }] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("id, student_id, score, manual_score_override, status")
        .eq("exam_id", exam_id)
        .eq("status", "submitted"),
      supabase.from("students").select("id").eq("is_staff_preview", true),
    ]);

    if (attemptsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch attempts" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // A staff rehearsal is a real attempt row; releasing it would publish a
    // score for an account that never sat the exam as a candidate.
    const previewIds = new Set((previewRows ?? []).map((r: { id: string }) => r.id));
    const attempts = (allAttempts ?? []).filter((a: { student_id: string }) => !previewIds.has(a.student_id));

    // Note there is no early return when the count is zero. Releasing is a
    // property of the exam, not of who happens to have sat it, and an exam so
    // far sat only as a rehearsal still has to show its result to the account
    // that sat it.

    // Flip the flag the student portal actually reads.
    //
    // This function used to count the attempts and return, without writing
    // anything — exams.results_released stayed false, so "Released to N
    // students" was reported while every student still saw nothing.
    const releasedCount = attempts.length;

    const { error: releaseError } = await supabase
      .from("exams")
      .update({ results_released: true })
      .eq("id", exam_id);

    if (releaseError) {
      console.error("Release flag error:", releaseError);
      return new Response(JSON.stringify({ error: "Failed to release results" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({
        success: true,
        released: releasedCount,
        message: `Released results for ${releasedCount} student(s). Scores are now finalized.`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("exam-release-results error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
