# شركة جناح الريادة — online store

Full-stack e-commerce platform for a Saudi electrical shop: an Arabic-first storefront
(Arabic / English / Urdu, RTL), a REST API, and a back office with orders, inventory,
point of sale, tax invoices and reports. Currency is SAR, prices include 15% VAT.

Everything the customer or the staff sees comes from PostgreSQL. There is no mock data
in the code: the sample catalogue is inserted by the seed script and can be left out.

## Contents

- [Stack](#stack)
- [Run it locally](#run-it-locally)
- [First administrator](#first-administrator)
- [What works out of the box and what needs credentials](#what-works-out-of-the-box-and-what-needs-credentials)
- [Before you take real orders](#before-you-take-real-orders)
- [Tests](#tests)
- [Project layout](#project-layout)
- [Known limits](#known-limits)
- More: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/APPS.md](docs/APPS.md), [docs/API.md](docs/API.md), [docs/ZATCA.md](docs/ZATCA.md)

## Stack

| Layer | Choice |
|---|---|
| Runtime | [Bun](https://bun.sh) ≥ 1.2 (TypeScript runs directly, HTTP server, PostgreSQL driver, bundler, password hashing) |
| Database | PostgreSQL 14+ (16 recommended) with `pg_trgm` for fuzzy search |
| Data access | Parameterised SQL through `Bun.SQL`; schema in `db/migrations/*.sql` |
| UI | React 19 (server-rendered storefront with hydration; admin is a single-page app), Tailwind CSS 4 |
| Validation | zod on every request body |

Only five npm packages are used at runtime: `react`, `react-dom`, `zod`, `tailwindcss`
(build step) and `sharp` (image resizing; optional).

> **Note on the stack.** The brief suggested Next.js with Prisma on Node.js. This
> build uses Bun, React and SQL migrations instead, because the workspace it was
> written in could not download npm packages and everything here had to be run and
> tested before delivery. The architecture is the same shape (server-rendered React,
> typed API, relational schema), and nothing is tied to a hosting vendor.

## Apps for phones, tablets and computers

The store and the back office both install as apps (Progressive Web App): Android, iPhone/iPad,
Windows, Mac, ChromeOS. They come from the same code as the website. Customers get a home-screen icon,
a full-screen window, shortcuts, a back button in app mode and offline viewing of pages they've
opened. The site offers the install itself (banner on phones, footer, menu), with step-by-step help on
iPhone. An Android **.apk** is built by GitHub (`android/`, published under the repository's Releases).
Google Play, Microsoft Store and App Store packages can be generated from the live site. See
[docs/APPS.md](docs/APPS.md).

## Run it locally

Requirements: Bun ≥ 1.2 and PostgreSQL.

```bash
# 1. database
createuser janah --pwprompt
createdb janah --owner janah

# 2. configuration
cp .env.example .env
#    set DATABASE_URL, APP_URL=http://localhost:3000, NODE_ENV=development,
#    SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD

# 3. install, create tables, load reference data
bun install
bun run migrate
bun run seed

# 4. start (rebuilds the browser bundles when files change)
bun run dev
```

Open <http://localhost:3000> for the store and <http://localhost:3000/admin> for the
back office.

Production start is `bun run build && bun run start`; see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Docker, the reverse proxy and backups.

### What the seed inserts

| Always | Only with `SEED_SAMPLE_CATALOG=true` (default) |
|---|---|
| 13 regions and 46 cities of Saudi Arabia | 57 sample electrical products with Arabic, English and Urdu names |
| 3 delivery methods with regional rates | 8 brands |
| 25 categories (21 top-level + 4 subcategories) | Opening stock for each sample product |
| 6 staff roles | |
| 5 legal pages, 6 FAQ entries, 12 homepage sections, 3 banners | |
| Default settings | |

The seed is idempotent: running it again adds what is missing and leaves your edits alone.
Sample products have no photos (the storefront draws a category line-icon instead) and no
reviews. Replace or delete them from **Admin → Products**.

## First administrator

Either set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before `bun run seed`, or:

```bash
bun run admin:create owner@example.sa 'a-strong-password' super_admin "Owner name"
```

Roles: `super_admin`, `manager`, `sales`, `inventory`, `accountant`, `support`. More staff
accounts and custom roles are managed in **Admin → Staff & roles**.

## What works out of the box and what needs credentials

| Area | Without any third-party account | With credentials |
|---|---|---|
| Catalogue, search, cart, checkout, orders, tracking, returns | Works | — |
| Cash on delivery | Works | — |
| mada / Visa / Mastercard / Apple Pay / STC Pay | **Not offered at checkout** (no fake success) | `PAYMENT_PROVIDER=moyasar` + `MOYASAR_SECRET_KEY`. Hosted payment page; card data never reaches this server. Which wallets appear depends on what Moyasar activates for your account. |
| Tax invoices with QR (ZATCA phase 1) | Works once the VAT number is saved in settings | — |
| ZATCA phase 2 (clearance / reporting) | Invoice XML, UUID, counter and hash chain are generated and stored | Needs onboarding and a signing module — see [docs/ZATCA.md](docs/ZATCA.md) |
| E-mail | Messages are queued and marked `skipped`; nothing is sent | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` |
| SMS | Not sent | `SMS_PROVIDER=unifonic` + keys |
| WhatsApp notifications | Not sent | `WHATSAPP_PROVIDER=meta` + token (needs approved templates) |
| WhatsApp chat button | Appears when a WhatsApp number is saved in settings | — |
| Image storage | Local disk (`UPLOAD_DIR`) | `STORAGE_DRIVER=s3` + bucket keys |
| Barcode scanning | USB / Bluetooth scanners work everywhere (they type the code) | Camera scanning uses the browser `BarcodeDetector` API: Chrome and Edge on Android, Chrome on macOS. Not available in Safari / iOS or Firefox. |

The admin dashboard shows a checklist while the VAT number, contact phone, payment
gateway or e-mail are still missing.

## Before you take real orders

1. **Admin → Settings → Store**: legal name, VAT number (15 digits), CR number, national
   address, phone, WhatsApp, e-mail. The VAT number is required for a valid tax invoice.
2. **Admin → Pages**: the privacy policy, terms, returns, shipping and VAT pages are
   templates. Have them reviewed for your business (and by a lawyer for the terms).
3. **Admin → Shipping**: check delivery fees, free-delivery thresholds and delivery times.
4. Replace the sample catalogue, upload product photos, set real stock levels.
5. Configure e-mail so customers receive order confirmations and password-reset links.
6. Configure the payment gateway and place a test payment in Moyasar test mode.
7. Read [docs/ZATCA.md](docs/ZATCA.md) and confirm with your accountant which e-invoicing
   phase applies to you today.
8. Set up TLS and backups ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Tests

```bash
bun test              # unit tests: pricing and VAT, barcodes, QR/TLV, phone numbers, translations
bun run test:e2e      # 318 checks against a running server + database (see below)
```

`bun run test:e2e` drives the real HTTP API end to end: registration and password reset,
guest and logged-in checkout, stock deduction, concurrent buyers for the last unit,
invoice and QR contents, the full order status chain, cancellation, full and partial
returns with refunds and credit notes, point of sale, stock movements, uploads, role
permissions, CSRF, validation, rate limiting and exports. It creates real rows, so run it
against a development database:

```bash
TRUST_PROXY=true bun run dev        # in one terminal
bun run test:e2e                    # in another (needs SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env)
```

What was verified before delivery, and what could not be, is listed in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#verification-status).

## Project layout

```
db/migrations/          SQL schema (applied in order, once each)
scripts/                migrate, seed, create-admin, build, dev, e2e, backup, restore
src/shared/             code used by server and browser: pricing/VAT, i18n dictionaries, routes, barcode, QR
src/server/             HTTP server, security, sessions, SSR
  api/                  REST handlers (auth, store, admin/*, webhooks)
  services/             business logic: cart, orders, inventory, invoices, ZATCA, payments, notifications, storage
src/web/                storefront (pages, shell, UI kit, styles)
src/admin/              back office (pages, generic CRUD screens)
tests/                  unit tests
docs/                   API reference, deployment, ZATCA notes
```

Conventions worth knowing before changing code:

- **Money is an integer number of halalas** everywhere (`2450` = 24.50 SAR). VAT rates
  are basis points (`1500` = 15%). All totals come from `src/shared/pricing.ts`.
- **Stock only changes through `moveStock`** (`src/server/services/inventory.ts`), which
  locks the row and writes an `inventory_transactions` record.
- **Text shown to people lives in `src/shared/i18n/`**; `bun test` fails if a key is
  missing in any of the three languages.
- **Every admin write is recorded in `audit_logs`.**

## Known limits

- **ZATCA phase 2 is prepared, not complete.** The XAdES signature and the onboarding
  (CSR / CSID) flow are not implemented. Details and the exact extension point are in
  [docs/ZATCA.md](docs/ZATCA.md).
- **PDF export is the browser's "Save as PDF"** from print-styled pages (invoices,
  reports, orders, labels). Excel (`.xlsx`) and CSV are real file downloads.
- **One payment gateway adapter (Moyasar).** Others (HyperPay, Tap, PayTabs, Tabby,
  Tamara) plug into the `PaymentGateway` interface in `src/server/services/payments/`.
- **E-mail goes through Resend's HTTP API.** There is no SMTP client.
- **The rate limiter is in-memory per process.** With several instances, add a shared
  limiter at the load balancer.
- **The return window is 7 days**, set by `RETURN_WINDOW_DAYS` in
  `src/server/services/orders.ts` and stated in the returns page text.
- **One stock location.** Each product has one quantity and a free-text shelf location.
