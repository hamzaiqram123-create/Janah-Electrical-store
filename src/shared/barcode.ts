/** Dependency-free 1D barcode rendering for product labels: EAN-13 when the value is a valid EAN-13, otherwise Code 128 (set B). */
const C128 = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
export function isEan13(v: string): boolean {
  return /^\d{13}$/.test(v) && ean13CheckDigit(v.slice(0, 12)) === Number(v[12]);
}

/** Returns the barcode as a string of 1 (bar) / 0 (space) modules. */
export function barcodeModules(value: string): { bits: string; symbology: "EAN-13" | "Code 128" } {
  if (isEan13(value)) {
    const inv = (s: string) => s.replace(/[01]/g, (c) => (c === "0" ? "1" : "0"));
    const rev = (s: string) => s.split("").reverse().join("");
    const par = EAN_PARITY[Number(value[0])]!;
    let bits = "101";
    for (let i = 1; i <= 6; i++) { const l = EAN_L[Number(value[i])]!; bits += par[i - 1] === "L" ? l : rev(inv(l)); }
    bits += "01010";
    for (let i = 7; i <= 12; i++) bits += inv(EAN_L[Number(value[i])]!);
    return { bits: bits + "101", symbology: "EAN-13" };
  }
  const chars = Array.from(value).filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126);
  const codes = [104, ...chars.map((ch) => ch.charCodeAt(0) - 32)];
  const check = codes.reduce((s, c, i) => s + c * (i === 0 ? 1 : i), 0) % 103;
  let bits = "";
  for (const c of [...codes, check, 106]) {
    C128[c]!.split("").forEach((w, i) => { bits += (i % 2 === 0 ? "1" : "0").repeat(Number(w)); });
  }
  return { bits, symbology: "Code 128" };
}

export function barcodeSvg(value: string, opts: { height?: number; module?: number } = {}): string {
  const { bits } = barcodeModules(value);
  const mod = opts.module ?? 2, h = opts.height ?? 60, quiet = 10 * mod;
  let rects = "";
  for (let i = 0; i < bits.length; ) {
    if (bits[i] === "1") { let j = i; while (bits[j] === "1") j++; rects += `<rect x="${quiet + i * mod}" y="0" width="${(j - i) * mod}" height="${h}"/>`; i = j; } else i++;
  }
  const w = bits.length * mod + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
