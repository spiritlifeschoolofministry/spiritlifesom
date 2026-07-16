import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Tailwind text-color class for the figure, e.g. "text-success" */
  color?: string;
  /** Optional top border accent, e.g. "border-t-success" */
  accent?: string;
  /** 0–100 optional progress bar */
  progress?: number;
  /** Tailwind bg-color class for the progress fill */
  progressClass?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Sanctuary stat tile — white card, tiny uppercase faint label, big serif
 * figure in a status color, optional icon, hint line and 5px progress track.
 */
const StatCard = ({
  label,
  value,
  hint,
  icon,
  color = "text-foreground",
  accent,
  progress,
  progressClass = "bg-primary",
  onClick,
  className,
}: StatCardProps) => (
  <Card
    onClick={onClick}
    className={cn(
      "p-5 border-border",
      accent && `border-t-[3px] ${accent}`,
      onClick && "cursor-pointer hover:shadow-md transition-shadow",
      className,
    )}
  >
    <div className="flex items-center gap-3">
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
        <p className={cn("font-serif text-3xl font-bold leading-tight", color)}>{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
    {typeof progress === "number" && (
      <div className="mt-3 h-[5px] rounded-full bg-[#eee7db] overflow-hidden">
        <div className={cn("h-full rounded-full", progressClass)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
    )}
  </Card>
);

export default StatCard;
