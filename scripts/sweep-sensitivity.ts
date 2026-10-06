// Detección y falsas alarmas de cada grado de alerta (SENSITIVITY_RULES) sobre los casos históricos, con el motor real
// y sin red (usa la caché de Open-Meteo). Mismos casos que sweep-watch.ts. Uso: node scripts/sweep-sensitivity.ts
import '../src/data/nodeCache.ts';
import { assessBySensitivity } from '../src/assess.ts';
import { SENSITIVITIES, type Sensitivity } from '../src/engine/config.ts';
import type { RiskLevel } from '../src/engine/types.ts';
import { loadEvents, seasonOf, windowFor, type HailEvent } from '../src/data/events.ts';

const events = await loadEvents();
// Granizo = dañino o sin dato de tamaño (se excluye graupel / chico), igual que sweep-watch.ts.
const cases = events.filter((e) => e.type === 'control' || e.damaging !== false);
const rows: { e: HailEvent; level: Record<Sensitivity, RiskLevel> }[] = [];
for (const e of cases) {
  const { from, to } = windowFor(e);
  const r = await assessBySensitivity({ center: { lat: e.lat, lon: e.lon }, from, to, source: 'historical' });
  rows.push({ e, level: Object.fromEntries(SENSITIVITIES.map((s) => [s, r[s].level])) as Record<Sensitivity, RiskLevel> });
}

const rate = (s: Sensitivity, pred: (e: HailEvent) => boolean, atLeast: 'watch' | 'protect') => {
  const rs = rows.filter((r) => pred(r.e));
  const hit = (r: (typeof rows)[number]) => (atLeast === 'watch' ? r.level[s] !== 'calm' : r.level[s] === 'protect');
  const h = rs.filter((r) => r.e.type === 'hail'), c = rs.filter((r) => r.e.type === 'control');
  const pct = (xs: typeof rs) => `${((100 * xs.filter(hit).length) / (xs.length || 1)).toFixed(0)}%`;
  return `${pct(h)} / ${pct(c)}`.padEnd(11);
};
const train = (e: HailEvent) => e.date < '2025-01-01', test = (e: HailEvent) => e.date >= '2025-01-01';
const cold = (e: HailEvent) => seasonOf(e) === 'cold', warm = (e: HailEvent) => seasonOf(e) === 'warm';
const splits: [string, (e: HailEvent) => boolean][] = [
  ['entren.', train], ['prueba', test], ['prueba fría', (e) => test(e) && cold(e)], ['prueba cálida', (e) => test(e) && warm(e)], ['todos', () => true],
];
console.log(`${cases.filter((e) => e.type === 'hail').length} granizadas, ${cases.filter((e) => e.type === 'control').length} controles · detección / falsas alarmas`);
for (const atLeast of ['watch', 'protect'] as const) {
  console.log(`\n${atLeast === 'watch' ? 'Atento o más' : 'Protegelo'}`.padEnd(13), splits.map(([n]) => n.padEnd(11)).join(' '));
  for (const s of SENSITIVITIES) console.log(s.padEnd(12), splits.map(([, p]) => rate(s, p, atLeast)).join(' '));
}
