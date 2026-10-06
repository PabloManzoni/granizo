// Motor en el navegador: la PWA calcula todo en el teléfono y le pide los datos directo a Open-Meteo.
// Así no hace falta servidor (GitHub Pages) y cada persona usa su propio cupo gratuito de Open-Meteo.
// Se empaqueta con esbuild en public/engine.js (npm run build).
import { assess } from './assess.ts';
import { fmtLocal, nowLocal } from './cli/args.ts';
import { configureOpenMeteo, NetworkError, RateLimitError, type CacheStore } from './data/openMeteo.ts';
import { present, type ResultView } from './presenter.ts';
import { resolveWindow, WINDOW_LABELS, WINDOW_NAMES, type WindowName } from './windows.ts';

export { DEV_SCENARIOS, devScenario } from './dev-scenarios.ts';

// Caché de la sesión: evita volver a descargar si cambiás de ventana o de lugar y volvés.
const memory = new Map<string, { at: number; data: unknown }>();
const sessionCache: CacheStore = {
  async get(url, maxAgeMs) {
    let hit = memory.get(url);
    if (!hit) {
      try {
        const raw = sessionStorage.getItem(`om:${url}`);
        if (raw) hit = JSON.parse(raw);
      } catch {
        // sin sessionStorage: solo memoria
      }
    }
    return hit && Date.now() - hit.at <= maxAgeMs ? hit.data : null;
  },
  async set(url, data) {
    const entry = { at: Date.now(), data };
    memory.set(url, entry);
    try {
      sessionStorage.setItem(`om:${url}`, JSON.stringify(entry));
    } catch {
      // lleno o bloqueado: alcanza con la memoria
    }
  },
};
configureOpenMeteo({ cache: sessionCache, waitOnMinuteLimit: false, attempts: 2 });

/** Uruguay con margen: el motor está calibrado acá. */
const BOUNDS = { latMin: -35.5, latMax: -29.5, lonMin: -59.0, lonMax: -52.5 };

export type ErrorCode = 'outside' | 'limit' | 'offline' | 'server';

export class AssessError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function assessHere(latIn: number, lonIn: number, windowName: WindowName): Promise<ResultView> {
  // Redondeo a ~1 km: alcanza para una zona de 40 km.
  const lat = Math.round(latIn * 100) / 100;
  const lon = Math.round(lonIn * 100) / 100;
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lon < BOUNDS.lonMin || lon > BOUNDS.lonMax) {
    throw new AssessError('outside', 'Por ahora el motor solo funciona en Uruguay.');
  }
  const name: WindowName = WINDOW_NAMES.includes(windowName) ? windowName : 'tonight';
  const { from, to } = resolveWindow(name);
  try {
    const r = await assess({ center: { lat, lon }, from, to, source: 'forecast' });
    return present(r, { name, label: WINDOW_LABELS[name], from, to }, fmtLocal(nowLocal()));
  } catch (err) {
    if (err instanceof RateLimitError) throw new AssessError('limit', err.message);
    if (err instanceof NetworkError) throw new AssessError('offline', err.message);
    throw new AssessError('server', String(err));
  }
}
