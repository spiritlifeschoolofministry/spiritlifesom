import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type AttendanceRow, tallyAttendance } from "../_shared/attendance.ts";

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
      return new Response(JSON.stringify({ error: "Unauthorized: only teachers and admins can send student emails" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { recipients, subject, body } = await req.json();

    /**
     * Per-recipient figures, filled here rather than written by anyone.
     *
     * A letter about attendance that quotes the cohort average tells the
     * student nothing about themselves, and thirty separately drafted letters
     * would mean thirty model calls and thirty individual records in prompts.
     * So one letter is written with tokens in it and each recipient's own true
     * figures are substituted at send time, from the same tally the student
     * sees on their own attendance page.
     *
     * Only recipients carrying a student id get figures. Anyone else keeps the
     * letter as written, which is what a token in a message to a non-student
     * should do — nothing.
     */
    const merged = new Map<string, Record<string, string>>();
    const withIds = (recipients as { student_id?: string }[])
      .map((r) => r.student_id)
      .filter((id): id is string => !!id);

    if (withIds.length > 0 && /\{\{\s*(classes_|attendance)/.test(String(body))) {
      const { data: studentRows } = await supabase
        .from("students")
        .select("id, cohort_id")
        .in("id", withIds);

      const cohortIds = [
        ...new Set(
          ((studentRows ?? []) as { cohort_id: string | null }[])
            .map((r) => r.cohort_id)
            .filter((id): id is string => !!id),
        ),
      ];

      const [{ data: sessions }, { data: marks }] = await Promise.all([
        supabase
          .from("schedule")
          .select("id, cohort_id")
          .in("cohort_id", cohortIds)
          .eq("counts_for_attendance", true)
          .lte("date", new Date().toISOString().slice(0, 10)),
        supabase
          .from("attendance")
          .select("student_id, status, schedule_id, is_verified")
          .in("student_id", withIds)
          .limit(20000),
      ]);

      const sessionsByCohort = new Map<string, Set<string>>();
      for (const row of (sessions ?? []) as { id: string; cohort_id: string }[]) {
        if (!sessionsByCohort.has(row.cohort_id)) sessionsByCohort.set(row.cohort_id, new Set());
        sessionsByCohort.get(row.cohort_id)!.add(row.id);
      }

      const marksByStudent = new Map<string, AttendanceRow[]>();
      for (
        const row of (marks ?? []) as unknown as (AttendanceRow & { student_id: string })[]
      ) {
        if (!marksByStudent.has(row.student_id)) marksByStudent.set(row.student_id, []);
        marksByStudent.get(row.student_id)!.push(row);
      }

      for (const student of (studentRows ?? []) as { id: string; cohort_id: string | null }[]) {
        const ids = student.cohort_id ? sessionsByCohort.get(student.cohort_id) : undefined;
        if (!ids || ids.size === 0) continue;
        const tally = tallyAttendance(ids, marksByStudent.get(student.id) ?? []);
        merged.set(student.id, {
          classes_attended: String(tally.present + tally.late),
          classes_held: String(tally.total),
          classes_missed: String(tally.absent),
          attendance_rate: tally.rate === null ? "—" : `${tally.rate}%`,
        });
      }
    }

    /** Replaces the tokens this recipient has values for, and leaves the rest. */
    const fill = (text: string, recipient: { student_id?: string; name?: string }): string => {
      const values: Record<string, string> = {
        first_name: String(recipient.name ?? "").trim().split(/\s+/)[0] || "Student",
        ...(recipient.student_id ? merged.get(recipient.student_id) ?? {} : {}),
      };
      return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) =>
        token in values ? values[token] : whole);
    };

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Recipients must be a non-empty array" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!subject || !body) {
      return new Response(JSON.stringify({ error: "Subject and body are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let successCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      if (!recipient.email) {
        failCount++;
        continue;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Spirit Life SOM <onboarding@resend.dev>",
            to: recipient.email,
            subject: fill(subject, recipient),
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <p>Dear ${recipient.name || "Student"},</p>
                <div style="margin: 20px 0; line-height: 1.6;">
                  ${fill(body, recipient).replace(/\n/g, "<br/>")}
                </div>
                <p>God bless you,<br/><strong>Spirit Life School of Ministry</strong></p>
              </div>
            `,
          }),
        });

        const data = await res.json();

        if (res.ok && data.id) {
          successCount++;
          // Log success to email_send_history
          await supabase.from("email_send_history").insert({
            recipient_email: recipient.email,
            email_type: "custom",
            trigger_source: "manual",
            triggered_by: user.id,
            status: "sent",
            resend_message_id: data.id,
            metadata: { subject, sent_by_name: profile.first_name || "Admin" },
          });
        } else {
          failCount++;
          // Log failure
          await supabase.from("email_send_history").insert({
            recipient_email: recipient.email,
            email_type: "custom",
            trigger_source: "manual",
            triggered_by: user.id,
            status: "failed",
            error_message: data.message || "Unknown error",
            metadata: { subject },
          });
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to send email to ${recipient.email}:`, error);
        await supabase.from("email_send_history").insert({
          recipient_email: recipient.email,
          email_type: "custom",
          trigger_source: "manual",
          triggered_by: user.id,
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          metadata: { subject },
        });
      }
    }

    return new Response(
      JSON.stringify({ successCount, failCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-student-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
