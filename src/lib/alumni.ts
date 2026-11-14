/** Alumni: testimony rules and the line that says where a graduate serves. */

export const TESTIMONY_MIN_LENGTH = 20;
export const TESTIMONY_MAX_LENGTH = 3000;

/** The first problem with a testimony, or null when it can be sent. */
export const testimonyProblem = (body: string): string | null => {
  const length = body.trim().length;
  if (length < TESTIMONY_MIN_LENGTH) return "Please write a little more: at least a sentence or two.";
  if (length > TESTIMONY_MAX_LENGTH) return "Please keep it under 3,000 characters.";
  return null;
};

export const testimonyStatusLabel = (status: string): string =>
  status === "approved" ? "On the wall" : status === "hidden" ? "Not shown" : "Waiting for approval";

/** "Youth pastor at Grace Chapel · Ibadan, Nigeria", from whichever parts exist. */
export const servingLine = (details: {
  serving_as?: string | null;
  serving_at?: string | null;
  location?: string | null;
}): string => {
  const role = details.serving_as?.trim();
  const place = details.serving_at?.trim();
  const where = details.location?.trim();
  const first = role && place ? `${role} at ${place}` : role || place || "";
  return [first, where].filter(Boolean).join(" · ");
};
