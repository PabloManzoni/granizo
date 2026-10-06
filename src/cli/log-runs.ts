// Registro de pronósticos REALES (corridas guardadas) para medir el motor a 12–60 h de anticipación.
// El test histórico usa casi-análisis, que es un techo. Acá se corre el motor sobre la corrida de las 12 UTC
// (09 h de Uruguay: lo que vería alguien que consulta a la mañana) con la Single Runs API de Open-Meteo, que guarda
// corridas pasadas completas, con niveles de presión (GFS desde 2026-04-02, ECMWF desde 2024-03).
//
// Ventanas por corrida (D = día de la corrida): tonight (D 20 h → D+1 8 h), tomorrow (D+1 8–20 h),
// tomorrow_night (D+1 20 h → D+2 8 h) y day_after (D+2 8–20 h). Cada línea trae el nivel combinado y, por modelo,
// los ingredientes del momento más favorable y √(gradiente × WMAXSHEAR), para poder probar después reglas continuas.
//
// Uso:
//   npm run log-runs                                  # la corrida más reciente de las 12 UTC ya publicada
//   npm run log-runs -- --run 2026-10-05T12:00        # una corrida concreta
//   npm run log-runs -- --backfill-from 2026-04-02    # reconstruye días anteriores (retoma donde quedó)
// Opciones: --cities core|all (por defecto all; el backfill usa core), --max-days N (tope de días por corrida),
//           --hour 12 (hora UTC de la corrida)
// Salida: data/forecast-log/runs/AAAA-MM.jsonl (una línea por corrida × ciudad × ventana; no repite lo ya guardado).
import '../data/nodeCache.ts'; // caché en disco de Open-Meteo
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assessProfiles } from '../assess.ts';
import { combineModels } from '../engine/classify.ts';
import { ENGINE_VERSION, NEIGHBORHOOD } from '../engine/config.ts';
import type { WindowAssessment } from '../engine/types.ts';
import { fetchProfiles, RateLimitError } from '../data/openMeteo.ts';
import { neighborhood } from '../geo/neighborhood.ts';
import { addHours, atHour, fmtLocal, parseArgs } from './args.ts';

const ALL_CITIES = [
  { name: 'Montevideo', lat: -34.9, lon: -56.16 },
  { name: 'El Pinar', lat: -34.8, lon: -55.91 },
  { name: 'Canelones', lat: -34.52, lon: -56.28 },
  { name: 'Maldonado', lat: -34.9, lon: -54.95 },
  { name: 'Colonia', lat: -34.47, lon: -57.84 },
  { name: 'Mercedes', lat: -33.25, lon: -58.03 },
  { name: 'Paysandú', lat: -32.32, lon: -58.08 },
  { name: 'Salto', lat: -31.39, lon: -57.96 },
  { name: 'Artigas', lat: -30.4, lon: -56.47 },
  { name: 'Rivera', lat: -30.9, lon: -55.55 },
  { name: 'Tacuarembó', lat: -31.71, lon: -55.98 },
  { name: 'Melo', lat: -32.37, lon: -54.17 },
  { name: 'Treinta y Tres', lat: -33.23, lon: -54.38 },
  { name: 'Durazno', lat: -33.38, lon: -56.52 },
  { name: 'Florida', lat: -34.1, lon: -56.21 },
  { name: 'Rocha', lat: -34.48, lon: -54.33 },
];
/** Para reconstruir el pasado dentro del cupo gratuito: una ciudad por región. */
const CORE = ['Montevideo', 'Salto', 'Tacuarembó', 'Rocha'];

const MODELS = [
  { name: 'GFS', id: 'gfs_seamless', firstRun: '2026-04-02T00:00' },
  { name: 'ECMWF', id: 'ecmwf_ifs025', firstRun: '2024-03-01T00:00' },
];
/** Horas UTC de Uruguay: la corrida de las 12 UTC es las 09 h locales. */
const UY_OFFSET_H = -3;
/** Una corrida tarda unas 5–6 h en publicarse completa. */
const PUBLISH_LAG_H = 6;

const args = parseArgs(process.argv.slice(2));
const runHour = Number(args.hour ?? 12);
const dir = join(import.meta.dirname, '../../data/forecast-log/runs');
await mkdir(dir, { recursive: true });
const fileFor = (day: string) => join(dir, `${day.slice(0, 7)}.jsonl`);

const readKeys = async (day: string): Promise<Set<string>> => {
  const keys = new Set<string>();
  try {
    for (const l of (await readFile(fileFor(day), 'utf8')).split('\n')) {
      if (!l) continue;
      const r = JSON.parse(l);
      keys.add(`${r.run}|${r.city}|${r.window}`);
    }
  } catch {
    // archivo todavía inexistente
  }
  return keys;
};

const runIso = (day: string) => `${day}T${String(runHour).padStart(2, '0')}:00`;

/** Corridas a procesar, de la más vieja a la más nueva. */
function daysToRun(): string[] {
  const latest = new Date(Date.now() - PUBLISH_LAG_H * 3600_000);
  latest.setUTCMinutes(0, 0, 0);
  latest.setUTCHours(runHour);
  if (latest.getTime() > Date.now() - PUBLISH_LAG_H * 3600_000) latest.setUTCDate(latest.getUTCDate() - 1);
  const lastDay = latest.toISOString().slice(0, 10);
  if (args.run) return [args.run.slice(0, 10)];
  const from = args['backfill-from'];
  if (!from) return [lastDay];
  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}

