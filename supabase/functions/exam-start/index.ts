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
      .select("id, status, device_fingerprint")
      .eq("exam_id", exam_id)
      .eq("student_id", student.id);

    const activeAttempt = existingAttempts?.find((a: any) => a.status !== "submitted");
    const submittedAttempt = existingAttempts?.find((a: any) => a.status === "submitted");

    // Resume, rather than refuse.
    //
    // The runner calls this endpoint on every mount, including when the student
    // taps Resume, so answering an unfinished attempt with 409 made a crashed
    // browser unrecoverable — the rules promise a resume and the list offers the
    // button, but both dead-ended here. Hand back the attempt already in flight:
    // its question order, option order and server deadline are the ones this
    // student was working to, and the runner reloads saved answers from
    // exam_answers.
    //
    // The session id has to move to this tab or exam-autosave, which rejects a
    // mismatched session, would refuse every save from the resumed sitting.
    if (activeAttempt) {
      // One device per sitting. A fresh tab or a browser restart on the same
      // machine still resumes, because the fingerprint is unchanged; a second
      // device cannot pick the paper up mid-flight.
      if (
        activeAttempt.device_fingerprint &&
        device_fingerprint &&
        activeAttempt.device_fingerprint !== device_fingerprint
      ) {
        return new Response(
          JSON.stringify({
            error: "This exam was started on another device. Continue on that device, or ask your lecturer to reset your attempt.",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: resumed, error: resumeError } = await supabase
        .from("exam_attempts")
        .update({
          active_session_id: session_id,
          device_fingerprint,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", activeAttempt.id)
        .select()
        .single();

      if (resumeError || !resumed) {
        console.error("Resume attempt error:", resumeError);
        return new Response(JSON.stringify({ error: "Failed to resume your exam attempt" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(
        JSON.stringify({ attempt: resumed, resumed: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // One sitting each — the rules page says so, and without this a student
    // could submit and immediately sit the paper again for a second score.
    // Staff rehearsals are exempt so a dry run can be repeated.
    if (submittedAttempt && !student.is_staff_preview) {
      return new Response(
        JSON.stringify({ error: "You have already submitted this exam" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    // Entry window.
    //
    // The exam's own window is authoritative here, not just in the lobby: a
    // request can arrive straight from the runner. late_entry_cutoff_minutes
    // was stored and never read, so a student could stroll in at any point
    // before the exam closed.
    const nowMs = Date.now();
    const startMs = new Date(exam.start_at).getTime();
    const endMs = new Date(exam.end_at).getTime();

    if (nowMs < startMs) {
      return new Response(JSON.stringify({ error: "This exam has not opened yet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (nowMs > endMs) {
      return new Response(JSON.stringify({ error: "This exam has closed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (exam.allow_late_entry === false && nowMs > startMs) {
      return new Response(JSON.stringify({ error: "Late entry is not allowed for this exam" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cutoff = Number(exam.late_entry_cutoff_minutes) || 0;
    if (exam.allow_late_entry && cutoff > 0 && nowMs > startMs + cutoff * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: `Entry closed ${cutoff} minutes after the exam opened` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Calculate server deadline, capped at the exam's closing time.
    //
    // Uncapped, starting a 60-minute paper 10 minutes before the window shuts
    // handed out the full hour and let the sitting run well past the close.
    const durationMinutes = exam.duration_minutes || 60;
    const serverDeadline = new Date(
      Math.min(nowMs + durationMinutes * 60 * 1000, endMs),
    ).toISOString();

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
