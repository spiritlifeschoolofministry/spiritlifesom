import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * The answers that come from the database, not from a model.
 *
 * Every figure a student reads here is a column. The model is never given the
 * chance to author one, because "you owe nothing" to somebody who owes ₦40,000
 * is worse than not answering at all, and no amount of prompting reliably
 * prevents a model from writing a plausible number.
 *
 * Each of these also stays short. A WhatsApp reply that runs past a screen is
 * one nobody reads to the end of, and the portal is one tap away for the
 * detail.
 */

export function naira(amount: number | string | null): string {
  return "₦" + Number(amount ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export function lagosDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export async function feesAnswer(
  admin: SupabaseClient,
  studentId: string,
  appUrl: string,
): Promise<string> {
  const { data: fees } = await admin
    .from("fees")
    .select("fee_type, amount_due, amount_paid, waived, cohort_id")
    .eq("student_id", studentId);

  // Waived fees are not debts. A closed session's balances are written off
  // deliberately, and repeating them at a student is chasing money the school
  // has already decided not to collect.
  const owing = (fees ?? []).filter(
    (f) => !f.waived && Number(f.amount_due ?? 0) > Number(f.amount_paid ?? 0),
  );

  if (owing.length === 0) {
    return ["*Your fees*", "", "You have nothing outstanding. Thank you."].join("\n");
  }

  const total = owing.reduce(
    (sum, f) => sum + (Number(f.amount_due ?? 0) - Number(f.amount_paid ?? 0)),
    0,
  );

  const lines = ["*Your fees*", "", `Outstanding: ${naira(total)}`, ""];
  for (const fee of owing.slice(0, 6)) {
    const left = Number(fee.amount_due ?? 0) - Number(fee.amount_paid ?? 0);
    lines.push(`• ${fee.fee_type}: ${naira(left)}`);
  }
  if (owing.length > 6) lines.push(`_…and ${owing.length - 6} more_`);
  if (appUrl) lines.push("", `Pay or upload a receipt: ${appUrl}/student/fees`);
  return lines.join("\n");
}

export async function resultsAnswer(
  admin: SupabaseClient,
  studentId: string,
  appUrl: string,
): Promise<string> {
  // Released only. A score that exists but has not been released is not the
  // student's to see yet, and handing it over here would go behind a decision
  // somebody deliberately has not made.
  const { data: attempts } = await admin
    .from("exam_attempts")
    .select("exam_id, score, manual_score_override, status, submitted_at")
    .eq("student_id", studentId)
    .eq("status", "released")
    .order("submitted_at", { ascending: false })
    .limit(6);

  if (!attempts || attempts.length === 0) {
    return [
      "*Your results*",
      "",
      "Nothing has been released yet. You will get a message here as soon as",
      "anything is.",
    ].join("\n");
  }

  const { data: exams } = await admin
    .from("exams")
    .select("id, title")
    .in("id", attempts.map((a) => a.exam_id as string));
  const title = new Map((exams ?? []).map((e) => [e.id as string, e.title as string]));

  const lines = ["*Your results*", ""];
  for (const attempt of attempts) {
    const score = attempt.manual_score_override ?? attempt.score;
    lines.push(`• ${title.get(attempt.exam_id as string) ?? "Exam"}: ${score ?? "—"}`);
  }
  if (appUrl) lines.push("", `${appUrl}/student/exams`);
  return lines.join("\n");
}

export async function assignmentsAnswer(
  admin: SupabaseClient,
  studentId: string,
  appUrl: string,
): Promise<string> {
  const { data: student } = await admin
    .from("students")
    .select("cohort_id")
    .eq("id", studentId)
    .maybeSingle();

  const { data: assignments } = await admin
    .from("assignments")
    .select("id, title, due_date")
    .eq("cohort_id", student?.cohort_id)
    .gte("due_date", new Date().toISOString())
    .order("due_date", { ascending: true })
    .limit(6);

  if (!assignments || assignments.length === 0) {
    return ["*Your assignments*", "", "Nothing is due at the moment."].join("\n");
  }

  const { data: submitted } = await admin
    .from("assignment_submissions")
    .select("assignment_id")
    .eq("student_id", studentId)
    .in("assignment_id", assignments.map((a) => a.id as string));
  const done = new Set((submitted ?? []).map((s) => String(s.assignment_id)));

  const lines = ["*Your assignments*", ""];
  for (const assignment of assignments) {
    const mark = done.has(String(assignment.id)) ? "✅" : "•";
    const due = assignment.due_date ? ` — due ${lagosDate(assignment.due_date as string)}` : "";
    lines.push(`${mark} ${assignment.title}${due}`);
  }
  if (appUrl) lines.push("", `${appUrl}/student/assignments`);
  return lines.join("\n");
}

export async function timetableAnswer(
  admin: SupabaseClient,
  studentId: string | null,
  appUrl: string,
): Promise<string> {
  const { data: events } = await admin
    .from("school_events")
    .select("title, start_date, target_cohort_id")
    .gte("start_date", new Date().toISOString())
    .order("start_date", { ascending: true })
    .limit(6);

  const { data: exams } = studentId
    ? await admin
        .from("exams")
        .select("title, start_at")
        .gte("start_at", new Date().toISOString())
        .in("status", ["published", "in_progress"])
        .order("start_at", { ascending: true })
        .limit(4)
    : { data: [] };

  const rows = [
    ...(events ?? []).map((e) => ({ what: e.title as string, when: e.start_date as string })),
    ...(exams ?? []).map((e) => ({ what: `${e.title} (exam)`, when: e.start_at as string })),
  ]
    .filter((r) => r.when)
    .sort((a, b) => a.when.localeCompare(b.when))
    .slice(0, 6);

  if (rows.length === 0) {
    return ["*What's coming up*", "", "Nothing is scheduled at the moment."].join("\n");
  }

  const lines = ["*What's coming up*", ""];
  for (const row of rows) lines.push(`• ${row.what} — ${lagosDate(row.when)}`);
  if (appUrl) lines.push("", `${appUrl}/student/calendar`);
  return lines.join("\n");
}
