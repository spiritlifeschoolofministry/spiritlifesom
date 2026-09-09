/**
 * Drafts an announcement or a student email, from the figures behind it.
 *
 * This function writes and returns text. It sends nothing, saves nothing and
 * notifies nobody — the draft lands in the field the writer is already looking
 * at, and publishing or sending stays the separate, deliberate click it is
 * today. A feature that could both compose and send would be one bug away from
 * emailing a cohort by itself.
 *
 * What makes a draft worth having is that it is fed real numbers. "Fees are
 * due" is something an admin can type faster than they can ask for it; "23 of
 * 41 students in Cohort 4 have an outstanding balance, and the session closes
 * on the 30th" is the part that takes ten minutes of looking things up first.
 * So the aggregates are gathered here, server-side, and handed to the model
 * with the instruction not to add any others.
 *
 * Only aggregates. No student is named to the model and no individual balance,
 * mark or attendance record leaves this function — a mail-merge greeting is
 * done by the sender, from the recipient list, long after this has finished.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { line, tidy } from "../_shared/ai-text.ts";

/** What may be drafted, and what each one is for. */
const KINDS = {
  announcement: "a notice posted in the student portal",
  fee_reminder: "an email reminding students of an outstanding balance",
  attendance_nudge: "an email to students whose attendance has slipped",
  exam_notice: "an email telling students about an upcoming exam",
  general: "an email to students",
} as const;

type Kind = keyof typeof KINDS;

const RULES = `You are drafting a message for the administration of Spirit Life School of Ministry, a Christian Bible school, to send to its students.

Rules:
- Write in British English. Warm, plain and brief — a school office writing to its own students, not a marketing department.
- Use only the facts given below. Never invent a date, an amount, a deadline, a venue or a policy. If something obvious seems missing, leave it out rather than guessing; the writer will add it.
- Do not open with "I hope this email finds you well" or similar filler. Say the thing.
- Do not quote scripture unless the notes below do. A verse chosen by a machine to decorate an administrative notice is not the school's voice.
- Never threaten, shame or imply consequences that are not stated in the facts given.
- Address the group, not one person. Do not write a greeting line with a name in it.
- Plain text. No markdown, no headings, no bullet characters unless the content is genuinely a list.`;

const prompt = (
  kind: Kind,
  brief: string,
  facts: string,
  wantsSubject: boolean,
) =>
  `${RULES}

You are writing ${KINDS[kind]}.

${
    wantsSubject
      ? 'Answer with a subject line on the first line prefixed exactly "Subject: ", then a blank line, then the message body.'
      : "Answer with the message body only — no subject line, no title."
  }

${brief ? `What the writer wants said:\n${brief}\n` : ""}
${facts ? `The facts, which are the only ones you may use:\n${facts}` : "No figures were gathered for this one."}`;

/**
 * The figures behind each kind of message.
 *
 * Deliberately narrow. Each query answers the one question the message is
 * about, so a fee reminder is not handed attendance data it might decide to
 * mention.
 */
