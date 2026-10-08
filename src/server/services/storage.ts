import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { config } from "../config";
import { db } from "../db";
import { HttpError } from "../http";
import { randomToken } from "../security";
import { log } from "../logger";

/**
 * Media storage abstraction. Product images live outside the application server:
 *   • `local` — files under UPLOAD_DIR, served from /media/* (single-server deployments, development).
 *   • `s3`    — any S3-compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO…),
 *               served from S3_PUBLIC_URL (CDN) or proxied through /media/* when the bucket is private.
 *   • `db`    — rows in the media_files table, served from /media/*. For hosts whose disk is wiped on
 *               restart; files are covered by the database backups. Responses are cached for a year.
 */
export interface StorageDriver {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Blob | ReadableStream | Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm" };
const typeOf = (key: string) => TYPES[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
const safeKey = (key: string) => /^[a-z0-9][a-z0-9/_.-]*$/i.test(key) && !key.includes("..");

class LocalDriver implements StorageDriver {
  root = resolve(config.UPLOAD_DIR);
  constructor() { mkdirSync(this.root, { recursive: true }); }
  async put(key: string, data: Uint8Array) {
    const path = join(this.root, key);
    mkdirSync(join(path, ".."), { recursive: true });
    await Bun.write(path, data);
  }
  async get(key: string) {
    if (!safeKey(key)) return null;
    const file = Bun.file(join(this.root, key));
    return (await file.exists()) ? { body: file, contentType: typeOf(key) } : null;
  }
  async delete(key: string) { if (safeKey(key)) await Bun.file(join(this.root, key)).delete().catch(() => {}); }
  publicUrl(key: string) { return `/media/${key}`; }
}

class S3Driver implements StorageDriver {
  private client: any;
  constructor() {
    const { S3Client } = require("bun") as typeof import("bun");
    this.client = new S3Client({ bucket: config.S3_BUCKET, region: config.S3_REGION, endpoint: config.S3_ENDPOINT, accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY });
  }
  async put(key: string, data: Uint8Array, contentType: string) { await this.client.write(key, data, { type: contentType }); }
  async get(key: string) {
    if (!safeKey(key)) return null;
    const f = this.client.file(key);
    return (await f.exists()) ? { body: f.stream() as ReadableStream, contentType: typeOf(key) } : null;
  }
  async delete(key: string) { await this.client.delete(key).catch(() => {}); }
  publicUrl(key: string) { return config.S3_PUBLIC_URL ? `${config.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}` : `/media/${key}`; }
}

class DbDriver implements StorageDriver {
  async put(key: string, data: Uint8Array, contentType: string) {
    await db.exec(`INSERT INTO media_files (key, content_type, size, data) VALUES ($1, $2, $3, $4)
                   ON CONFLICT (key) DO UPDATE SET content_type = EXCLUDED.content_type, size = EXCLUDED.size, data = EXCLUDED.data`, [key, contentType, data.byteLength, Buffer.from(data)]);
  }
  async get(key: string) {
    if (!safeKey(key)) return null;
    const row = await db.one<{ content_type: string; data: Uint8Array }>(`SELECT content_type, data FROM media_files WHERE key = $1`, [key]);
    return row ? { body: new Uint8Array(row.data), contentType: row.content_type } : null;
  }
  async delete(key: string) { if (safeKey(key)) await db.exec(`DELETE FROM media_files WHERE key = $1`, [key]); }
  publicUrl(key: string) { return `/media/${key}`; }
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  if (!driver) {
    if (config.STORAGE_DRIVER === "s3") {
      if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
      driver = new S3Driver();
    } else if (config.STORAGE_DRIVER === "db") driver = new DbDriver();
    else driver = new LocalDriver();
  }
  return driver;
}

/** Detect the real file type from magic bytes — the client-supplied MIME type and extension are never trusted. */
function sniff(b: Uint8Array): "jpg" | "png" | "webp" | "mp4" | "webm" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  return null;
}

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;

/**
 * Validates and stores an uploaded image. Images are re-encoded to WebP (which strips EXIF and any
 * embedded payload) in two sizes; if the `sharp` module is unavailable the validated original is stored.
 */
export async function saveImage(file: File, folder = "products"): Promise<{ url: string; thumb_url: string }> {
  if (file.size > MAX_IMAGE) throw new HttpError(413, "file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (kind !== "jpg" && kind !== "png" && kind !== "webp") throw new HttpError(415, "unsupported_file_type");
  const id = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}`;
  const s = storage();
  try {
    const sharp = (await import("sharp")).default;
    const large = await sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const thumb = await sharp(bytes).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await s.put(`${id}.webp`, large, "image/webp");
    await s.put(`${id}_t.webp`, thumb, "image/webp");
    return { url: s.publicUrl(`${id}.webp`), thumb_url: s.publicUrl(`${id}_t.webp`) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if ((e as any)?.code !== "ERR_MODULE_NOT_FOUND" && !/Cannot find (module|package)/.test(String((e as any)?.message))) throw new HttpError(422, "invalid_image");
    log.warn("sharp not available — storing original image without resizing");
    await s.put(`${id}.${kind}`, bytes, TYPES[kind]!);
    const u = s.publicUrl(`${id}.${kind}`);
    return { url: u, thumb_url: u };
  }
}

export async function saveVideo(file: File): Promise<{ url: string }> {
  if (file.size > MAX_VIDEO) throw new HttpError(413, "file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (kind !== "mp4" && kind !== "webm") throw new HttpError(415, "unsupported_file_type");
  const key = `videos/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${kind}`;
  await storage().put(key, bytes, TYPES[kind]!);
  return { url: storage().publicUrl(key) };
}

/** Serve /media/<key> (local driver, or private S3 bucket). */
export async function serveMedia(key: string): Promise<Response | null> {
  const obj = await storage().get(key);
  if (!obj) return null;
  const headers: Record<string, string> = { "content-type": obj.contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" };
  if (obj.contentType === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(obj.body as any, { headers });
}
