/**
 * Generates the app icons in public/icons from the brand mark (copper plate, graphite bolt).
 *   bun scripts/icons.ts
 * The PNGs are committed, so this only needs to run again when the mark changes.
 *
 *   icon-*.png           regular icons (rounded plate, transparent corners)
 *   maskable-*.png       full-bleed for Android adaptive icons: the bolt stays inside the 80% safe zone
 *   apple-touch-icon.png 180×180, square (iOS rounds the corners itself)
 *   admin-*.png          back-office app: graphite plate, copper bolt, conductor-colour stripe
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join } from "path";

const out = join(import.meta.dir, "../public/icons");
mkdirSync(out, { recursive: true });

const COPPER = "#e39a5b", GRAPHITE = "#17202a";
const BOLT = "M18 4 8 18h7l-2 10 11-15h-7z"; // drawn on a 32×32 grid
// IEC 60446 conductor colours, as in the stripe under the site header
const STRIPE = ["#8a4b2a", "#17202a", "#8f969c", "#1d57b0", "#2e8b57"];

/** bolt scaled so it spans `scale` of the canvas, centred */
const bolt = (size: number, scale: number, fill: string) => {
  const k = (size * scale) / 26, off = (size - 32 * k) / 2;
  return `<path d="${BOLT}" fill="${fill}" transform="translate(${off} ${off}) scale(${k})"/>`;
};
const stripe = (size: number, h: number) => {
  const w = size / STRIPE.length;
  return STRIPE.map((c, i) => `<rect x="${i * w}" y="${size - h}" width="${w + 0.5}" height="${h}" fill="${c}"/>`).join("")
    + `<rect x="${4 * w}" y="${size - h}" width="${w + 0.5}" height="${h}" fill="url(#ye)"/>`;
};
const yellowGreen = `<defs><pattern id="ye" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#2e8b57"/><rect width="6" height="12" fill="#e8c21a"/></pattern></defs>`;

const svg = (size: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${yellowGreen}${body}</svg>`;

const store = {
  any: (s: number) => svg(s, `<rect width="${s}" height="${s}" rx="${s * 0.18}" fill="${COPPER}"/>${bolt(s, 0.74, GRAPHITE)}`),
  maskable: (s: number) => svg(s, `<rect width="${s}" height="${s}" fill="${COPPER}"/>${bolt(s, 0.5, GRAPHITE)}`),
  apple: (s: number) => svg(s, `<rect width="${s}" height="${s}" fill="${COPPER}"/>${bolt(s, 0.62, GRAPHITE)}`),
};
const admin = {
  any: (s: number) => svg(s, `<clipPath id="r"><rect width="${s}" height="${s}" rx="${s * 0.18}"/></clipPath><g clip-path="url(#r)"><rect width="${s}" height="${s}" fill="${GRAPHITE}"/>${bolt(s, 0.62, COPPER)}${stripe(s, s * 0.09)}</g>`),
  maskable: (s: number) => svg(s, `<rect width="${s}" height="${s}" fill="${GRAPHITE}"/>${bolt(s, 0.46, COPPER)}${stripe(s, s * 0.1)}`),
  apple: (s: number) => svg(s, `<rect width="${s}" height="${s}" fill="${GRAPHITE}"/>${bolt(s, 0.56, COPPER)}${stripe(s, s * 0.09)}`),
};

const jobs: [file: string, svg: string, size: number][] = [
  ["icon-192.png", store.any(192), 192],
  ["icon-512.png", store.any(512), 512],
  ["maskable-192.png", store.maskable(192), 192],
  ["maskable-512.png", store.maskable(512), 512],
  ["apple-touch-icon.png", store.apple(180), 180],
  ["favicon-32.png", store.any(32), 32],
  ["admin-192.png", admin.any(192), 192],
  ["admin-512.png", admin.any(512), 512],
  ["admin-maskable-512.png", admin.maskable(512), 512],
  ["admin-apple-touch-icon.png", admin.apple(180), 180],
];
for (const [file, src, size] of jobs) {
  await sharp(Buffer.from(src)).resize(size, size).png({ compressionLevel: 9 }).toFile(join(out, file));
  console.log(`  public/icons/${file}`);
}
await Bun.write(join(out, "icon.svg"), store.any(512));
console.log("  public/icons/icon.svg");
