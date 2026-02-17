import { cn } from "@/lib/utils";

interface LearningModeCardProps {
  title: string;
  description: string;
  price: string;
  details?: string[];
  selected: boolean;
  onSelect: () => void;
}

const LearningModeCard = ({
  title,
  description,
  price,
  details,
  selected,
  onSelect,
}: LearningModeCardProps) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border-2 p-5 transition-all duration-200",
        selected
          ? "border-primary bg-secondary shadow-lg ring-2 ring-primary/20"
          : "border-border bg-card hover:border-primary/40 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold text-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <span
          className={cn(
            "text-sm font-bold px-3 py-1 rounded-full whitespace-nowrap ml-3",
            selected
              ? "gradient-flame text-accent-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {price}
        </span>
      </div>
      {details && details.length > 0 && (
        <ul className="mt-3 space-y-1">
          {details.map((d) => (
            <li key={d} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-accent mt-0.5">•</span>
              {d}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
};

export default LearningModeCard;
