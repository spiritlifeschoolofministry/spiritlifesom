-- Where each element sits on a cohort's certificate, set by dragging them in
-- the layout editor (Admin > Settings > Certificates > Edit > Edit layout).
--
-- Null -- every existing row, and any cohort nobody has laid out -- means the
-- certificate is drawn exactly as before, by the original fixed markup.
--
-- It lives beside the signatories rather than on cohorts for the same reason
-- they do: cohorts is anon-readable, and nothing about a certificate needs to
-- be. No policy changes are needed: the existing ones on this table already
-- let staff and the cohort's own students read it, and only admins (the
-- superadmin role) write it.

ALTER TABLE public.cohort_certificate_settings
  ADD COLUMN IF NOT EXISTS layout jsonb;

ALTER TABLE public.cohort_certificate_settings
  DROP CONSTRAINT IF EXISTS layout_is_object;
ALTER TABLE public.cohort_certificate_settings
  ADD CONSTRAINT layout_is_object
    CHECK (layout IS NULL OR jsonb_typeof(layout) = 'object');

-- A dozen small entries is a few hundred bytes; bound it so the column cannot
-- become a dumping ground on a row every graduate downloads.
ALTER TABLE public.cohort_certificate_settings
  DROP CONSTRAINT IF EXISTS layout_is_small;
ALTER TABLE public.cohort_certificate_settings
  ADD CONSTRAINT layout_is_small
    CHECK (layout IS NULL OR pg_column_size(layout) <= 16384);

COMMENT ON COLUMN public.cohort_certificate_settings.layout IS
  'Certificate element positions, or null for the original fixed layout. An object keyed by element '
  '(header, title, certify, recipientName, studentCode, rule, mainText, subText, date, serial, '
  'signatory1, signatory2), each { x, y, fontScale?, width? }: x/y are the element''s anchor point as '
  'fractions 0-1 of the A4-landscape sheet''s width/height, fontScale multiplies its type size, width '
  'is a wrapping block''s width as a fraction of the sheet. Missing keys keep their default position; '
  'unknown keys are ignored. Read by src/lib/certificate-layout.ts.';
