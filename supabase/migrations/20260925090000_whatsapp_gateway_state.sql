-- Where the WhatsApp gateway keeps its session, and what it reports about itself.
--
-- Baileys is a WhatsApp *client*, not an API: pairing a number produces Signal
-- credentials that identify this gateway as a linked device, and losing them
-- means someone has to stand in front of the phone and scan a QR again. Baileys
-- ships useMultiFileAuthState, which writes those credentials to a folder, and
-- its own documentation says not to use it for anything real. On Render that
-- advice is not optional: the container filesystem is rebuilt on every deploy
-- and every restart, so a folder-backed session would be destroyed by an
-- ordinary push. The credentials therefore live here, in the one place that
-- outlives the container.
--
-- Two kinds of row share the table, distinguished by id: 'creds' holds the
-- device identity, and 'key-<type>-<id>' rows hold the Signal protocol keys for
-- individual conversations. Baileys reads and writes them constantly during a
-- session, so this is a hot table, not an archive.
CREATE TABLE IF NOT EXISTS public.whatsapp_auth_state (
  id text PRIMARY KEY,

  -- Serialised by Baileys' own BufferJSON, which encodes the binary key
  -- material as {type:'Buffer',data:[...]}. Stored as jsonb rather than text so
  -- a corrupted write fails here instead of at the next pairing, but it is
  -- opaque to us: nothing should read into it except the gateway.
  value jsonb NOT NULL,

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- These rows are the number's identity. Anyone holding them can send messages
-- as the school. No policy is created deliberately: with RLS on and no policy,
-- every anon and authenticated request is refused, and only the service role --
-- which bypasses RLS -- can reach the table. The gateway holds that key; no
-- browser ever should.
ALTER TABLE public.whatsapp_auth_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_auth_state FROM anon, authenticated;


-- The gateway's own pulse.
--
-- A Baileys socket does not fail loudly. It closes, and the process stays up
-- answering HTTP perfectly well while sending nothing at all -- so a plain
-- "is the web service responding" check reports green through a total outage.
-- The gateway writes what it actually knows about its socket here, and the
-- scheduled check reads it rather than trusting a 200.
--
-- Exactly one row, enforced by the primary key: this is current state, not a
-- log. History, when we want it, belongs in activity_events.
CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_status (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),

  -- 'open' is the only value that can send. 'connecting' is normal and brief;
  -- 'qr' means the session is gone and a human must re-pair; 'closed' means the
  -- socket dropped and reconnection is being attempted.
  connection text NOT NULL DEFAULT 'closed'
    CHECK (connection IN ('open', 'connecting', 'closed', 'qr')),

  -- The number currently paired, so an alert can say which line went down, and
  -- so an accidental re-pair against the wrong phone is visible.
  jid text,

  -- Written on every socket event and every scheduled ping. Staleness is the
  -- real signal: a row that stopped updating means the process died, which no
  -- value of `connection` can tell us on its own.
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Set when the socket closes, cleared when it opens. Carried into the alert
  -- so the first thing read is the cause, not just the symptom.
  last_error text,

  -- Survives restarts, unlike an in-process counter. A number climbing between
  -- two checks is a reconnect loop, which WhatsApp itself will eventually treat
  -- as abuse -- worth seeing before they do.
  reconnect_count integer NOT NULL DEFAULT 0,

  -- When the last outage email went out. The check runs every five minutes, so
  -- without this an overnight outage would send well over a hundred identical
  -- emails -- which trains whoever receives them to ignore the one that
  -- matters. Written by the check, not by the gateway.
  last_alert_at timestamptz
);

ALTER TABLE public.whatsapp_gateway_status ENABLE ROW LEVEL SECURITY;

-- Unlike the credentials, this row is not a secret -- it is an operational
-- status an admin screen may want to show. Admins may read it; only the service
-- role writes it. Teachers are left out on purpose: re-pairing the line is not
-- their job, and a red banner they cannot act on is just noise.
DROP POLICY IF EXISTS "Admins read gateway status" ON public.whatsapp_gateway_status;
CREATE POLICY "Admins read gateway status" ON public.whatsapp_gateway_status
  FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

INSERT INTO public.whatsapp_gateway_status (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;
