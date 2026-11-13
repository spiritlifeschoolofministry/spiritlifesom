import { cn } from "@/lib/utils";

/** Class names and helpers shared by the redesigned admin screens. */

export type Tone = "good" | "warn" | "bad" | "neutral" | "info";

/** Note / figure text in a tone. Always paired with words, never colour alone. */
export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-800 dark:text-emerald-300",
  warn: "text-amber-800 dark:text-amber-300",
  bad: "text-red-800 dark:text-red-300",
  neutral: "text-muted-foreground",
  info: "text-secondary-foreground",
};

/** Soft pill backgrounds, the board's one shared badge set. */
export const TONE_PILL: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  bad: "bg-red-50 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  neutral: "bg-muted text-foreground/80",
  info: "bg-secondary text-secondary-foreground",
};

/** The board's green "Approve / Verify" button (white on #047857, 5.5:1). */
export const APPROVE_BUTTON =
  "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700";

/** The board's quiet "Reject / Sign out" outline in burnt orange. */
export const REJECT_BUTTON =
  "border border-orange-200 bg-card text-orange-800 hover:bg-orange-50 hover:text-orange-900 dark:border-orange-900/70 dark:text-orange-300 dark:hover:bg-orange-950/40 dark:hover:text-orange-200";

/** Neutral bordered button used for secondary actions on every board. */
export const QUIET_BUTTON =
  "border border-border bg-card text-foreground hover:bg-secondary hover:text-secondary-foreground";

export const initialsOf = (name: string | null | undefined) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Row classes for a selectable queue item (selected = tinted with a left edge). */
export const queueRowClass = (selected: boolean) =>
  cn(
    "border-b border-border/60 border-l-[3px] transition-colors last:border-b-0",
    selected ? "border-l-primary bg-secondary/60" : "border-l-transparent bg-card hover:bg-muted/40",
  );
