# ZATCA e-invoicing (Fatoora) — what is built and what is left

This page is a technical status report, not tax advice. ZATCA updates its rules and
rolls phase 2 out in waves, so confirm what applies to your business on
<https://zatca.gov.sa> and with your accountant before going live.

## Summary

| Requirement | Status |
|---|---|
| Tax invoice for every sale, simplified (B2C) or standard (B2B with buyer VAT number) | Done |
| Credit note for every refund or cancelled invoiced order, linked to the original invoice | Done |
| Seller and buyer details, line items, VAT per line, totals, Arabic text | Done |
| Sequential invoice numbers that cannot be reused or edited | Done |
| **Phase 1** QR code (TLV, base64: seller, VAT number, timestamp, total, VAT) | Done, verified with an independent QR reader |
| UUID, invoice counter (ICV), previous-invoice hash (PIH) chain | Done |
| UBL 2.1 XML for each document | Generated and stored; **not validated with ZATCA's SDK** |
| **Phase 2** cryptographic stamp (XAdES, ECDSA secp256k1) and QR tags 6–9 | **Not implemented** — extension point provided |
| Phase 2 onboarding (CSR → compliance CSID → production CSID) | **Not implemented** — do it with ZATCA's SDK / portal |
| Phase 2 reporting (simplified) and clearance (standard) API calls | Client written and driven by environment variables; **never run against ZATCA** |
| VAT report by tax month, netting credit notes | Done (**Admin → Reports → VAT**, Excel/CSV) |

In short: the store issues compliant-looking phase 1 invoices today and stores everything
phase 2 needs per invoice, but the signing step and the onboarding are yours (or your
integrator's) to complete and certify.

## What happens when an invoice is issued

`src/server/services/invoices.ts` → `issueInvoice(orderId)`

1. Triggered when an order is confirmed (cash on delivery), when an online payment is
   verified, or immediately for a point-of-sale sale. One invoice per order; the function
   returns the existing one if called again.
2. Takes a row lock on the invoice counter, so numbers, ICV and the hash chain stay in
   order even with simultaneous sales.
3. Snapshots the seller (from **Admin → Settings → Store**) and the buyer into the invoice
   row, so later edits to settings or customers never change an issued invoice.
4. Chooses the type: **standard** when the buyer has a VAT number, otherwise **simplified**.
5. Builds the UBL XML (`buildInvoiceXml` in `src/server/services/zatca.ts`), hashes it
   (SHA-256, base64) and stores `uuid`, `icv`, `previous_hash`, `hash`, `xml`, `qr_base64`.
6. Writes `tax_records` rows per VAT rate for the Saudi-calendar tax month.

Credit notes (`issueCreditNote`) follow the same path with document type 381, a reference
to the original invoice and negative tax records. Invoices are never updated or deleted.

The printable invoice (`/ar/invoice/<number>`) is bilingual Arabic/English, shows the QR
code, and prints to PDF from the browser. Amounts and the issue time are shown in SAR and
Saudi time.

## Configuration

Nothing about ZATCA is hard-coded. Seller identity comes from the database
(**Admin → Settings → Store**: legal name, VAT number, CR number, national address).
Credentials come from the environment:

| Variable | Meaning |
|---|---|
| `ZATCA_ENV` | `disabled` (default), `sandbox`, `simulation`, `production` |
| `ZATCA_API_BASE` | Optional override of the Fatoora base URL for the chosen environment |
| `ZATCA_CSID` | Binary security token (the CSID) used as the API user name |
| `ZATCA_SECRET` | Secret issued with the CSID |
| `ZATCA_PRIVATE_KEY` | EC secp256k1 private key, PEM, base64-encoded |
| `ZATCA_CERTIFICATE` | Certificate issued with the CSID |

With `ZATCA_ENV=disabled`, or while any credential or the signer is missing, invoices are
saved with `zatca_status = 'not_submitted'` and **nothing is sent to ZATCA**.
**Admin → Invoices** shows the current state and the reason.

## Completing phase 2

### 1. Onboard the device (EGS unit)

Use ZATCA's SDK (`fatoora` CLI) or the Fatoora portal:

1. Generate an EC secp256k1 key pair and a CSR with your organisation's details.
2. Get an OTP from the Fatoora portal and request a **compliance CSID**.
3. Pass the compliance checks (sample invoices of each type you will issue).
4. Request the **production CSID**. Put the CSID, secret, key and certificate in the
   environment variables above. Keep the private key out of the repository and backups
   that are not encrypted.

### 2. Supply the signer

`src/server/services/zatca.ts` exposes one hook:

```ts
export interface SignedInvoice { xml: string; hash: string; qr: string }
export type InvoiceSigner =
  (xml: string, ctx: { privateKeyPem: string; certificate: string }) => Promise<SignedInvoice>;
export function registerSigner(fn: InvoiceSigner): void;
```

The signer receives the unsigned UBL XML and must return:

- `xml` — the invoice with the `UBLExtensions` signature block (XAdES-BES: signed
  properties, certificate digest, ECDSA signature over the canonicalised invoice hash)
  and the QR `AdditionalDocumentReference` embedded;
- `hash` — the invoice hash as ZATCA defines it (SHA-256 of the canonical XML with the
  `UBLExtensions`, `Signature` and QR nodes removed), base64;
- `qr` — the phase 2 QR (tags 1–5 plus 6 hash, 7 signature, 8 public key, and 9 the
  certificate signature for simplified invoices).

Register it once at start-up, for example in a new file imported by `src/server/index.ts`:

```ts
import { registerSigner } from "./services/zatca";
import { signWithZatcaSdk } from "./zatca-signer";   // your implementation
registerSigner(signWithZatcaSdk);
```

The quickest reliable route is a thin wrapper around ZATCA's official SDK (Java) or a
maintained library that is validated against it. Writing XAdES canonicalisation by hand
is error-prone, which is why it was left out rather than shipped unverified.

When you add the signer, also make two small changes in `issueInvoice`:

- store the signer's `hash` as the invoice hash (it becomes the next invoice's PIH), and
- store the signer's `qr` so the printed invoice shows the phase 2 QR.

