import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sweep-secret",
};

/**
 * Close sittings that ended without the student closing them.
 *
 * An exam is only finished when its attempt row says so. Until then it shows as
 * in progress on the monitor, has no score, and is skipped when results are
 * released — and, worse, it is resumable. The student's own browser normally
 * closes the attempt, but it cannot be relied on to: it is submitting at the
 * exact moment it is least likely to succeed (a paper being auto-submitted for
 * cheating, a laptop lid going down, a network dropping), and for a while a
 * database constraint rejected the write outright. Whatever the cause, nobody
 * was left to finish the job, so an abandoned attempt sat open for good.
 *
 * This endpoint is that missing sweep. Two ways in:
 *   - a sweep, for one exam or all of them, over attempts that are past saving
 *   - one named attempt, when a lecturer closes it by hand from the monitor
 *
 * A sweep only touches attempts that can no longer legitimately be resumed:
 * the exam clock has run out, or the proctoring counters already show the
 * student was over a limit. A student whose browser crashed mid-paper is left
 * alone so they can carry on, which is the whole point of resuming.
 *
 * The closing itself is left to exam-submit, called with the service key. The
 * marking, the score and the closing write then happen in exactly one place, so
 * a paper is filed identically whether the student submitted it or nobody did.
 */

type Eligible = {
  id: string;
  server_deadline_at: string;
  last_heartbeat_at: string | null;
  tab_switch_count: number | null;
  fullscreen_exits: number | null;
  exam_id: string;
};

/** When the sitting really ended — not when this sweep happened to run. */
function endedAt(a: Eligible): string {
  const deadline = new Date(a.server_deadline_at).getTime();
  const heartbeat = a.last_heartbeat_at ? new Date(a.last_heartbeat_at).getTime() : 0;
  const ended = heartbeat > 0 ? Math.min(heartbeat, deadline) : deadline;
  return new Date(Math.min(ended, Date.now())).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { exam_id, attempt_id } = body as { exam_id?: string; attempt_id?: string };

    // Naming an exam or an attempt is a staff action, so it needs a staff token.
    // The unfiltered sweep does not: it takes no instruction from the caller and
    // only ever does what the rules already say should have happened — closing
    // papers whose time is up. That is what lets pg_cron call it on a schedule
    // without a secret of its own sitting in a migration file. Set SWEEP_SECRET
    // on the function to require one anyway.
    const targeted = !!exam_id || !!attempt_id;
    const authHeader = req.headers.get("Authorization");

    if (targeted) {
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
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["admin", "teacher"].includes(profile.role)) {
        return new Response(JSON.stringify({ error: "Staff only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      const expectedSecret = Deno.env.get("SWEEP_SECRET");
      if (expectedSecret && req.headers.get("x-sweep-secret") !== expectedSecret) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    let query = admin
      .from("exam_attempts")
      .select("id, exam_id, server_deadline_at, last_heartbeat_at, tab_switch_count, fullscreen_exits")
      .is("submitted_at", null)
      .eq("status", "in_progress");

    if (attempt_id) query = query.eq("id", attempt_id);
    else if (exam_id) query = query.eq("exam_id", exam_id);

    const { data: open, error: openError } = await query;
    if (openError) {
      console.error("Load open attempts error:", openError);
      return new Response(JSON.stringify({ error: openError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const attempts = (open ?? []) as Eligible[];
    if (attempts.length === 0) {
      return new Response(JSON.stringify({ closed: 0, attempts: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // The limits live on the exam, so fetch each exam once.
    const examIds = [...new Set(attempts.map((a) => a.exam_id))];
    const { data: exams } = await admin
      .from("exams")
      .select("id, max_tab_switches, max_fullscreen_exits, enforce_fullscreen")
      .in("id", examIds);
    // deno-lint-ignore no-explicit-any
    const examById = new Map((exams ?? []).map((e: any) => [e.id, e]));

    const now = Date.now();
    const closed: { attempt_id: string; reason: string; score: number; status: string }[] = [];
    const failed: { attempt_id: string; error: string }[] = [];

    for (const a of attempts) {
      // deno-lint-ignore no-explicit-any
      const exam = examById.get(a.exam_id) as any;
      const expired = new Date(a.server_deadline_at).getTime() <= now;
      const tabLimit = Number(exam?.max_tab_switches ?? 0);
      const fsLimit = Number(exam?.max_fullscreen_exits ?? 0);
      const overTabs = tabLimit > 0 && (a.tab_switch_count ?? 0) >= tabLimit;
      const overFullscreen = !!exam?.enforce_fullscreen && fsLimit > 0 && (a.fullscreen_exits ?? 0) >= fsLimit;

      // A named attempt is closed because a lecturer said so. A sweep has to
      // justify itself: only papers whose time is up, or whose student was
      // already over a limit, are finished off behind their back.
      const reason = attempt_id
        ? "admin"
        : overTabs
        ? "tab_switch_exceeded"
        : overFullscreen
        ? "fullscreen_exceeded"
        : expired
        ? "timeout"
        : null;

      if (!reason) continue;

      try {
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/exam-submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            attempt_id: a.id,
            reason,
            // A hand-closed attempt is closed now; a swept one ended when the
            // student's browser last spoke, or when their clock ran out.
            submitted_at: reason === "admin" ? new Date().toISOString() : endedAt(a),
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result?.success) {
          throw new Error(result?.error ?? `exam-submit returned ${res.status}`);
        }
        closed.push({ attempt_id: a.id, reason, score: result.score ?? 0, status: result.status ?? "submitted" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Close attempt failed:", a.id, message);
        failed.push({ attempt_id: a.id, error: message });
      }
    }

    return new Response(
      JSON.stringify({ closed: closed.length, attempts: closed, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("exam-close-attempts error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
