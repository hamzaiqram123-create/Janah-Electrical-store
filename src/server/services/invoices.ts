import { config } from "../config";
import { db, nextCounter, type Db, type Row } from "../db";
import { vatPortion } from "../../shared/pricing";
import { riyadhDate, sar } from "../../shared/constants";
import { getSettings } from "./settings";
import { buildInvoiceXml, FIRST_PIH, invoiceHash, submitToZatca, zatcaQrTlv, zatcaReady } from "./zatca";
import { errMeta, log } from "../logger";

interface Line { sku: string | null; name_ar: string; name_en: string; quantity: number; unit_price_excl: number; discount_excl: number; net_amount: number; vat_rate_bp: number; vat_amount: number; total: number }

async function sellerSnapshot() {
  const s = (await getSettings()).store;
  return { name: s.legal_name || s.name_ar, name_en: s.name_en, vat_number: s.vat_number, cr_number: s.cr_number, street: s.street, building_no: s.building_no, district: s.district, city: s.city_ar, city_en: s.city_en, postal_code: s.postal_code, phone: s.phone, email: s.email };
}

async function persist(t: Db, doc: { kind: "invoice" | "credit_note"; type: "simplified" | "standard"; order: Row; buyer: Row; lines: Line[]; refInvoice?: Row | null; reason?: string | null; sign: 1 | -1 }) {
  const settings = await getSettings();
  const year = riyadhDate().year;
  const prefix = doc.kind === "invoice" ? settings.numbering.invoice_prefix : settings.numbering.credit_note_prefix;
  const seq = await nextCounter(t, `${doc.kind}:${year}`);
  const icv = await nextCounter(t, "zatca:icv"); // row lock serialises the hash chain
  const number = `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
  const prev = await t.one<{ hash: string }>(`SELECT hash FROM invoices ORDER BY icv DESC LIMIT 1`);
  const previousHash = prev?.hash ?? FIRST_PIH;
  const issuedAt = new Date();
  const uuid = crypto.randomUUID();
  const seller = await sellerSnapshot();
  const taxable = doc.lines.reduce((s, l) => s + l.net_amount, 0);
  const vat = doc.lines.reduce((s, l) => s + l.vat_amount, 0);
  const total = taxable + vat;

  const xml = buildInvoiceXml({
    number, uuid, icv, previousHash, issuedAt, kind: doc.kind, type: doc.type, seller, buyer: doc.buyer,
    paymentMethod: doc.order.payment_method, reason: doc.reason, refNumber: doc.refInvoice?.number ?? null,
    taxable, vat, total, items: doc.lines.map((l, i) => ({ ...l, line_no: i + 1 })),
  });
  const hash = invoiceHash(xml);
  const qr = zatcaQrTlv({ seller: seller.name, vatNumber: seller.vat_number || "", timestamp: issuedAt.toISOString().replace(/\.\d{3}Z$/, "Z"), total: (total / 100).toFixed(2), vat: (vat / 100).toFixed(2) });

  const inv = await t.insert("invoices", {
    number, kind: doc.kind, type: doc.type, order_id: doc.order.id, ref_invoice_id: doc.refInvoice?.id ?? null, uuid, icv, previous_hash: previousHash, hash,
    qr_base64: qr, xml, issued_at: issuedAt, seller, buyer: doc.buyer, payment_method: doc.order.payment_method,
    taxable_amount: taxable, vat_amount: vat, total, discount_amount: doc.lines.reduce((s, l) => s + l.discount_excl, 0), reason: doc.reason ?? null,
    zatca_status: zatcaReady().ready ? "queued" : "not_submitted",
  });
  for (let i = 0; i < doc.lines.length; i++) await t.insert("invoice_items", { invoice_id: inv.id, line_no: i + 1, ...doc.lines[i] });

  const byRate = new Map<number, { taxable: number; vat: number }>();
  for (const l of doc.lines) {
    const g = byRate.get(l.vat_rate_bp) ?? { taxable: 0, vat: 0 };
    g.taxable += l.net_amount; g.vat += l.vat_amount;
    byRate.set(l.vat_rate_bp, g);
  }
  const local = riyadhDate(issuedAt); // the tax period follows the Saudi calendar date, not the server clock's zone
  const period = `${local.year}-${String(local.month).padStart(2, "0")}-01`;
  for (const [bp, g] of byRate) {
    await t.insert("tax_records", { invoice_id: inv.id, period, type: doc.sign === 1 ? "sale" : "refund", vat_rate_bp: bp, taxable_amount: doc.sign * g.taxable, vat_amount: doc.sign * g.vat });
  }
  return inv;
}

async function buyerOf(t: Db, order: Row): Promise<Row> {
  const cust = await t.one(`SELECT vat_number, company_name FROM customers WHERE id = $1`, [order.customer_id]);
  const a = order.address ?? {};
  return { name: cust?.company_name || order.customer_name, phone: order.customer_phone, email: order.customer_email, vat_number: cust?.vat_number || null, street: a.street ?? "", building_no: a.building_no ?? "", district: a.district ?? "", city: a.city ?? "", postal_code: a.postal_code ?? "" };
}

/** Issues the tax invoice for an order (idempotent — returns the existing one if already issued). */
export async function issueInvoice(t: Db, orderId: number): Promise<Row> {
  const order = await t.one(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  if (!order) throw new Error("order not found");
  const existing = await t.one(`SELECT * FROM invoices WHERE order_id = $1 AND kind = 'invoice'`, [orderId]);
  if (existing) return existing;
  const settings = await getSettings();
  const items = await t.q(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId]);
  const lines: Line[] = items.map((it) => {
    const grossNet = it.line_total - vatPortion(it.line_total, it.vat_rate_bp); // excl. VAT before coupon
    return {
      sku: it.sku, name_ar: it.name_ar, name_en: it.name_en, quantity: it.quantity,
      unit_price_excl: Math.round(grossNet / it.quantity), discount_excl: Math.max(0, grossNet - it.net_amount),
      net_amount: it.net_amount, vat_rate_bp: it.vat_rate_bp, vat_amount: it.vat_amount, total: it.net_amount + it.vat_amount,
    };
  });
  const fees = order.shipping_fee + order.cod_fee;
  if (fees > 0) {
    const bp = settings.tax.vat_rate_bp, vat = vatPortion(fees, bp);
    lines.push({ sku: null, name_ar: "رسوم التوصيل", name_en: "Delivery fee", quantity: 1, unit_price_excl: fees - vat, discount_excl: 0, net_amount: fees - vat, vat_rate_bp: bp, vat_amount: vat, total: fees });
  }
  const buyer = await buyerOf(t, order);
  return persist(t, { kind: "invoice", type: buyer.vat_number ? "standard" : "simplified", order, buyer, lines, sign: 1 });
}

/** Issues a credit note against the order's invoice for `amount` (incl. VAT). */
export async function issueCreditNote(t: Db, orderId: number, amount: number, reason: string): Promise<Row | null> {
  const order = await t.one(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const invoice = await t.one(`SELECT * FROM invoices WHERE order_id = $1 AND kind = 'invoice'`, [orderId]);
  if (!order || !invoice || amount <= 0) return null;
  const settings = await getSettings();
  let lines: Line[];
  if (amount === invoice.total) {
    const src = await t.q(`SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY line_no`, [invoice.id]);
    lines = src.map((l) => ({ sku: l.sku, name_ar: l.name_ar, name_en: l.name_en, quantity: l.quantity, unit_price_excl: l.unit_price_excl, discount_excl: l.discount_excl, net_amount: l.net_amount, vat_rate_bp: l.vat_rate_bp, vat_amount: l.vat_amount, total: l.total }));
  } else {
    const bp = settings.tax.vat_rate_bp, vat = vatPortion(amount, bp);
    lines = [{ sku: null, name_ar: `استرداد جزئي للفاتورة ${invoice.number}`, name_en: `Partial refund for invoice ${invoice.number}`, quantity: 1, unit_price_excl: amount - vat, discount_excl: 0, net_amount: amount - vat, vat_rate_bp: bp, vat_amount: vat, total: amount }];
  }
  return persist(t, { kind: "credit_note", type: invoice.type, order, buyer: invoice.buyer, lines, refInvoice: invoice, reason, sign: -1 });
}

export async function invoiceWithItems(where: { id?: number; number?: string }): Promise<(Row & { items: Row[] }) | null> {
  const inv = where.id
    ? await db.one(`SELECT i.*, o.number AS order_number, o.access_key, r.number AS ref_number FROM invoices i LEFT JOIN orders o ON o.id = i.order_id LEFT JOIN invoices r ON r.id = i.ref_invoice_id WHERE i.id = $1`, [where.id])
    : await db.one(`SELECT i.*, o.number AS order_number, o.access_key, r.number AS ref_number FROM invoices i LEFT JOIN orders o ON o.id = i.order_id LEFT JOIN invoices r ON r.id = i.ref_invoice_id WHERE i.number = $1`, [where.number]);
  if (!inv) return null;
  const items = await db.q(`SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY line_no`, [inv.id]);
  return { ...inv, items };
}

/** Background job: push queued invoices to ZATCA when the integration is fully configured. */
export async function submitQueuedInvoices() {
  if (config.ZATCA_ENV === "disabled" || !zatcaReady().ready) return;
  const rows = await db.q(`SELECT id, uuid, xml, type, number FROM invoices WHERE zatca_status = 'queued' ORDER BY icv LIMIT 20`);
  for (const inv of rows) {
    try {
      const r = await submitToZatca(inv as any);
      await db.exec(`UPDATE invoices SET zatca_status = $2, zatca_response = $3::jsonb, zatca_submitted_at = now() WHERE id = $1`, [inv.id, r.status === "error" ? "queued" : r.status, r.response]);
      if (r.status === "error") { log.warn("zatca submission error", { invoice: inv.number, response: r.response }); break; }
    } catch (e) {
      log.error("zatca submission failed", { invoice: inv.number, ...errMeta(e) });
      break;
    }
  }
}
export const fmt = sar;
