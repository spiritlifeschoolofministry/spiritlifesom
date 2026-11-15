# Webmail (SnappyMail) — what is running and how to look after it

**https://webmail.spiritlifesom.org** — browser mail for students and staff.

Stalwart is a mail *server*. It has no mail-reading interface of its own:
`mail.spiritlifesom.org` serves a settings portal whose navigation is
Management / Settings / Account, with no inbox anywhere in it. People handed an
address and a password had nowhere to go. SnappyMail is that missing piece.

## What was changed, and where

All of it is on the Contabo VPS `173.212.215.196`, in `/opt/apps`.

| Change | File / place |
|---|---|
| `snappymail` service, image pinned to `djmaze/snappymail:v3.0.1.2` | `/opt/apps/compose.yml` |
| `webmail.spiritlifesom.org` vhost → `snappymail:8888` | `/opt/apps/caddy/Caddyfile` |
| Domain config pointing at Stalwart | `snappymail-data` volume, `_data_/_default_/domains/spiritlifesom.org.json` |
| `A` + `AAAA` records for `webmail`, **DNS-only** | Cloudflare zone `spiritlifesom.org` |

Backups of both config files were taken first, as
`compose.yml.bak-YYYY-MM-DD` and `caddy/Caddyfile.bak-YYYY-MM-DD`.

## Four decisions worth not undoing

**1. It talks to Stalwart over the internal bridge, not the public name.**
The domain config uses the hostname `stalwart`, not `mail.spiritlifesom.org`.
That keeps every webmail login inside `apps_default` (`172.18.0.0/16`), which
is already an `AllowedIp` in Stalwart — the same entry that stops Stalwart
banning Caddy. Point it at the public name instead and a run of bad passwords
in the webmail could get the webmail's own IP banned, locking everyone out at
once. The cost is that the TLS certificate names `mail.spiritlifesom.org`
rather than `stalwart`, so `verify_peer` is off for that one hop — a hop that
never leaves the host.

**2. IMAP is 993 with implicit TLS, not 143.** Stalwart **refuses** port 143;
there is no plaintext IMAP to fall back to. SMTP is 587 with STARTTLS.
In SnappyMail's config, `type` is `0` none, `1` SSL/TLS, `2` STARTTLS,
`9` auto-detect — so IMAP is `type: 1` and SMTP is `type: 2`.

**3. The wildcard domain is gone.** SnappyMail ships `domains/default.json`,
which decodes to `*` and matches *any* domain someone types. It pointed at
`localhost:143` so it was never an open proxy, but it is one edit away from
becoming one. It is parked as `default.json.disabled-backup`, so only
`spiritlifesom.org.json` resolves and any other address is simply refused.

**4. The image is pinned, not `:latest`.** This is internet-facing PHP sitting
in front of everyone's mailbox. The version must change deliberately.

## Looking after it

**Updating — do this promptly when a release lands.** A webmail that is
installed and forgotten is how someone gets onto this box, which is shared with
another project.

```bash
ssh deploy@173.212.215.196
cd /opt/apps
# check https://github.com/the-djmaze/snappymail/releases for the new tag
sed -i 's|djmaze/snappymail:v[0-9.]*|djmaze/snappymail:vNEW.VERSION|' compose.yml
docker compose up -d snappymail
docker compose logs snappymail --tail 20
```

**The SnappyMail admin panel** is at `https://webmail.spiritlifesom.org/?admin`,
user `admin`. The generated password is in the volume at
`_data_/_default_/admin_password.txt`:

```bash
docker compose exec snappymail cat /var/lib/snappymail/_data_/_default_/admin_password.txt
```

Change it on first login. You rarely need this panel — the domain is already
configured.

**If webmail stops working**, check in this order:

```bash
docker compose ps                       # all three containers up?
docker compose logs snappymail --tail 50
docker compose logs caddy --tail 50     # certificate problems show here
# does the container still reach Stalwart?
docker compose exec snappymail php -r '$f=@fsockopen("stalwart",993,$e,$s,5); echo $f?"ok\n":"FAILED: $s\n";'
```

**The DNS record must stay DNS-only (grey cloud).** The zone has a proxied
wildcard `*.spiritlifesom.org` pointing at the website. The explicit unproxied
`webmail` record is what both overrides that wildcard and lets Caddy's ACME
HTTP challenge reach the box. Switch it to proxied and the certificate renewal
fails.

**Do not** set `spiritlifesom.org` to Automatic DNS management in Stalwart —
it would overwrite the apex SPF, DMARC and CAA records.

## Rolling it back

```bash
ssh deploy@173.212.215.196
cd /opt/apps
cp compose.yml.bak-YYYY-MM-DD compose.yml
cp caddy/Caddyfile.bak-YYYY-MM-DD caddy/Caddyfile
docker compose down snappymail
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker volume rm apps_snappymail-data     # only if you want the settings gone too
```

Then delete the `webmail` A and AAAA records in Cloudflare. Nothing about
Stalwart, the website or the mailboxes themselves is touched by any of this.
