// Descarga de perfiles verticales desde Open-Meteo (uso no comercial, sin API key).
// - historical: archivo de pronósticos (GFS desde 2021), para el test histórico.
// - forecast: pronóstico vigente, para el uso diario.
// Sin dependencias de Node: corre igual en el navegador (PWA) y en Node (CLI, test histórico).
// La caché se inyecta con configureOpenMeteo(): en Node, archivos (nodeCache.ts); en el navegador, la sesión.
import type { ProfileHour, ProfileLevel, WindLevel } from '../engine/types.ts';
import type { Point } from '../geo/neighborhood.ts';

export type Source = 'historical' | 'forecast';

const BASE_URL: Record<Source, string> = {
  historical: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
  forecast: 'https://api.open-meteo.com/v1/forecast',
};

// Con más niveles el servidor a veces corta la respuesta (timeout); 15 alcanza para la parcela y la cizalladura.
const LEVELS_HPA = [1000, 975, 950, 925, 900, 850, 800, 750, 700, 600, 500, 400, 300, 250, 200];
const WIND_LEVELS_HPA = [850, 700, 500, 400];
const SURFACE_VARS = [
  'temperature_2m',
  'dew_point_2m',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'cape',
  'freezing_level_height',
  'showers',
  'precipitation',
];
const CHUNK_SIZE = 3;

/** Dónde guardar respuestas ya descargadas. `maxAgeMs` = antigüedad máxima aceptable. */
export interface CacheStore {
  get(url: string, maxAgeMs: number): Promise<unknown | null>;
  set(url: string, data: unknown): Promise<void>;
}

const noCache: CacheStore = { get: async () => null, set: async () => {} };

const settings = {
  cache: noCache,
  /** En Node conviene esperar el minuto del límite gratuito; en el navegador, mejor avisar enseguida. */
  waitOnMinuteLimit: true,
  attempts: 3,
};

export function configureOpenMeteo(opts: Partial<typeof settings>) {
  Object.assign(settings, opts);
}

function hourlyVariables(): string[] {
  const vars = [...SURFACE_VARS];
  for (const p of LEVELS_HPA) vars.push(`temperature_${p}hPa`, `dew_point_${p}hPa`, `geopotential_height_${p}hPa`);
  for (const p of WIND_LEVELS_HPA) vars.push(`wind_speed_${p}hPa`, `wind_direction_${p}hPa`);
  return [...new Set(vars)];
}

export interface FetchOptions {
  source: Source;
  points: Point[];
  startDate: string; // YYYY-MM-DD (local)
  endDate: string;
  model?: string;
}

interface OpenMeteoLocation {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: Record<string, (number | null)[]> & { time: string[] };
}

function buildUrl(source: Source, points: Point[], startDate: string, endDate: string, model: string): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    start_date: startDate,
    end_date: endDate,
    hourly: hourlyVariables().join(','),
    models: model,
    timezone: 'America/Montevideo',
    wind_speed_unit: 'ms',
  });
  return `${BASE_URL[source]}?${params}`;
}

/** Cuánto vale una respuesta en caché: el archivo histórico no cambia; el pronóstico se refresca cada hora. */
const CACHE_TTL_MS: Record<Source, number> = { historical: Infinity, forecast: 60 * 60 * 1000 };

