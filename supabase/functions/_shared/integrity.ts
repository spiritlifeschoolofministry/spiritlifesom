/**
 * Ranking exam attempts by how much they warrant a human looking at them.
 *
 * Every signal here is computed, not judged. That is the whole design: a model
 * asked "does this look like cheating" will answer confidently either way, and
 * a wrongly accused student in a school of this size is a serious harm. So the
 * arithmetic happens in code where it can be tested and shown, and the model's
 * only job downstream is to say the same numbers in a sentence.
 *
 * Nothing here concludes anything. A signal means "unusual compared with this
 * exam's own cohort", which is a reason to open the footage, not a verdict. The
 * words used deliberately stop short: "unusual", "worth checking", never
 * "cheated" or "suspicious".
 *
 * The comparisons are within one exam, never across exams. A paper everybody
 * finishes in ten minutes makes ten minutes normal, and a rule imported from
 * another exam would flag the whole cohort.
 */

export interface AttemptFacts {
  attemptId: string;
  studentId: string;
  /** For display only; never used in the arithmetic. */
  studentName: string;
  durationSeconds: number | null;
  tabSwitches: number;
  fullscreenExits: number;
  submissionReason: string | null;
  autoSubmitted: boolean;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  /** The browser's own random label, or null where storage was refused. */
  browserInstallId: string | null;
  /** Question id -> the answer given, already normalised to a string. */
  answers: Record<string, string>;
  scorePercent: number | null;
  snapshots: number;
  audioClips: number;
}

export interface Signal {
  /** Stable name, so the UI can style or filter without parsing prose. */
  kind:
    | "tab_switching"
    | "fullscreen_exits"
    | "stopped_for_breach"
    | "unusually_fast"
    | "shared_network"
    | "same_browser"
    | "matching_answers"
    | "no_footage";
  /** What was measured, in plain words. Carries the numbers. */
  detail: string;
  /** 1 worth a glance, 2 worth checking, 3 look at this one first. */
  weight: 1 | 2 | 3;
}

export interface RankedAttempt {
  attemptId: string;
  studentId: string;
  studentName: string;
  signals: Signal[];
  /** Sum of weights. Ordering only — not a probability, and not a score. */
  concern: number;
}

/** The middle value, for comparing an attempt against its own cohort. */
export const median = (values: number[]): number | null => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

/**
 * How alike two attempts' answers are, over the questions both answered.
 *
 * Agreement on its own means little — everyone gets the easy ones right, and a
 * well-taught cohort agreeing is the system working. What carries weight is
 * agreement on answers that are *wrong*: two students independently arriving at
 * the same wrong answer to the same question is the coincidence worth noticing.
 */
export const answerAgreement = (
  a: Record<string, string>,
  b: Record<string, string>,
): { shared: number; same: number; rate: number } => {
  let shared = 0;
  let same = 0;
  for (const [question, answer] of Object.entries(a)) {
    const other = b[question];
    if (other === undefined || answer === "" || other === "") continue;
    shared += 1;
    if (answer === other) same += 1;
  }
  return { shared, same, rate: shared === 0 ? 0 : same / shared };
};

/** Past this, over enough shared questions, two papers are worth comparing by eye. */
export const MATCHING_ANSWERS = 0.9;
/** Below this many shared questions the rate says nothing. */
export const MIN_SHARED_QUESTIONS = 5;
/** An attempt this much faster than the cohort's middle is unusual for this paper. */
export const FAST_FRACTION = 0.4;

