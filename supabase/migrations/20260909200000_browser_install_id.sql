-- A random label for one browser, so "the same browser" can be told from "the
-- same kind of browser".
--
-- `device_fingerprint` was meant to do this and cannot: it is built from the
-- user agent, language, screen size, timezone and core count, which describes a
-- model rather than a device. Ten students on the same handset in the same city
-- produce one identical value, and reading that as a shared device marks half a
-- cohort. It is left in place, unread.
--
-- This is a random number generated once in a browser and kept there. It says
-- nothing about who owns it, what it is, or where it is. Its only use is
-- noticing that one browser was used by two different students in one exam,
-- which is a reason to ask a question and never an answer to one: a household
-- sharing a laptop looks exactly the same as anything else.
--
-- It describes nothing before the day it ships, and a cleared browser starts
-- again. Both are stated plainly wherever it is read.

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS browser_install_id TEXT;

COMMENT ON COLUMN public.exam_attempts.browser_install_id IS
  'Random id generated once per browser install and kept in its local storage. '
  'Used only to notice one browser used by two students in the same exam. Not '
  'an identity, not evidence, and empty for every attempt sat before it existed.';
