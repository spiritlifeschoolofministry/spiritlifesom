/**
 * The assistant as a chatbox, for students and for staff.
 *
 * The shape of this function is the whole point, so it is worth stating before
 * the code:
 *
 *   Almost nothing here reaches a model. The questions people actually ask a
 *   school portal are a small, knowable set — "what do I owe", "who hasn't
 *   paid", "what's due this week" — and each is one query. Those are answered
 *   from the database, returned as typed figures, and charged nothing. Only a
 *   question that matches nothing known costs a call, and it gets exactly one,
 *   with a digest measured in a few hundred tokens rather than a transcript.
 *
 *   Figures never come out of a model. Every number the caller sees is a field
 *   in `facts`, rendered by the client as a figure. The model, when it runs at
 *   all, writes prose around numbers it was handed and is told it may not state
 *   one it was not given. "You owe nothing" when a student owes ₦40,000 is
 *   worse than no chatbox, and the only reliable way to prevent it is for the
 *   model to have no opportunity to author the number.
 *
 *   Nothing is read from the request about who is asking. The intent in the
 *   body is a hint about *what* was asked, never about *whose* data to read:
 *   the student id comes from the guard, the audience comes from the role, and
 *   a student asking for an admin intent is refused. A client that lies about
 *   its intent gets a truthful answer to the wrong question.
 *
 *   Read-only, always. There is no action this function can take — no fee
 *   waived, no attendance marked, no result released. An assistant that could
 *   move money or attendance at a school is a liability no convenience
 *   justifies, and a student's own typed message is a live injection path
 *   straight into it.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Mirrors STUDENT_INTENTS / ADMIN_INTENTS in src/lib/chat-intents.ts. */
const STUDENT_INTENTS = ["fees", "tasks", "exams", "attendance", "grades", "week"];
const ADMIN_INTENTS = [
  "unpaid",
  "pending_admissions",
  "pending_payments",
  "attendance_today",
  "engagement",
  "exams_status",
  "overview",
];

/** Longest question worth reading. Past this it is not a question. */
const MAX_QUESTION = 500;

/** How many rows a "who hasn't paid" style answer names. */
const LIST_LIMIT = 12;

/**
 * The rules that cannot be edited from any screen.
 *
 * Every one of these exists because removing it has a specific, foreseeable
 * consequence for a student, so none of them is a matter of taste:
 *
 *   The figures rule is what prevents a confidently wrong balance. The model
 *   is handed numbers and forbidden from authoring one.
 *   The outcome rule stops it implying a pass, a graduation or a certificate
 *   the school has not awarded.
 *   The no-action rule stops it claiming to have done something it cannot do —
 *   this function has no write path whatsoever.
 *
 * `composePrompt` restates them after the school's own guidance so that
 * nothing an admin adds later can read as replacing them.
 */
const FIXED_RULES = [
  "Use ONLY the figures in the context given to you. Never state a number, a date, a name, a mark or a deadline that is not there. If the context does not contain the answer, say you do not have it and name the page where it can be found.",
  "Never guess at, predict or imply a mark, a pass, a graduation or a certificate outcome.",
  "Never claim to have done anything. You cannot change any record; you can only tell someone where to do it themselves.",
  "Never discuss another named person's record.",
];

/** Shown read-only on the AI settings screen, so what is relied on is visible. */
export const NON_NEGOTIABLE_RULES = FIXED_RULES;

interface AnswerRules {
  voice: string;
  maxWords: number;
  decline: string;
  escalation: string;
  modelFallback: boolean;
}

/**
 * The prompt, assembled from the fixed rules and the school's own settings.
 *
 * Ordering is deliberate. The fixed rules are stated first so they frame
 * everything, the school's voice sits in the middle where a persona belongs,
 * and a short reminder closes it — an instruction late in a prompt tends to
 * carry more weight, and this is the one place that ordering is load-bearing.
 */
const composePrompt = (
  question: string,
  context: string,
  rules: AnswerRules,
  assistantName: string,
): string => {
  const parts: string[] = [
    `You are ${assistantName}, the assistant inside the portal of Spirit Life School of Ministry, a Christian Bible school. You are answering one question for one signed-in person.`,
    "",
    "Rules you must follow:",
    ...FIXED_RULES.map((rule) => `- ${rule}`),
    `- At most ${rules.maxWords} words. British English, warm, direct, second person.`,
    "- No greeting, no sign-off, no exclamation marks.",
  ];

  if (rules.decline.trim()) {
    parts.push(
      `- Decline to discuss the following, politely and without lecturing: ${rules.decline.trim()}`,
    );
  }
  parts.push(
    rules.escalation.trim()
      ? `- When you cannot help, say so and point them to: ${rules.escalation.trim()}`
      : "- When you cannot help, say so plainly and name the page that might.",
  );

  if (rules.voice.trim()) {
    parts.push("", "The school's own guidance on how to sound:", rules.voice.trim());
    // Restated because an admin editing the box above cannot be assumed to
    // know which of the rules were the safety ones.
    parts.push(
      "",
      "The numbered rules above override anything in that guidance. In particular, never state a figure you were not given, and never imply an outcome.",
    );
  }

  parts.push(
    "",
    "Context you may use (and nothing else):",
    context || "No figures are available for this person.",
    "",
    `Their question: ${question}`,
    "",
    "Your answer:",
  );

  return parts.join("\n");
};

