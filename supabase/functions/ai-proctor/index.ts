/**
 * What an administrator should look at after an exam.
 *
 * The school collects thousands of webcam snapshots and audio clips and nobody
 * has time to watch them, so in practice none of it is ever reviewed. This does
 * not review them either — it says which attempts are worth opening, and why.
 *
 * Two things are deliberately kept apart.
 *
 * **The signals are arithmetic.** `_shared/integrity.ts` computes them from the
 * records: tab switches, fullscreen exits, time against this cohort's own
 * middle, shared devices, identical answers. That code is tested, and it is
 * what decides the order. No model is involved in the ranking.
 *
 * **The model only writes it up.** It is handed the computed signals and asked
 * for a sentence per attempt. It is told, repeatedly, that it is describing and
 * not deciding — because a model asked whether something looks like cheating
 * will answer confidently in either direction, and a wrongly accused student in
 * a school this size is a serious harm.
 *
 * Nothing is stored and nothing is flagged. The output is a reading list. Every
 * conclusion belongs to the person who opens the footage.
 */
import { chainFailureResponse, corsHeaders, guard, json } from "../_shared/ai-guard.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { reviewAttempts, type AttemptFacts } from "../_shared/integrity.ts";

/** How many attempts get a written note. The rest are returned with their
    signals and no prose, which is all a quiet attempt needs. */
const MAX_NARRATED = 12;

