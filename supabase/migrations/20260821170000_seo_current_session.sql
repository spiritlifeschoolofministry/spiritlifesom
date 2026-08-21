-- The llms.txt summary — what AI assistants read when asked about the school —
-- still announced 2025/26 as the current academic session months after that
-- session closed. The line now carries whichever cohort is marked active, and
-- default_content is updated alongside it so "Reset to default" in the admin
-- settings screen cannot bring the stale year back.
UPDATE public.seo_files f
SET content = regexp_replace(
      f.content,
      'Current academic session: [0-9]{4}/[0-9]{2,4}\.',
      'Current academic session: ' || COALESCE(
        (SELECT c.name FROM public.cohorts c WHERE c.is_active ORDER BY c.start_date DESC LIMIT 1),
        '2026/2027'
      ) || '.'
    ),
    default_content = regexp_replace(
      f.default_content,
      'Current academic session: [0-9]{4}/[0-9]{2,4}\.',
      'Current academic session: ' || COALESCE(
        (SELECT c.name FROM public.cohorts c WHERE c.is_active ORDER BY c.start_date DESC LIMIT 1),
        '2026/2027'
      ) || '.'
    )
WHERE f.content ~ 'Current academic session: [0-9]{4}/[0-9]{2,4}\.'
   OR f.default_content ~ 'Current academic session: [0-9]{4}/[0-9]{2,4}\.';