const cityList = () => {
  const which = args.cities ?? (args['backfill-from'] ? 'core' : 'all');
  return which === 'core' ? ALL_CITIES.filter((c) => CORE.includes(c.name)) : ALL_CITIES;
};

const windowsFor = (day: string) => {
  const base = atHour(new Date(`${day}T00:00:00Z`), 0); // "hora local" del día D como Date en UTC
  const at = (offsetDays: number, hour: number) => atHour(addHours(base, 24 * offsetDays), hour);
  return [
    { name: 'tonight', from: at(0, 20), to: at(1, 8) },
    { name: 'tomorrow', from: at(1, 8), to: at(1, 20) },
    { name: 'tomorrow_night', from: at(1, 20), to: at(2, 8) },
    { name: 'day_after', from: at(2, 8), to: at(2, 20) },
  ];
};

const round = (x: number | null, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const score = (a: WindowAssessment) => {
  const i = a.peak.ingredients;
  return i.lapse700500CKm === null || i.wmaxshearM2s2 === null ? null : round(Math.sqrt(Math.max(i.lapse700500CKm, 0) * i.wmaxshearM2s2), 1);
};

let written = 0;
let skipped = 0;
let daysDone = 0;
const maxDays = Number(args['max-days'] ?? Infinity);
try {
  for (const day of daysToRun()) {
    if (daysDone >= maxDays) break;
    const run = runIso(day);
    const done = await readKeys(day);
    const windows = windowsFor(day);
    const pending = cityList().filter((c) => windows.some((w) => !done.has(`${run}|${c.name}|${w.name}`)));
    skipped += (cityList().length - pending.length) * windows.length;
    if (!pending.length) continue;
    const runLocalStart = addHours(new Date(`${run}:00Z`), UY_OFFSET_H);
    const startDate = fmtLocal(runLocalStart).slice(0, 10);
    const endDate = fmtLocal(addHours(runLocalStart, 24 * 4)).slice(0, 10);
    for (const c of pending) {
      const perModel: { model: string; assessments: Map<string, WindowAssessment> }[] = [];
      const points = neighborhood(c, NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm);
      for (const m of MODELS) {
        if (run < m.firstRun) continue;
        try {
          const profiles = await fetchProfiles({ source: 'single-run', run, points, startDate, endDate, model: m.id });
          const byWindow = new Map<string, WindowAssessment>();
          for (const w of windows) {
            try {
              byWindow.set(w.name, assessProfiles(profiles, fmtLocal(w.from), fmtLocal(w.to)));
            } catch {
              // ventana sin datos de este modelo
            }
          }
          perModel.push({ model: m.name, assessments: byWindow });
        } catch (err) {
          if (err instanceof RateLimitError) throw err;
          console.error(`✗ ${run} ${c.name} ${m.name}: ${err}`);
        }
      }
      for (const w of windows) {
        if (done.has(`${run}|${c.name}|${w.name}`)) continue;
        const res = perModel.flatMap((p) => (p.assessments.has(w.name) ? [{ model: p.model, assessment: p.assessments.get(w.name)! }] : []));
        if (!res.length) continue;
        const combined = combineModels(res);
        const line = {
          run,
          engineVersion: ENGINE_VERSION,
          city: c.name,
          lat: c.lat,
          lon: c.lon,
          window: w.name,
          from: fmtLocal(w.from),
          to: fmtLocal(w.to),
          // horas desde el inicio de la corrida (12 UTC = 09 h locales) hasta el inicio y el fin de la ventana
          leadFromH: Math.round((w.from.getTime() - runLocalStart.getTime()) / 3600_000),
          leadToH: Math.round((w.to.getTime() - runLocalStart.getTime()) / 3600_000),
          level: combined.level,
          storm: combined.storm,
          confidence: combined.confidence,
          models: res.map(({ model, assessment: a }) => ({
            model,
            level: a.level,
            peakTime: a.peak.time,
            mucape: Math.round(a.peak.ingredients.muCapeJkg),
            lapse: round(a.peak.ingredients.lapse700500CKm, 2),
            wmaxshear: a.peak.ingredients.wmaxshearM2s2 === null ? null : Math.round(a.peak.ingredients.wmaxshearM2s2),
            sqrtLapseWmax: score(a),
            ship: round(a.peak.ingredients.ship, 2),
            maxShowersMm: a.trigger.maxShowersMm,
            maxPrecipMm: a.trigger.maxPrecipitationMm,
          })),
        };
        await appendFile(fileFor(day), JSON.stringify(line) + '\n');
        written++;
      }
    }
    daysDone++;
    console.log(`✓ corrida ${run}: ${pending.length} ciudades`);
  }
} catch (err) {
  if (!(err instanceof RateLimitError)) throw err;
  console.error(`Se agotó el cupo gratuito de Open-Meteo (${err.message}). Lo hecho queda guardado: volver a correr retoma desde acá.`);
}
console.log(`Registradas ${written} líneas nuevas (${skipped} ya existían) en ${dir}`);
