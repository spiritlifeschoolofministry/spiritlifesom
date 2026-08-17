import { supabase } from "@/integrations/supabase/client";
import { isStudentProfileComplete, type MissingProfileField } from "@/lib/profile-complete";

export interface ProfileCompletionInput {
  userId: string;
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  gender: string;
  age: number;
  learningMode: string;
  /** Fields the app believes are missing — drives which columns we touch. */
  missing: MissingProfileField[];
}

/**
 * Write the profile fields, creating the row if it doesn't exist.
 *
 * Normally the signup trigger creates it, but accounts that predate the trigger
 * (or whose rows were deleted) reach /complete-profile with nothing to update —
 * and an UPDATE against a missing row succeeds silently.
 *
 * Deliberately not an upsert: an upsert would have to send `role`, and would
 * overwrite it on rows that already exist, demoting an admin who fills in a
 * missing phone number. `role` is set only when creating, and only ever to
 * 'student' — user metadata is user-writable, so it can't be trusted here.
 */
const saveProfileRow = async (input: ProfileCompletionInput): Promise<void> => {
  const { userId, email, firstName, middleName, lastName, phone, missing } = input;

  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    const update: Record<string, unknown> = {};
    if (missing.includes("first_name")) update.first_name = firstName.trim();
    if (missing.includes("last_name")) update.last_name = lastName.trim();
    if (middleName.trim()) update.middle_name = middleName.trim();
    if (missing.includes("phone")) update.phone = phone.trim();
    if (!Object.keys(update).length) return;

    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("profiles").insert({
    id: userId,
    email,
    role: "student",
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    middle_name: middleName.trim() || null,
    phone: phone.trim(),
  });
  if (error) throw error;
};

/**
 * Write the student fields, creating the row if it doesn't exist. A
 * self-created row starts unapproved and Pending, matching what the signup
 * trigger produces — this grants no standing a fresh signup wouldn't have.
 */
const saveStudentRow = async (input: ProfileCompletionInput): Promise<void> => {
  const { userId, gender, age, learningMode, missing } = input;

  const { data: existing, error: readErr } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    const update: Record<string, unknown> = {};
    if (missing.includes("gender")) update.gender = gender;
    if (missing.includes("age")) update.age = age;
    if (missing.includes("learning_mode")) update.learning_mode = learningMode;
    if (!Object.keys(update).length) return;

    const { error } = await supabase.from("students").update(update).eq("profile_id", userId);
    if (error) throw error;
    return;
  }

  // Same cohort the signup trigger would have picked.
  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("students").insert({
    profile_id: userId,
    cohort_id: cohort?.id ?? null,
    admission_status: "Pending",
    is_approved: false,
    gender,
    age,
    learning_mode: learningMode,
  });
  if (error) throw error;
};

/**
 * Persist everything /complete-profile collected, then verify it landed.
 *
 * The verification is the point: an UPDATE matching zero rows is not an error —
 * PostgREST returns success — so a user with no profile row used to see
 * "Profile completed!" and get bounced straight back to the form, forever.
 * Throws when the record is still incomplete afterwards.
 */
export const saveProfileCompletion = async (input: ProfileCompletionInput): Promise<void> => {
  await saveProfileRow(input);
  await saveStudentRow(input);

  const [{ data: freshProfile }, { data: freshStudent }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", input.userId).maybeSingle(),
    supabase.from("students").select("*").eq("profile_id", input.userId).maybeSingle(),
  ]);

  if (!isStudentProfileComplete(freshProfile, freshStudent)) {
    throw new Error(
      "We saved your answers but your record still looks incomplete. Please try again, or contact the school office.",
    );
  }
};