const gatherFacts = async (
  service: SupabaseClient,
  kind: Kind,
  cohortId: string | null,
): Promise<string> => {
  const parts: string[] = [];

  let cohortName = "";
  if (cohortId) {
    const { data } = await service.from("cohorts").select("name").eq("id", cohortId).maybeSingle();
    cohortName = data?.name ?? "";
    parts.push(line("Cohort", cohortName));
  } else {
    parts.push(line("Audience", "all current students"));
  }

  const students = service.from("students").select("id", { count: "exact", head: true });
  const { count: studentCount } = cohortId
    ? await students.eq("cohort_id", cohortId)
    : await students;
  parts.push(line("Students in this group", studentCount ?? 0));

  if (kind === "fee_reminder") {
    /**
     * Only fees belonging to a cohort that is still running.
     *
     * A closed session's outstanding balances are written off, not chased — so
     * summing every unpaid fee ever raised would produce a total the school
     * does not actually consider owed, and a reminder built on it would be
     * asking students for money that was forgiven.
     */
    let query = service
      .from("fees")
      .select("amount_due, amount_paid, cohort_id")
      .eq("waived", false);
    if (cohortId) {
      query = query.eq("cohort_id", cohortId);
    } else {
      const { data: active } = await service
        .from("cohorts")
        .select("id")
        .eq("is_active", true);
      const ids = ((active ?? []) as { id: string }[]).map((row) => row.id);
      if (ids.length === 0) return parts.filter(Boolean).join("");
      query = query.in("cohort_id", ids);
    }
    const { data } = await query.limit(2000);

    const rows = (data ?? []) as { amount_due: number | null; amount_paid: number | null }[];
    const outstanding = rows
      .map((row) => Number(row.amount_due ?? 0) - Number(row.amount_paid ?? 0))
      .filter((balance) => balance > 0);
    const total = outstanding.reduce((sum, balance) => sum + balance, 0);

    parts.push(line("Students with an outstanding balance", outstanding.length));
    parts.push(line("Total outstanding", `₦${Math.round(total).toLocaleString("en-NG")}`));
    // The average is the figure worth naming: a total across a cohort sounds
    // alarming and tells an individual student nothing about their own bill.
    if (outstanding.length) {
      parts.push(
        line(
          "Average outstanding per affected student",
          `₦${Math.round(total / outstanding.length).toLocaleString("en-NG")}`,
        ),
      );
    }
  }

  if (kind === "attendance_nudge") {
    // attendance has no cohort of its own, so it is reached through the student.
    let query = service.from("attendance").select("status, students!inner(cohort_id)");
    if (cohortId) query = query.eq("students.cohort_id", cohortId);
    const { data } = await query.limit(5000);

    const rows = (data ?? []) as { status: string | null }[];
    const present = rows.filter((row) => /present|late/i.test(String(row.status ?? ""))).length;
    if (rows.length) {
      parts.push(line("Attendance records counted", rows.length));
      parts.push(line("Overall attendance rate", `${Math.round((present / rows.length) * 100)}%`));
    }
  }

  if (kind === "exam_notice") {
    let query = service
      .from("exams")
      .select("title, start_at, duration_minutes, cohort_id")
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true });
    if (cohortId) query = query.eq("cohort_id", cohortId);
    const { data } = await query.limit(5);

    for (const exam of (data ?? []) as Record<string, unknown>[]) {
      parts.push(
        line(
          "Upcoming exam",
          `${exam.title} — ${
            exam.start_at
              ? new Date(String(exam.start_at)).toLocaleString("en-GB", {
                dateStyle: "full",
                timeStyle: "short",
              })
              : "date not set"
          }${exam.duration_minutes ? `, ${exam.duration_minutes} minutes` : ""}`,
        ),
      );
    }
  }

  return parts.filter(Boolean).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_message_drafting", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const kind = (String(body?.kind ?? "general") as Kind) in KINDS
      ? String(body?.kind ?? "general") as Kind
      : "general";
    const brief = String(body?.brief ?? "").slice(0, 2000);
    const cohortId = body?.cohort_id ? String(body.cohort_id) : null;
    const wantsSubject = body?.subject !== false && kind !== "announcement";

    const facts = await gatherFacts(service, kind, cohortId).catch(() => "");

    const result = await runChain(service, prompt(kind, brief, facts, wantsSubject), {
      accept: (raw) => raw.trim().length >= 40,
      maxTokens: 1200,
    });
    if (!result.text) return chainFailureResponse(result.failures, result.configured);

    // A subject line asked for on the first line is what comes back most of the
    // time; when it doesn't, the whole answer is the body rather than a lost
    // draft, and the writer fills the subject in themselves.
    const text = result.text.trim();
    const match = wantsSubject ? text.match(/^\s*subject\s*:\s*(.+?)\s*\n([\s\S]*)$/i) : null;

    return json({
      subject: match ? tidy(match[1], 120) : undefined,
      body: (match ? match[2] : text).trim(),
      facts,
      provider: result.provider,
      model: result.model,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
