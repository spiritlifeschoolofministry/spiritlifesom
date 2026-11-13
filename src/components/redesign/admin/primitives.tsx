import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_PILL, TONE_TEXT, initialsOf, type Tone } from "./styles";

export type { Tone } from "./styles";

/**
 * Shared building blocks for the redesigned admin screens (boards
 * AdminHome / AdminAdmissions / AdminAttendance / AdminFees).
 *
 * Everything reads the theme tokens so the screens keep working in dark mode;
 * the only fixed colours are the status tones, each paired with a dark variant.
 */

/**
 * Page header band from the boards: breadcrumb ("People / Admissions"), a bold
 * title, actions on the right and optional tabs underneath. It bleeds to the
 * edges of the admin content area, so it undoes AdminLayout's main padding.
 */
export function AdminPageHeader({
  section,
  title,
  description,
  actions,
  tabs,
}: {
  section?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "-mx-4 -mt-4 mb-5 border-b border-border bg-card px-4 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8",
        tabs ? "pb-0" : "pb-4",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          {section && (
            <p className="text-[13px] text-muted-foreground">
              {section} <span aria-hidden="true">/</span> {title}
            </p>
          )}
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-3">{tabs}</div>}
    </header>
  );
}

/** White rounded card with an optional title row, as on every board. */
export function Panel({
  title,
  titleId,
  actions,
  children,
  className,
  headerClassName,
  description,
}: {
  title?: ReactNode;
  titleId?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
  description?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={title && titleId ? titleId : undefined}
      className={cn("min-w-0 overflow-hidden rounded-[18px] border border-border bg-card", className)}
    >
      {(title || actions) && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-5 py-3.5",
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-[17px] font-bold text-foreground">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * KPI tile: label, a big figure, and a coloured note. Becomes a toggle button
 * when given `onClick` (for example "Low attendance: click to filter").
 */
export function KpiTile({
  label,
  value,
  note,
  tone = "neutral",
  onClick,
  pressed,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  pressed?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <strong className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">{value}</strong>
      {note && <span className={cn("text-[12px] font-semibold", TONE_TEXT[tone])}>{note}</span>}
    </>
  );
  const base = cn(
    "flex min-w-0 flex-col gap-1 rounded-2xl border bg-card px-[18px] py-4 text-left",
    pressed ? "border-primary ring-2 ring-primary/30" : "border-border",
    className,
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        className={cn(
          base,
          "transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

/** Status badge: colour plus the word, from the shared tone set. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold",
        TONE_PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Round initials badge used on queue rows. */
export function InitialsBadge({
  name,
  size = "md",
  strong = false,
}: {
  name: string;
  size?: "md" | "lg";
  strong?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold",
        size === "lg" ? "h-14 w-14 text-xl" : "h-9 w-9 text-[13px]",
        strong ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
