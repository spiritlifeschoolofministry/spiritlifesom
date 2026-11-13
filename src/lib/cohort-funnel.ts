/**
 * Applied → Admitted → Graduated, from students.admission_status.
 *
 * Statuses are stored in mixed case ("Pending"/"PENDING", "ADMITTED",
 * "REJECTED", "Graduate"/"GRADUATE"), so they are compared upper-cased.
 * Everyone with a student record applied; admitted counts current students and
 * graduates (a graduate was admitted); graduated counts graduates only.
 */
export interface FunnelStage {
  key: "applied" | "admitted" | "graduated";
  label: string;
  count: number;
  /** Share of the stage before it, 0–100; null for the first stage. */
  conversion: number | null;
}

export function cohortFunnel(students: { admission_status: string | null }[]): FunnelStage[] {
  const status = (s: { admission_status: string | null }) => (s.admission_status ?? "").trim().toUpperCase();
  const applied = students.length;
  const graduated = students.filter((s) => status(s) === "GRADUATE").length;
  const admitted = students.filter((s) => status(s) === "ADMITTED").length + graduated;
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  return [
    { key: "applied", label: "Applied", count: applied, conversion: null },
    { key: "admitted", label: "Admitted", count: admitted, conversion: pct(admitted, applied) },
    { key: "graduated", label: "Graduated", count: graduated, conversion: pct(graduated, admitted) },
  ];
}
