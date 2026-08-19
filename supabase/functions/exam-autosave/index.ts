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

    const { attempt_id, session_id, answers, event } = await req.json();
    if (!attempt_id || !session_id || !Array.isArray(answers)) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get the attempt to verify ownership and check status
    const { data: attempt, error: attemptError } = await supabase
      .from("exam_attempts")
      // fullscreen_exits and suspicious_events are read below to build their
      // next value. They were missing from this list, so both came back
      // undefined: the exit counter reset to 1 every time, and each new
      // suspicious event overwrote the whole log instead of appending to it.
      .select("id, exam_id, student_id, submitted_at, server_deadline_at, active_session_id, tab_switch_count, status, fullscreen_exits, suspicious_events")
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
        JSON.stringify({ error: "Exam already submitted", expired: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if deadline passed
    const now = new Date();
    const deadline = new Date(attempt.server_deadline_at);
    if (now > deadline) {
      return new Response(
        JSON.stringify({ error: "Exam time expired", expired: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check session conflict
    if (attempt.active_session_id && attempt.active_session_id !== session_id) {
      return new Response(
        JSON.stringify({ error: "Another session has taken over", session_conflict: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Save/update answers.
    //
    // Write failures are reported, not swallowed. This loop used to ignore its
    // errors, so a rejected write looked identical to a successful one and the
    // runner would clear the answer as saved — the student loses work and
    // nobody finds out until the paper is marked.
    for (const ans of answers) {
      if (!ans.question_id) continue;
      const { error: saveError } = await supabase
        .from("exam_answers")
        .upsert({
          attempt_id,
          question_id: ans.question_id,
          answer: ans.answer,
          time_spent_seconds: ans.time_spent_seconds || 0,
          autosaved_at: new Date().toISOString(),
        }, { onConflict: "attempt_id,question_id" });

      if (saveError) {
        console.error("Autosave write error:", saveError, { attempt_id, question_id: ans.question_id });
        return new Response(
          JSON.stringify({ error: "Your answer could not be saved. Check your connection." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Log event if provided
    let limitExceeded: { reason: string; message: string } | null = null;

    if (event && event.type) {
      const eventData = {
        type: event.type,
        ...event.data,
      };

      const updates: Record<string, unknown> = { last_heartbeat_at: new Date().toISOString() };

      // Counted here, from the stored value, rather than taking the client's
      // number. A tab that reloads starts its own tally from whatever it last
      // read, so trusting event.data.count let a student rewind the counter by
      // reopening the paper.
      let tabSwitches = attempt.tab_switch_count || 0;
      let fullscreenExits = attempt.fullscreen_exits || 0;

      if (event.type === "tab_switch") {
        tabSwitches += 1;
        updates.tab_switch_count = tabSwitches;
      }
      if (event.type === "fullscreen_exit") {
        fullscreenExits += 1;
        updates.fullscreen_exits = fullscreenExits;
      }

      const suspiciousEvents = attempt.suspicious_events || [];
      if (["tab_switch", "fullscreen_exit"].includes(event.type)) {
        suspiciousEvents.push({ type: event.type, timestamp: new Date().toISOString(), ...event.data });
      }
      updates.suspicious_events = suspiciousEvents;

      const { error: eventUpdateError } = await supabase
        .from("exam_attempts")
        .update(updates)
        .eq("id", attempt_id);
      if (eventUpdateError) console.error("Event update error:", eventUpdateError, { attempt_id, type: event.type });

      // Log to exam_events table
      await supabase.from("exam_events").insert({
        attempt_id,
        event_type: event.type,
        event_data: eventData,
      });

      // Tell the runner when a limit has gone, so the decision to end the
      // sitting is made against the stored counters rather than a tab's own
      // idea of how many times it has been left.
      if (["tab_switch", "fullscreen_exit"].includes(event.type)) {
        const { data: exam } = await supabase
          .from("exams")
          .select("max_tab_switches, max_fullscreen_exits, enforce_fullscreen")
          .eq("id", attempt.exam_id)
          .maybeSingle();

        const tabLimit = Number(exam?.max_tab_switches ?? 0);
        const fsLimit = Number(exam?.max_fullscreen_exits ?? 0);

        if (tabLimit > 0 && tabSwitches >= tabLimit) {
          limitExceeded = { reason: "tab_switch_exceeded", message: "Tab switch limit exceeded" };
        } else if (exam?.enforce_fullscreen && fsLimit > 0 && fullscreenExits >= fsLimit) {
          limitExceeded = { reason: "fullscreen_exceeded", message: "Fullscreen exit limit exceeded" };
        }
      }
    } else {
      // Just update heartbeat
      await supabase
        .from("exam_attempts")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", attempt_id);
    }

    return new Response(
      JSON.stringify({ success: true, limit_exceeded: limitExceeded }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("exam-autosave error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
