-- Everything the number sends, and whether it got there.
--
-- Until now the gateway sent and kept nothing. Asked "what has the bot sent,
-- and to whom", the honest answer had to be reconstructed from marker columns,
-- the events that would have fired a message, and memory -- and some of it was
-- still guesswork. During an incident that is the first question anyone asks,
-- and the one this system could least answer.
--
-- Written by the gateway, at the last point before the wire, so nothing that
-- sends can forget to record itself -- the same reason the signature is applied
-- there.
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  to_jid text NOT NULL,

  -- What kind of message this was, as named by whatever asked for it:
  -- 'payment_rejected', 'exam_starting_soon', 'reply:fees' and so on. Null for
  -- a caller that did not say.
  source text,

  -- The words as actually delivered, signature included. Not the caller's
  -- input: what matters afterwards is what the person saw.
  body text,

  -- One of:
  --   sent           delivered to WhatsApp
  --   deduplicated   a repeat of something already sent, not sent again
  --   not_connected  the line was down, nothing went out
  --   refused        blocked by the gateway's own rules (personal data to a group)
  --   failed         WhatsApp rejected it
  --
  -- The failures are the reason this exists. A send that did not happen leaves
  -- no trace anywhere else -- the week the device was unlinked, every alert
  -- simply vanished.
  outcome text NOT NULL
    CHECK (outcome IN ('sent', 'deduplicated', 'not_connected', 'refused', 'failed')),
  error text,

  -- WhatsApp's own id for the message, for matching against the phone.
  message_id text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  idempotency_key text
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_recent
  ON public.whatsapp_outbound_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_to
  ON public.whatsapp_outbound_log (to_jid, sent_at DESC);

ALTER TABLE public.whatsapp_outbound_log ENABLE ROW LEVEL SECURITY;

-- Admins only. These rows contain fee balances, results and rejected-payment
-- reasons -- every personal thing the number has ever said.
DROP POLICY IF EXISTS whatsapp_outbound_admin_read ON public.whatsapp_outbound_log;
CREATE POLICY whatsapp_outbound_admin_read ON public.whatsapp_outbound_log
  FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

REVOKE ALL ON public.whatsapp_outbound_log FROM anon;
