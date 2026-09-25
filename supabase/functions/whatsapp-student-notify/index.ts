import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Messages that go to one student, on their own phone.
 *
 * The third and last of the three senders, kept apart from the other two for
 * the same reason they are kept apart from each other: the destination decides
 * the rules. Admin alerts go to two named people and may say anything about
 * anyone. Group posts go to seventy-seven and may say nothing about anyone.
 * These go to the person the message is about, which is the only case where
 * their balance or their score may appear at all.
 *
 * Two things are therefore true of every path below and of anything added
 * later. The recipient is resolved from the student id through
 * whatsapp_target_for_student, which returns nothing for a student who has
 * opted out or whose number could not be read. And the student id is passed to
 * the gateway, so if a group JID were ever configured here by mistake the send
 * is refused rather than published.
 */

type Kind =
  | "payment_verified"
  | "payment_rejected"
  | "assignment_graded"
  | "results_released"
  | "admission_decision"
  | "certificate_issued";

const SETTING_FOR_KIND: Record<Kind, string> = {
  payment_verified: "notify_payment_verified",
  payment_rejected: "notify_payment_rejected",
  assignment_graded: "notify_assignment_graded",
  results_released: "notify_results_released",
  admission_decision: "notify_admission_decision",
  certificate_issued: "notify_certificate_issued",
};

