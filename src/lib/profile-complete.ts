import type { Tables } from "@/integrations/supabase/types";

export type MissingProfileField =
  | "first_name"
  | "last_name"
  | "phone"
  | "gender"
  | "age"
  | "learning_mode";

/**
 * Decide whether a student has provided the minimum info we need
 * before letting them into the portal.
 *
 * Email-password registrants fill these via /register.
 * Google / OAuth signups skip that form, so we backfill via /complete-profile.
 *
 * Admins/teachers can also flip `profile_complete_override` to bypass.
 */
export function isStudentProfileComplete(
  profile: Tables<"profiles"> | null,
  student: (Tables<"students"> & { profile_complete_override?: boolean | null }) | null,
): boolean {
  if (!profile || !student) return false;
  if ((student).profile_complete_override === true) return true;
  return missingProfileFields(profile, student).length === 0;
}

export function missingProfileFields(
  profile: Tables<"profiles"> | null,
  student: Tables<"students"> | null,
): MissingProfileField[] {
  const missing: MissingProfileField[] = [];
  if (!profile?.first_name?.trim()) missing.push("first_name");
  if (!profile?.last_name?.trim()) missing.push("last_name");
  if (!profile?.phone?.trim()) missing.push("phone");
  if (!student?.gender?.trim()) missing.push("gender");
  if (!student?.age || student.age <= 0) missing.push("age");
  if (!student?.learning_mode?.trim()) missing.push("learning_mode");
  return missing;
}

export const REQUIRED_FIELD_COUNT = 6;
