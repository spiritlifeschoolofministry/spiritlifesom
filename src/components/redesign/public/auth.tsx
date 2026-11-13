import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * The shared look of the public account screens (Log in, Forgot password,
 * Reset password): a narrow column with the crest and a big heading, one white
 * card, and an optional deep-plum "Apply now" panel underneath.
 */

const ring =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/** Classes for the board's 50px inputs (pass to <Input className>). */
export const authInput =
  "h-[50px] rounded-xl border-[1.5px] border-input bg-card px-3.5 text-base md:text-base";

/** Bold field label. */
export const authLabel = "text-sm font-bold text-foreground";

/** The single purple call to action of a card. */
export const authPrimary =
  `inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-[17px] font-extrabold text-primary-foreground shadow-[0_6px_16px_rgba(91,33,182,0.28)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 ${ring}`;

/** Outlined secondary action ("Forgot password?"). */
export const authOutline =
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-primary bg-card px-2.5 text-center text-sm font-bold text-primary transition-colors hover:bg-secondary dark:text-foreground ${ring}`;

/** Soft lavender secondary action ("Email me a login code"). */
export const authSoft =
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-2.5 text-center text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary/70 ${ring}`;

/** Quiet text-style action inside a card ("Use a different email"). */
export const authLink =
  `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:underline dark:text-foreground ${ring}`;

export const AuthPage = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) => (
  <div className="mx-auto flex w-full max-w-[440px] flex-col gap-[18px] px-4 pb-[72px] pt-10 sm:px-6 sm:pt-14">
    <div className="flex flex-col items-center gap-2.5 text-center">
      <img src="/images/school-logo.png" alt="" className="h-16 w-16 object-contain" />
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
      {subtitle && <p className="text-[15px] text-muted-foreground">{subtitle}</p>}
    </div>
    {children}
  </div>
);

export const AuthCard = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      "flex flex-col gap-3.5 rounded-[22px] border border-border bg-card p-5 shadow-[0_12px_32px_rgba(23,17,43,0.08)] sm:p-6",
      className,
    )}
  >
    {children}
  </div>
);

/** Deep plum panel with the purple "Apply now" — the one standout colour. */
export const ApplyPanel = () => (
  <div className="flex flex-col items-center gap-2.5 rounded-[18px] bg-[#17112B] p-[18px] text-center text-white">
    <span className="text-[15px] font-semibold">New to Spirit Life SOM?</span>
    <Link
      to="/register"
      className="inline-flex min-h-[46px] items-center rounded-xl bg-primary px-[22px] text-[15px] font-extrabold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B5FD] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17112B]"
    >
      Apply now
    </Link>
  </div>
);
