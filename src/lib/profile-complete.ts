import type { Tables } from "@/integrations/supabase/types";

/**
 * Decide whether a student has provided the minimum info we need
 * before letting them into the portal.
 *
 * Email-password registrants always go through /register and fill these.
 * Google / OAuth signups skip that form, so we backfill here.
 */
export function isStudentProfileComplete(
  profile: Tables<"profiles"> | null,
  student: Tables<"students"> | null,
): boolean {
  if (!profile || !student) return false;
  if (!profile.phone || profile.phone.trim() === "") return false;
  if (!student.gender || student.gender.trim() === "") return false;
  if (!student.age || student.age <= 0) return false;
  if (!student.learning_mode || student.learning_mode.trim() === "") return false;
  return true;
}
