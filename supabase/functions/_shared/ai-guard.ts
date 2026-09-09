/**
 * The one gate every AI function passes through.
 *
 * The provider chain is portable; this file is not. A media library's AI is
 * called by a handful of staff, so a key check and a rate limit are the whole
 * story. A school's AI is called by every student, which adds three concerns
 * that have nothing to do with models:
 *
 *   1. A free tier shared by a whole cohort needs a per-user daily cap, not a
 *      per-IP burst limit — one student in a study session would otherwise
 *      spend the school's allowance before the rest woke up.
 *   2. Every feature must be switchable off without a deploy, because the
 *      thing you want when a model starts saying something odd on a ministry
 *      site is an off switch.
 *   3. **No AI is reachable while an exam is open.** Without that, a study
 *      assistant is a cheating tool, and every other feature is a side door
 *      into the same thing.
 *
 * Nothing here trusts the client. The feature name, the role and the exam
 * state are all read server-side from the caller's own token.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Who may call a feature at all.
 *
 * "any" is for a feature both portals share — the chatbox is the only one so
 * far. It is deliberately not the default and deliberately not a way to skip
 * the gate: the switch, the exam lock and the quota all still apply, and a
 * function using it must decide for itself what the caller's role entitles
 * them to see. "admin" and "student" stay the right answer everywhere else,
 * because they fail closed and this one cannot.
 */
export type Audience = "admin" | "student" | "any";

export interface GuardSpec {
  /**
   * The `system_settings` key switching this feature, and the `ai_usage`
   * feature name the cap is counted against. One name for both, so a screen
   * showing "12 of 20 used" and the switch that turns it off cannot disagree.
   */
  feature: string;
  audience: Audience;
  /**
   * Whether an open exam attempt blocks the call. True for everything a
   * student can reach, and for admin features too — an admin marking essays
   * mid-exam is not a thing that needs to work, and a blanket rule has no gaps
   * to find.
   */
  examLock?: boolean;
  /**
   * Whether this call spends a day's allowance.
   *
   * False for work that reaches no model — serving a practice question and
   * marking it against its stored key is pure database work, and charging it
   * against the same budget as a generated paragraph would let ten practice
   * answers exhaust a student's whole daily allowance without a single model
   * call having been made. The rest of the gate — the switches, the role, the
   * exam lock — still applies.
   */
  countsQuota?: boolean;
}

export interface GuardOk {
  ok: true;
  /** Service-role client. The only thing that may read `ai_providers`. */
  service: SupabaseClient;
  /** The caller's own client, for anything that should respect their RLS. */
  asUser: SupabaseClient;
  userId: string;
  role: string;
  /** Set for a caller who is a student; null for staff. */
  studentId: string | null;
  usage: { used: number; quota: number };
  /**
   * What the school calls its assistant.
   *
   * Read here rather than in each function because the guard is already
   * reading settings, and because a name that differed between two screens
   * would be worse than no name at all.
   */
  assistantName: string;
}

export type GuardResult = GuardOk | { ok: false; response: Response };

/**
 * A `system_settings` value.
 *
 * `value` is a jsonb column, so supabase-js hands back whatever JSON is in it —
 * a real boolean for `true`, a real number for `200`, a string for anything
 * written through `JSON.stringify`. All three have been written by different
 * screens over the years, so this returns the raw JSON and the two readers
 * below cope with each shape rather than assuming one.
 */
const setting = async (
  service: SupabaseClient,
  key: string,
  fallback: unknown,
): Promise<unknown> => {
  const { data } = await service
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  return raw === null || raw === undefined || raw === "" ? fallback : raw;
};

/** A real boolean, a number, or any of the strings people write for "yes". */
const isOn = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return /^(true|1|yes|on)$/i.test(String(value ?? "").trim().replace(/^"(.*)"$/, "$1"));
};

const asNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(String(value ?? "").replace(/^"(.*)"$/, "$1"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const guard = async (req: Request, spec: GuardSpec): Promise<GuardResult> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, response: json({ error: "Not authenticated" }, 401) };

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return { ok: false, response: json({ error: "Invalid token" }, 401) };

  // The master switch first, so turning AI off turns all of it off even if a
  // per-feature flag says otherwise.
  if (!isOn(await setting(service, "ai_enabled", false))) {
    return {
      ok: false,
      response: json({ error: "AI features are switched off for this school." }, 403),
    };
  }
  if (!isOn(await setting(service, spec.feature, false))) {
    return { ok: false, response: json({ error: "This AI feature is switched off." }, 403) };
  }

  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((profile as { role?: string } | null)?.role ?? "").toLowerCase();

  const isStaff = role === "admin" || role === "teacher";
  if (spec.audience === "admin" && !isStaff) {
    return {
      ok: false,
      response: json({ error: "Only teachers and admins may use this." }, 403),
    };
  }

  // A staff account may hold a preview student record, so the student id is
  // looked up rather than assumed from the role.
  const { data: student } = await service
    .from("students")
    .select("id, is_staff_preview")
    .eq("profile_id", user.id)
    .maybeSingle();
  const studentRow = student as { id?: string; is_staff_preview?: boolean } | null;
  const studentId = studentRow?.id ?? null;

  // Staff have no student record unless they hold a preview one, so this check
  // is what keeps a student-only feature student-only. It is skipped for "any",
  // where `studentId` being null is the normal state of a member of staff.
  if (spec.audience === "student" && !studentId) {
    return { ok: false, response: json({ error: "No student record for this account." }, 403) };
  }

  /**
   * The exam lock.
   *
   * An attempt with no `submitted_at` is a student sitting an exam right now.
   * Checked against the service role rather than their own session, so a
   * client cannot make the row invisible and unlock itself, and it is logged
   * to `exam_events` because an AI request arriving mid-exam is exactly the
   * signal an invigilator wants after the fact.
   *
   * A staff preview record is exempt. Those attempts exist so an admin can
   * walk through an exam to check it, and one left open — which is the normal
   * end of such a walkthrough — would otherwise lock that admin out of every
   * AI feature until somebody noticed why.
   */
  if (spec.examLock !== false && studentId && !studentRow?.is_staff_preview) {
    const { data: open } = await service
      .from("exam_attempts")
      .select("id")
      .eq("student_id", studentId)
      .is("submitted_at", null)
      .limit(1)
      .maybeSingle();
    const attemptId = (open as { id?: string } | null)?.id;
    if (attemptId) {
      await service.from("exam_events").insert({
        attempt_id: attemptId,
        event_type: "ai_blocked",
        event_data: { feature: spec.feature },
      });
      return {
        ok: false,
        response: json(
          { error: "AI help is unavailable while you have an exam in progress." },
          403,
        ),
      };
    }
  }

  const assistantName = String(await setting(service, "ai_assistant_name", "Barnabas"));

  if (spec.countsQuota === false) {
    return {
      ok: true, service, asUser, userId: user.id, role, studentId,
      usage: { used: 0, quota: 0 }, assistantName,
    };
  }

  const limitKey = isStaff ? "ai_daily_limit_admin" : "ai_daily_limit_student";
  const fallbackLimit = isStaff ? 200 : 20;
  const limit = asNumber(await setting(service, limitKey, fallbackLimit), fallbackLimit);

  const { data: quota, error: quotaError } = await service.rpc("ai_consume_quota", {
    p_user_id: user.id,
    p_feature: spec.feature,
    p_limit: limit,
  });
  if (quotaError) return { ok: false, response: json({ error: quotaError.message }, 500) };

  const row = (Array.isArray(quota) ? quota[0] : quota) as
    | { allowed?: boolean; used?: number; quota?: number }
    | null;
  if (row && row.allowed === false) {
    return {
      ok: false,
      response: json(
        {
          error: `You have used today's ${row.quota} AI requests. It resets at midnight.`,
          used: row.used,
          quota: row.quota,
        },
        429,
      ),
    };
  }

  return {
    ok: true,
    service,
    asUser,
    userId: user.id,
    role,
    studentId,
    usage: { used: row?.used ?? 0, quota: row?.quota ?? 0 },
    assistantName,
  };
};

/** The shape every AI function answers a dead chain with. */
export const chainFailureResponse = (
  failures: { kind: string; detail: string }[],
  configured: boolean,
) =>
  json(
    {
      error: configured
        ? "No AI provider could answer. See Auto AI settings for what each one said."
        : "No AI provider is set up yet. Add one under Settings → AI.",
      configured,
      failures,
    },
    503,
  );