async function getJson(url: string, ttlMs: number): Promise<OpenMeteoLocation[]> {
  const useCache = ttlMs > 0;
  if (useCache) {
    const hit = await settings.cache.get(url, ttlMs).catch(() => null);
    if (hit) return hit as OpenMeteoLocation[];
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < settings.attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      // Sin red (o el pedido no llegó): reintentar y, si sigue, avisar como problema de conexión.
      lastError = new NetworkError(String(err));
      if (attempt < settings.attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    try {
      if (res.status === 429) {
        const reason = (await res.json().catch(() => ({}))).reason ?? '';
        // Plan gratuito: si es el límite por hora o por día, no tiene sentido reintentar.
        if (/hourly|daily/i.test(reason) || !settings.waitOnMinuteLimit) throw new RateLimitError(`Open-Meteo: ${reason}`);
        lastError = new Error(`Open-Meteo 429: ${reason}`);
        await new Promise((r) => setTimeout(r, 61_000));
        continue;
      }
      const text = await res.text();
      const body = JSON.parse(text); // el servidor a veces devuelve 200 con texto de timeout
      if (!res.ok || body.error) throw new Error(`Open-Meteo ${res.status}: ${body.reason ?? text.slice(0, 200)}`);
      const locations: OpenMeteoLocation[] = Array.isArray(body) ? body : [body];
      if (useCache) await settings.cache.set(url, locations).catch(() => {});
      return locations;
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      lastError = err;
      if (attempt < settings.attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Se agotó el cupo gratuito de Open-Meteo. */
export class RateLimitError extends Error {}
/** No se pudo hablar con Open-Meteo (sin conexión o red caída). */
export class NetworkError extends Error {}

async function fetchChunk(opts: FetchOptions, points: Point[], model: string): Promise<OpenMeteoLocation[]> {
  const url = buildUrl(opts.source, points, opts.startDate, opts.endDate, model);
  try {
    return await getJson(url, CACHE_TTL_MS[opts.source]);
  } catch (err) {
    if (points.length === 1 || err instanceof RateLimitError || err instanceof NetworkError) throw err;
    // Si falla un grupo, probar de a un punto.
    const out: OpenMeteoLocation[] = [];
    for (const p of points) out.push(...(await fetchChunk(opts, [p], model)));
    return out;
  }
}

function toProfiles(loc: OpenMeteoLocation): ProfileHour[] {
  const h = loc.hourly;
  const at = (name: string, i: number) => h[name]?.[i] ?? null;
  const profiles: ProfileHour[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const psfc = at('surface_pressure', i);
    const t2 = at('temperature_2m', i);
    const td2 = at('dew_point_2m', i);
    const ws10 = at('wind_speed_10m', i);
    const wd10 = at('wind_direction_10m', i);
    if (psfc === null || t2 === null || td2 === null || ws10 === null || wd10 === null) continue;

    const levels: ProfileLevel[] = [];
    for (const p of LEVELS_HPA) {
      const t = at(`temperature_${p}hPa`, i);
      const td = at(`dew_point_${p}hPa`, i);
      const z = at(`geopotential_height_${p}hPa`, i);
      if (p >= psfc - 1 || t === null || td === null || z === null) continue;
      levels.push({ pressureHpa: p, temperatureC: t, dewPointC: td, heightM: z });
    }
    const winds: WindLevel[] = [];
    for (const p of WIND_LEVELS_HPA) {
      const s = at(`wind_speed_${p}hPa`, i);
      const d = at(`wind_direction_${p}hPa`, i);
      const z = at(`geopotential_height_${p}hPa`, i);
      if (p >= psfc - 1 || s === null || d === null || z === null) continue;
      winds.push({ pressureHpa: p, heightM: z, wind: { speedMs: s, directionDeg: d } });
    }
    if (levels.length < 8) continue;

    profiles.push({
      time: h.time[i],
      lat: loc.latitude,
      lon: loc.longitude,
      elevationM: loc.elevation,
      surface: { pressureHpa: psfc, temperatureC: t2, dewPointC: td2, wind10m: { speedMs: ws10, directionDeg: wd10 } },
      levels,
      winds,
      freezingLevelM: at('freezing_level_height', i),
      showersMm: at('showers', i),
      precipitationMm: at('precipitation', i),
      modelCapeJkg: at('cape', i),
    });
  }
  return profiles;
}

/** Perfiles horarios para todos los puntos (deduplicados por celda del modelo). */
export async function fetchProfiles(opts: FetchOptions): Promise<ProfileHour[]> {
  const model = opts.model ?? 'gfs_seamless';
  const seen = new Set<string>();
  const profiles: ProfileHour[] = [];
  for (let i = 0; i < opts.points.length; i += CHUNK_SIZE) {
    const locations = await fetchChunk(opts, opts.points.slice(i, i + CHUNK_SIZE), model);
    for (const loc of locations) {
      const key = `${loc.latitude},${loc.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      profiles.push(...toProfiles(loc));
    }
  }
  return profiles;
}
