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
    const { data: attempts, error: attemptsError } = await supabase
      .from("exam_attempts")
      .select("id, student_id, score, manual_score_override, status")
      .eq("exam_id", exam_id)
      .eq("status", "submitted");

    if (attemptsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch attempts" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!attempts || attempts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, released: 0, message: "No submitted attempts found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For each attempt, create or update a grade record
    let releasedCount = 0;
    for (const attempt of attempts) {
      const finalScore = attempt.manual_score_override ?? attempt.score ?? 0;

      // Insert or update grade record
      // Assuming there's a grades table with: exam_id, student_id, score, released_at
      const { error: gradeError } = await supabase
        .from("grades")
        .upsert(
          {
            exam_id,
            student_id: attempt.student_id,
            score: finalScore,
            released_at: new Date().toISOString(),
            attempt_id: attempt.id,
          },
          { onConflict: "exam_id,student_id" },
        );

      if (!gradeError) {
        releasedCount++;
      } else {
        console.warn(`Failed to release grade for attempt ${attempt.id}:`, gradeError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, released: releasedCount }),
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
