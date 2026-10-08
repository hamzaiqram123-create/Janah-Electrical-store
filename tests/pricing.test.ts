import { describe, expect, test } from "bun:test";
import { addVat, allocate, computeTotals, vatPortion } from "../src/shared/pricing";

describe("VAT maths (integer halalas)", () => {
  test("15% VAT inside a VAT-inclusive price", () => {
    expect(vatPortion(11500, 1500)).toBe(1500);
    expect(vatPortion(10000, 1500)).toBe(1304); // 100.00 incl. → 13.04 VAT
    expect(vatPortion(10000, 0)).toBe(0);
  });
  test("adding VAT to a net price", () => {
    expect(addVat(10000, 1500)).toBe(11500);
    expect(addVat(999, 1500)).toBe(1149);
  });
});

describe("allocate", () => {
  test("parts always sum to the amount", () => {
    for (const [amount, weights] of [[1000, [1, 1, 1]], [999, [5000, 2500, 2500]], [1, [3, 3, 3, 3]], [12345, [7, 13, 29, 1]]] as [number, number[]][]) {
      expect(allocate(amount, weights).reduce((a, b) => a + b, 0)).toBe(amount);
    }
  });
  test("nothing to allocate", () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(500, [0, 0])).toEqual([0, 0]);
  });
});

describe("computeTotals", () => {
  const lines = [
    { key: 1, unitPrice: 2400, quantity: 2, vatBp: 1500 },
    { key: 2, unitPrice: 10900, quantity: 1, vatBp: 1500 },
  ];
  test("VAT-inclusive prices, shipping and COD fee", () => {
    const t = computeTotals({ lines, shippingFee: 2500, codFee: 1000 });
    expect(t.itemsSubtotal).toBe(15700);
    expect(t.total).toBe(19200);
    expect(t.totalExclVat + t.vatTotal).toBe(t.total);
    expect(Math.abs(t.vatTotal - vatPortion(19200, 1500))).toBeLessThanOrEqual(2); // per-line rounding
  });
  test("percentage coupon is spread across lines and capped", () => {
    const t = computeTotals({ lines, coupon: { type: "percent", value: 1000, max_discount: null } });
    expect(t.discountTotal).toBe(1570);
    expect(t.lines.reduce((s, l) => s + l.discountAlloc, 0)).toBe(1570);
    expect(t.total).toBe(14130);
    const capped = computeTotals({ lines, coupon: { type: "percent", value: 5000, max_discount: 2000 } });
    expect(capped.discountTotal).toBe(2000);
  });
  test("fixed coupon never exceeds the items subtotal", () => {
    const t = computeTotals({ lines, coupon: { type: "fixed", value: 999999, max_discount: null }, shippingFee: 2500 });
    expect(t.discountTotal).toBe(15700);
    expect(t.total).toBe(2500);
    expect(t.lines.every((l) => l.netAmount === 0 && l.vatAmount === 0)).toBe(true);
  });
  test("free-shipping coupon removes the delivery fee only", () => {
    const t = computeTotals({ lines, coupon: { type: "free_shipping", value: 0, max_discount: null }, shippingFee: 2500 });
    expect(t.shippingFee).toBe(0);
    expect(t.freeShippingApplied).toBe(true);
    expect(t.total).toBe(15700);
  });
  test("zero-rated line carries no VAT", () => {
    const t = computeTotals({ lines: [{ key: 1, unitPrice: 5000, quantity: 1, vatBp: 0 }] });
    expect(t.vatTotal).toBe(0);
    expect(t.totalExclVat).toBe(5000);
  });
  test("VAT-exclusive price lists add VAT on top", () => {
    const t = computeTotals({ lines: [{ key: 1, unitPrice: 10000, quantity: 3, vatBp: 1500 }], pricesIncludeVat: false });
    expect(t.itemsSubtotal).toBe(34500);
    expect(t.vatTotal).toBe(4500);
  });
  test("line net + VAT equals what the customer pays for the line", () => {
    const t = computeTotals({ lines, coupon: { type: "percent", value: 1250, max_discount: null } });
    for (const l of t.lines) expect(l.netAmount + l.vatAmount).toBe(l.lineTotal - l.discountAlloc);
  });
});