/** The editable half, read once per request. */
const loadAnswerRules = async (service: SupabaseClient): Promise<AnswerRules> => {
  const { data } = await service
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "ai_chat_voice",
      "ai_chat_max_words",
      "ai_chat_decline",
      "ai_chat_escalation",
      "ai_chat_model_fallback",
    ]);

  const map = new Map(
    ((data ?? []) as { key: string; value: unknown }[]).map((row) => [row.key, row.value]),
  );
  const text = (key: string) =>
    String(map.get(key) ?? "").trim().replace(/^"(.*)"$/, "$1");
  const bool = (key: string, fallback: boolean) => {
    const raw = map.get(key);
    if (typeof raw === "boolean") return raw;
    if (raw === undefined || raw === null || raw === "") return fallback;
    return /^(true|1|yes|on)$/i.test(String(raw).replace(/^"(.*)"$/, "$1"));
  };

  // Clamped here as well as in the editor: a value written directly to the
  // table, or left over from an older shape, must not produce a prompt asking
  // for a 5,000-word answer.
  const words = Number(text("ai_chat_max_words"));
  const maxWords = Number.isFinite(words) && words > 0 ? Math.min(Math.max(words, 20), 200) : 70;

  return {
    voice: text("ai_chat_voice").slice(0, 1500),
    maxWords,
    decline: text("ai_chat_decline").slice(0, 600),
    escalation: text("ai_chat_escalation").slice(0, 200),
    modelFallback: bool("ai_chat_model_fallback", true),
  };
};

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** A `system_settings` number, coping with every shape written to that column. */
const settingNumber = async (
  service: SupabaseClient,
  key: string,
  fallback: number,
): Promise<number> => {
  const { data } = await service
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  const value = Number(String(raw ?? "").trim().replace(/^"(.*)"$/, "$1"));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * What an answer is made of.
 *
 * `figures` are rendered by the client as figures and are the authoritative
 * part. `answer` is a sentence of context around them. `page` is where to go
 * and do something about it, which is the most useful thing a chatbox can
 * offer and the one thing no page can tell you about itself.
 */
interface Resolved {
  answer: string;
  figures?: { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
  items?: { label: string; detail?: string }[];
  page?: { path: string; label: string };
  /** Anything the model would need if this had to fall through to one. */
  digest?: string;
}

// ---------------------------------------------------------------------------
// Student answers
// ---------------------------------------------------------------------------

const studentFees = async (asUser: SupabaseClient): Promise<Resolved> => {
  // Through the caller's own client, so RLS decides which rows exist at all.
  // Waived fees are excluded because nobody is going to collect them, which is
  // the same rule the Fees page and Analytics both apply.
  const { data } = await asUser
    .from("fees")
    .select("fee_type, amount_due, amount_paid, waived")
    .eq("waived", false);

  const rows = (data ?? []) as {
    fee_type: string | null;
    amount_due: number | null;
    amount_paid: number | null;
  }[];

  const due = rows.reduce((sum, row) => sum + (Number(row.amount_due) || 0), 0);
  const paid = rows.reduce((sum, row) => sum + (Number(row.amount_paid) || 0), 0);
  const owed = rows.reduce(
    (sum, row) => sum + Math.max(0, (Number(row.amount_due) || 0) - (Number(row.amount_paid) || 0)),
    0,
  );

  if (rows.length === 0) {
    return {
      answer:
        "You have no fees on your record yet. Nothing is owed, and nothing needs paying until the school assigns one.",
      page: { path: "/student/fees", label: "Fees" },
      digest: "This student has no fee rows at all.",
    };
  }

  return {
    answer: owed > 0
      ? `You still owe ${naira(owed)}. Receipts go up on the Fees page and a member of staff verifies them.`
      : "Your fees are fully settled. Nothing is outstanding.",
    figures: [
      { label: "Outstanding", value: naira(owed), tone: owed > 0 ? "bad" : "good" },
      { label: "Paid", value: naira(paid), tone: "good" },
      { label: "Total charged", value: naira(due) },
    ],
    items: rows
      .filter((row) => (Number(row.amount_due) || 0) - (Number(row.amount_paid) || 0) > 0)
      .map((row) => ({
        label: row.fee_type ?? "Fee",
        detail: `${naira(Math.max(0, (Number(row.amount_due) || 0) - (Number(row.amount_paid) || 0)))} left`,
      })),
    page: { path: "/student/fees", label: "Fees" },
    digest: `Fees: owes ${naira(owed)}, has paid ${naira(paid)} of ${naira(due)} charged.`,
  };
};

const studentTasks = async (
  asUser: SupabaseClient,
  studentId: string,
  cohortId: string | null,
): Promise<Resolved> => {
  if (!cohortId) {
    return {
      answer: "You are not on a cohort yet, so no work has been set for you.",
      page: { path: "/student/assignments", label: "Tasks" },
      digest: "No cohort, so no assignments.",
    };
  }

  // Offline records hold marks for work done onsite and were never "set" to
  // anybody through the portal, so counting them as outstanding would invent
  // homework — the same exclusion Analytics makes for completion rates.
  const [{ data: assignments }, { data: submissions }] = await Promise.all([
    asUser
      .from("assignments")
      .select("id, title, due_date, is_manual_record")
      .eq("cohort_id", cohortId)
      .eq("is_manual_record", false),
    asUser.from("assignment_submissions").select("assignment_id").eq("student_id", studentId),
  ]);

  const submitted = new Set(
    ((submissions ?? []) as { assignment_id: string }[]).map((row) => row.assignment_id),
  );
  const outstanding = ((assignments ?? []) as {
    id: string;
    title: string;
    due_date: string | null;
  }[]).filter((row) => !submitted.has(row.id));

  const today = todayIso();
  const overdue = outstanding.filter((row) => row.due_date && row.due_date < today);

  return {
    answer: outstanding.length === 0
      ? "You have submitted everything that has been set. Nothing is outstanding."
      : `${outstanding.length} task${outstanding.length === 1 ? "" : "s"} still to submit${
        overdue.length ? `, ${overdue.length} of them past the due date` : ""
      }.`,
    figures: [
      {
        label: "To submit",
        value: String(outstanding.length),
        tone: outstanding.length === 0 ? "good" : overdue.length ? "bad" : "warn",
      },
      { label: "Overdue", value: String(overdue.length), tone: overdue.length ? "bad" : "good" },
      { label: "Submitted", value: String(submitted.size), tone: "good" },
    ],
    items: outstanding.slice(0, LIST_LIMIT).map((row) => ({
      label: row.title,
      detail: row.due_date
        ? row.due_date < today ? `overdue — was due ${row.due_date}` : `due ${row.due_date}`
        : "no due date",
    })),
    page: { path: "/student/assignments", label: "Tasks" },
    digest: `Tasks: ${outstanding.length} outstanding, ${overdue.length} overdue, ${submitted.size} submitted.`,
  };
};

const studentExams = async (
  asUser: SupabaseClient,
  cohortId: string | null,
): Promise<Resolved> => {
  if (!cohortId) {
    return {
      answer: "You are not on a cohort yet, so no exams are scheduled for you.",
      page: { path: "/student/exams", label: "Exams" },
      digest: "No cohort, so no exams.",
    };
  }

  // 'draft' is not a thing a student may know about, and 'closed'/'archived'
  // are over. `status` is the exam's own lifecycle column — there is no
  // is_published flag on this table.
  const { data } = await asUser
    .from("exams")
    .select("title, start_at, end_at, status, assessment_type")
    .eq("cohort_id", cohortId)
    .in("status", ["published", "in_progress"])
    .order("start_at", { ascending: true })
    .limit(20);

  const rows = (data ?? []) as {
    title: string;
    start_at: string | null;
    end_at: string | null;
    assessment_type: string | null;
  }[];
  const now = new Date().toISOString();
  const upcoming = rows.filter((row) => !row.end_at || row.end_at >= now);

  return {
    answer: upcoming.length === 0
      ? "Nothing is scheduled for you at the moment. Exams appear here as soon as the school publishes them."
      : `Your next is ${upcoming[0].title}${
        upcoming[0].start_at ? `, starting ${upcoming[0].start_at.slice(0, 10)}` : ""
      }.`,
    figures: [{ label: "Upcoming", value: String(upcoming.length) }],
    items: upcoming.slice(0, LIST_LIMIT).map((row) => ({
      label: row.title,
      detail: row.start_at
        ? `${row.assessment_type ?? "Exam"} — starts ${row.start_at.slice(0, 10)}`
        : `${row.assessment_type ?? "Exam"} — date to be confirmed`,
    })),
    page: { path: "/student/exams", label: "Exams" },
    digest: upcoming.length
      ? `Exams: ${upcoming.length} upcoming, next is "${upcoming[0].title}" starting ${
        upcoming[0].start_at?.slice(0, 10) ?? "unknown"
      }.`
      : "Exams: none scheduled.",
  };
};

const studentAttendance = async (
  service: SupabaseClient,
  studentId: string,
  cohortId: string | null,
): Promise<Resolved> => {
  if (!cohortId) {
    return {
      answer: "You are not on a cohort yet, so there are no classes to attend.",
      page: { path: "/student/attendance", label: "Attendance" },
      digest: "No cohort, so no attendance.",
    };
  }

  // Measured the way the Attendance page and Analytics measure it: against
  // the counted sessions the cohort has actually held. An absence is a missing
  // row, so counting rows alone always came out near 100%.
  const [{ data: sessions }, { data: marks }] = await Promise.all([
    service
      .from("schedule")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("counts_for_attendance", true)
      .lte("date", todayIso()),
    service
      .from("attendance")
      .select("status, is_verified")
      .eq("student_id", studentId)
      .eq("is_verified", true),
  ]);

  const held = (sessions ?? []).length;
  const counted = ((marks ?? []) as { status: string | null }[]).filter((row) =>
    /present|late/i.test(String(row.status ?? ""))
  ).length;

  if (held === 0) {
    return {
      answer: "No classes counting towards attendance have been held yet.",
      page: { path: "/student/attendance", label: "Attendance" },
      digest: "Attendance: no counted sessions held yet.",
    };
  }

  const rate = Math.round((counted / held) * 100);
  return {
    answer: rate >= 75
      ? `You have attended ${counted} of ${held} classes — ${rate}%, which is good standing.`
      : `You have attended ${counted} of ${held} classes, which is ${rate}%. Anything under 75% is worth talking to the school about.`,
    figures: [
      {
        label: "Attendance",
        value: `${rate}%`,
        tone: rate >= 75 ? "good" : rate >= 50 ? "warn" : "bad",
      },
      { label: "Attended", value: String(counted) },
      { label: "Classes held", value: String(held) },
    ],
    page: { path: "/student/attendance", label: "Attendance" },
    digest: `Attendance: ${counted} of ${held} counted classes (${rate}%).`,
  };
};

const studentGrades = async (
  asUser: SupabaseClient,
  studentId: string,
): Promise<Resolved> => {
  // Coursework marks only. Exam marks are deliberately not read here: whether
  // a student may see them is `exams.results_released`, and a chatbox that
  // inferred "did I pass?" from marks it could technically read would be
  // telling them sideways what the school has not released. That is what the
  // Assessments page is for, where the release flag gates each row.
  const { data } = await asUser
    .from("assignment_submissions")
    .select("grade, assignments(title, max_points)")
    .eq("student_id", studentId)
    .not("grade", "is", null)
    .limit(50);

  const rows = (data ?? []) as {
    grade: number | null;
    assignments: { title: string; max_points: number | null } | null;
  }[];

  if (rows.length === 0) {
    return {
      answer:
        "Nothing of yours has been marked yet. Marks appear on the Assessments page as they are released.",
      page: { path: "/student/grades", label: "Assessments" },
      digest: "Grades: nothing marked yet.",
    };
  }

  const earned = rows.reduce((sum, row) => sum + (Number(row.grade) || 0), 0);
  const available = rows.reduce((sum, row) => sum + (Number(row.assignments?.max_points) || 100), 0);
  const pct = available > 0 ? Math.round((earned / available) * 100) : 0;

  return {
    answer:
      `Across ${rows.length} marked task${rows.length === 1 ? "" : "s"} you are averaging ${pct}%. Exam results appear on the Assessments page once the school releases them.`,
    figures: [
      {
        label: "Coursework average",
        value: `${pct}%`,
        tone: pct >= 70 ? "good" : pct >= 50 ? "warn" : "bad",
      },
      { label: "Tasks marked", value: String(rows.length) },
    ],
    items: rows.slice(0, LIST_LIMIT).map((row) => ({
      label: row.assignments?.title ?? "Task",
      detail: `${row.grade} / ${row.assignments?.max_points ?? 100}`,
    })),
    page: { path: "/student/grades", label: "Assessments" },
    digest:
      `Coursework: ${rows.length} marked, averaging ${pct}%. Exam results not read — release is per exam.`,
  };
};

/** The cross-cutting one: the thing no single page can answer. */
const studentWeek = async (
  service: SupabaseClient,
  asUser: SupabaseClient,
  studentId: string,
  cohortId: string | null,
): Promise<Resolved> => {
  const [fees, tasks, exams, attendance] = await Promise.all([
    studentFees(asUser),
    studentTasks(asUser, studentId, cohortId),
    studentExams(asUser, cohortId),
    studentAttendance(service, studentId, cohortId),
  ]);

  const figures = [
    tasks.figures?.find((f) => f.label === "To submit"),
    exams.figures?.find((f) => f.label === "Upcoming"),
    fees.figures?.find((f) => f.label === "Outstanding"),
    attendance.figures?.find((f) => f.label === "Attendance"),
  ].filter(Boolean) as Resolved["figures"];

  // Ordered by what actually needs doing, so the first line is the first job.
  const jobs: { label: string; detail?: string }[] = [];
  const outstandingTasks = Number(tasks.figures?.find((f) => f.label === "To submit")?.value ?? 0);
  const overdueTasks = Number(tasks.figures?.find((f) => f.label === "Overdue")?.value ?? 0);
  if (overdueTasks > 0) {
    jobs.push({ label: `${overdueTasks} overdue task${overdueTasks === 1 ? "" : "s"}`, detail: "Tasks" });
  } else if (outstandingTasks > 0) {
    jobs.push({ label: `${outstandingTasks} task${outstandingTasks === 1 ? "" : "s"} to submit`, detail: "Tasks" });
  }
  (exams.items ?? []).slice(0, 2).forEach((item) =>
    jobs.push({ label: item.label, detail: `Exam — ${item.detail}` })
  );
  const owed = fees.figures?.find((f) => f.label === "Outstanding");
  if (owed && owed.tone === "bad") jobs.push({ label: `${owed.value} in fees outstanding`, detail: "Fees" });

  return {
    answer: jobs.length === 0
      ? "Nothing is outstanding — your work is in, your fees are settled and no exam is waiting."
      : `${jobs.length} thing${jobs.length === 1 ? "" : "s"} need your attention.`,
    figures,
    items: jobs,
    page: jobs.length ? { path: "/student/assignments", label: "Tasks" } : undefined,
    digest: [fees.digest, tasks.digest, exams.digest, attendance.digest].filter(Boolean).join(" "),
  };
};

// ---------------------------------------------------------------------------
// Admin answers
// ---------------------------------------------------------------------------

const adminUnpaid = async (asUser: SupabaseClient): Promise<Resolved> => {
  // Scoped to the active cohort, because "who hasn't paid" always means this
  // session — a closed session's balances are written off, not chased.
  const { data: cohort } = await asUser
    .from("cohorts")
    .select("id, name")
    .eq("is_active", true)
    .maybeSingle();
  const activeCohort = cohort as { id: string; name: string } | null;
  if (!activeCohort) {
    return {
      answer: "No cohort is marked active, so there is no current session to report on.",
      page: { path: "/admin/settings", label: "Settings" },
      digest: "No active cohort.",
    };
  }

  const { data: students } = await asUser
    .from("students")
    .select("id, profile:profiles(first_name, last_name)")
    .eq("cohort_id", activeCohort.id)
    .eq("is_staff_preview", false);

  const rows = (students ?? []) as {
    id: string;
    profile: { first_name: string | null; last_name: string | null } | null;
  }[];
  if (rows.length === 0) {
    return {
      answer: `No students are on ${activeCohort.name} yet.`,
      page: { path: "/admin/students", label: "Students" },
      digest: `Active cohort ${activeCohort.name} has no students.`,
    };
  }

  const { data: fees } = await asUser
    .from("fees")
    .select("student_id, amount_due, amount_paid, cohort_id")
    .in("student_id", rows.map((row) => row.id))
    .eq("waived", false);

  const owedBy = new Map<string, number>();
  ((fees ?? []) as {
    student_id: string;
    amount_due: number | null;
    amount_paid: number | null;
    cohort_id: string | null;
  }[])
    // A fee naming its own session is held to it; one with no cohort falls
    // back to its student's, which the query above already scoped.
    .filter((fee) => !fee.cohort_id || fee.cohort_id === activeCohort.id)
    .forEach((fee) => {
      const balance = Math.max(0, (Number(fee.amount_due) || 0) - (Number(fee.amount_paid) || 0));
      if (balance > 0) owedBy.set(fee.student_id, (owedBy.get(fee.student_id) ?? 0) + balance);
    });

  const debtors = rows
    .filter((row) => owedBy.has(row.id))
    .map((row) => ({
      label: [row.profile?.first_name, row.profile?.last_name].filter(Boolean).join(" ") ||
        "Unnamed student",
      detail: naira(owedBy.get(row.id) ?? 0),
      amount: owedBy.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const total = debtors.reduce((sum, row) => sum + row.amount, 0);

  return {
    answer: debtors.length === 0
      ? `Every student on ${activeCohort.name} is fully paid up.`
      : `${debtors.length} of ${rows.length} students on ${activeCohort.name} owe ${naira(total)} between them.`,
    figures: [
      {
        label: "Students owing",
        value: `${debtors.length} of ${rows.length}`,
        tone: debtors.length ? "warn" : "good",
      },
      { label: "Total outstanding", value: naira(total), tone: total ? "bad" : "good" },
    ],
    items: debtors.slice(0, LIST_LIMIT).map(({ label, detail }) => ({ label, detail })),
    page: { path: "/admin/fees", label: "Fees" },
    digest: `${debtors.length} of ${rows.length} students on ${activeCohort.name} owe ${naira(total)} in total.`,
  };
};

const adminPendingAdmissions = async (asUser: SupabaseClient): Promise<Resolved> => {
  const { data, count } = await asUser
    .from("students")
    .select("id, learning_mode, profile:profiles(first_name, last_name)", { count: "exact" })
    .eq("is_staff_preview", false)
    .ilike("admission_status", "pending")
    .order("created_at", { ascending: true })
    .limit(LIST_LIMIT);

  const rows = (data ?? []) as {
    learning_mode: string | null;
    profile: { first_name: string | null; last_name: string | null } | null;
  }[];

  return {
    answer: (count ?? 0) === 0
      ? "No applications are waiting. Nothing to approve."
      : `${count} application${count === 1 ? "" : "s"} waiting for a decision.`,
    figures: [{ label: "Waiting", value: String(count ?? 0), tone: count ? "warn" : "good" }],
    items: rows.map((row) => ({
      label: [row.profile?.first_name, row.profile?.last_name].filter(Boolean).join(" ") ||
        "Unnamed applicant",
      detail: row.learning_mode ?? "mode not set",
    })),
    page: { path: "/admin/admissions", label: "Admissions/Requests" },
    digest: `${count ?? 0} pending admission applications.`,
  };
};

const adminPendingPayments = async (asUser: SupabaseClient): Promise<Resolved> => {
  const { count } = await asUser
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  return {
    answer: (count ?? 0) === 0
      ? "No receipts are waiting to be verified."
      : `${count} receipt${count === 1 ? "" : "s"} waiting to be verified or rejected.`,
    figures: [{ label: "To verify", value: String(count ?? 0), tone: count ? "warn" : "good" }],
    page: { path: "/admin/payments", label: "Payments" },
    digest: `${count ?? 0} payments pending verification.`,
  };
};

const adminAttendanceToday = async (
  asUser: SupabaseClient,
  service: SupabaseClient,
): Promise<Resolved> => {
  const today = todayIso();

  // `schedule` carries no title and no "open" flag. What a session is called
  // comes from its activity type, and whether check-in is open lives in the
  // `class_today` system setting, keyed by cohort — the same value
  // StudentAttendance reads. Reading a column that does not exist here would
  // have failed silently and reported no classes on a day full of them.
  const [{ data: sessions }, { data: classToday }] = await Promise.all([
    asUser
      .from("schedule")
      .select("id, activity_type, description, cohort_id, counts_for_attendance, start_time")
      .eq("date", today),
    service.from("system_settings").select("value").eq("key", "class_today").maybeSingle(),
  ]);

  const rows = (sessions ?? []) as {
    id: string;
    activity_type: string | null;
    description: string | null;
    cohort_id: string | null;
    counts_for_attendance: boolean | null;
    start_time: string | null;
  }[];

  if (rows.length === 0) {
    return {
      answer: "Nothing is scheduled for today, so there is no register to take.",
      page: { path: "/admin/attendance", label: "Attendance" },
      digest: "No classes scheduled today.",
    };
  }

  // Two shapes have been written to this key over time: per-cohort toggles,
  // and an older single `enabled` boolean for the whole school.
  const setting = (classToday as { value?: unknown } | null)?.value as
    | { date?: string; enabled?: boolean; cohorts?: Record<string, unknown> }
    | null;
  const openForToday = setting?.date === today;
  const openCohorts = new Set(
    openForToday && setting?.cohorts ? Object.keys(setting.cohorts) : [],
  );
  const openEverywhere = openForToday && !setting?.cohorts && setting?.enabled === true;
  const openCount = openEverywhere
    ? rows.length
    : rows.filter((row) => row.cohort_id && openCohorts.has(row.cohort_id)).length;

  const { count: marked } = await asUser
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .in("schedule_id", rows.map((row) => row.id))
    .eq("is_verified", true);

  return {
    answer:
      `${rows.length} session${rows.length === 1 ? "" : "s"} scheduled today, ${openCount} open for check-in, ${marked ?? 0} verified mark${
        (marked ?? 0) === 1 ? "" : "s"
      } so far.`,
    figures: [
      { label: "Sessions today", value: String(rows.length) },
      {
        label: "Open for check-in",
        value: String(openCount),
        tone: openCount ? "good" : "warn",
      },
      { label: "Verified marks", value: String(marked ?? 0) },
    ],
    items: rows.map((row) => ({
      label: row.description || row.activity_type || "Class",
      detail: [
        row.start_time ? row.start_time.slice(0, 5) : null,
        row.counts_for_attendance ? "counts for attendance" : "not counted",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    page: { path: "/admin/attendance", label: "Attendance" },
    digest: `Today: ${rows.length} sessions, ${openCount} open for check-in, ${marked ?? 0} verified marks.`,
  };
};

const adminEngagement = async (asUser: SupabaseClient): Promise<Resolved> => {
  const { data } = await asUser.rpc("activity_pulse");
  const pulse = ((data ?? []) as Record<string, number | string | null>[])[0];

  if (!pulse || pulse.first_event_day === null) {
    return {
      answer:
        "Nothing has been recorded yet. Views and downloads are counted from the day the feature went live, so there is no history before then.",
      page: { path: "/admin/analytics", label: "Analytics" },
      digest: "No activity events recorded yet.",
    };
  }

  const num = (key: string) => Number(pulse[key]) || 0;
  return {
    answer:
      `Today: ${num("views_today")} page views and ${num("downloads_today")} downloads from ${num("active_today")} people. Over the last seven days that is ${num("views_week")} views from ${num("active_week")} people.`,
    figures: [
      { label: "Views today", value: String(num("views_today")) },
      { label: "Downloads today", value: String(num("downloads_today")) },
      { label: "People today", value: String(num("active_today")) },
      { label: "People this week", value: String(num("active_week")) },
    ],
    page: { path: "/admin/analytics", label: "Analytics" },
    digest: `Engagement today: ${num("views_today")} views, ${num("downloads_today")} downloads, ${num("active_today")} people. Week: ${num("views_week")} views, ${num("active_week")} people.`,
  };
};

const adminExamsStatus = async (asUser: SupabaseClient): Promise<Resolved> => {
  // 'closed' and 'archived' are finished; a draft has not been set. Only a
  // published or running exam is worth reporting on, and `results_released`
  // is what decides whether students can see their marks.
  const [{ data: exams }, { count: inProgress }] = await Promise.all([
    asUser
      .from("exams")
      .select("title, status, results_released")
      .in("status", ["published", "in_progress", "closed"])
      .limit(60),
    asUser
      .from("exam_attempts")
      .select("id", { count: "exact", head: true })
      .is("submitted_at", null),
  ]);

  const rows = (exams ?? []) as {
    title: string;
    status: string | null;
    results_released: boolean | null;
  }[];
  const awaitingRelease = rows.filter((row) => !row.results_released);

  return {
    answer: `${inProgress ?? 0} sitting${(inProgress ?? 0) === 1 ? "" : "s"} in progress right now, and ${awaitingRelease.length} exam${
      awaitingRelease.length === 1 ? "" : "s"
    } with results not yet released.`,
    figures: [
      {
        label: "Sittings in progress",
        value: String(inProgress ?? 0),
        tone: (inProgress ?? 0) > 0 ? "warn" : "good",
      },
      { label: "Awaiting release", value: String(awaitingRelease.length) },
      { label: "Live exams", value: String(rows.length) },
    ],
    items: awaitingRelease.slice(0, LIST_LIMIT).map((row) => ({
      label: row.title,
      detail: `${row.status ?? "unknown"} — results not released`,
    })),
    page: { path: "/admin/exams", label: "Exams" },
    digest: `Exams: ${inProgress ?? 0} sittings in progress, ${awaitingRelease.length} awaiting result release.`,
  };
};

const adminOverview = async (asUser: SupabaseClient): Promise<Resolved> => {
  const [admissions, payments, unpaid, engagement] = await Promise.all([
    adminPendingAdmissions(asUser),
    adminPendingPayments(asUser),
    adminUnpaid(asUser),
    adminEngagement(asUser),
  ]);

  const jobs: { label: string; detail?: string }[] = [];
  const waiting = Number(admissions.figures?.[0]?.value ?? 0);
  const toVerify = Number(payments.figures?.[0]?.value ?? 0);
  if (waiting > 0) {
    jobs.push({ label: `${waiting} admission${waiting === 1 ? "" : "s"} to decide`, detail: "Admissions" });
  }
  if (toVerify > 0) {
    jobs.push({ label: `${toVerify} receipt${toVerify === 1 ? "" : "s"} to verify`, detail: "Payments" });
  }
  const owing = unpaid.figures?.find((f) => f.label === "Total outstanding");
  if (owing && owing.tone === "bad") jobs.push({ label: `${owing.value} in fees outstanding`, detail: "Fees" });

  return {
    answer: jobs.length === 0
      ? "Nothing needs a decision right now — no admissions, no receipts and no outstanding fees this session."
      : `${jobs.length} thing${jobs.length === 1 ? "" : "s"} waiting on you.`,
    figures: [
      ...(admissions.figures ?? []).map((f) => ({ ...f, label: "Admissions waiting" })),
      ...(payments.figures ?? []).map((f) => ({ ...f, label: "Receipts to verify" })),
      ...(unpaid.figures ?? []).filter((f) => f.label === "Total outstanding"),
      ...(engagement.figures ?? []).filter((f) => f.label === "People today"),
    ],
    items: jobs,
    page: jobs.length ? { path: "/admin/dashboard", label: "Dashboard" } : undefined,
    digest: [admissions.digest, payments.digest, unpaid.digest, engagement.digest]
      .filter(Boolean)
      .join(" "),
  };
};

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").trim().slice(0, MAX_QUESTION);
  const hinted = String(body?.intent ?? "");
  // Which portal the question was asked from. Validated against the caller's
  // role below — see the note on `audience`.
  const fromPortal = body?.audience === "admin" ? "admin" : "student";

  if (!question) return json({ error: "Ask a question." }, 400);

  /**
   * `countsQuota: false` so the gate runs — switch, role, exam lock, identity —
   * without spending anything. A recognised question is answered from the
   * database and must cost the school nothing; only a fall-through to a model
   * charges, and it charges itself below. Doing it the other way round would
   * mean a student asking "what do I owe" four times had spent a fifth of
   * their day's allowance on four database reads.
   */
  const gate = await guard(req, { feature: "ai_chat", audience: "any", countsQuota: false });
  if (!gate.ok) return gate.response;
  const { service, asUser, userId, role, studentId, assistantName } = gate;

  /**
   * Which portal is asking, not what the asker happens to be.
   *
   * This was originally derived from the role alone, which was wrong in a way
   * that only showed up in use: staff hold a preview student record precisely
   * so they can see the portal as a student sees it, and an admin opening the
   * chatbox on the *student* dashboard was answered with the school's books —
   * pending payments, every student in arrears, the week's traffic. Not a leak,
   * since they were entitled to all of it, but an answer to a question nobody
   * asked, in the one place built to show them what a student sees.
   *
   * It also silently cost money: the student intent the client had classified
   * was not on the admin allowlist, so every such question was rejected as
   * unrecognised and fell through to a model call — the one path that spends.
   *
   * So the portal asks, and the role decides whether it may. Staff may ask as
   * either; a student asking as an admin is refused here rather than trusted.
   */
  const isStaff = ["admin", "teacher"].includes((role ?? "").toLowerCase());
  if (fromPortal === "admin" && !isStaff) {
    return json({ error: "Only teachers and admins may ask about the school." }, 403);
  }
  if (fromPortal === "student" && !studentId) {
    return json({
      answer:
        "This account has no student record, so there is nothing personal to report here. Ask from the admin dashboard for the school's own figures.",
      figures: [],
      items: [],
      page: null,
      source: "records",
    });
  }

  const audience: "admin" | "student" = fromPortal;
  const allowed = audience === "admin" ? ADMIN_INTENTS : STUDENT_INTENTS;
  const intent = allowed.includes(hinted) ? hinted : null;

  try {
    let resolved: Resolved | null = null;

    if (intent && audience === "student" && studentId) {
      const { data: studentRow } = await service
        .from("students")
        .select("cohort_id")
        .eq("id", studentId)
        .maybeSingle();
      const cohortId = (studentRow as { cohort_id: string | null } | null)?.cohort_id ?? null;

      if (intent === "fees") resolved = await studentFees(asUser);
      else if (intent === "tasks") resolved = await studentTasks(asUser, studentId, cohortId);
      else if (intent === "exams") resolved = await studentExams(asUser, cohortId);
      else if (intent === "attendance") {
        resolved = await studentAttendance(service, studentId, cohortId);
      } else if (intent === "grades") resolved = await studentGrades(asUser, studentId);
      else if (intent === "week") {
        resolved = await studentWeek(service, asUser, studentId, cohortId);
      }
    } else if (intent && audience === "admin") {
      if (intent === "unpaid") resolved = await adminUnpaid(asUser);
      else if (intent === "pending_admissions") resolved = await adminPendingAdmissions(asUser);
      else if (intent === "pending_payments") resolved = await adminPendingPayments(asUser);
      else if (intent === "attendance_today") {
        resolved = await adminAttendanceToday(asUser, service);
      }
      else if (intent === "engagement") resolved = await adminEngagement(asUser);
      else if (intent === "exams_status") resolved = await adminExamsStatus(asUser);
      else if (intent === "overview") resolved = await adminOverview(asUser);
    }

    // The common path: answered from the database, no model, nothing charged.
    if (resolved) {
      return json({
        answer: resolved.answer,
        figures: resolved.figures ?? [],
        items: resolved.items ?? [],
        page: resolved.page ?? null,
        source: "records",
      });
    }

    // ------------------------------------------------------- the model path
    //
    // Only reached by a question nothing recognised.
    const rules = await loadAnswerRules(service);

    // The school can switch this off entirely. With no fallback there is no
    // model call, so no invented answer is possible and nothing is charged —
    // the chatbox becomes strictly a reader of records and of the portal map,
    // which is a defensible way to run it.
    if (!rules.modelFallback) {
      return json({
        answer: rules.escalation.trim()
          ? `I can only answer questions about ${
            audience === "admin" ? "the school's records" : "your own record"
          } and about where to find things in the portal. For this one, ${rules.escalation.trim()}.`
          : `I can only answer questions about ${
            audience === "admin" ? "the school's records" : "your own record"
          } and about where to find things in the portal. This one is outside that, so it is worth asking the school directly.`,
        figures: [],
        items: [],
        page: null,
        source: "records",
      });
    }

    // Charged here, and against `ai_daily_limit_chat` rather than the role's
    // general allowance, because a chatbox invites far more messages than a
    // button does.
    const limit = await settingNumber(service, "ai_daily_limit_chat", 40);
    const { data: quota, error: quotaError } = await service.rpc("ai_consume_quota", {
      p_user_id: userId,
      p_feature: "ai_chat",
      p_limit: limit,
    });
    if (quotaError) return json({ error: quotaError.message }, 500);
    const spend = ((quota ?? []) as { allowed: boolean; used: number; quota: number }[])[0];
    if (spend && !spend.allowed) {
      return json({
        error:
          `You have asked ${spend.used} questions today, which is this school's daily limit. The pages themselves are all still there.`,
      }, 429);
    }

    // A digest of the caller's own situation, so the model has real figures to
    // write around and no reason to invent any. Small on purpose: this is a
    // few hundred tokens, not a conversation history.
    const context = audience === "admin"
      ? (await adminOverview(asUser)).digest
      : studentId
      ? (await studentWeek(
        service,
        asUser,
        studentId,
        ((await service.from("students").select("cohort_id").eq("id", studentId).maybeSingle())
          .data as { cohort_id: string | null } | null)?.cohort_id ?? null,
      )).digest
      : "";

    const chain = await runChain(
      service,
      composePrompt(question, context ?? "", rules, assistantName),
      // Roughly two tokens a word plus room for the sentence to finish, so a
      // school that asks for shorter answers actually pays for shorter ones.
      { maxTokens: Math.round(rules.maxWords * 2.2) + 40 },
    );

    if (!chain.text) return chainFailureResponse(chain);

    return json({
      answer: chain.text.trim(),
      figures: [],
      items: [],
      page: null,
      source: "model",
      usage: spend ? { used: spend.used, quota: spend.quota } : undefined,
    });
  } catch (err) {
    console.error("ai-chat failed", err);
    return json({ error: err instanceof Error ? err.message : "The assistant is unavailable." }, 500);
  }
});
