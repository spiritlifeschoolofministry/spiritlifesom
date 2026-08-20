-- SLM101 is a printed handout, but its fee structure was left at learning_modes
-- '{All}' while every other handout in the cohort is '{Physical}'. Online
-- students were therefore billed 350 for a booklet they never receive: 40 of
-- them had the fee, and it was what made an otherwise fully-paid student read
-- "Partial" on their dashboard.
--
-- The 38 unpaid rows were deleted by hand on 2026-08-20; the two that had
-- already been paid were deliberately kept so the payments stay on record.
-- Only the structure is corrected here, so a database rebuilt from migrations
-- does not start charging online students again.

UPDATE public.fee_structures
SET learning_modes = ARRAY['Physical']
WHERE fee_name = 'SLM101'
  AND learning_modes @> ARRAY['All'];
