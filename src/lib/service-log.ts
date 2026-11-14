/** Ministry service log: categories and how hours add up. */

export const SERVICE_CATEGORIES = [
  { value: "evangelism", label: "Evangelism or outreach" },
  { value: "teaching", label: "Teaching or preaching" },
  { value: "prayer", label: "Prayer or intercession" },
  { value: "church_service", label: "Serving in church" },
  { value: "pastoral_care", label: "Pastoral care or visitation" },
  { value: "community", label: "Community service" },
  { value: "other", label: "Other" },
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];
export type ServiceStatus = "pending" | "approved" | "rejected";

export const categoryLabel = (value: string): string =>
  SERVICE_CATEGORIES.find((category) => category.value === value)?.label ?? value;

export interface ServiceTotals {
  approved: number;
  pending: number;
  rejected: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Hours by status. Only approved hours count toward a requirement. */
export const serviceTotals = (rows: { hours: number | string; status: string }[]): ServiceTotals => {
  const totals: ServiceTotals = { approved: 0, pending: 0, rejected: 0 };
  for (const row of rows) {
    const hours = Number(row.hours);
    if (!Number.isFinite(hours)) continue;
    if (row.status === "approved" || row.status === "pending" || row.status === "rejected") {
      totals[row.status] += hours;
    }
  }
  return { approved: round1(totals.approved), pending: round1(totals.pending), rejected: round1(totals.rejected) };
};

/** Percent of the requirement met, 0–100. No requirement means no percentage. */
export const serviceProgress = (approvedHours: number, requiredHours: number | null | undefined): number | null => {
  if (!requiredHours || requiredHours <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((approvedHours / requiredHours) * 100)));
};

/** "7.5 hours", "1 hour". */
export const formatHours = (hours: number | string): string => {
  const value = round1(Number(hours) || 0);
  return `${value} ${value === 1 ? "hour" : "hours"}`;
};

export interface ServiceEntryInput {
  activityDate: string;
  hours: string;
  description: string;
}

/** The first problem with an entry, or null when it can be saved. `today` is yyyy-mm-dd. */
export const validateServiceEntry = (input: ServiceEntryInput, today: string): string | null => {
  if (!input.activityDate) return "Choose the date you served.";
  if (input.activityDate > today) return "The date cannot be in the future.";
  const hours = Number(input.hours);
  if (!input.hours.trim() || !Number.isFinite(hours) || hours <= 0) return "Enter how many hours you served.";
  if (hours > 24) return "One entry covers one day, so no more than 24 hours.";
  if (input.description.trim().length < 10) return "Describe what you did in a sentence or two.";
  return null;
};
