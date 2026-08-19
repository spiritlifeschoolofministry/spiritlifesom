import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ALL_MODES, TARGETABLE_LEARNING_MODES, toModeArray } from "@/lib/learning-modes";

/**
 * Multi-select for learning-mode targeting. Picking 'All' clears the specific
 * modes and vice versa, so the two can never be stored together. Deselecting
 * everything falls back to 'All' rather than saving an empty set that would
 * reach nobody.
 */
export const LearningModeSelect = ({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (modes: string[]) => void;
  disabled?: boolean;
}) => {
  const selected = toModeArray(value);
  const allSelected = selected.includes(ALL_MODES);

  const handleChange = (next: string[]) => {
    // 'All' just got added: it wins alone.
    if (next.includes(ALL_MODES) && !allSelected) {
      onChange([ALL_MODES]);
      return;
    }
    const specific = next.filter((m) => m !== ALL_MODES);
    onChange(specific.length > 0 ? specific : [ALL_MODES]);
  };

  return (
    <div className="space-y-1.5">
      <ToggleGroup
        type="multiple"
        value={selected}
        onValueChange={handleChange}
        disabled={disabled}
        className="justify-start flex-wrap gap-1.5"
      >
        <ToggleGroupItem value={ALL_MODES} size="sm" variant="outline" className="text-xs px-3">
          All Students
        </ToggleGroupItem>
        {TARGETABLE_LEARNING_MODES.map((mode) => (
          <ToggleGroupItem key={mode} value={mode} size="sm" variant="outline" className="text-xs px-3">
            {mode}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-[10px] text-muted-foreground">
        {allSelected
          ? "Applies to everyone in the cohort."
          : `Applies to ${selected.join(" and ")} students only.`}
      </p>
    </div>
  );
};

/** The assigned modes, shown as tags in listings. */
export const LearningModeTags = ({ modes }: { modes: string[] | string | null | undefined }) => {
  const list = toModeArray(modes);
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((m) => (
        <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">
          {m === ALL_MODES ? "All" : m}
        </Badge>
      ))}
    </div>
  );
};
