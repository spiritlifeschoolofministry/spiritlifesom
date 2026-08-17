-- Answer keys for the matching questions in SLM 104.
--
-- Matching questions were imported with correct_answer NULL, so they could only
-- ever be marked by hand. The key is {left letter: right number}, the same shape
-- the runner stores an answer in, and marks are awarded pair by pair.
--
-- Set from the plain sense of each pair; a lecturer can change any of them in
-- the question bank, and can still override a mark when reviewing a paper.
UPDATE public.question_bank SET correct_answer = '{"A":"1","B":"2"}'::jsonb
WHERE id = '852a0ebc-5403-4cdc-b54e-7a41bfb3bbb0';  -- Evangelist→preaches to the unsaved, Teacher→opens the Word

UPDATE public.question_bank SET correct_answer = '{"A":"2","B":"1"}'::jsonb
WHERE id = '6b6ad21b-35b8-49cd-abc5-8ed318728cd4';  -- Athanasius→AD 367 Easter Letter, Carthage→AD 397

UPDATE public.question_bank SET correct_answer = '{"A":"1","B":"2"}'::jsonb
WHERE id = '40f9741a-94da-4e5a-8ad9-82b8ca6a4ee1';  -- Historical→time, Linguistic→language

UPDATE public.question_bank SET correct_answer = '{"A":"1","B":"2"}'::jsonb
WHERE id = 'aaaaf09a-2ec3-4d54-a227-03f63480be0f';  -- Revelation→reveal something, Power→do something

UPDATE public.question_bank SET correct_answer = '{"A":"1","B":"2"}'::jsonb
WHERE id = '19892374-8e94-424a-aa49-85fd63ee0db1';  -- Abraham→sacrificed his son, Elisha→poured water for Elijah
