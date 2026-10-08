import { z } from "zod";
import { normalizePhone } from "../../shared/constants";

export const email = z.string().trim().toLowerCase().email().max(200);
export const password = z.string().min(8).max(128).regex(/[A-Za-z؀-ۿ]/, "password_needs_letter").regex(/\d|[٠-٩]/, "password_needs_digit");
export const phone = z.string().trim().max(30).transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) { ctx.addIssue({ code: "custom", message: "invalid_phone" }); return z.NEVER; }
  return n;
});
export const name = z.string().trim().min(2).max(120);
export const text = (max: number) => z.string().trim().max(max);
export const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
export const id = z.coerce.number().int().positive();
export const money = z.coerce.number().int().min(0).max(1_000_000_000);
export const lang = z.enum(["ar", "en", "ur"]);
export const vatNumber = z.string().trim().regex(/^3\d{13}3$/, "invalid_vat_number").nullish().or(z.literal("")).transform((v) => (v ? v : null));

export const address = z.object({
  city_id: id,
  district: text(120).min(2),
  street: text(200).min(2),
  building_no: optText(20),
  postal_code: z.string().trim().regex(/^\d{5}$/, "invalid_postal_code").nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  short_address: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{4}$/, "invalid_short_address").nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  notes: optText(300),
});
