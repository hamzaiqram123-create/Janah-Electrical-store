import { describe, expect, test } from "bun:test";

// The module reads its configuration at import time; these are harmless placeholders for a unit test.
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/unused";
process.env.APP_URL ??= "http://localhost:3000";
const { zatcaQrTlv, invoiceHash, FIRST_PIH } = await import("../src/server/services/zatca");
const { buildXlsx } = await import("../src/server/xlsx");

describe("ZATCA phase-1 QR (TLV, base64)", () => {
  const b64 = zatcaQrTlv({ seller: "شركة جناح الريادة", vatNumber: "310122393500003", timestamp: "2026-10-08T09:30:00Z", total: "115.00", vat: "15.00" });
  const buf = Buffer.from(b64, "base64");
  const tags: Record<number, string> = {};
  for (let i = 0; i < buf.length;) { const tag = buf[i]!, len = buf[i + 1]!; tags[tag] = buf.subarray(i + 2, i + 2 + len).toString("utf8"); i += 2 + len; }
  test("five tags in order with UTF-8 byte lengths", () => {
    expect(Object.keys(tags).map(Number)).toEqual([1, 2, 3, 4, 5]);
    expect(tags[1]).toBe("شركة جناح الريادة");
    expect(buf[1]).toBe(Buffer.byteLength("شركة جناح الريادة", "utf8")); // length counts bytes, not characters
    expect(tags[2]).toBe("310122393500003");
    expect(tags[3]).toBe("2026-10-08T09:30:00Z");
    expect(tags[4]).toBe("115.00");
    expect(tags[5]).toBe("15.00");
  });
  test("invoice hash is base64 SHA-256; first previous-invoice hash is the documented constant", () => {
    expect(Buffer.from(invoiceHash("<Invoice/>"), "base64").length).toBe(32);
    expect(FIRST_PIH).toBe("NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==");
  });
});

describe("XLSX export", () => {
  test("produces a zip container with the workbook parts", () => {
    const bytes = buildXlsx([["Order", "Total (SAR)"], ["JR-1", "1,234.50"], ["=cmd()", "5.00"]], "orders");
    const text = Buffer.from(bytes).toString("latin1");
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) expect(text.includes(part)).toBe(true);
  });
});
