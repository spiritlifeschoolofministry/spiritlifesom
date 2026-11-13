import { cn } from "@/lib/utils";

interface LearningModeCardProps {
  title: string;
  description: string;
  /** Radio group name; give every card in one question the same name. */
  name: string;
  value: string;
  price?: string;
  details?: string[];
  selected: boolean;
  onSelect: () => void;
}

/**
 * One option of the "Learning mode" question on the Apply board: a whole-card
 * radio with a title, a one-line description and, where known, the price.
 * Wrap the set in a <fieldset> with a <legend>.
 */
const LearningModeCard = ({
  title,
  description,
  name,
  value,
  price,
  details,
  selected,
  onSelect,
}: LearningModeCardProps) => {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[14px] border p-3.5 transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ring-offset-background",
        selected
          ? "border-primary bg-secondary/60 ring-1 ring-primary"
          : "border-input bg-card hover:border-primary/50",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 h-5 w-5 shrink-0 accent-primary focus-visible:outline-none"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-3">
          <strong className="text-[15px] font-semibold text-foreground">{title}</strong>
          {price && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                selected ? "gradient-flame" : "bg-muted text-foreground",
              )}
            >
              {price}
            </span>
          )}
        </span>
        <span className="text-[13px] text-muted-foreground">{description}</span>
        {details && details.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {details.map((d) => (
              <li key={d} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden="true" className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                {d}
              </li>
            ))}
          </ul>
        )}
      </span>
    </label>
  );
};

export default LearningModeCard;
