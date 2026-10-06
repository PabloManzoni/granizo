// Registro de pronósticos para verificación hacia adelante.
// Corre el motor con el pronóstico vigente para varias ciudades y guarda el resultado en data/forecast-log/AAAA-MM.jsonl.
// Al cruzar este registro con las granizadas que ocurran, medimos la habilidad REAL a 12–36 h (el test histórico usa
// casi-análisis, que es un techo). Pensado para correr una vez por día, a la tarde.
// Uso: npm run log-forecast
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assessProfiles } from '../assess.ts';
import { NEIGHBORHOOD } from '../engine/config.ts';
import { fetchProfiles } from '../data/openMeteo.ts';
import { neighborhood } from '../geo/neighborhood.ts';
import { addHours, atHour, fmtLocal, nowLocal } from './args.ts';

const CITIES = [
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

const now = nowLocal();
const tomorrow = addHours(now, 24);
const windows = [
  { name: 'tonight', from: atHour(now, 20), to: atHour(tomorrow, 8) },
  { name: 'tomorrow', from: atHour(tomorrow, 8), to: atHour(tomorrow, 20) },
];

const dir = join(import.meta.dirname, '../../data/forecast-log');
await mkdir(dir, { recursive: true });
const file = join(dir, `${fmtLocal(now).slice(0, 7)}.jsonl`);
let n = 0;
for (const c of CITIES) {
  // Una sola descarga por ciudad para las dos ventanas (cuida el cupo gratuito de Open-Meteo).
  const profiles = await fetchProfiles({
    source: 'forecast',
    points: neighborhood(c, NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm),
    startDate: fmtLocal(now).slice(0, 10),
    endDate: fmtLocal(tomorrow).slice(0, 10),
  });
  for (const w of windows) {
    try {
      const r = assessProfiles(profiles, fmtLocal(w.from), fmtLocal(w.to));
      const i = r.peak.ingredients;
      const line = {
        issuedAt: fmtLocal(now),
        engineVersion: r.engineVersion,
        city: c.name,
        lat: c.lat,
        lon: c.lon,
        window: w.name,
        from: fmtLocal(w.from),
        to: fmtLocal(w.to),
        level: r.level,
        confidence: r.confidence,
        reasons: r.reasons,
        peakTime: r.peak.time,
        mucape: Math.round(i.muCapeJkg),
        lapse: i.lapse700500CKm,
        wmaxshear: i.wmaxshearM2s2 === null ? null : Math.round(i.wmaxshearM2s2),
        ship: i.ship,
        maxShowersMm: r.trigger.maxShowersMm,
      };
      await appendFile(file, JSON.stringify(line) + '\n');
      n++;
    } catch (err) {
      console.error(`✗ ${c.name} ${w.name}: ${err}`);
    }
  }
}
console.log(`Registrados ${n} pronósticos en ${file}`);
