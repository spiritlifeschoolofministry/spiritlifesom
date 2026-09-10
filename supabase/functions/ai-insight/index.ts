/**
 * The analytics page in a paragraph.
 *
 * The charts already say everything this does. What they do not do is say which
 * of them changed — a page of twelve charts is read by noticing, and noticing is
 * exactly what nobody has time for between a lecture and a fees query.
 *
 * Built to answer the two fair objections to a feature like this.
 *
 * **It is asked for, not automatic.** Nothing writes a paragraph because a page
 * loaded. A paragraph nobody requested is a paragraph nobody reads, and it
 * would spend a model call every time an admin glanced at their own dashboard.
 *
 * **It is cached for the day.** The figures move slowly; the reading of them
 * moves slower. Opening the page ten times costs one call.
 *
 * As with the exam review, the arithmetic is done here and the model only
 * phrases it. Every number below — including each change over time — is
 * computed from the records, so the paragraph cannot contain a figure that is
 * not true. A model asked to "analyse the trends" would invent a plausible one.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { line } from "../_shared/ai-text.ts";
import { tallyAttendance, type AttendanceRow } from "../_shared/attendance.ts";

const RULES =
  `You are writing a short note for the administrators of Spirit Life School of Ministry, a Christian Bible school, summarising where the school stands. They are looking at the charts these figures come from.

Rules:
- Four or five sentences, at most 130 words. British English, plain and direct.
- Use only the figures given. Never state a number, a percentage or a change that is not in them, and never estimate one.
- Lead with what changed, not with what is largest. They can see the totals; the movement is what a chart does not point out.
- Where a figure has moved, say the direction and the size of the move as given.
- Name at most one thing worth doing about it, and only where the figures point at one. If they do not, say nothing about what to do.
- No greeting, no sign-off, no exclamation marks, no encouragement. This is a briefing, not a report card.
- Never predict, never forecast, and never attribute a cause the figures do not establish. "Attendance fell" is supported; "attendance fell because students are losing interest" is not.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_analytics_note", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const cohortId = body?.cohort_id ? String(body.cohort_id) : null;
    const refresh = body?.refresh === true;

    const today = new Date().toISOString().slice(0, 10);
    const scopeKey = `${today}:${cohortId ?? "all"}`;

    if (!refresh) {
      const { data: cached } = await service
        .from("ai_insights")
        .select("body")
        .eq("scope", "analytics")
        .eq("scope_key", scopeKey)
        .maybeSingle();
      if (cached) return json({ body: (cached as { body: string }).body, cached: true });
    }

    const facts: string[] = [];

    // ---------------------------------------------------------------- people
    let studentQuery = service
      .from("students")
      .select("id, admission_status, learning_mode, cohort_id, is_staff_preview");
    if (cohortId) studentQuery = studentQuery.eq("cohort_id", cohortId);
    const { data: studentRows } = await studentQuery;

    const students = ((studentRows ?? []) as {
      id: string;
      admission_status: string | null;
      learning_mode: string | null;
      cohort_id: string | null;
      is_staff_preview: boolean | null;
    }[]).filter((s) => !s.is_staff_preview);

    const admitted = students.filter((s) =>
      String(s.admission_status ?? "").toUpperCase() === "ADMITTED"
    ).length;
    facts.push(line("Students", students.length));
    facts.push(line("Admitted", admitted));
    if (students.length > admitted) {
      facts.push(line("Not yet admitted", students.length - admitted));
    }

    const modes = new Map<string, number>();
    for (const s of students) {
      const mode = s.learning_mode ?? "unspecified";
      modes.set(mode, (modes.get(mode) ?? 0) + 1);
    }
    facts.push(line(
      "By learning mode",
      [...modes.entries()].map(([mode, n]) => `${mode} ${n}`).join(", "),
    ));

    // ------------------------------------------------------------ attendance
    /**
     * The recent half of the term against the earlier half.
     *
     * A single overall rate hides the only thing worth knowing — whether it is
     * getting better or worse. Split at the midpoint of the sessions actually
     * held, so a term that has barely started compares four classes with four
     * rather than one with twenty.
     */
    const cohortIds = cohortId
      ? [cohortId]
      : [...new Set(students.map((s) => s.cohort_id).filter((id): id is string => !!id))];

    if (cohortIds.length > 0) {
      const { data: sessionRows } = await service
        .from("schedule")
        .select("id, date")
        .in("cohort_id", cohortIds)
        .eq("counts_for_attendance", true)
        .lte("date", today)
        .order("date", { ascending: true });

      const sessions = (sessionRows ?? []) as { id: string; date: string }[];

      /**
       * Only students whose own cohort has held a counted class.
       *
       * A cohort with no counted sessions has no attendance to speak of, and
       * averaging its students in as zero drags the school's figure down by
       * exactly the people it says nothing about. The 2025/2026 cohort has
       * held none, and including its 27 students moved the whole-school figure
       * by several points in the first run of this.
       */
      const cohortsWithSessions = new Set(
        ((sessionRows ?? []) as { id: string }[]).length > 0
          ? (await service
            .from("schedule")
            .select("cohort_id")
            .in("cohort_id", cohortIds)
            .eq("counts_for_attendance", true)
            .lte("date", today)).data
            ?.map((row) => String((row as { cohort_id: string }).cohort_id)) ?? []
          : [],
      );
      const counted = students.filter((s) => s.cohort_id && cohortsWithSessions.has(s.cohort_id));

      if (sessions.length >= 2 && counted.length > 0) {
        const half = Math.floor(sessions.length / 2);
        const earlier = new Set(sessions.slice(0, half).map((s) => s.id));
        const later = new Set(sessions.slice(half).map((s) => s.id));

        const { data: markRows } = await service
          .from("attendance")
          .select("student_id, status, schedule_id, is_verified")
          .in("student_id", counted.map((s) => s.id))
          .limit(50000);

        const marks = (markRows ?? []) as unknown as (AttendanceRow & { student_id: string })[];
        const byStudent = new Map<string, AttendanceRow[]>();
        for (const row of marks) {
          if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, []);
          byStudent.get(row.student_id)!.push(row);
        }

        /** Averaged per student, so one diligent student cannot carry the figure. */
        const rateOver = (ids: Set<string>): number | null => {
          if (ids.size === 0) return null;
          const rates = counted.map((s) => {
            const tally = tallyAttendance(ids, byStudent.get(s.id) ?? []);
            return tally.rate ?? 0;
          });
          if (rates.length === 0) return null;
          return Math.round(rates.reduce((sum, r) => sum + r, 0) / rates.length);
        };

        const before = rateOver(earlier);
        const after = rateOver(later);
        facts.push(line("Classes counted so far", sessions.length));
        if (counted.length !== students.length) {
          facts.push(line(
            "Attendance figures cover",
            `${counted.length} of ${students.length} students, the rest being in cohorts that have held no counted classes`,
          ));
        }
        if (before !== null && after !== null) {
          facts.push(line("Attendance, earlier half of term", `${before}%`));
          facts.push(line("Attendance, recent half", `${after}%`));
          facts.push(line(
            "Attendance change",
            after === before
              ? "unchanged"
              : `${after > before ? "up" : "down"} ${Math.abs(after - before)} points`,
          ));
        }
        // The figure that decides whether anyone acts.
        const overall = rateOver(new Set(sessions.map((s) => s.id)));
        if (overall !== null) {
          const struggling = counted.filter((s) => {
            const tally = tallyAttendance(new Set(sessions.map((x) => x.id)), byStudent.get(s.id) ?? []);
            return (tally.rate ?? 0) < 50;
          }).length;
          facts.push(line("Attendance overall", `${overall}%`));
          facts.push(line("Students below 50%", `${struggling} of ${counted.length}`));
        }
      }
    }

    // ------------------------------------------------------------------ fees
    let feeQuery = service
      .from("fees")
      .select("amount_due, amount_paid, waived, students!inner(cohort_id, is_staff_preview)")
      .eq("waived", false);
    if (cohortId) feeQuery = feeQuery.eq("students.cohort_id", cohortId);
    const { data: feeRows } = await feeQuery.limit(20000);

    const fees = (feeRows ?? []) as unknown as {
      amount_due: number | null;
      amount_paid: number | null;
    }[];
    if (fees.length) {
      const due = fees.reduce((sum, f) => sum + Number(f.amount_due ?? 0), 0);
      const paid = fees.reduce((sum, f) => sum + Number(f.amount_paid ?? 0), 0);
      const outstanding = Math.max(0, due - paid);
      facts.push(line("Fees billed", `₦${Math.round(due).toLocaleString("en-NG")}`));
      facts.push(line("Fees collected", `₦${Math.round(paid).toLocaleString("en-NG")}`));
      facts.push(line("Fees outstanding", `₦${Math.round(outstanding).toLocaleString("en-NG")}`));
      if (due > 0) {
        facts.push(line("Collection rate", `${Math.round((paid / due) * 100)}%`));
      }
    }

    // ----------------------------------------------------------------- exams
    let examQuery = service.from("exams").select("id, title, status, results_released, cohort_id");
    if (cohortId) examQuery = examQuery.eq("cohort_id", cohortId);
    const { data: examRows } = await examQuery;
    const exams = (examRows ?? []) as { id: string; results_released: boolean | null }[];
    if (exams.length) {
      const unreleased = exams.filter((e) => !e.results_released).length;
      facts.push(line("Exams and tests set", exams.length));
      if (unreleased > 0) facts.push(line("With results not yet released", unreleased));
    }

    // --------------------------------------------------------------- marking
    const { data: submissionRows } = await service
      .from("assignment_submissions")
      .select("grade, reviewed_at")
      .limit(20000);
    const submissions = (submissionRows ?? []) as { grade: number | null }[];
    if (submissions.length) {
      const marked = submissions.filter((s) => s.grade !== null);
      facts.push(line("Task submissions", submissions.length));
      facts.push(line("Still unmarked", submissions.length - marked.length));
      if (marked.length) {
        const average = marked.reduce((sum, s) => sum + Number(s.grade), 0) / marked.length;
        facts.push(line("Average task mark", `${Math.round(average)}%`));
      }
    }

    const result = await runChain(
      service,
      `${RULES}\n\nThe figures:\n${facts.filter(Boolean).join("")}`,
      { accept: (raw) => raw.trim().length >= 60, maxTokens: 500 },
    );
    if (!result.text) return chainFailureResponse(result.failures, result.configured);

    const note = result.text.trim();
    await service.from("ai_insights").upsert({
      scope: "analytics",
      scope_key: scopeKey,
      body: note,
      provider: result.provider,
      model: result.model,
    }, { onConflict: "scope,scope_key" });

    return json({
      body: note,
      cached: false,
      provider: result.provider,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
