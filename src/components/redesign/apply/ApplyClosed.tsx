import { Link } from "react-router-dom";
import { ArrowLeft, Lock, MessageCircle } from "lucide-react";

/**
 * Shown on /register while `accepting_applications` is off (and the moment a
 * sign-up is refused because applications closed mid-form). One clear
 * message, one way to ask about the next intake, one way in for students
 * who already have an account.
 */
const ApplyClosed = () => (
  <div className="flex w-full justify-center bg-card px-5 py-10 sm:bg-background sm:px-4 sm:py-16">
    <section
      aria-labelledby="apply-closed-title"
      className="flex w-full max-w-md flex-col items-center gap-5 text-center sm:rounded-[20px] sm:border sm:border-border sm:bg-card sm:p-10 sm:shadow-[var(--shadow-card)]"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#17112B] text-[#C4B5FD]">
        <Lock className="h-7 w-7" aria-hidden="true" />
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-[13px] font-semibold text-secondary-foreground">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground" />
        Admissions closed
      </span>
      <div className="flex flex-col gap-2">
        <h1 id="apply-closed-title" className="m-0 text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
          Applications are closed for now
        </h1>
        <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">
          We are not accepting new applications at this time. Please check back later, or contact the school office
          to ask about the next intake.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        <Link
          to="/contact"
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-base font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Contact the school
        </Link>
        <p className="m-0 text-sm text-muted-foreground">
          Already a student?{" "}
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Log in
          </Link>
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to home
      </Link>
    </section>
  </div>
);

export default ApplyClosed;
