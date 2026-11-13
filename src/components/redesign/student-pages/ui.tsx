import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The card language of the student Learn, Exams and Record screens, taken from
 * the redesign boards: white 16–20px-radius cards on the soft canvas, one deep
 * plum panel per screen for the thing that matters most, primary purple for the single
 * standout action, and one shared set of status pills (colour plus text, never
 * colour alone).
 */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "gold";

const PILL_TONES: Record<Tone, string> = {
  success: "bg-[#E6F4EE] text-[#11603F] dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "bg-[#FDF1E3] text-[#8A3F05] dark:bg-amber-500/15 dark:text-amber-300",
  danger: "bg-[#FDE2D8] text-[#8E2A0A] dark:bg-red-500/15 dark:text-red-300",
  info: "bg-[#EFE9FB] text-[#3F1585] dark:bg-primary/20 dark:text-violet-200",
  neutral: "bg-[#F1EFF6] text-[#3A3450] dark:bg-muted dark:text-muted-foreground",
  gold: "bg-primary text-primary-foreground",
};

/** A status badge. Always carries its meaning in words. */
export const Pill = ({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-bold",
      PILL_TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

const BAR_TONES = {
  primary: "bg-primary",
  success: "bg-[#157F5B] dark:bg-emerald-400",
  gold: "bg-primary",
} as const;

/** A thin progress bar. Pass a label so assistive tech hears what it measures. */
export const Bar = ({
  value,
  tone = "primary",
  label,
  className,
  trackClassName,
}: {
  value: number;
  tone?: keyof typeof BAR_TONES;
  label: string;
  className?: string;
  trackClassName?: string;
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-2 overflow-hidden rounded-full bg-[#ECE9F3] dark:bg-muted", trackClassName, className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", BAR_TONES[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
};

/** A white card on the canvas. */
export const Panel = ({
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "li";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) => (
  <Tag className={cn("rounded-[20px] border border-border bg-card p-4 text-card-foreground sm:p-5", className)} {...rest}>
    {children}
  </Tag>
);

/**
 * The deep plum surface. It is a brand surface, so it stays plum in dark mode
 * too; the hairline keeps it distinct from the dark-mode cards around it.
 */
export const DarkPanel = ({
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) => (
  <Tag className={cn("rounded-[20px] bg-[#17112B] p-4 text-white dark:border dark:border-white/10 sm:p-5", className)} {...rest}>
    {children}
  </Tag>
);

/** A white card holding rows separated by hairlines. */
export const ListCard = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <ul className={cn("divide-y divide-[#F1EFF6] overflow-hidden rounded-[18px] border border-border bg-card dark:divide-border", className)}>
    {children}
  </ul>
);

export const SectionTitle = ({
  children,
  action,
  id,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) => (
  <div className={cn("flex items-baseline justify-between gap-3", className)}>
    <h2 id={id} className="text-base font-bold text-foreground">{children}</h2>
    {action}
  </div>
);

/**
 * A screen's top edge: an optional 44px back button, the title in the boards'
 * heavy tight heading, an optional line under it and an optional right-hand
 * slot (a pill or an action).
 */
export const ScreenHeader = ({
  title,
  backTo,
  backLabel,
  description,
  aside,
  className,
}: {
  title: string;
  backTo?: string;
  backLabel?: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex items-start justify-between gap-3", className)}>
    <div className="flex min-w-0 items-center gap-3">
      {backTo && (
        <Link
          to={backTo}
          aria-label={backLabel ?? "Back"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">{title}</h1>
        {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
    </div>
    {aside && <div className="flex shrink-0 items-center gap-2 pt-1">{aside}</div>}
  </div>
);

/** A labelled figure in a small tile. */
export const StatTile = ({
  value,
  label,
  valueClassName,
  className,
}: {
  value: React.ReactNode;
  label: string;
  valueClassName?: string;
  className?: string;
}) => (
  <div className={cn("flex flex-col items-center gap-0.5 rounded-[14px] border border-border bg-card p-2.5 text-center", className)}>
    <strong className={cn("text-xl font-extrabold tracking-tight text-foreground", valueClassName)}>{value}</strong>
    <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
  </div>
);

/** An empty state inside a card. */
export const EmptyCard = ({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) => (
  <Panel className="flex flex-col items-center gap-2 py-10 text-center">
    {icon && <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">{icon}</span>}
    <h2 className="text-base font-bold text-foreground">{title}</h2>
    {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
  </Panel>
);
