import { scaleLinear } from "d3";
import type { FunnelStage } from "@/lib/cohort-funnel";

const COLORS = ["#5B21B6", "#7C3AED", "#A78BFA"];

/**
 * Horizontal funnel: one bar per stage, width proportional to its count
 * (d3 scale), with the conversion from the stage before it.
 */
const CohortFunnel = ({ stages }: { stages: FunnelStage[] }) => {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const width = scaleLinear().domain([0, max]).range([6, 100]);
  const summary = stages.map((s) => `${s.label} ${s.count}`).join(", ");
  return (
    <div role="img" aria-label={`Cohort funnel: ${summary}`} className="space-y-3">
      {stages.map((stage, i) => (
        <div key={stage.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">{stage.label}</span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{stage.count}</strong>
              {stage.conversion !== null && <> · {stage.conversion}% of {stages[i - 1].label.toLowerCase()}</>}
            </span>
          </div>
          <div className="h-7 rounded-lg bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-lg transition-[width] duration-700"
              style={{ width: `${stage.count === 0 ? 0 : width(stage.count)}%`, backgroundColor: COLORS[i] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default CohortFunnel;
