import { config } from "../config";
import type { Row } from "../db";

/**
 * ZATCA (Fatoora) e-invoicing support.
 *
 * Implemented here:
 *   • Phase 1 QR code — base64 TLV (seller name, VAT number, timestamp, total, VAT total).
 *   • UBL 2.1 invoice XML in the ZATCA profile (simplified / standard tax invoice, credit note).
 *   • Invoice hash chain: ICV counter, previous-invoice hash (PIH), UUID.
 *   • Reporting / clearance API client driven entirely by environment configuration.
 *
 * NOT implemented (must be completed and validated with the official ZATCA SDK before go-live):
 *   • Cryptographic stamp: XAdES signature with the CSID certificate and QR tags 6–9.
 *     Plug an implementation in with `registerSigner()`. Until then invoices are stored with
 *     zatca_status = 'not_submitted' and nothing is sent to ZATCA.
 * Always re-check field rules against the current ZATCA "E-Invoicing Detailed Technical Guidelines".
 */

export function zatcaQrTlv(fields: { seller: string; vatNumber: string; timestamp: string; total: string; vat: string }): string {
  const parts: Buffer[] = [];
  [fields.seller, fields.vatNumber, fields.timestamp, fields.total, fields.vat].forEach((v, i) => {
    const val = Buffer.from(v, "utf8");
    parts.push(Buffer.from([i + 1, val.length]), val);
  });
  return Buffer.concat(parts).toString("base64");
}

const amt = (h: number) => (h / 100).toFixed(2);
const esc = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));

/** First PIH in the chain as defined by ZATCA: base64 of the hex SHA-256 of "0". */
export const FIRST_PIH = Buffer.from(new Bun.CryptoHasher("sha256").update("0").digest("hex")).toString("base64");

export interface InvoiceDoc {
  number: string; uuid: string; icv: number; previousHash: string; issuedAt: Date;
  kind: "invoice" | "credit_note"; type: "simplified" | "standard";
  seller: Row; buyer: Row; paymentMethod: string | null; reason?: string | null; refNumber?: string | null;
  taxable: number; vat: number; total: number;
  items: { line_no: number; name_ar: string; quantity: number; net_amount: number; vat_rate_bp: number; vat_amount: number; total: number; discount_excl: number }[];
}

const PAYMENT_MEANS: Record<string, string> = { cod: "10", cash: "10", card: "48", mada: "48", online: "48", creditcard: "48", applepay: "48", stcpay: "48", transfer: "42" };

