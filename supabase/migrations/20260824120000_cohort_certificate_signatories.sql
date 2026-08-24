-- Who signs a certificate was hardcoded in the React component, so the two
-- names on it could only be changed by a deploy -- and changing them there
-- would silently rewrite every certificate ever issued, including those signed
-- by whoever held the office before.
--
-- Signatories become per-cohort instead, alongside the certificate text that is
-- already per-cohort on cohorts. A past session then keeps the people who
-- actually signed it when leadership changes.
--
-- They live in their own table rather than as more columns on cohorts, because
-- cohorts is readable by anon -- the registration page lists it. A scanned
-- signature that anyone could fetch without logging in is a forgery kit, so
-- these rows are visible only to staff and to the students of that cohort.

CREATE TABLE IF NOT EXISTS public.cohort_certificate_settings (
  cohort_id uuid PRIMARY KEY REFERENCES public.cohorts(id) ON DELETE CASCADE,

  -- An array of at most two { name, title, signature } objects, left to right as
  -- they are printed. signature is a PNG data URL drawn in the admin signature
  -- pad, or null for a printed name with no signature over it. Stored inline
  -- rather than in R2 on purpose: the certificate exporter has to inline every
  -- image it draws, and a cross-origin fetch that fails leaves the signature
  -- silently missing from the downloaded PDF.
  signatories jsonb NOT NULL DEFAULT jsonb_build_array(
    jsonb_build_object('name', 'Pastor Folakemi Obadare', 'title', 'Residence Pastor', 'signature', NULL),
    jsonb_build_object('name', 'Prophet Cherub Obadare',  'title', 'Founder/Proprietor', 'signature', NULL)
  ),

  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT signatories_is_short_array
    CHECK (jsonb_typeof(signatories) = 'array' AND jsonb_array_length(signatories) <= 2),

  -- Every graduate of the cohort downloads this, so a pasted full-resolution
  -- photograph would be paid for on every certificate. A drawn signature is a
  -- few KB; 256KB is generous for one and still bounds the row.
  CONSTRAINT signatories_are_small
    CHECK (pg_column_size(signatories) <= 524288)
);

ALTER TABLE public.cohort_certificate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read all certificate settings" ON public.cohort_certificate_settings;
CREATE POLICY "Staff read all certificate settings" ON public.cohort_certificate_settings
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]));

-- A student needs the signatories to render their own certificate, and only
-- their own cohort's.
DROP POLICY IF EXISTS "Students read their own cohort settings" ON public.cohort_certificate_settings;
CREATE POLICY "Students read their own cohort settings" ON public.cohort_certificate_settings
  FOR SELECT USING (
    cohort_id IN (SELECT cohort_id FROM public.students WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins write certificate settings" ON public.cohort_certificate_settings;
CREATE POLICY "Admins write certificate settings" ON public.cohort_certificate_settings
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

GRANT SELECT ON public.cohort_certificate_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cohort_certificate_settings TO authenticated;

COMMENT ON TABLE public.cohort_certificate_settings IS
  'Per-cohort certificate signatories. Separate from cohorts because cohorts is anon-readable and a fetchable signature image is a forgery risk.';
COMMENT ON COLUMN public.cohort_certificate_settings.signatories IS
  'Up to two { name, title, signature } objects, printed left to right. signature is a PNG data URL or null.';

-- Stamp who last touched a cohort's certificate, the way the rest of the schema
-- records edits.
CREATE OR REPLACE FUNCTION public.touch_cohort_certificate_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_cohort_certificate_settings_touch ON public.cohort_certificate_settings;
CREATE TRIGGER on_cohort_certificate_settings_touch
  BEFORE INSERT OR UPDATE ON public.cohort_certificate_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_cohort_certificate_settings();

-- Existing cohorts keep printing exactly what they print today: the column
-- default is the pair that was hardcoded in the component.
INSERT INTO public.cohort_certificate_settings (cohort_id)
SELECT id FROM public.cohorts
ON CONFLICT (cohort_id) DO NOTHING;

-- A new cohort should not have to be configured before its certificates work.
CREATE OR REPLACE FUNCTION public.seed_cohort_certificate_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO cohort_certificate_settings (cohort_id)
  VALUES (NEW.id)
  ON CONFLICT (cohort_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_cohort_seed_certificate_settings ON public.cohorts;
CREATE TRIGGER on_cohort_seed_certificate_settings
  AFTER INSERT ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.seed_cohort_certificate_settings();
