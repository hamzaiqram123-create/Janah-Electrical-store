import { db, type Db } from "../db";
import { cached, invalidate } from "../cache";

export const DEFAULT_SETTINGS = {
  store: {
    name_ar: "شركة جناح الريادة", name_en: "Janah Al Riyada Co.", name_ur: "جناح الریادہ کمپنی",
    legal_name: "شركة جناح الريادة",
    tagline_ar: "كل ما تحتاجه من الأدوات والمواد الكهربائية", tagline_en: "Electrical supplies for homes, sites and workshops", tagline_ur: "گھر، سائٹ اور ورکشاپ کے لیے برقی سامان",
    vat_number: "", cr_number: "",
    phone: "", whatsapp: "", email: "",
    country: "SA", city_ar: "", city_en: "", district: "", street: "", building_no: "", postal_code: "", additional_no: "",
    working_hours_ar: "السبت – الخميس، 8 ص – 10 م", working_hours_en: "Sat – Thu, 8 am – 10 pm", working_hours_ur: "ہفتہ تا جمعرات، صبح 8 تا رات 10",
    instagram: "", x: "", tiktok: "", snapchat: "",
  },
  tax: { vat_rate_bp: 1500, prices_include_vat: true },
  checkout: {
    guest_checkout: true,
    cod_enabled: true,
    cod_fee: 0,
    cod_max_total: 500000,
    auto_confirm_cod: true,
    unpaid_order_ttl_minutes: 60,
    cart_recovery_hours: 6,
    max_qty_per_item: 500,
  },
  numbering: { order_prefix: "JR", invoice_prefix: "INV", credit_note_prefix: "CN" },
  reviews: { auto_approve: false, verified_only: false },
  notifications: { admin_email: "", admin_phone: "", send_sms: true, send_whatsapp: true },
  seo: {
    title_ar: "شركة جناح الريادة | متجر الأدوات الكهربائية في السعودية",
    title_en: "Janah Al Riyada | Electrical supplies store in Saudi Arabia",
    title_ur: "جناح الریادہ | سعودی عرب میں برقی سامان کی دکان",
    description_ar: "تسوّق المفاتيح والأفياش والإنارة LED والكابلات والقواطع ولوحات التوزيع مع توصيل لجميع مناطق المملكة ودفع آمن.",
    description_en: "Shop switches, sockets, LED lighting, cables, breakers and distribution boards with delivery across Saudi Arabia and secure payment.",
    description_ur: "سوئچ، ساکٹ، ایل ای ڈی لائٹس، کیبلز، بریکرز اور ڈسٹری بیوشن بورڈز خریدیں، پورے سعودی عرب میں ڈیلیوری کے ساتھ۔",
  },
};
export type Settings = typeof DEFAULT_SETTINGS;
export type SettingsGroup = keyof Settings;

export async function getSettings(): Promise<Settings> {
  return cached("settings", 60, async () => {
    const rows = await db.q<{ key: string; value: any }>(`SELECT key, value FROM settings`);
    const out: any = structuredClone(DEFAULT_SETTINGS);
    for (const r of rows) if (r.key in out && r.value && typeof r.value === "object") out[r.key] = { ...out[r.key], ...r.value };
    return out as Settings;
  });
}

export async function saveSettings(group: SettingsGroup, value: Record<string, unknown>, t: Db = db) {
  await t.exec(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value, updated_at = now()`,
    [group, value],
  );
  invalidate("settings", "shell");
}
