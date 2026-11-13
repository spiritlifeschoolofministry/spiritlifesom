import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  /** 1-based. */
  currentStep: number;
  steps: string[];
  /** When given, each segment is a button that jumps to its step. */
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * The Apply board's progress: one thin segment per step, filled up to the
 * current one, then "Step N of M · Title" underneath. Segments are 6px to the
 * eye but each has a 44px-tall hit area when clickable.
 */
const StepIndicator = ({ currentStep, steps, onStepClick, className }: StepIndicatorProps) => {
  const total = steps.length;
  const current = Math.min(Math.max(currentStep, 1), total);
  const label = steps[current - 1];

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={`Step ${current} of ${total}`}>
        {steps.map((name, index) => {
          const stepNum = index + 1;
          const done = stepNum < current;
          const isCurrent = stepNum === current;
          const bar = (
            <span
              aria-hidden="true"
              className={cn(
                "block h-1.5 w-full rounded-[3px] transition-colors duration-300",
                stepNum <= current ? "bg-primary" : "bg-border",
              )}
            />
          );
          const status = done ? "done" : isCurrent ? "current" : "not started";
          return (
            <li key={name} className="flex-1">
              {onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(stepNum)}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Go to step ${stepNum}: ${name} (${status})`}
                  className="group -my-[19px] flex h-11 w-full items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {bar}
                </button>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined} className="block">
                  <span className="sr-only">{`Step ${stepNum}: ${name} (${status})`}</span>
                  {bar}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="m-0 text-[13px] font-semibold text-muted-foreground" aria-live="polite">
        Step {current} of {total} · {label}
      </p>
    </div>
  );
};

export default StepIndicator;
