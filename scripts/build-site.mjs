// Arma el sitio estático para GitHub Pages en site/: la PWA + el motor empaquetado, sin la botonera de desarrollo.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'site');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'public'), out, {
  recursive: true,
  filter: (src) => !src.endsWith('dev.js'),
});
await writeFile(join(out, 'CNAME'), 'granizo.tuggsy.com\n');
await writeFile(join(out, '.nojekyll'), '');
console.log('Sitio listo en site/');
