# Deployment

- [What you need](#what-you-need)
- [Option R — Render (managed hosting)](#option-r--render-managed-hosting)
- [Option A — Docker Compose on one server](#option-a--docker-compose-on-one-server)
- [Option B — without Docker](#option-b--without-docker)
- [Reverse proxy and TLS](#reverse-proxy-and-tls)
- [Connecting the services](#connecting-the-services)
- [Backups and restore](#backups-and-restore)
- [Updating](#updating)
- [Logs, health and monitoring](#logs-health-and-monitoring)
- [Scaling beyond one server](#scaling-beyond-one-server)
- [Security checklist](#security-checklist)
- [Verification status](#verification-status)

## What you need

- A Linux server (2 vCPU / 2 GB RAM is plenty to start) or any platform that runs a
  container, in a region close to Saudi Arabia.
- PostgreSQL 14 or newer. The migration runs `CREATE EXTENSION pg_trgm`, so the database
  user needs permission to create extensions on first run (managed databases usually
  allow `pg_trgm`).
- A domain name with HTTPS. The session cookie is `Secure` in production, so the site
  **does not work over plain HTTP** when `NODE_ENV=production`.
- Persistent storage for uploaded images: a disk volume, or an S3-compatible bucket.

All configuration is environment variables. `.env.example` documents each one.

## Option R — Render (managed hosting)

`render.yaml` describes the whole setup: a PostgreSQL database and a Docker web service in Frankfurt
(the closest Render region to Saudi Arabia), wired together.

1. Put the project in a GitHub (or GitLab/Bitbucket) repository.
2. Render dashboard → **New → Blueprint** → choose the repository. Render may ask you to add a
   card first, even for free plans.
3. Enter `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` when asked, then **Apply**.
4. The first deploy builds the image, creates the tables and loads the reference data, your
   admin account and the sample catalogue. The store is at `https://janah-alriyadah-store.onrender.com`
   (Render shows the exact address). Sign in at `/admin`.
5. In the service's **Environment** tab set `SEED_ON_START=false` and delete
   `SEED_ADMIN_PASSWORD`. Otherwise every restart re-adds sample pages or FAQs you deleted.

What the Blueprint sets for Render specifically:

- `STORAGE_DRIVER=db`: Render's disk is wiped on every restart and deploy, so photos are kept
  in PostgreSQL (and in its backups).
- `TRUST_PROXY=true`: Render's load balancer forwards the visitor's address.
- `APP_URL` is not needed: the app uses Render's `RENDER_EXTERNAL_URL`. Set `APP_URL` when you add
  your own domain (Settings → Custom Domains).

The Blueprint uses **free** plans. On the free plan the site sleeps after 15 idle minutes (the next
visit waits about a minute), the database is deleted 30 days after creation unless upgraded, and
there are no database backups. Before taking real orders change `plan:` to a paid web plan
(`starter`, $7/month) and a paid database plan (`basic-256mb`, $6/month) in `render.yaml` or the
dashboard, and add the payment, e-mail and other keys from `.env.example` in the Environment tab.

## Option A — Docker Compose on one server

```bash
git clone <your repository> janah && cd janah
cp .env.example .env
```

Edit `.env`:

```ini
APP_URL=https://www.your-domain.sa
POSTGRES_PASSWORD=<long random string>
SEED_ADMIN_EMAIL=owner@your-domain.sa
SEED_ADMIN_PASSWORD=<at least 10 characters, letters and digits>
```

Then:

```bash
docker compose up -d --build        # builds the image, starts PostgreSQL and the app, applies migrations
docker compose exec app bun run seed # regions, cities, categories, roles, pages, first admin, sample catalogue
docker compose logs -f app
```

The app listens on `127.0.0.1:3000`. Put a reverse proxy in front of it (next section).
After the first seed, remove `SEED_ADMIN_PASSWORD` from `.env`.

To seed without the 57 sample products: `docker compose exec -e SEED_SAMPLE_CATALOG=false app bun run seed`.

## Option B — without Docker

```bash
curl -fsSL https://bun.sh/install | bash
bun install --production=false
cp .env.example .env                 # fill it in; NODE_ENV=production
bun run migrate
bun run seed
bun run build                        # writes dist/ (hashed JS + CSS and manifest.json)
bun run start
```

A systemd unit to keep it running:

```ini
# /etc/systemd/system/janah.service
[Unit]
Description=Janah Al Riyada store
After=network.target postgresql.service

[Service]
WorkingDirectory=/srv/janah
EnvironmentFile=/srv/janah/.env
ExecStartPre=/home/janah/.bun/bin/bun scripts/migrate.ts
ExecStart=/home/janah/.bun/bin/bun src/server/index.ts
Restart=always
RestartSec=3
User=janah
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

The server handles `SIGTERM` by finishing in-flight requests before exiting.

## Reverse proxy and TLS

The app must sit behind a proxy that terminates HTTPS and forwards the client address.
Set `TRUST_PROXY=true` so rate limiting uses the visitor's IP rather than the proxy's.
Only set it when such a proxy is really in front; otherwise visitors could spoof the header.

**Caddy** (obtains and renews certificates by itself):

```
www.your-domain.sa {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
your-domain.sa {
    redir https://www.your-domain.sa{uri} permanent
}
```

**nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name www.your-domain.sa;
    ssl_certificate     /etc/letsencrypt/live/www.your-domain.sa/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.your-domain.sa/privkey.pem;

    client_max_body_size 70m;            # product videos are accepted up to 60 MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`APP_URL` must equal the public origin exactly (scheme and host). It is used for the
CSRF origin check, canonical URLs, the sitemap and payment return addresses.

## Connecting the services

### Payments — Moyasar

1. Open a merchant account at <https://moyasar.com> and complete activation. Ask them to
   enable mada, Apple Pay and STC Pay for your account as needed.
2. Set `PAYMENT_PROVIDER=moyasar` and `MOYASAR_SECRET_KEY=sk_test_…` and restart.
   Checkout now shows "Online payment" beside cash on delivery.
3. In the Moyasar dashboard add a webhook to `https://www.your-domain.sa/api/webhooks/moyasar`.
4. Place a test order with Moyasar's test cards, then check **Admin → Payments**.
5. Switch to the live key (`sk_live_…`).

How it works: the server creates a Moyasar *invoice* for the order total and sends the
customer to Moyasar's hosted page. On return (and on webhook, and every two minutes for
anything still pending) the server asks Moyasar for the invoice state with the secret key
and only then marks the order paid. A webhook body is never trusted on its own, and the
amount and currency must match the order. Only the card scheme and last four digits are
stored. Orders left unpaid for `unpaid_order_ttl_minutes` (default 60) are cancelled and
their stock is released.

Refunds from **Admin → Orders** call Moyasar's refund API for online payments. Cash
orders are refunded by you directly; the system records the refund and the credit note.

To add a different gateway, implement the `PaymentGateway` interface
(`src/server/services/payments/gateway.ts`) and register it in `onlineGateway()`.

### E-mail — Resend

1. Create an account at <https://resend.com>, add and verify your sending domain (SPF/DKIM).
2. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM="شركة جناح الريادة <orders@your-domain.sa>"`.
3. In **Admin → Settings → Notifications** set the address that should receive new-order
   and low-stock alerts.

Messages sent: registration, order confirmation, payment confirmation, status updates,
shipped (with tracking number), delivered, cancelled, refunded, password reset,
abandoned-cart reminder, support-ticket reply; to staff: new order, return requested, new
ticket, low stock. Every message is stored in the `notifications` table with its delivery
status and is visible in **Admin → Notifications**.

### SMS — Unifonic

Set `SMS_PROVIDER=unifonic`, `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`. The sender ID must
be registered for Saudi Arabia. SMS is used for order confirmation, payment
confirmation, shipped, out for delivery, delivered, cancelled and refunded. Turn it off without redeploying in
**Admin → Settings → Notifications**.

### WhatsApp — Meta Cloud API

Set `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Meta only
delivers business-initiated messages that use a pre-approved template. The adapter in
`src/server/services/notifications.ts` sends plain text, which Meta accepts only inside
an open 24-hour customer conversation. For order updates you need to create templates in
Meta Business Manager and change `sendWhatsapp` to send them by name. Until then, leave
this off and use the WhatsApp chat button (set the number in store settings).

### Image storage — S3-compatible

```ini
STORAGE_DRIVER=s3
S3_BUCKET=janah-media
S3_REGION=me-central-1
S3_ENDPOINT=https://s3.me-central-1.amazonaws.com
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_PUBLIC_URL=https://cdn.your-domain.sa
```

Uploads are checked by file signature (JPEG, PNG, WebP; MP4/WebM for video), re-encoded
to WebP in two sizes, and stored under random names. SVG and anything else is rejected.

### ZATCA

See [ZATCA.md](ZATCA.md).

## Backups and restore

Two things hold your data: the PostgreSQL database and the uploads folder (or bucket).

```bash
# nightly at 02:30, keep 14 days
30 2 * * * cd /srv/janah && set -a && . ./.env && set +a && scripts/backup.sh >> backups/backup.log 2>&1
```

`scripts/backup.sh` writes `backups/db-<timestamp>.dump` (`pg_dump` custom format) and
`backups/uploads-<timestamp>.tar.gz`, checks that the dump is readable, then deletes
files older than `KEEP_DAYS`. With Docker Compose run it on the host with
`DATABASE_URL` pointing at the published database port, or:

```bash
docker compose exec -T db pg_dump -U janah -Fc janah > backups/db-$(date +%F).dump
docker run --rm -v janah_uploads:/data -v "$PWD/backups":/out alpine tar -czf /out/uploads-$(date +%F).tar.gz -C /data .
```

Recommendations:

- Copy backups off the server every night (another region or object storage).
- Tax invoices must be kept for at least six years under the Saudi VAT regulations. Do
  not let retention delete your only copy of old invoice data; keep monthly archives.
- Test a restore every few months:

```bash
createdb janah_restore_test
CONFIRM=yes DATABASE_URL=postgres://janah:…@localhost/janah_restore_test scripts/restore.sh backups/db-….dump
```

To restore production: stop the app, run `scripts/restore.sh <dump> [uploads archive]`
against the production `DATABASE_URL`, start the app.

For a recovery point better than "last night", enable continuous archiving
(WAL / point-in-time recovery) on PostgreSQL or use a managed database that provides it.

## Updating

```bash
git pull
docker compose up -d --build     # migrations run automatically before the server starts
```

Without Docker: `bun install && bun run build && systemctl restart janah`.

Schema changes go in a new file `db/migrations/00N_description.sql`. Files are applied in
name order, once each, inside a transaction. Never edit a migration that has already run
in production.

## Logs, health and monitoring

- Logs are JSON lines on stdout (`LOG_LEVEL=info` logs each request with status and
  duration; errors include a stack trace). Collect them with journald or Docker's log driver.
- `GET /api/health` returns `200 {"ok":true}`; point your uptime monitor at it.
- **Admin → Activity log** records every staff action with user, time and IP address.
- **Admin → Notifications** shows failed e-mail / SMS deliveries with the provider's error.
- Passwords, session tokens, payment keys and card data are never written to logs.

## Scaling beyond one server

- Run several app instances behind a load balancer; sessions and carts are in PostgreSQL,
  so no sticky sessions are needed.
- Set `RUN_JOBS=false` on all instances but one.
- Use `STORAGE_DRIVER=s3`; local disk is per-instance.
- Add a shared rate limiter at the load balancer; the built-in one counts per process.
- Settings, the category tree and homepage content are cached in memory for 60 seconds per
  instance, so an admin change can take up to a minute to appear on other instances.

## Security checklist

- [ ] `NODE_ENV=production`, HTTPS only, `APP_URL` matches the public origin
- [ ] Strong unique `POSTGRES_PASSWORD`; database port not exposed to the internet
- [ ] `SEED_ADMIN_PASSWORD` removed from `.env` after the first seed
- [ ] `.env` readable only by the service user (`chmod 600`)
- [ ] Staff have individual accounts with the narrowest role that fits
- [ ] Nightly off-site backups, and one restore test done
- [ ] Moyasar live key only on the production server; webhook URL configured
- [ ] Legal pages reviewed and store details filled in

What the application does itself: argon2id password hashing; session tokens stored only as
SHA-256 hashes in `HttpOnly`, `SameSite=Lax`, `Secure` cookies; CSRF protection (origin
check plus double-submit token) on every state-changing request; per-IP rate limits (10
login-type requests, 90 writes, 180 searches per minute); account lock for 15 minutes
after 5 wrong passwords; role permissions checked on every admin endpoint; all SQL
parameterised; React escaping plus a nonce-based Content-Security-Policy; upload content
sniffing; audit log.

## Verification status

Checked before delivery, on Bun 1.4 and PostgreSQL 16:

| Check | Result |
|---|---|
| Migration and seed on an empty database | Pass |
| `bun test` (32 unit tests, including translation completeness in all three languages) | Pass |
| `bun run test:e2e` (318 API checks: auth, checkout, stock, concurrency, invoices, returns, POS, permissions, CSRF, uploads, exports) | Pass |
| Storefront purchase through a real browser: Arabic mobile, Urdu mobile, English desktop, Arabic dark mode | Pass, no layout overflow, no script errors |
| Back office through a real browser: all 34 screens load; POS sale by barcode, order fulfilment with tracking, product creation with photo upload, stock movement, label printing, coupon create/delete, restricted-role navigation | Pass |
| Installable app (docs/APPS.md): Chrome installability check for store and back office, service worker, offline pages, install banner and iPhone steps, app mode | Pass (32 checks) |
| Online payment flow against a local stand-in that mimics Moyasar's documented API (success, failure, amount mismatch, forged webhook, expiry, partial and full refund, gateway outage) | Pass |
| Barcode output compared with an independent encoder's tables (EAN-13, Code 128) | Identical |
| ZATCA QR payload decoded by an independent QR reader | All five fields correct |
| `.xlsx` export opened with LibreOffice and openpyxl | Opens, numeric cells |
| Backup script, then restore into a second database | Row counts match |

Not checked, because the build environment had no access to them:

- **A real Moyasar account.** The integration follows Moyasar's published API and passed
  against a stand-in, but has not processed a real or test-mode payment.
- **Real e-mail, SMS and WhatsApp delivery** (Resend, Unifonic, Meta).
- **The ZATCA Fatoora APIs** and ZATCA's validation SDK.
- **The Docker image and Compose file** (no Docker daemon available). They are standard but
  were not built.
- **S3 storage**; only local disk was exercised.
- **A full TypeScript compiler pass with library typings.** The code was compiled and run by
  Bun and checked with `tsc` using stand-in typings for React and Bun. Run `bun run typecheck`
  after `bun install` and expect some strictness warnings to tidy up.
- **Camera barcode scanning on a physical phone**, and load testing.

Do a test order with each payment method and one refund on your own infrastructure
before opening to customers.
