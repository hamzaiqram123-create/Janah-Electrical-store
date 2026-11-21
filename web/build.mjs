// Builds both apps into dist/ (browser preview) and into the Android project assets.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ANDROID = path.join(ROOT, '..', 'android', 'app', 'src');
const prod = !process.argv.includes('--dev');
const fonts = ['arabic-400', 'arabic-700', 'latin-400', 'latin-700'];

function copyShared(dir) {
  fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/shared/styles.css'), path.join(dir, 'styles.css'));
  for (const f of fonts) fs.copyFileSync(path.join(ROOT, `node_modules/@fontsource/cairo/files/cairo-${f}-normal.woff2`), path.join(dir, `fonts/cairo-${f}.woff2`));
}

for (const appName of ['customer', 'owner']) {
  const title = appName === 'customer' ? 'Janah Al Riyadah | جناح الريادة' : 'Janah Owner | المالك';
  const html = fs.readFileSync(path.join(ROOT, 'src/static/index.html'), 'utf8').replace('__TITLE__', title);
  const res = await build({
    entryPoints: [path.join(ROOT, `src/${appName}/main.js`)], bundle: true, minify: prod, sourcemap: !prod,
    format: 'iife', target: ['chrome80'], write: false, legalComments: 'none', logLevel: 'warning', define: { __APP__: JSON.stringify(appName) },
  });
  const js = res.outputFiles[0].contents;
  // 1) browser preview: dist/<app>/
  const dist = path.join(ROOT, 'dist', appName);
  fs.mkdirSync(dist, { recursive: true });
  copyShared(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.writeFileSync(path.join(dist, 'app.js'), js);
  if (!fs.existsSync(path.join(dist, 'config.js'))) fs.copyFileSync(path.join(ROOT, 'src/static/config.js'), path.join(dist, 'config.js'));
  // 2) Android flavour assets
  if (fs.existsSync(ANDROID)) {
    const fl = path.join(ANDROID, appName, 'assets', 'www');
    fs.mkdirSync(fl, { recursive: true });
    fs.writeFileSync(path.join(fl, 'index.html'), html);
    fs.writeFileSync(path.join(fl, 'app.js'), js);
  }
  console.log(appName, (js.length / 1024).toFixed(0) + ' KB');
}
if (fs.existsSync(ANDROID)) {
  const main = path.join(ANDROID, 'main', 'assets', 'www');
  copyShared(main);
  if (!fs.existsSync(path.join(main, 'config.js'))) fs.copyFileSync(path.join(ROOT, 'src/static/config.js'), path.join(main, 'config.js'));
}
