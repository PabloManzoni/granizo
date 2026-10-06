// Servidor local: API del motor + PWA básica (sin dependencias).
// Uso: npm run serve   (PORT=8787 por defecto)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { assess } from './assess.ts';
import { CONFIDENCE, DISCLAIMER, HEADLINES, REASONS, SEASON_NOTE } from './engine/messages.ts';
import { RateLimitError } from './data/openMeteo.ts';
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
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: 'Faltan lat y lon.' });
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lon < BOUNDS.lonMin || lon > BOUNDS.lonMax) {
    return json(res, 400, { error: 'Por ahora el motor solo funciona en Uruguay.' });
  }
  if (!WINDOW_NAMES.includes(windowName)) return json(res, 400, { error: 'Ventana desconocida.' });

  const { from, to } = resolveWindow(windowName);
  try {
    const r = await assess({ center: { lat, lon }, from, to, source: 'forecast' });
    const i = r.peak.ingredients;
    json(res, 200, {
      level: r.level,
      headline: HEADLINES[r.level],
      confidence: r.confidence,
      confidenceLabel: CONFIDENCE[r.confidence],
      season: r.season,
      seasonNote: SEASON_NOTE[r.season],
      reasons: r.reasons.map((code) => ({ code, text: REASONS[code] })),
      window: { name: windowName, label: WINDOW_LABELS[windowName], from, to },
      favorableHours: r.favorableHours.length
        ? { from: r.favorableHours[0], to: r.favorableHours.at(-1) }
        : null,
      peak: {
        time: r.peak.time,
        muCapeJkg: Math.round(i.muCapeJkg),
        shear06Ms: i.shear06Ms === null ? null : Math.round(i.shear06Ms * 10) / 10,
        lapse700500CKm: i.lapse700500CKm === null ? null : Math.round(i.lapse700500CKm * 100) / 100,
        t500C: i.t500C,
        wmaxshearM2s2: i.wmaxshearM2s2 === null ? null : Math.round(i.wmaxshearM2s2),
        ship: i.ship === null ? null : Math.round(i.ship * 100) / 100,
        maxShowersMm: r.trigger.maxShowersMm,
      },
      models: r.models ?? [],
      model: `${(r.models ?? []).map((m) => m.model).join(' + ') || 'GFS'} (vía Open-Meteo)`,
      generatedAt: fmtLocal(nowLocal()),
      engineVersion: r.engineVersion,
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return json(res, 503, { error: 'La fuente de datos llegó a su límite gratuito por ahora. Probá en un rato.' });
    }
    console.error('assess error', err);
    json(res, 502, { error: 'No pudimos obtener el pronóstico. Probá de nuevo en unos minutos.' });
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
      'cache-control': rel === 'sw.js' ? 'no-cache' : 'public, max-age=300',
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
