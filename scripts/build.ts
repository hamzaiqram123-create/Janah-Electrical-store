/**
 * Production build: bundles the storefront and admin clients, compiles Tailwind CSS and writes dist/manifest.json.
 *   bun run build            (minified)
 *   bun scripts/build.ts --dev   (unminified, used by `bun run dev`)
 */
import { compile } from "tailwindcss";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const root = join(import.meta.dir, "..");
const out = join(root, "dist/assets");
const dev = process.argv.includes("--dev");

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx?|css)$/.test(name)) files.push(p);
  }
  return files;
}

async function buildCss(): Promise<string> {
  const twRoot = dirname(Bun.resolveSync("tailwindcss/package.json", root));
  const entry = join(root, "src/web/styles.css");
  const compiler = await compile(readFileSync(entry, "utf8"), {
    base: dirname(entry),
    from: entry,
    loadStylesheet: async (id: string, base: string) => {
      const path = id === "tailwindcss" ? join(twRoot, "index.css") : id.startsWith("tailwindcss/") ? join(twRoot, id.slice("tailwindcss/".length)) : join(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  } as any);
  // Collect every token that could be a utility class from the UI sources; unknown tokens are ignored by the compiler.
  const candidates = new Set<string>();
  for (const file of [...walk(join(root, "src/web")), ...walk(join(root, "src/admin"))]) {
    if (file.endsWith(".css")) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/[^\s"'`<>{}=;]+/g)) candidates.add(m[0]);
  }
  let css = compiler.build([...candidates]);
  if (!dev) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "").replace(/\s*([{};,>])\s*/g, "$1").replace(/;}/g, "}");
  }
  return css;
}

rmSync(join(root, "dist"), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const started = performance.now();
const result = await Bun.build({
  entrypoints: [join(root, "src/web/client.tsx"), join(root, "src/admin/main.tsx")],
  outdir: out,
  target: "browser",
  format: "esm",
  splitting: true,
  minify: !dev,
  sourcemap: dev ? "linked" : "none",
  naming: { entry: "[name]-[hash].js", chunk: "chunk-[hash].js", asset: "[name]-[hash].[ext]" },
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const entries = result.outputs.filter((o) => o.kind === "entry-point").map((o) => o.path.split("/").pop()!);
const app = entries.find((n) => n.startsWith("client-"));
const admin = entries.find((n) => n.startsWith("main-"));
if (!app || !admin) throw new Error("entry bundles missing from build output");

const css = await buildCss();
const cssName = `app-${Bun.hash(css).toString(36)}.css`;
writeFileSync(join(out, cssName), css);
writeFileSync(join(root, "dist/manifest.json"), JSON.stringify({ app, admin, css: cssName, built_at: new Date().toISOString() }, null, 2));

const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
console.log(`built in ${Math.round(performance.now() - started)} ms`);
for (const o of result.outputs) if (o.path.endsWith(".js")) console.log(`  ${o.path.split("/").pop()!.padEnd(28)} ${kb(o.size)}`);
console.log(`  ${cssName.padEnd(28)} ${kb(css.length)}`);
