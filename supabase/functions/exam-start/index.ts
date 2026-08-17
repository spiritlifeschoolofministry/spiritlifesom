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
      supabase.from("students").select("id, profile_id, is_staff_preview").eq("profile_id", user.id).single(),
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
        // A staff rehearsal is throwaway, and it is hidden from the monitor, so
        // a half-finished one would lock the admin out of their own dry run with
        // nothing on screen to clear. Discard it and start clean. Answers,
        // events and snapshots cascade with the attempt.
        if (student.is_staff_preview) {
          const { error: discardError } = await supabase
            .from("exam_attempts")
            .delete()
            .eq("id", active.id);
          if (discardError) {
            console.error("Discard rehearsal attempt error:", discardError);
            return new Response(
              JSON.stringify({ error: "Could not clear the previous rehearsal attempt" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        } else {
          return new Response(
            JSON.stringify({ error: "You already have an active attempt at this exam" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Questions hang off an exam through exam_questions — question_bank has no
    // exam_id of its own. Querying it by exam_id failed at the schema level, and
    // because the error was dropped it surfaced as "Exam has no questions",
    // which is why no attempt had ever been created.
    const { data: links, error: linksError } = await supabase
      .from("exam_questions")
      .select("question_id, display_order")
      .eq("exam_id", exam_id)
      .order("display_order", { ascending: true });

    if (linksError) {
      console.error("Load exam questions error:", linksError);
      return new Response(JSON.stringify({ error: "Failed to load exam questions" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const linkedIds = (links ?? []).map((l) => l.question_id).filter(Boolean);
    if (linkedIds.length === 0) {
      return new Response(JSON.stringify({ error: "Exam has no questions" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: questions, error: questionsError } = await supabase
      .from("question_bank")
      .select("id, options")
      .in("id", linkedIds);

    if (questionsError) {
      console.error("Load question bank error:", questionsError);
      return new Response(JSON.stringify({ error: "Failed to load exam questions" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Exam has no questions" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Honour the builder's toggles rather than always shuffling. linkedIds is
    // already in display_order, so the un-randomised path is the order the
    // teacher set.
    const byId = new Map(questions.map((q) => [q.id, q]));
    let questionIds = linkedIds.filter((qid) => byId.has(qid));
    if (exam.randomize_questions) {
      questionIds = shuffle(questionIds);
    }

    const perAttempt = exam.questions_per_attempt;
    if (perAttempt && perAttempt > 0 && perAttempt < questionIds.length) {
      questionIds = questionIds.slice(0, perAttempt);
    }

    // Build option_orders: for each question, shuffle its options
    const optionOrders: Record<string, number[]> = {};
    if (exam.randomize_options) {
      for (const qid of questionIds) {
        const q = byId.get(qid);
        if (Array.isArray(q?.options) && q.options.length > 0) {
          const indices = Array.from({ length: q.options.length }, (_, i) => i);
          optionOrders[qid] = shuffle(indices);
        }
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
        question_order: questionIds,
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
