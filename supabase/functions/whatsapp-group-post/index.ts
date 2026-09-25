import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Post a published announcement to the official WhatsApp group.
 *
 * Kept separate from whatsapp-admin-alert on purpose. That function sends to
 * named admins and routinely carries one student's details; this one sends to a
 * group of seventy-seven people and must never carry anybody's. Two functions
 * with two destinations and two rules is harder to get wrong than one function
 * with a flag deciding which it is today.
 *
 * As with the admin alerts, the caller names a row and nothing else. The text
 * comes from the announcement, the destination from configuration. There is no
 * way to make this send arbitrary words to the group.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");

  if (!gatewayUrl || !gatewaySecret) {
    return new Response(
      JSON.stringify({ error: "GATEWAY_URL and GATEWAY_SECRET must be set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const { kind = "announcement", announcement_id, exam_id } = body as {
    kind?: "announcement" | "exam_published" | "exam_starting_soon" | "materials_added";
    announcement_id?: string;
    exam_id?: string;
  };

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Settings first: both switches are checked before the announcement is even
  // read, so a silenced mirror costs nothing and leaves whatsapp_sent_at unset
  // -- the notice can still be mirrored later by turning the switch back on and
  // re-saving it.
  const { data: settings } = await admin
    .from("whatsapp_settings")
    .select(
      "enabled, mirror_announcements, alert_exam_published, alert_exam_starting_soon, " +
        "alert_material_uploaded, official_group_jid, exam_reminder_minutes",
    )
    .eq("id", true)
    .maybeSingle();

  const SWITCH: Record<string, string> = {
    announcement: "mirror_announcements",
    exam_published: "alert_exam_published",
    exam_starting_soon: "alert_exam_starting_soon",
    materials_added: "alert_material_uploaded",
  };
  const switchName = SWITCH[kind];

  if (
    settings &&
    (settings.enabled === false ||
      (switchName && (settings as Record<string, unknown>)[switchName] === false))
  ) {
    return new Response(
      JSON.stringify({ sent: 0, reason: `${kind} posts are switched off` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const groupJid = settings?.official_group_jid ?? Deno.env.get("OFFICIAL_GROUP_JID");
  if (!groupJid) {
    console.error("no official group configured -- nothing will be posted");
    return new Response(JSON.stringify({ sent: 0, reason: "no group configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

  /** Lagos time, written the way a person would say it. Everything in the
   *  database is UTC, and a student reading "07:00" for an eight o'clock exam
   *  is the one mistake this notice must never make. */
  const lagos = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  /** The group belongs to one cohort. Anything aimed at a different one is not
   *  posted there: those students are not in it, and the ones who are would be
   *  reading somebody else's notice. */
  async function targetsThisGroup(cohortId: string | null): Promise<boolean> {
    if (!cohortId) return true;
    const { data: cohort } = await admin
      .from("cohorts")
      .select("is_active")
      .eq("id", cohortId)
      .maybeSingle();
    return Boolean(cohort?.is_active);
  }

  let text: string | null = null;
  let idempotencyKey = "";
  let markSent: (() => Promise<void>) | null = null;

  if (kind === "announcement") {
    if (!announcement_id) {
      return new Response(JSON.stringify({ error: "announcement_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: announcement, error } = await admin
      .from("announcements")
      .select("id, title, body, target_cohort_id, cohort_id, is_published, send_to_whatsapp, whatsapp_sent_at")
      .eq("id", announcement_id)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: `lookup failed: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-check every condition the trigger checked. The trigger fires on a row
    // as it was written; by the time this runs the announcement may have been
    // unpublished, un-flagged, or already sent by a call that raced this one.
    if (
      !announcement ||
      !announcement.is_published ||
      !announcement.send_to_whatsapp ||
      announcement.whatsapp_sent_at
    ) {
      return new Response(JSON.stringify({ sent: 0, reason: "nothing to post" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await targetsThisGroup(announcement.target_cohort_id ?? announcement.cohort_id ?? null))) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "announcement targets a cohort that is not the active one" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lines = [`*${announcement.title}*`, "", String(announcement.body ?? "").trim()];
    if (appUrl) lines.push("", `${appUrl}/student/announcements`);
    text = lines.join("\n");
    idempotencyKey = `announcement-${announcement.id}`;
    markSent = async () => {
      await admin
        .from("announcements")
        .update({ whatsapp_sent_at: new Date().toISOString() })
        .eq("id", announcement.id);
    };
  } else if (kind === "materials_added") {
    // The sweep decides there is something to say; this decides what. Reading
    // the rows here rather than being handed ids means a material uploaded
    // between the sweep and this call is included rather than waiting fifteen
    // minutes for the next pass.
    const settled = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: materials, error } = await admin
      .from("course_materials")
      .select("id, title, material_type, is_paid, course_id, cohort_id, created_at")
      .is("whatsapp_sent_at", null)
      .lt("created_at", settled)
      .order("created_at", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: `lookup failed: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mine: typeof materials = [];
    for (const material of materials ?? []) {
      if (await targetsThisGroup(material.cohort_id as string | null)) mine.push(material);
    }

    if (mine.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "nothing to post" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const courseIds = [...new Set(mine.map((m) => m.course_id as string).filter(Boolean))];
    const { data: courses } = courseIds.length
      ? await admin.from("courses").select("id, title, code").in("id", courseIds)
      : { data: [] };
    const courseName = new Map(
      (courses ?? []).map((c) => [
        c.id as string,
        [c.code, c.title].filter(Boolean).join(" — ") || "Course",
      ]),
    );

    const lines =
      mine.length === 1
        ? ["*New course material*", ""]
        : [`*${mine.length} new course materials*`, ""];

    for (const material of mine.slice(0, 12)) {
      const course = courseName.get(material.course_id as string);
      lines.push(
        `• ${material.title}${course ? ` — ${course}` : ""}${material.is_paid ? " _(paid)_" : ""}`,
      );
    }
    if (mine.length > 12) lines.push(`_…and ${mine.length - 12} more_`);
    if (appUrl) lines.push("", `${appUrl}/student/materials`);

    text = lines.join("\n");
    // Keyed to the set, so a retry of the same batch is refused but a genuinely
    // new upload a minute later is not.
    idempotencyKey = `materials_added-${mine.map((m) => m.id).join(",").slice(0, 80)}`;
    markSent = async () => {
      await admin
        .from("course_materials")
        .update({ whatsapp_sent_at: new Date().toISOString() })
        .in("id", mine.map((m) => m.id as string));
    };
  } else {
    if (!exam_id) {
      return new Response(JSON.stringify({ error: "exam_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: exam, error } = await admin
      .from("exams")
      .select("id, title, status, start_at, end_at, duration_minutes, cohort_id, whatsapp_reminded_at, whatsapp_published_at")
      .eq("id", exam_id)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: `lookup failed: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!exam) {
      return new Response(JSON.stringify({ sent: 0, reason: "nothing to post" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await targetsThisGroup(exam.cohort_id as string | null))) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "exam belongs to a cohort that is not the active one" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (kind === "exam_published") {
      // A draft that was published and then withdrawn should not be announced
      // by a call that arrives late.
      if (exam.status !== "published" || exam.whatsapp_published_at) {
        return new Response(JSON.stringify({ sent: 0, reason: "nothing to post" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const lines = [
        "*New exam published*",
        "",
        String(exam.title ?? "Untitled exam"),
      ];
      if (exam.start_at) lines.push(`Opens: ${lagos(exam.start_at as string)}`);
      if (exam.end_at) lines.push(`Closes: ${lagos(exam.end_at as string)}`);
      if (exam.duration_minutes) lines.push(`Duration: ${exam.duration_minutes} minutes`);
      if (appUrl) lines.push("", `${appUrl}/student/exams`);
      text = lines.join("\n");
      idempotencyKey = `exam_published-${exam.id}`;
      markSent = async () => {
        await admin
          .from("exams")
          .update({ whatsapp_published_at: new Date().toISOString() })
          .eq("id", exam.id);
      };
    } else {
      // exam_starting_soon. The schedule finds the exam; this re-checks that it
      // is still ahead of us and still unreminded, because the window is swept
      // repeatedly and two passes can overlap.
      if (exam.whatsapp_reminded_at || !exam.start_at) {
        return new Response(JSON.stringify({ sent: 0, reason: "already reminded" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const minutesAway = Math.round(
        (new Date(exam.start_at as string).getTime() - Date.now()) / 60000,
      );
      if (minutesAway < 0) {
        return new Response(JSON.stringify({ sent: 0, reason: "exam already started" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const lines = [
        "*Exam reminder*",
        "",
        String(exam.title ?? "Untitled exam"),
        `Starts ${lagos(exam.start_at as string)} — in about ${minutesAway} minutes.`,
      ];
      if (exam.duration_minutes) lines.push(`Duration: ${exam.duration_minutes} minutes.`);
      lines.push("", "Be seated and logged in before the start time.");
      if (appUrl) lines.push(`${appUrl}/student/exams`);
      text = lines.join("\n");
      idempotencyKey = `exam_starting_soon-${exam.id}`;
      markSent = async () => {
        await admin
          .from("exams")
          .update({ whatsapp_reminded_at: new Date().toISOString() })
          .eq("id", exam.id);
      };
    }
  }

  const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
    body: JSON.stringify({
      to: groupJid,
      text,
      // Deliberately no student_id. This is a group message and the gateway
      // would refuse it if one were set -- which is the point: if this function
      // ever grows a per-student variant, it fails closed rather than leaking.
      idempotency_key: idempotencyKey,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("group post failed", response.status, detail);
    return new Response(JSON.stringify({ sent: 0, error: detail, status: response.status }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Marked only on success, so a failed post can be retried rather than being
  // silently recorded as delivered.
  if (markSent) await markSent();

  return new Response(JSON.stringify({ sent: 1 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
