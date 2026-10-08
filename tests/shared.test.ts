import { describe, expect, test } from "bun:test";
import { barcodeModules, ean13CheckDigit, isEan13 } from "../src/shared/barcode";
import { normalizePhone, ORDER_STATUSES, ORDER_TRANSITIONS, PERMISSIONS, sar, slugify, SYSTEM_ROLES, toHalalas } from "../src/shared/constants";
import { qrMatrix } from "../src/shared/qr";
import { matchRoute } from "../src/shared/routes";

describe("money", () => {
  test("halalas ⇄ SAR text", () => {
    expect(sar(123456)).toBe("1,234.56");
    expect(sar(0)).toBe("0.00");
    expect(toHalalas("34.50")).toBe(3450);
    expect(toHalalas("0.1")).toBe(10);
    expect(toHalalas("19.99")).toBe(1999); // no floating-point drift
    expect(toHalalas("٢٤٫٥٠")).toBe(2450); // Arabic-Indic digits and decimal mark
  });
});

describe("Saudi mobile numbers", () => {
  test("every common spelling becomes +9665XXXXXXXX", () => {
    for (const v of ["0551234567", "551234567", "+966551234567", "00966551234567", "966 55 123 4567", "٠٥٥١٢٣٤٥٦٧", "055-123-4567"]) expect(normalizePhone(v)).toBe("+966551234567");
  });
  test("other countries keep their international form; junk is rejected", () => {
    expect(normalizePhone("+971501234567")).toBe("+971501234567");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("0112345678")).toBeNull(); // landline, not a mobile
    expect(normalizePhone("")).toBeNull();
  });
});

describe("slugs and routes", () => {
  test("slugify", () => {
    expect(slugify("13A Switched Socket (Type G)")).toBe("13a-switched-socket-type-g");
    expect(slugify("  LED   Panel 60×60  ")).toMatch(/^led-panel-60/);
  });
  test("storefront routes", () => {
    expect(matchRoute("/ar")).toEqual({ name: "home", params: { lang: "ar" } });
    expect(matchRoute("/en/p/some-slug")?.name).toBe("product");
    expect(matchRoute("/ur/order/JR-2026-000001")?.params.number).toBe("JR-2026-000001");
    expect(matchRoute("/fr")).toBeNull();
    expect(matchRoute("/ar/does/not/exist")).toBeNull();
  });
});

describe("order workflow and roles", () => {
  test("the ten statuses and their transitions are consistent", () => {
    expect(ORDER_STATUSES.length).toBe(10);
    for (const s of ORDER_STATUSES) for (const to of ORDER_TRANSITIONS[s]) expect(ORDER_STATUSES).toContain(to);
    expect(ORDER_TRANSITIONS.refunded).toEqual([]);
    expect(ORDER_TRANSITIONS.pending).not.toContain("delivered");
  });
  test("built-in roles only use known permissions", () => {
    for (const r of SYSTEM_ROLES) for (const p of r.permissions) expect(p === "*" || (PERMISSIONS as readonly string[]).includes(p)).toBe(true);
    expect(SYSTEM_ROLES.find((r) => r.key === "super_admin")?.permissions).toContain("*");
  });
});

describe("barcodes", () => {
  test("EAN-13 check digit", () => {
    expect(ean13CheckDigit("590123412345")).toBe(7);
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(isEan13("5901234123457")).toBe(true);
    expect(isEan13("5901234123458")).toBe(false);
  });
  test("EAN-13 is 95 modules with guard bars", () => {
    const { bits, symbology } = barcodeModules("5901234123457");
    expect(symbology).toBe("EAN-13");
    expect(bits.length).toBe(95);
    expect(bits.startsWith("101") && bits.endsWith("101") && bits.slice(45, 50) === "01010").toBe(true);
  });
  test("other values use Code 128 set B with start, checksum and stop", () => {
    const { bits, symbology } = barcodeModules("SK-13A-1G");
    expect(symbology).toBe("Code 128");
    expect(bits.length).toBe(11 * ("SK-13A-1G".length + 2) + 13); // start + data + checksum, then the 13-module stop
    expect(bits.startsWith("11010010000")).toBe(true);   // Start B
    expect(bits.endsWith("1100011101011")).toBe(true);   // Stop
  });
});

describe("QR code", () => {
  test("square matrix with finder patterns; grows with content", () => {
    const small = qrMatrix("hello");
    expect(small.length).toBe(small[0]!.length);
    expect((small.length - 17) % 4).toBe(0);
    for (const [r, c] of [[0, 0], [0, small.length - 7], [small.length - 7, 0]] as [number, number][]) {
      expect(small[r]![c]).toBe(true); expect(small[r + 6]![c + 6]).toBe(true); expect(small[r + 3]![c + 3]).toBe(true); expect(small[r + 1]![c + 1]).toBe(false);
    }
    expect(qrMatrix("x".repeat(300)).length).toBeGreaterThan(small.length);
  });
});

describe("Saudi calendar date", () => {
  test("late evening UTC is already the next day in Riyadh", async () => {
    const { riyadhDate } = await import("../src/shared/constants");
    expect(riyadhDate(new Date("2026-10-31T21:30:00Z"))).toEqual({ year: 2026, month: 11, day: 1 });
    expect(riyadhDate(new Date("2026-12-31T20:59:59Z"))).toEqual({ year: 2026, month: 12, day: 31 });
    expect(riyadhDate(new Date("2026-12-31T21:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});
