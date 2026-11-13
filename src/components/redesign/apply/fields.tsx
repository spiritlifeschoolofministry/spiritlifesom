import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Form pieces for the Apply board: 48px fields with 12px corners, 14px
 * semibold labels, 13px muted helper text. Native controls so they behave on
 * low-end Android (the OS picker for selects, the right keyboard for inputs).
 */

/** Pass to <Input> / <Textarea> so shadcn fields take the board's shape. */
export const fieldClass =
  "h-12 rounded-xl border-input bg-card px-3 text-base md:text-base placeholder:text-muted-foreground/80";
export const textareaClass = "rounded-xl border-input bg-card px-3 py-3 text-base md:text-base";

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  hintId?: string;
  error?: string;
  errorId?: string;
  className?: string;
  children: ReactNode;
}

export const Field = ({ label, htmlFor, hint, hintId, error, errorId, className, children }: FieldProps) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
      {label}
    </label>
    {children}
    {hint && (
      <p id={hintId} className="text-[13px] text-muted-foreground">
        {hint}
      </p>
    )}
    {error && (
      <p id={errorId} role="alert" className="text-[13px] font-medium text-destructive">
        {error}
      </p>
    )}
  </div>
);

/** Small grey "(optional)" after a label. */
export const Optional = () => <span className="font-normal text-muted-foreground"> (optional)</span>;

export const NativeSelect = ({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={cn(
      "h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
  >
    {children}
  </select>
);

interface ChoiceGroupProps {
  legend: ReactNode;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}

/** A row of pill radios (Yes / No, Male / Female, English / Yoruba). */
export const ChoiceGroup = ({ legend, name, value, onChange, options, error }: ChoiceGroupProps) => (
  <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
    <legend className="mb-1.5 text-sm font-semibold text-foreground">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex min-h-12 min-w-[6.5rem] flex-1 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 text-[15px] font-medium transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ring-offset-background",
              checked
                ? "border-primary bg-secondary/60 text-foreground ring-1 ring-primary"
                : "border-input bg-card hover:border-primary/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="h-5 w-5 shrink-0 accent-primary focus-visible:outline-none"
            />
            {o.label}
          </label>
        );
      })}
    </div>
    {error && (
      <p role="alert" className="text-[13px] font-medium text-destructive">
        {error}
      </p>
    )}
  </fieldset>
);
