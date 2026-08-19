// Modes a fee or material can be aimed at. 'All' is a sentinel meaning every
// mode, kept separate from the list so a mode added later is covered without
// editing existing rows.
export const TARGETABLE_LEARNING_MODES = ["Online", "Physical", "Hybrid"] as const;

export const ALL_MODES = "All";

/** Normalises anything stored (legacy single string, null, empty array) to a set. */
export const toModeArray = (value: string[] | string | null | undefined): string[] => {
  if (Array.isArray(value)) return value.length > 0 ? value : [ALL_MODES];
  if (typeof value === "string" && value.trim() !== "") return [value];
  return [ALL_MODES];
};
