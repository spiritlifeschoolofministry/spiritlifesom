import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

    const { exam_id, session_id, device_fingerprint } = await req.json();
    if (!exam_id || !session_id) {
      return new Response(JSON.stringify({ error: "Missing exam_id or session_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get exam and user's student record
    const [examRes, studentRes] = await Promise.all([
      supabase.from("exams").select("*").eq("id", exam_id).single(),
      supabase.from("students").select("id, profile_id").eq("profile_id", user.id).single(),
    ]);

    if (examRes.error || !examRes.data) {
      return new Response(JSON.stringify({ error: "Exam not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (studentRes.error || !studentRes.data) {
      return new Response(JSON.stringify({ error: "Student record not found" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const exam = examRes.data;
    const student = studentRes.data;

    // Check if student already has an active/submitted attempt
    const { data: existingAttempts } = await supabase
      .from("exam_attempts")
      .select("id, status")
      .eq("exam_id", exam_id)
      .eq("student_id", student.id);

    if (existingAttempts && existingAttempts.length > 0) {
      const active = existingAttempts.find((a: any) => a.status !== "submitted");
      if (active) {
        return new Response(
          JSON.stringify({ error: "You already have an active attempt at this exam" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Get question bank for the exam
    const { data: questions } = await supabase
      .from("question_bank")
      .select("id, options")
      .eq("exam_id", exam_id);

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Exam has no questions" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const questionIds = questions.map((q) => q.id);
    const shuffledQuestionIds = shuffle(questionIds);

    // Build option_orders: for each question, shuffle its options
    const optionOrders: Record<string, number[]> = {};
    for (const q of questions) {
      if (Array.isArray(q.options) && q.options.length > 0) {
        const indices = Array.from({ length: q.options.length }, (_, i) => i);
        optionOrders[q.id] = shuffle(indices);
      }
    }

    // Calculate server deadline
    const durationMinutes = exam.duration_minutes || 60;
    const serverDeadline = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    // Create exam attempt
    const { data: attempt, error: createError } = await supabase
      .from("exam_attempts")
      .insert({
        exam_id,
        student_id: student.id,
        question_order: shuffledQuestionIds,
        option_orders: optionOrders,
        server_deadline_at: serverDeadline,
        device_fingerprint,
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
        active_session_id: session_id,
      })
      .select()
      .single();

    if (createError || !attempt) {
      console.error("Create attempt error:", createError);
      return new Response(JSON.stringify({ error: "Failed to create exam attempt" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ attempt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("exam-start error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
