// Arma las dos variantes del ícono desde scripts/icon/icon.svg:
// - "maskable": fondo a sangre (Android le aplica su forma); también para iPhone, que redondea solo.
// - "rounded": con esquinas redondeadas, para favicon e instalación en escritorio.
// Uso: node scripts/icon/variants.mjs → escribe public/icon.svg (redondeado) y scripts/icon/maskable.svg.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = import.meta.dirname;
const src = readFileSync(join(dir, 'icon.svg'), 'utf8').replace(/<!--\n[\s\S]*?-->\n/, '');
const bleed = src.replace('<!--SHAPE-->', '<rect width="512" height="512" fill="#07050A"/>');
const rounded = src
  .replace('</defs>', '  <clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>\n</defs>\n<g clip-path="url(#tile)">')
  .replace('<!--SHAPE-->', '<rect width="512" height="512" fill="#07050A"/>')
  .replace(/<\/svg>\s*$/, '</g>\n</svg>\n');
writeFileSync(join(dir, 'maskable.svg'), bleed);
writeFileSync(join(dir, '..', '..', 'public', 'icon.svg'), rounded);