const RULES =
  `You are writing notes for an administrator at a Bible school who is deciding which exam attempts to look at by hand. Each attempt below comes with signals that have already been measured from the records.

Rules:
- One sentence per attempt, at most 30 words. British English, plain and neutral.
- Say only what the signals say. Never add a signal, a number or an inference of your own.
- You are describing, not deciding. Never say or imply that a student cheated, was dishonest, or broke a rule. Say what was measured and leave the judgement to the reader.
- Words like "suspicious", "guilty", "caught", "proof" and "clearly" are banned. "Unusual", "worth checking" and "left the tab" are the register.
- Where a signal has an innocent explanation, say it in the same breath — a shared network is normal on campus, leaving fullscreen may be a dropped connection.
- Do not rank, do not score, and do not recommend a punishment. The order is already decided.

Answer with a JSON object mapping each attempt id to its sentence, and nothing else. No prose, no code fence.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await guard(req, { feature: "ai_proctor_review", audience: "admin" });
  if (!gate.ok) return gate.response;
  const { service } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const examId = String(body?.exam_id ?? "");
    if (!examId) return json({ error: "Which exam?" }, 400);

    const { data: exam } = await service
      .from("exams")
      .select("id, title, duration_minutes")
      .eq("id", examId)
      .maybeSingle();
    const examRow = exam as { title?: string; duration_minutes?: number } | null;
    if (!examRow) return json({ error: "That exam is gone." }, 404);

    const { data: attempts } = await service
      .from("exam_attempts")
      .select(
        "id, student_id, started_at, submitted_at, duration_used_seconds, tab_switch_count, " +
          "fullscreen_exits, submission_reason, auto_submitted, ip_address, device_fingerprint, " +
          "browser_install_id, " +
          "score, max_points",
      )
      .eq("exam_id", examId);

    const rows = (attempts ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) return json({ error: "Nobody has sat this exam yet." }, 404);

    const attemptIds = rows.map((r) => String(r.id));
    const studentIds = [...new Set(rows.map((r) => String(r.student_id)))];

    const [{ data: answers }, { data: snaps }, { data: clips }, { data: students }] =
      await Promise.all([
        service.from("exam_answers").select("attempt_id, question_id, answer").in(
          "attempt_id",
          attemptIds,
        ),
        service.from("exam_snapshots").select("attempt_id").in("attempt_id", attemptIds),
        service.from("exam_audio_clips").select("attempt_id").in("attempt_id", attemptIds),
        service.from("students").select("id, student_code, is_staff_preview, profile_id").in(
          "id",
          studentIds,
        ),
      ]);

    const studentRows = (students ?? []) as {
      id: string;
      student_code: string | null;
      is_staff_preview: boolean | null;
      profile_id: string | null;
    }[];

    const { data: profiles } = await service
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentRows.map((s) => s.profile_id).filter(Boolean) as string[]);

    const nameOf = new Map(
      ((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[])
        .map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]),
    );
    const student = new Map(studentRows.map((s) => [s.id, s]));

    const count = (list: unknown, key: string) => {
      const tally = new Map<string, number>();
      for (const row of (list ?? []) as Record<string, unknown>[]) {
        const id = String(row[key]);
        tally.set(id, (tally.get(id) ?? 0) + 1);
      }
      return tally;
    };
    const snapCount = count(snaps, "attempt_id");
    const clipCount = count(clips, "attempt_id");

    // Answers keyed per attempt, stringified so two answers compare as equal
    // only when they are actually the same choice.
    const answersByAttempt = new Map<string, Record<string, string>>();
    for (const row of (answers ?? []) as Record<string, unknown>[]) {
      const id = String(row.attempt_id);
      if (!answersByAttempt.has(id)) answersByAttempt.set(id, {});
      answersByAttempt.get(id)![String(row.question_id)] = JSON.stringify(row.answer ?? null);
    }

    const facts: AttemptFacts[] = rows
      // A rehearsal by a member of staff is not a student sitting an exam, and
      // including it would put a colleague at the top of the list.
      .filter((r) => !student.get(String(r.student_id))?.is_staff_preview)
      .map((r) => {
        const s = student.get(String(r.student_id));
        const name = (s?.profile_id ? nameOf.get(s.profile_id) : "") || s?.student_code ||
          "Unnamed student";
        const score = Number(r.score);
        const max = Number(r.max_points);
        return {
          attemptId: String(r.id),
          studentId: String(r.student_id),
          studentName: name,
          durationSeconds: r.duration_used_seconds === null
            ? null
            : Number(r.duration_used_seconds),
          tabSwitches: Number(r.tab_switch_count ?? 0),
          fullscreenExits: Number(r.fullscreen_exits ?? 0),
          submissionReason: r.submission_reason === null ? null : String(r.submission_reason),
          autoSubmitted: !!r.auto_submitted,
          ipAddress: r.ip_address === null ? null : String(r.ip_address),
          deviceFingerprint: r.device_fingerprint === null
            ? null
            : String(r.device_fingerprint),
          browserInstallId: r.browser_install_id === null
            ? null
            : String(r.browser_install_id),
          answers: answersByAttempt.get(String(r.id)) ?? {},
          scorePercent: Number.isFinite(score) && Number.isFinite(max) && max > 0
            ? Math.round((score / max) * 100)
            : null,
          snapshots: snapCount.get(String(r.id)) ?? 0,
          audioClips: clipCount.get(String(r.id)) ?? 0,
        };
      });

    const ranked = reviewAttempts(facts);
    const worthNarrating = ranked.filter((r) => r.signals.length > 0).slice(0, MAX_NARRATED);

    // A clean exam needs no model at all. Saying so costs nothing and spends
    // nothing, which matters on a free tier shared by the whole school.
    if (worthNarrating.length === 0) {
      return json({
        exam: examRow.title,
        reviewed: facts.length,
        attempts: ranked,
        notes: {},
        clean: true,
      });
    }

    const listing = worthNarrating
      .map((r) =>
        `${r.attemptId}\n  Student: ${r.studentName}\n${
          r.signals.map((s) => `  - ${s.detail}`).join("\n")
        }`
      )
      .join("\n\n");

    const result = await runChain(
      service,
      `${RULES}\n\nExam: ${examRow.title}\n\nThe attempts:\n\n${listing}`,
      {
        accept: (raw) => {
          try {
            const parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, "").trim());
            return !!parsed && typeof parsed === "object";
          } catch {
            return false;
          }
        },
        maxTokens: 1500,
      },
    );

    // The notes are a convenience. The signals are the substance, and they are
    // returned either way — an exam review must not depend on a free tier
    // having allowance left.
    let notes: Record<string, string> = {};
    if (result.text) {
      try {
        notes = JSON.parse(result.text.replace(/^```(?:json)?|```$/gm, "").trim());
      } catch {
        notes = {};
      }
    }

    return json({
      exam: examRow.title,
      reviewed: facts.length,
      attempts: ranked,
      notes,
      clean: false,
      narrated: !!result.text,
      provider: result.provider,
      usage: gate.usage,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
