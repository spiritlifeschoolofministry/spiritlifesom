# SLSOM WhatsApp Gateway

A single-purpose Node service that holds one WhatsApp connection (via Baileys)
and exposes it as a small authenticated HTTP API. Supabase decides *what* to
send and *to whom*; this service only knows how to put a message on the wire.

That split is deliberate. School rules — which cohort, whose balance, who has
opted out — stay in the database that already enforces them. If this gateway is
ever replaced with the official WhatsApp Cloud API, one URL changes and nothing
else does.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | none | Liveness for Render. 200 whenever the process is up — says nothing about WhatsApp. |
| GET | `/status` | secret | What the socket is actually doing. Also refreshes the heartbeat. |
| GET | `/qr` | secret **or** pairing token | Scannable pairing page, when a pairing is in progress. |
| GET | `/groups` | secret | Lists the groups this number is in, with their JIDs. Read-only. |
| POST | `/send` | secret | `{ to, text, idempotency_key?, student_id? }` |

Auth is the `x-gateway-secret` header, compared in constant time.

### The one hard rule

`POST /send` returns **422** for any payload that carries a `student_id` and a
group JID (`…@g.us`). Balances, scores and rejected receipts are personal; the
official group contains staff and every other student, and its membership is
maintained by hand in WhatsApp, outside this system's access control entirely.
A group message may carry a *deadline*; it may never carry a *balance*.

The guard runs before the connection check, so it holds even while the line is
down.

## Deploying to Render

1. **Create a Web Service** from this repo, root directory `whatsapp-gateway`.
   Or point Render at `render.yaml` as a Blueprint.
2. **Use the Starter plan, not Free.** Free services spin down after ~15 minutes
   idle, and a spun-down container has no process, so the WhatsApp socket dies
   with it. It reconnects on the next request, but repeatedly dropping and
   re-establishing a session is the pattern WhatsApp reads as abuse. The
   scheduled ping reduces idling; it does not make the free tier safe here.
3. **Set the environment variables:**

   | Variable | Notes |
   |---|---|
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role, **not** anon — `whatsapp_auth_state` has RLS on with no policy, so the anon key reads back nothing and the gateway asks for a QR on every boot |
   | `GATEWAY_SECRET` | Long random string; also set on the `whatsapp-health` Edge Function |
   | `PAIRING_TOKEN` | Optional. Opens `/qr` from a plain browser link. Scoped to that page only — it cannot send. Unset closes the query-parameter route entirely |
   | `OFFICIAL_GROUP_JID` | Optional until group sends are built |
   | `NODE_VERSION` | `22.11.0` — Baileys needs ≥20.10 for JSON import attributes |

4. **Keep it at one instance.** A Baileys session is a single linked device; two
   containers sharing credentials fight over the socket and get the number
   logged out.

## Pairing

1. Deploy. The service starts, finds no credentials, and issues a QR.
2. Open the QR page. With `PAIRING_TOKEN` set, that is just a link:
   `https://<service>.onrender.com/qr?token=<PAIRING_TOKEN>`
   Otherwise, curl it with the `x-gateway-secret` header and open the file.
3. On the school phone: **WhatsApp → Settings → Linked devices → Link a device**.
4. `/status` should report `connection: "open"`.

The QR expires in about a minute — reload for a fresh one.

Rotate or unset `PAIRING_TOKEN` once paired. It only ever displays a QR that is
already being offered, but there is no reason to leave the page reachable when
no pairing is in progress.

Credentials are written to `whatsapp_auth_state` in Supabase, so a redeploy does
**not** require re-pairing. Only an explicit logout does, and the health check
emails you when that happens.

## Monitoring

`supabase/functions/whatsapp-health` runs every 5 minutes via `pg_cron`. It both
keeps the service warm and judges it, checking two things a plain 200 cannot:
whether the socket reports itself open, and whether the status row is still
being written. A Baileys socket fails quietly — it closes while the process
keeps answering HTTP perfectly well.

Alerts go out by **email**, not WhatsApp, because the thing being monitored is
the only thing that could deliver a WhatsApp alert. Repeats are capped at one
per hour.

## Local development

```bash
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GATEWAY_SECRET=dev npm run dev
```

Note this pairs against the **same** stored session as production if pointed at
the production database. Use a branch database, or a second WhatsApp number.