export function buildInvoiceXml(d: InvoiceDoc): string {
  // Issue date and time are written in Saudi local time (UTC+3), matching the printed invoice.
  const local = new Date(d.issuedAt.getTime() + 3 * 3600_000).toISOString();
  const date = local.slice(0, 10);
  const time = local.slice(11, 19);
  const typeCode = d.kind === "credit_note" ? "381" : "388";
  const typeName = d.type === "standard" ? "0100000" : "0200000";
  const party = (p: Row, isSeller: boolean) => `<cac:Party>${
    isSeller && p.cr_number ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(p.cr_number)}</cbc:ID></cac:PartyIdentification>` : ""
  }<cac:PostalAddress><cbc:StreetName>${esc(p.street)}</cbc:StreetName><cbc:BuildingNumber>${esc(p.building_no)}</cbc:BuildingNumber><cbc:CitySubdivisionName>${esc(p.district)}</cbc:CitySubdivisionName><cbc:CityName>${esc(p.city)}</cbc:CityName><cbc:PostalZone>${esc(p.postal_code)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>${
    p.vat_number ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(p.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""
  }<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>`;

  const groups = new Map<number, { taxable: number; vat: number }>();
  for (const it of d.items) {
    const g = groups.get(it.vat_rate_bp) ?? { taxable: 0, vat: 0 };
    g.taxable += it.net_amount; g.vat += it.vat_amount;
    groups.set(it.vat_rate_bp, g);
  }
  const cat = (bp: number) => (bp > 0 ? "S" : "Z");
  const subtotals = [...groups].map(([bp, g]) =>
    `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">${amt(g.taxable)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">${amt(g.vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${cat(bp)}</cbc:ID><cbc:Percent>${(bp / 100).toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join("");

  const lines = d.items.map((it) => {
    const gross = it.net_amount + it.discount_excl;
    return `<cac:InvoiceLine><cbc:ID>${it.line_no}</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">${it.quantity}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">${amt(it.net_amount)}</cbc:LineExtensionAmount>${
      it.discount_excl > 0 ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason><cbc:Amount currencyID="SAR">${amt(it.discount_excl)}</cbc:Amount></cac:AllowanceCharge>` : ""
    }<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${amt(it.vat_amount)}</cbc:TaxAmount><cbc:RoundingAmount currencyID="SAR">${amt(it.total)}</cbc:RoundingAmount></cac:TaxTotal><cac:Item><cbc:Name>${esc(it.name_ar)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${cat(it.vat_rate_bp)}</cbc:ID><cbc:Percent>${(it.vat_rate_bp / 100).toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="SAR">${(gross / 100 / it.quantity).toFixed(6)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
  }).join("");

  return `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">` +
    `<cbc:ProfileID>reporting:1.0</cbc:ProfileID><cbc:ID>${esc(d.number)}</cbc:ID><cbc:UUID>${d.uuid}</cbc:UUID><cbc:IssueDate>${date}</cbc:IssueDate><cbc:IssueTime>${time}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode name="${typeName}">${typeCode}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>` +
    (d.refNumber ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(d.refNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : "") +
    `<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${d.icv}</cbc:UUID></cac:AdditionalDocumentReference>` +
    `<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${d.previousHash}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>` +
    `<cac:AccountingSupplierParty>${party(d.seller, true)}</cac:AccountingSupplierParty><cac:AccountingCustomerParty>${party(d.buyer, false)}</cac:AccountingCustomerParty>` +
    `<cac:Delivery><cbc:ActualDeliveryDate>${date}</cbc:ActualDeliveryDate></cac:Delivery>` +
    `<cac:PaymentMeans><cbc:PaymentMeansCode>${PAYMENT_MEANS[d.paymentMethod ?? ""] ?? "1"}</cbc:PaymentMeansCode>${d.reason ? `<cbc:InstructionNote>${esc(d.reason)}</cbc:InstructionNote>` : ""}</cac:PaymentMeans>` +
    `<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${amt(d.vat)}</cbc:TaxAmount></cac:TaxTotal>` +
    `<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${amt(d.vat)}</cbc:TaxAmount>${subtotals}</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="SAR">${amt(d.taxable)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="SAR">${amt(d.taxable)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="SAR">${amt(d.total)}</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount><cbc:PayableAmount currencyID="SAR">${amt(d.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>` +
    lines + `</Invoice>`;
}

export const invoiceHash = (xml: string) => new Bun.CryptoHasher("sha256").update(xml).digest("base64");

// ───────────── Phase 2 integration layer ─────────────
export interface SignedInvoice { xml: string; hash: string; qr: string }
export type InvoiceSigner = (xml: string, ctx: { privateKeyPem: string; certificate: string }) => Promise<SignedInvoice>;
let signer: InvoiceSigner | null = null;
/** Register the XAdES signing implementation (e.g. a wrapper around the official ZATCA SDK). */
export function registerSigner(fn: InvoiceSigner) { signer = fn; }

const BASES: Record<string, string> = {
  sandbox: "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
  simulation: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  production: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

export function zatcaReady(): { ready: boolean; reason?: string } {
  if (config.ZATCA_ENV === "disabled") return { ready: false, reason: "ZATCA_ENV is disabled" };
  if (!config.ZATCA_CSID || !config.ZATCA_SECRET) return { ready: false, reason: "ZATCA_CSID / ZATCA_SECRET are not configured" };
  if (!config.ZATCA_PRIVATE_KEY || !config.ZATCA_CERTIFICATE) return { ready: false, reason: "ZATCA_PRIVATE_KEY / ZATCA_CERTIFICATE are not configured" };
  if (!signer) return { ready: false, reason: "No invoice signer registered (see registerSigner in services/zatca.ts)" };
  return { ready: true };
}

/** Reports (simplified) or clears (standard) an invoice with ZATCA. Returns the status to store on the invoice row. */
export async function submitToZatca(inv: { uuid: string; xml: string; type: string }): Promise<{ status: "reported" | "cleared" | "warning" | "rejected" | "error"; response: Record<string, unknown>; signed?: SignedInvoice }> {
  const state = zatcaReady();
  if (!state.ready) return { status: "error", response: { message: state.reason } };
  try {
    const signed = await signer!(inv.xml, {
      privateKeyPem: Buffer.from(config.ZATCA_PRIVATE_KEY!, "base64").toString("utf8"),
      certificate: config.ZATCA_CERTIFICATE!,
    });
    const base = config.ZATCA_API_BASE ?? BASES[config.ZATCA_ENV]!;
    const clearance = inv.type === "standard";
    const res = await fetch(`${base}/invoices/${clearance ? "clearance" : "reporting"}/single`, {
      method: "POST",
      headers: {
        "content-type": "application/json", accept: "application/json", "accept-language": "en", "accept-version": "V2",
        "clearance-status": clearance ? "1" : "0",
        authorization: "Basic " + Buffer.from(`${config.ZATCA_CSID}:${config.ZATCA_SECRET}`).toString("base64"),
      },
      body: JSON.stringify({ invoiceHash: signed.hash, uuid: inv.uuid, invoice: Buffer.from(signed.xml, "utf8").toString("base64") }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, any>;
    const hasWarnings = (body?.validationResults?.warningMessages ?? []).length > 0;
    if (res.status === 200) return { status: clearance ? "cleared" : "reported", response: body, signed };
    if (res.status === 202 || hasWarnings && res.ok) return { status: "warning", response: body, signed };
    if (res.status === 400) return { status: "rejected", response: body };
    return { status: "error", response: { http_status: res.status, ...body } };
  } catch (e) {
    return { status: "error", response: { message: e instanceof Error ? e.message : String(e) } };
  }
}
