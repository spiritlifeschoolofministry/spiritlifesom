import { format } from "date-fns";
import type { Heatmap, HeatStatus } from "@/lib/attendance-heatmap";

/**
 * Colours that differ in lightness as well as hue, so they still read for
 * colour-blind staff: blue (present) vs orange (late, absent), never red/green.
 * Unverified check-ins carry a diagonal hatch on top of the present colour.
 */
const STYLE: Record<HeatStatus, { label: string; className: string }> = {
  present: { label: "Present", className: "bg-[#1D4ED8]" },
  late: { label: "Late", className: "bg-[#F59E0B]" },
  absent: { label: "Absent", className: "bg-[#9A3412]" },
  excused: { label: "Excused", className: "bg-[#C4B5FD]" },
  unverified: {
    label: "Checked in, not verified",
    className: "bg-[#93C5FD] bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(29,78,216,0.55)_3px_5px)]",
  },
  none: { label: "Not their class", className: "bg-transparent border border-dashed border-border" },
};

const LEGEND: HeatStatus[] = ["present", "late", "unverified", "absent", "excused"];

const AttendanceHeatmap = ({ data }: { data: Heatmap }) => {
  const { sessions, rows } = data;
  if (sessions.length === 0 || rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No classes held yet for this selection.</p>;
  }
  const atRisk = rows.filter((r) => r.pct < 70).length;
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
        {LEGEND.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`h-3.5 w-3.5 rounded-sm ${STYLE[k].className}`} aria-hidden="true" />
            {STYLE[k].label}
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label={`Attendance heatmap: ${rows.length} students across the last ${sessions.length} classes. ${atRisk} below 70%. Lowest attendance first.`}
        className="max-h-[480px] overflow-auto rounded-lg border border-border"
      >
        <table className="w-max border-separate border-spacing-[3px] text-xs" aria-hidden="true">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className="sticky left-0 z-20 min-w-[160px] bg-card px-2 py-1 text-left font-medium text-muted-foreground">Student</th>
              <th className="px-1 text-right font-medium text-muted-foreground">%</th>
              {sessions.map((s) => (
                <th key={s.id} className="h-12 w-6 align-bottom font-normal text-muted-foreground">
                  <span className="block -rotate-45 whitespace-nowrap">{format(new Date(`${s.date}T00:00:00`), "d MMM")}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 max-w-[180px] truncate bg-card px-2 py-0.5 text-foreground">{r.name}</td>
                <td className={`px-1 text-right font-semibold ${r.pct < 70 ? "text-[#9A3412]" : "text-foreground"}`}>{r.pct}</td>
                {r.cells.map((c, i) => (
                  <td key={sessions[i].id} className="p-0">
                    <span
                      className={`block h-5 w-6 rounded-sm ${STYLE[c].className}`}
                      title={`${r.name} · ${format(new Date(`${sessions[i].date}T00:00:00`), "EEE d MMM yyyy")} · ${STYLE[c].label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Lowest attendance first. Hover a square for the date and status. Showing the last {sessions.length} classes.</p>
    </div>
  );
};

export default AttendanceHeatmap;