export const reviewAttempts = (attempts: AttemptFacts[]): RankedAttempt[] => {
  const durations = attempts
    .map((a) => a.durationSeconds)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const middleDuration = median(durations);

  // Networks and devices are only interesting where they are shared, so the
  // counting happens once rather than per attempt.
  const perIp = new Map<string, Set<string>>();
  for (const a of attempts) {
    if (a.ipAddress) {
      if (!perIp.has(a.ipAddress)) perIp.set(a.ipAddress, new Set());
      perIp.get(a.ipAddress)!.add(a.studentId);
    }
  }

  const perBrowser = new Map<string, Set<string>>();
  for (const a of attempts) {
    if (a.browserInstallId) {
      if (!perBrowser.has(a.browserInstallId)) perBrowser.set(a.browserInstallId, new Set());
      perBrowser.get(a.browserInstallId)!.add(a.studentId);
    }
  }

  /**
   * `device_fingerprint` is deliberately not a signal.
   *
   * It is built from the user agent, language, screen size, timezone offset and
   * core count, which identifies a *model* rather than a device: ten students
   * on the same handset, same browser and same timezone produce one identical
   * value. Run against this school's real attempts it marked ten students per
   * exam as sharing a device — half the cohort, at the top of the list, wrongly.
   *
   * Making it usable needs a random id generated once per install and kept in
   * that browser's storage. That is a real change to the runner, it only ever
   * describes devices from the day it ships, and it is still defeated by a
   * cleared browser. Until then, silence is the honest output.
   */

  const ranked: RankedAttempt[] = attempts.map((a) => {
    const signals: Signal[] = [];

    if (a.tabSwitches > 0) {
      signals.push({
        kind: "tab_switching",
        detail: `Left the exam tab ${a.tabSwitches} time${a.tabSwitches === 1 ? "" : "s"}.`,
        weight: a.tabSwitches >= 5 ? 3 : a.tabSwitches >= 2 ? 2 : 1,
      });
    }

    if (a.fullscreenExits > 0) {
      signals.push({
        kind: "fullscreen_exits",
        detail: `Left fullscreen ${a.fullscreenExits} time${a.fullscreenExits === 1 ? "" : "s"}.`,
        weight: a.fullscreenExits >= 3 ? 3 : 2,
      });
    }

    // The system already stopped this one. It is at the top of the list not
    // because the software judged it, but because a rule the school set was hit.
    const reason = String(a.submissionReason ?? "").toLowerCase();
    if (reason && reason !== "manual" && reason !== "timeout") {
      signals.push({
        kind: "stopped_for_breach",
        detail: `The attempt was stopped automatically (${a.submissionReason}).`,
        weight: 3,
      });
    }

    if (
      middleDuration !== null && typeof a.durationSeconds === "number" &&
      a.durationSeconds > 0 && a.durationSeconds < middleDuration * FAST_FRACTION
    ) {
      signals.push({
        kind: "unusually_fast",
        detail: `Finished in ${Math.round(a.durationSeconds / 60)} minutes, against ${
          Math.round(middleDuration / 60)
        } for the middle of this cohort.`,
        weight: 2,
      });
    }

    const ipShare = a.ipAddress ? perIp.get(a.ipAddress)! : null;
    if (ipShare && ipShare.size > 1) {
      signals.push({
        kind: "shared_network",
        detail:
          `Sat from the same network as ${ipShare.size - 1} other student${
            ipShare.size === 2 ? "" : "s"
          }. Normal for anyone sitting on campus or sharing a household connection.`,
        weight: 1,
      });
    }

    /**
     * One browser, two students, one exam.
     *
     * Weighted below a breach and below matching answers on purpose. It is a
     * fact about equipment, not about a person: a couple studying together on
     * one laptop, a student who borrowed a phone because theirs died, and two
     * people taking turns to help each other all look identical here. So the
     * innocent reading is given in the same sentence as the finding, and the
     * word "shared" is used rather than anything implying intent.
     */
    const browserShare = a.browserInstallId ? perBrowser.get(a.browserInstallId)! : null;
    if (browserShare && browserShare.size > 1) {
      signals.push({
        kind: "same_browser",
        detail: `This exam was also sat by ${browserShare.size - 1} other student${
          browserShare.size === 2 ? "" : "s"
        } on the same browser. Households and shared computers look the same as anything else, so this is a question to ask rather than a finding.`,
        weight: 2,
      });
    }

    if (a.snapshots === 0 && a.audioClips === 0) {
      signals.push({
        kind: "no_footage",
        detail:
          "No webcam or audio recording was captured, so there is nothing to review for this attempt.",
        weight: 1,
      });
    }

    return {
      attemptId: a.attemptId,
      studentId: a.studentId,
      studentName: a.studentName,
      signals,
      concern: signals.reduce((sum, s) => sum + s.weight, 0),
    };
  });

  // Matching answers are a property of a pair, so both sides are told, and the
  // other student is named — an admin cannot check one paper against another
  // without knowing which.
  const byId = new Map(ranked.map((r) => [r.attemptId, r]));
  for (let i = 0; i < attempts.length; i += 1) {
    for (let j = i + 1; j < attempts.length; j += 1) {
      const a = attempts[i];
      const b = attempts[j];
      if (a.studentId === b.studentId) continue;
      const { shared, same, rate } = answerAgreement(a.answers, b.answers);
      if (shared < MIN_SHARED_QUESTIONS || rate < MATCHING_ANSWERS) continue;

      for (const [self, other] of [[a, b], [b, a]] as const) {
        byId.get(self.attemptId)!.signals.push({
          kind: "matching_answers",
          detail: `Gave the same answer as ${other.studentName} on ${same} of ${shared} shared questions.`,
          weight: 3,
        });
      }
    }
  }

  for (const row of byId.values()) {
    row.concern = row.signals.reduce((sum, s) => sum + s.weight, 0);
  }

  // Highest concern first; a stable name order under it so the list does not
  // reshuffle between two identical readings.
  return [...byId.values()].sort((x, y) =>
    y.concern - x.concern || x.studentName.localeCompare(y.studentName)
  );
};
