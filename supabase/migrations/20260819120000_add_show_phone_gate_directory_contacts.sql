-- Phone becomes an opt-in contact field alongside email, and BOTH gates move
-- into the directory view.
--
-- Previously Coursemates.tsx fetched every classmate's email and phone straight
-- from profiles and hid them in the client. The "Show email to classmates"
-- switch therefore only controlled rendering: the address was already in the
-- browser and readable from the network tab, and phone was fetched for everyone
-- despite never being displayed. Gating in the view means an address that a
-- student has not shared never leaves the database.
--
-- classmate_directory has no security_invoker, so it runs as its owner and the
-- CASE expressions are the enforcement point.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.show_phone IS
  'Student opt-in: release phone to classmates through classmate_directory. Mirrors show_email.';

-- Appending email/phone; the leading columns keep their existing order and types.
CREATE OR REPLACE VIEW public.classmate_directory AS
  SELECT p.id AS profile_id,
    p.first_name,
    p.last_name,
    (p.first_name || ' '::text) || p.last_name AS display_name,
    p.avatar_url,
    p.role,
    s.cohort_id,
    c.name AS cohort_name,
    -- Own row always visible to its owner, so a student can see what they share.
    CASE WHEN p.id = auth.uid() OR COALESCE(s.show_email, false)
         THEN p.email END AS email,
    CASE WHEN p.id = auth.uid() OR COALESCE(s.show_phone, false)
         THEN p.phone END AS phone
   FROM profiles p
     LEFT JOIN students s ON s.profile_id = p.id
     LEFT JOIN cohorts c ON s.cohort_id = c.id
  WHERE COALESCE(s.is_staff_preview, false) = false;
