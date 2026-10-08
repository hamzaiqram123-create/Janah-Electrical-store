import { z } from "zod";

const flag = (def: boolean) =>
  z.string().optional().transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));
const opt = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  // Render sets RENDER_EXTERNAL_URL (https://<service>.onrender.com); an explicit APP_URL (your own domain) wins.
  APP_URL: z.string().url().default(process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_POOL_MAX: z.coerce.number().int().default(10),
  SESSION_DAYS: z.coerce.number().int().default(30),
  TRUST_PROXY: flag(false),
  // Header that carries the visitor's address when the proxy sets a dedicated one (e.g. cf-connecting-ip, true-client-ip).
  // When empty and TRUST_PROXY is on, the first X-Forwarded-For entry is used.
  CLIENT_IP_HEADER: z.string().trim().toLowerCase().optional().transform((v) => (v ? v : undefined)),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RUN_JOBS: flag(true),

  // Product image storage
  STORAGE_DRIVER: z.enum(["local", "s3", "db"]).default("local"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  S3_BUCKET: opt, S3_REGION: opt, S3_ENDPOINT: opt, S3_ACCESS_KEY_ID: opt, S3_SECRET_ACCESS_KEY: opt,
  S3_PUBLIC_URL: opt, // CDN / public bucket base URL

  // Payments
  PAYMENT_PROVIDER: z.enum(["none", "moyasar"]).default("none"),
  MOYASAR_SECRET_KEY: opt,
  MOYASAR_API_BASE: z.string().url().default("https://api.moyasar.com/v1"),

  // Notifications
  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  EMAIL_FROM: z.string().default("شركة جناح الريادة <no-reply@example.com>"),
  RESEND_API_KEY: opt,
  SMS_PROVIDER: z.enum(["none", "unifonic"]).default("none"),
  UNIFONIC_APP_SID: opt, UNIFONIC_SENDER_ID: opt,
  WHATSAPP_PROVIDER: z.enum(["none", "meta"]).default("none"),
  WHATSAPP_TOKEN: opt, WHATSAPP_PHONE_NUMBER_ID: opt,

  // Installed app: Google Play package (Trusted Web Activity) — see docs/APPS.md
  ANDROID_APP_PACKAGE: opt,     // e.g. sa.janah.store
  ANDROID_APP_SHA256: opt,      // signing certificate SHA-256 fingerprint(s), comma-separated

  // ZATCA e-invoicing (Fatoora)
  ZATCA_ENV: z.enum(["disabled", "sandbox", "simulation", "production"]).default("disabled"),
  ZATCA_API_BASE: opt,
  ZATCA_CSID: opt,          // binary security token issued at onboarding
  ZATCA_SECRET: opt,
  ZATCA_PRIVATE_KEY: opt,   // EC secp256k1 private key (PEM, base64-encoded in env)
  ZATCA_CERTIFICATE: opt,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const i of parsed.error.issues) console.error(`  ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";

if (isProd && config.PAYMENT_PROVIDER === "moyasar" && !config.MOYASAR_SECRET_KEY) {
  console.error("PAYMENT_PROVIDER=moyasar requires MOYASAR_SECRET_KEY");
  process.exit(1);
}
