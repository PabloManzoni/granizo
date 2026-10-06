// Consulta el pronóstico vigente para un lugar.
// Uso: npm run check -- --lat -34.80 --lon -55.90 --window tonight
//      ventanas: tonight (20–08) | today (ahora–20) | tomorrow (08–20 de mañana) | next12h
import { assess } from '../assess.ts';
import { CONFIDENCE, DISCLAIMER, HEADLINES, REASONS, SEASON_NOTE } from '../engine/messages.ts';
import { resolveWindow, WINDOW_NAMES, type WindowName } from '../windows.ts';
import { fmtLocal, nowLocal, parseArgs } from './args.ts';

const args = parseArgs(process.argv.slice(2));
const lat = Number(args.lat);
const lon = Number(args.lon);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
  console.error('Uso: npm run check -- --lat -34.80 --lon -55.90 [--window tonight|today|tomorrow|next12h]');
  process.exit(1);
}
const windowName = (WINDOW_NAMES.includes(args.window as WindowName) ? args.window : 'tonight') as WindowName;
const { from, to } = resolveWindow(windowName);
const result = await assess({ center: { lat, lon }, from, to, source: 'forecast' });

const p = result.peak;
const n = (x: number | null, d = 0) => (x === null ? '—' : x.toFixed(d));
console.log(`\n${HEADLINES[result.level]}`);
console.log(`${CONFIDENCE[result.confidence]} · ${SEASON_NOTE[result.season]}`);
console.log(`Ventana: ${from} → ${to} (hora de Uruguay) · zona de ~40 km`);
if (result.models) console.log(`Modelos: ${result.models.map((m) => `${m.model} → ${m.level}`).join(' · ')}`);
console.log('\nPor qué:');
for (const r of result.reasons) console.log(`  · ${REASONS[r]}`);
if (result.favorableHours.length) {
  console.log(`\nHoras con ingredientes: ${result.favorableHours[0].slice(11)} a ${result.favorableHours.at(-1)!.slice(11)}`);
}
console.log(`\nPunto más favorable: ${p.time} en ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`);
console.log(
  `  MUCAPE ${n(p.ingredients.muCapeJkg)} J/kg · cizalladura 0–6 km ${n(p.ingredients.shear06Ms, 1)} m/s · ` +
    `gradiente 700–500 ${n(p.ingredients.lapse700500CKm, 1)} °C/km · T500 ${n(p.ingredients.t500C, 1)} °C · ` +
    `SHIP ${n(p.ingredients.ship, 2)} · energía×viento ${n(p.ingredients.wmaxshearM2s2)} m²/s² · congelamiento ${n(p.ingredients.freezingLevelMAgl)} m`,
);
console.log(`  Disparo del modelo: lluvia convectiva máx ${result.trigger.maxShowersMm.toFixed(1)} mm/h`);
console.log(`\nConsultado: ${fmtLocal(nowLocal())} · motor v${result.engineVersion}`);
console.log(DISCLAIMER);
