// Servidor local: API del motor + PWA básica (sin dependencias).
// Uso: npm run serve   (PORT=8787 por defecto)
import './data/nodeCache.ts'; // caché en disco de Open-Meteo
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { assess } from './assess.ts';
import { RateLimitError } from './data/openMeteo.ts';
import { present } from './presenter.ts';
import { fmtLocal, nowLocal } from './cli/args.ts';
import { resolveWindow, WINDOW_LABELS, WINDOW_NAMES, type WindowName } from './windows.ts';

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_DIR = join(import.meta.dirname, '../public');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
};

/** Uruguay con margen: el motor está calibrado acá. */
const BOUNDS = { latMin: -35.5, latMax: -29.5, lonMin: -59.0, lonMax: -52.5 };

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleAssess(url: URL, res: import('node:http').ServerResponse) {
  // Redondeo a ~1 km: alcanza para el motor (zona de 40 km) y no guardamos la ubicación exacta.
  const lat = Math.round(Number(url.searchParams.get('lat')) * 100) / 100;
  const lon = Math.round(Number(url.searchParams.get('lon')) * 100) / 100;
  const windowName = (url.searchParams.get('window') ?? 'tonight') as WindowName;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { code: 'bad_request', error: 'Faltan lat y lon.' });
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lon < BOUNDS.lonMin || lon > BOUNDS.lonMax) {
    return json(res, 400, { code: 'outside', error: 'Por ahora el motor solo funciona en Uruguay.' });
  }
  if (!WINDOW_NAMES.includes(windowName)) return json(res, 400, { code: 'bad_request', error: 'Ventana desconocida.' });

  const { from, to } = resolveWindow(windowName);
  try {
    const r = await assess({ center: { lat, lon }, from, to, source: 'forecast' });
    json(res, 200, present(r, { name: windowName, label: WINDOW_LABELS[windowName], from, to }, fmtLocal(nowLocal())));
  } catch (err) {
    if (err instanceof RateLimitError) {
      return json(res, 503, { code: 'limit', error: 'La fuente de datos llegó a su límite gratuito por ahora.' });
    }
    console.error('assess error', err);
    json(res, 502, { code: 'server', error: 'No pudimos obtener el pronóstico.' });
  }
}

async function serveStatic(pathname: string, res: import('node:http').ServerResponse) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': rel === 'sw.js' || process.env.NODE_ENV !== 'production' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method !== 'GET') return void res.writeHead(405).end();
  if (url.pathname === '/api/assess') return handleAssess(url, res);
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  return serveStatic(url.pathname, res);
}).listen(PORT, () => console.log(`Hail Guard en http://localhost:${PORT}`));