Both values are already columns on `invoices`; at the moment they hold the phase 1 QR and
a plain SHA-256 of the unsigned XML.

### 3. Validate, then switch on

1. Export a few invoices (**Admin → Invoices → XML**) covering simplified, standard,
   credit note, discount and zero-rated cases.
2. Validate them with the SDK (`fatoora -validate -invoice <file>`). Fix whatever it
   reports in `buildInvoiceXml`. Expect adjustments: the generated XML follows the
   published structure but has not been through the validator.
3. Set `ZATCA_ENV=sandbox` (or `simulation`) and watch **Admin → Invoices**. New invoices
   are created with status `queued`; a background job submits them every five minutes:
   simplified → `/invoices/reporting/single`, standard → `/invoices/clearance/single`.
   Results are saved in `zatca_status` (`reported`, `cleared`, `warning`, `rejected`) with
   ZATCA's full response in `zatca_response`. Network errors leave the invoice queued and
   are retried.
4. Only then set `ZATCA_ENV=production`.

A business rule to settle with your accountant: for **standard (B2B) invoices, phase 2
requires clearance before the invoice is given to the buyer**. Today the customer can open
the invoice as soon as it is issued. If you sell B2B under phase 2, hide standard invoices
from the customer until `zatca_status = 'cleared'` (one condition in
`src/server/loaders.ts` and `GET /api/invoices/:number`).

## Things to re-check against the current ZATCA specification

- Invoice type codes and the `name` flags (`0100000` standard, `0200000` simplified).
- Rounding rules per line and per document, and how document-level discounts are expressed.
- Required seller address fields (building number, additional number, district, postal code).
- VAT category codes and exemption reason codes if you sell zero-rated or exempt goods.
  The store supports a VAT rate per product; only `S` (standard) and `Z` (zero) are emitted.
- Payment means codes.
- Whether delivery fees should appear as a line item (current behaviour) or a document charge.
- Issue date and time format (written in Saudi local time).

## Data you must keep

`invoices`, `invoice_items` and `tax_records` are the tax record. Keep them, and the
backups that contain them, for the retention period the VAT regulations require
(six years at the time of writing; longer for some asset types).
