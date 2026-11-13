import type { FormEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ApplyFrameProps {
  /** Top-left slot: a 44px back link/button or the school mark. */
  leading?: ReactNode;
  /** Top-right slot: the "Saved" indicator or a fields-done count. */
  status?: ReactNode;
  /** The segmented progress bar and its "Step N of M · Title" line. */
  progress: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Ties the step heading to the form for screen readers. */
  titleId: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  /** Sticky footer actions (Back + Continue). */
  footer: ReactNode;
  /** Below the footer, inside the card (e.g. "Already have an account?"). */
  after?: ReactNode;
  /** Extra classes for the sticky footer bar. */
  footerClassName?: string;
  /** Height the frame should fill on phones, e.g. under a fixed site nav. */
  className?: string;
}

/**
 * The Apply board's screen: header with progress, one big question, the
 * fields, and a footer pinned to the bottom of the viewport with Back and
 * Continue. Full-bleed white on phones; a centred card from `sm` up.
 */
const ApplyFrame = ({
  leading,
  status,
  progress,
  title,
  description,
  titleId,
  onSubmit,
  children,
  footer,
  after,
  footerClassName,
  className,
}: ApplyFrameProps) => (
  <div className={cn("flex w-full justify-center bg-card sm:bg-background sm:px-4 sm:py-10", className)}>
    <div className="flex w-full max-w-lg flex-col bg-card sm:rounded-[20px] sm:border sm:border-border sm:shadow-[var(--shadow-card)]">
      <header className="flex flex-col gap-3.5 px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex min-h-11 items-center justify-between gap-3">
          {leading ?? <span />}
          {status}
        </div>
        {progress}
        <h1 id={titleId} className="m-0 text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description && <p className="-mt-1.5 text-[15px] text-muted-foreground">{description}</p>}
      </header>

      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col gap-[18px] px-5 py-5 sm:px-8">{children}</div>
        <div
          className={cn(
            "sticky bottom-0 z-10 flex gap-2.5 border-t border-border bg-card px-5 pt-3.5 sm:px-8",
            "pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6",
            footerClassName,
          )}
        >
          {footer}
        </div>
      </form>
      {after && <div className="px-5 pb-8 sm:px-8">{after}</div>}
    </div>
  </div>
);

export default ApplyFrame;

/** Shared footer button shapes: 52px tall, 14px corners. */
export const backButtonClass =
  "h-[52px] shrink-0 rounded-[14px] border border-input bg-card px-[18px] text-base font-semibold text-foreground hover:bg-secondary";
export const continueButtonClass =
  "h-[52px] flex-1 rounded-[14px] text-base font-bold";
