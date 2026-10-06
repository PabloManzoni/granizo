// Arma las variantes del ícono desde scripts/icon/icon.svg:
// - "rounded": con esquinas redondeadas, para favicon e instalación en escritorio → public/icon.svg.
// - "maskable": fondo a sangre y dibujo al 80%, dentro del círculo seguro (Android le aplica su forma).
// - "apple": fondo a sangre y dibujo entero (el iPhone redondea las esquinas solo, no recorta en círculo).
// Uso: node scripts/icon/variants.mjs, y después node scripts/icon/render.mjs para los PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BG = '#1F5BD8';
const dir = import.meta.dirname;
const src = readFileSync(join(dir, 'icon.svg'), 'utf8').replace(/<!--\n[\s\S]*?-->\n/, '');
const tile = `<rect width="512" height="512" fill="${BG}"/>`;
const apple = src.replace('<!--SHAPE-->', tile);
const maskable = apple.replace('<g class="art">', '<g class="art" transform="translate(256 256) scale(.8) translate(-256 -256)">');
const rounded = src
  .replace('<defs></defs>', '<defs><clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath></defs>\n<g clip-path="url(#tile)">')
  .replace('<!--SHAPE-->', tile)
  .replace(/<\/svg>\s*$/, '</g>\n</svg>\n');
writeFileSync(join(dir, 'maskable.svg'), maskable);
writeFileSync(join(dir, 'apple.svg'), apple);
writeFileSync(join(dir, '..', '..', 'public', 'icon.svg'), rounded);
