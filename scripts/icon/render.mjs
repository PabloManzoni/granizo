// Genera los PNG del ícono y favicon.ico con Chrome sin cabeza, a partir de las variantes de variants.mjs.
// Uso: node scripts/icon/variants.mjs && node scripts/icon/render.mjs   (CHROME=/ruta/a/chrome si no está en la de macOS)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = import.meta.dirname;
const pub = join(dir, '..', '..', 'public');
const tmp = mkdtempSync(join(tmpdir(), 'cubierto-icon-'));

/** SVG → PNG de `size` px, con fondo transparente (las esquinas redondeadas quedan transparentes). */
function render(svgFile, size, out) {
  const svg = readFileSync(svgFile, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
  const src = join(tmp, `${size}-${Date.now()}.svg`);
  writeFileSync(src, svg);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${out}`, `file://${src}`,
  ], { stdio: 'ignore' });
  return readFileSync(out);
}

const rounded = join(pub, 'icon.svg');
render(rounded, 512, join(pub, 'icon-512.png'));
render(rounded, 192, join(pub, 'icon-192.png'));
render(rounded, 32, join(pub, 'favicon-32.png'));
render(join(dir, 'maskable.svg'), 512, join(pub, 'icon-maskable-512.png'));
render(join(dir, 'apple.svg'), 180, join(pub, 'apple-touch-icon.png'));

// favicon.ico con PNG adentro (16, 32 y 48 px): lo entienden todos los navegadores actuales.
const pngs = [16, 32, 48].map((s) => ({ s, data: render(rounded, s, join(tmp, `ico-${s}.png`)) }));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // tipo: ícono
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach(({ s, data }, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4); // planos
  header.writeUInt16LE(32, e + 6); // bits por pixel
  header.writeUInt32LE(data.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([header, ...pngs.map((p) => p.data)]));
console.log('Íconos listos en public/');
