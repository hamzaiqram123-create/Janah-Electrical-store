/**
 * Pure order-pricing maths shared by cart, checkout, POS and invoices.
 * All amounts are integer halalas; shelf prices are VAT-inclusive when `pricesIncludeVat` is true.
 */
export interface PriceLine { key: number | string; unitPrice: number; quantity: number; vatBp: number }
export interface CouponRule { type: "percent" | "fixed" | "free_shipping"; value: number; max_discount: number | null }
export interface PricedLine extends PriceLine {
  unitGross: number;      // unit price incl. VAT
  lineTotal: number;      // unitGross × quantity
  discountAlloc: number;  // share of the coupon discount (incl. VAT)
  netAmount: number;      // excl. VAT, after discount
  vatAmount: number;
}
export interface Totals {
  lines: PricedLine[];
  itemsSubtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingVat: number;
  codFee: number;
  totalExclVat: number;
  vatTotal: number;
  total: number;
  freeShippingApplied: boolean;
}

export const vatPortion = (gross: number, bp: number) => Math.round((gross * bp) / (10000 + bp));
export const addVat = (net: number, bp: number) => Math.round((net * (10000 + bp)) / 10000);

/** Split `amount` across weights so the parts sum exactly to `amount` (largest-remainder method). */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const out = raw.map(Math.floor);
  let left = amount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k]![1]]!++;
  return out;
}

export function computeTotals(input: {
  lines: PriceLine[];
  coupon?: CouponRule | null;
  shippingFee?: number;      // incl. VAT
  codFee?: number;           // incl. VAT
  shippingVatBp?: number;
  pricesIncludeVat?: boolean;
}): Totals {
  const incl = input.pricesIncludeVat !== false;
  const shipBp = input.shippingVatBp ?? 1500;
  const base = input.lines.map((l) => {
    const unitGross = incl ? l.unitPrice : addVat(l.unitPrice, l.vatBp);
    return { ...l, unitGross, lineTotal: unitGross * l.quantity };
  });
  const itemsSubtotal = base.reduce((s, l) => s + l.lineTotal, 0);

  let discountTotal = 0;
  let shippingFee = Math.max(0, input.shippingFee ?? 0);
  let freeShippingApplied = false;
  const c = input.coupon;
  if (c) {
    if (c.type === "percent") discountTotal = Math.round((itemsSubtotal * c.value) / 10000);
    else if (c.type === "fixed") discountTotal = c.value;
    else if (c.type === "free_shipping") { freeShippingApplied = shippingFee > 0; shippingFee = 0; }
    if (c.max_discount != null) discountTotal = Math.min(discountTotal, c.max_discount);
    discountTotal = Math.max(0, Math.min(discountTotal, itemsSubtotal));
  }
  const allocs = allocate(discountTotal, base.map((l) => l.lineTotal));
  const lines: PricedLine[] = base.map((l, i) => {
    const gross = l.lineTotal - allocs[i]!;
    const vatAmount = vatPortion(gross, l.vatBp);
    return { ...l, discountAlloc: allocs[i]!, vatAmount, netAmount: gross - vatAmount };
  });
  const codFee = Math.max(0, input.codFee ?? 0);
  const shippingVat = vatPortion(shippingFee + codFee, shipBp);
  const vatTotal = lines.reduce((s, l) => s + l.vatAmount, 0) + shippingVat;
  const total = itemsSubtotal - discountTotal + shippingFee + codFee;
  return { lines, itemsSubtotal, discountTotal, shippingFee, shippingVat, codFee, vatTotal, total, totalExclVat: total - vatTotal, freeShippingApplied };
}
