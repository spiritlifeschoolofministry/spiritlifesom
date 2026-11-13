import { Link } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";
import { preloadPath } from "@/routes/lazy-pages";

type StepState = "done" | "now" | "next";

interface Step {
  title: string;
  body: string;
  state: StepState;
}

const DOT: Record<StepState, string> = {
  done: "bg-primary text-primary-foreground",
  now: "border-2 border-primary bg-card text-primary",
  next: "bg-muted text-muted-foreground",
};

const STATE_TEXT: Record<StepState, string> = { done: "Done", now: "In progress", next: "Not yet" };

interface Props {
  firstName: string;
  email: string | null;
  /** Gender, age, learning mode and cohort are all on file. */
  detailsComplete: boolean;
  learningMode: string | null;
  cohortName: string | null;
}

const WAIT_LINKS = [
  { label: "Preview the courses", to: "/student/courses" },
  { label: "Edit my details", to: "/student/profile" },
  { label: "Questions? Contact admissions", to: "/contact" },
];

/**
 * What a pending applicant sees on Today: where their application is, as a
 * tracker rather than a locked dashboard, and what they can do meanwhile.
 * Every step is read from their own rows; nothing here is a promise of time.
 */
const ApplicationTracker = ({ firstName, email, detailsComplete, learningMode, cohortName }: Props) => {
  const details = [learningMode, cohortName].filter(Boolean).join(" · ");
  const steps: Step[] = [
    { title: "Account created", body: email ? `Signed in as ${email}` : "You can sign in to the portal", state: "done" },
    {
      title: "Details submitted",
      body: detailsComplete ? details || "Your details are on file" : "Finish your details so admissions can review them",
      state: detailsComplete ? "done" : "now",
    },
    {
      title: "Admissions review",
      body: "An administrator is checking your details",
      state: detailsComplete ? "now" : "next",
    },
    { title: "Welcome to SLSOM", body: "Your student app unlocks: courses, timetable, fees", state: "next" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-card p-5">
        <span className="self-start rounded-full bg-amber-100 px-2.5 py-1 text-[13px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          Under review
        </span>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
          Thanks, {firstName}. We have your application.
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          You will receive an admission confirmation email once it is approved. Some pages stay locked until then.
        </p>
      </section>

      <section aria-label="Application progress" className="rounded-[20px] border border-border bg-card p-5">
        <ol>
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-3.5" aria-current={step.state === "now" ? "step" : undefined}>
              <div className="flex flex-col items-center">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${DOT[step.state]}`}>
                  {step.state === "done" ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                </span>
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`min-h-[22px] w-0.5 flex-1 ${step.state === "done" ? "bg-primary" : "bg-border"}`}
                  />
                )}
              </div>
              <div className="flex flex-col gap-0.5 pb-4">
                <strong className="text-[15px] text-foreground">
                  {step.title}
                  <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
                </strong>
                <span className="text-[13px] text-muted-foreground">{step.body}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="while-you-wait" className="flex flex-col gap-1 rounded-[20px] border border-border bg-card px-5 py-4">
        <h2 id="while-you-wait" className="pb-1 text-[15px] font-bold text-foreground">
          While you wait
        </h2>
        {WAIT_LINKS.map((link, i) => (
          <Link
            key={link.to}
            to={link.to}
            onMouseEnter={() => preloadPath(link.to)}
            onFocus={() => preloadPath(link.to)}
            className={`flex min-h-11 items-center justify-between rounded-md text-[15px] text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              i > 0 ? "border-t border-border/70" : ""
            }`}
          >
            {link.label}
            <ChevronRight className="h-4 w-4 text-primary" aria-hidden="true" />
          </Link>
        ))}
      </section>
    </div>
  );
};

export default ApplicationTracker;