function naira(amount: number | string | null): string {
  return "₦" + Number(amount ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

type Composed = { studentId: string; lines: string[]; key: string } | null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gatewayUrl = Deno.env.get("GATEWAY_URL");
  const gatewaySecret = Deno.env.get("GATEWAY_SECRET");
  if (!gatewayUrl || !gatewaySecret) {
    return new Response(JSON.stringify({ error: "gateway not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const { kind, id } = body as { kind?: Kind; id?: string };
  if (!kind || !id) {
    return new Response(JSON.stringify({ error: "kind and id are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const { data: settings } = await admin
    .from("whatsapp_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const switchName = SETTING_FOR_KIND[kind];
  if (
    settings &&
    (settings.enabled === false ||
      (switchName && (settings as Record<string, unknown>)[switchName] === false))
  ) {
    return new Response(JSON.stringify({ sent: 0, reason: `${kind} is switched off` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

  /** The outstanding balance on one fee, after whatever has just been applied. */
  async function feeLine(feeId: string | null): Promise<string[]> {
    if (!feeId) return [];
    const { data: fee } = await admin
      .from("fees")
      .select("fee_type, amount_due, amount_paid, waived")
      .eq("id", feeId)
      .maybeSingle();
    if (!fee) return [];
    if (fee.waived) return [`${fee.fee_type}: waived`];
    const outstanding = Number(fee.amount_due ?? 0) - Number(fee.amount_paid ?? 0);
    return outstanding > 0
      ? [`${fee.fee_type}: ${naira(outstanding)} still outstanding`]
      : [`${fee.fee_type}: fully paid. Thank you.`];
  }

  async function compose(): Promise<Composed> {
    switch (kind) {
      case "payment_verified":
      case "payment_rejected": {
        const { data: payment } = await admin
          .from("payments")
          .select("id, student_id, student_fee_id, fee_id, amount_paid, status, admin_notes")
          .eq("id", id)
          .maybeSingle();
        if (!payment) return null;

        const wanted = kind === "payment_verified" ? "VERIFIED" : "REJECTED";
        // The status may have moved on since the trigger fired -- verified then
        // reversed, say. Telling a student their payment was accepted when it
        // no longer is would be worse than telling them nothing.
        if (payment.status !== wanted) return null;

        if (kind === "payment_verified") {
          const lines = [
            "*Payment confirmed*",
            "",
            `We have received and verified ${naira(payment.amount_paid)}.`,
            ...(await feeLine((payment.student_fee_id ?? payment.fee_id) as string | null)),
          ];
          if (appUrl) lines.push("", `${appUrl}/student/fees`);
          return { studentId: String(payment.student_id), lines, key: `payment_verified-${payment.id}` };
        }

        const lines = [
          "*Payment not accepted*",
          "",
          `Your payment of ${naira(payment.amount_paid)} could not be verified.`,
        ];
        // The reason is the entire point of this message. Without it the
        // student knows only that something is wrong, which is where this sat
        // before -- in the portal, unread, with the money stuck.
        if (payment.admin_notes) lines.push("", `Reason: ${payment.admin_notes}`);
        lines.push("", "Please submit the correct proof of payment.");
        if (appUrl) lines.push(`${appUrl}/student/fees`);
        return { studentId: String(payment.student_id), lines, key: `payment_rejected-${payment.id}` };
      }

      case "assignment_graded": {
        const { data: submission } = await admin
          .from("assignment_submissions")
          .select("id, student_id, assignment_id, grade, feedback, reviewed_at")
          .eq("id", id)
          .maybeSingle();
        if (!submission || submission.grade === null || !submission.reviewed_at) return null;

        const { data: assignment } = await admin
          .from("assignments")
          .select("title")
          .eq("id", submission.assignment_id)
          .maybeSingle();

        const lines = [
          "*Assignment graded*",
          "",
          String(assignment?.title ?? "Your assignment"),
          `Score: ${submission.grade}`,
        ];
        if (submission.feedback) lines.push("", `Feedback: ${submission.feedback}`);
        if (appUrl) lines.push("", `${appUrl}/student/assignments`);
        return {
          studentId: String(submission.student_id),
          // Keyed on the review, not the submission: a regrade is genuinely new
          // news and should reach the student again.
          key: `assignment_graded-${submission.id}-${submission.reviewed_at}`,
          lines,
        };
      }

      case "results_released": {
        const { data: attempt } = await admin
          .from("exam_attempts")
          .select("id, student_id, exam_id, score, manual_score_override, status")
          .eq("id", id)
          .maybeSingle();
        if (!attempt || attempt.status !== "released") return null;

        const { data: exam } = await admin
          .from("exams")
          .select("title")
          .eq("id", attempt.exam_id)
          .maybeSingle();

        const score = attempt.manual_score_override ?? attempt.score;
        const lines = [
          "*Exam result released*",
          "",
          String(exam?.title ?? "Your exam"),
          score !== null && score !== undefined ? `Score: ${score}` : "Your result is now available.",
        ];
        if (appUrl) lines.push("", `${appUrl}/student/exams`);
        return { studentId: String(attempt.student_id), lines, key: `results_released-${attempt.id}` };
      }

      case "admission_decision": {
        const { data: student } = await admin
          .from("students")
          .select("id, admission_status, is_approved, student_code, is_staff_preview")
          .eq("id", id)
          .maybeSingle();
        if (!student || student.is_staff_preview) return null;

        const status = String(student.admission_status ?? "").toUpperCase();
        if (status === "ADMITTED") {
          const lines = [
            "*Admission approved*",
            "",
            "Congratulations — your application has been approved.",
          ];
          if (student.student_code) lines.push(`Your student number: ${student.student_code}`);
          lines.push("", "Log in to complete your enrolment.");
          if (appUrl) lines.push(`${appUrl}/student/dashboard`);
          return { studentId: String(student.id), lines, key: `admission_decision-${student.id}-${status}` };
        }
        if (status === "REJECTED") {
          // Deliberately brief and without a reason. A decision like this is
          // owed a conversation, not a paragraph from an automated number;
          // this only makes sure nobody is left waiting without knowing.
          const lines = [
            "*Application update*",
            "",
            "Your application was not successful on this occasion.",
            "Please contact the school office if you would like to discuss it.",
          ];
          return { studentId: String(student.id), lines, key: `admission_decision-${student.id}-${status}` };
        }
        return null;
      }

      case "certificate_issued": {
        const { data: certificate } = await admin
          .from("certificates")
          .select("id, student_id, serial, revoked_at")
          .eq("id", id)
          .maybeSingle();
        if (!certificate || certificate.revoked_at) return null;

        const lines = [
          "*Certificate issued*",
          "",
          "Your certificate has been issued.",
          `Serial: ${certificate.serial}`,
        ];
        if (appUrl) lines.push("", `${appUrl}/verify/${certificate.serial}`);
        return { studentId: String(certificate.student_id), lines, key: `certificate_issued-${certificate.id}` };
      }
    }
  }

  const composed = await compose();
  if (!composed) {
    return new Response(JSON.stringify({ sent: 0, reason: "nothing to send" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // One place decides whether this person may be written to, and where. It
  // returns nothing for an opt-out, an unreadable number, or a staff preview
  // record -- none of which is an error worth retrying.
  const { data: target } = await admin.rpc("whatsapp_target_for_student", {
    p_student_id: composed.studentId,
  });

  if (!target) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "student is not reachable or has opted out" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-gateway-secret": gatewaySecret },
    body: JSON.stringify({
      to: target,
      text: composed.lines.join("\n"),
      // Always set. This is personal data, so if a group JID ever reached this
      // function the gateway refuses the send rather than publishing it.
      student_id: composed.studentId,
      idempotency_key: composed.key,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("student notify failed", response.status, detail);
    return new Response(JSON.stringify({ sent: 0, error: detail }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: 1 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
