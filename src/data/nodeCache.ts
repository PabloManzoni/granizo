// Caché en disco para Node (CLI, test histórico, servidor local). Importarlo activa la caché.
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configureOpenMeteo, type CacheStore } from './openMeteo.ts';

const CACHE_DIR = join(import.meta.dirname, '../../.cache/open-meteo');
const fileFor = (url: string) => join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`);

export const fileCache: CacheStore = {
  async get(url, maxAgeMs) {
    try {
      const file = fileFor(url);
      if (Date.now() - (await stat(file)).mtimeMs > maxAgeMs) return null;
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return null;
    }
  },
  async set(url, data) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(fileFor(url), JSON.stringify(data));
  },
};

configureOpenMeteo({ cache: fileCache });
