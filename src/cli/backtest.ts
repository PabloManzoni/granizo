// Test histórico: corre el motor sobre cada evento/control y lo compara con lo que pasó y con INUMET.
// Uso: npm run backtest [-- --file data/events.json]
// Ojo: el archivo histórico de Open-Meteo son las primeras horas de cada corrida (casi un análisis),
// así que esto mide "con un pronóstico casi perfecto, ¿la receta separa?". Es un techo, no la realidad a 24 h.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assess } from '../assess.ts';
import { ENGINE_VERSION, RULES } from '../engine/config.ts';
import type { RiskLevel } from '../engine/types.ts';
import { loadEvents, seasonOf, windowFor, type HailEvent } from '../data/events.ts';
import { parseArgs } from './args.ts';

interface Row {
  e: HailEvent;
  level: RiskLevel;
  env: string;
  peakTime: string;
  muCape: number;
  shear: number | null;
  lapse: number | null;
  t500: number | null;
  ship: number | null;
  showers: number;
  error?: string;
}

type Group = 'damaging' | 'hail_unknown' | 'hail_small' | 'control';
const GROUPS: Group[] = ['damaging', 'hail_unknown', 'hail_small', 'control'];
const groupOf = (e: HailEvent): Group =>
  e.type === 'control'
    ? 'control'
    : e.damaging === true
      ? 'damaging'
      : e.damaging === false
        ? 'hail_small'
        : 'hail_unknown';
const GROUP_LABEL: Record<Group, string> = {
  damaging: 'Granizo dañino (≥ 2 cm o con daño)',
  hail_unknown: 'Granizo sin dato de tamaño',
  hail_small: 'Granizo chico / graupel',
  control: 'Control: tormenta sin granizo',
};

const args = parseArgs(process.argv.slice(2));
const events = await loadEvents(args.file);
const rows: Row[] = [];
for (const e of events) {
  const { from, to } = windowFor(e);
  try {
    const r = await assess({ center: { lat: e.lat, lon: e.lon }, from, to, source: 'historical' });
    const i = r.peak.ingredients;
    rows.push({
      e,
      level: r.level,
      env: r.peak.environment,
      peakTime: r.peak.time,
      muCape: i.muCapeJkg,
      shear: i.shear06Ms,
      lapse: i.lapse700500CKm,
      t500: i.t500C,
      ship: i.ship,
      showers: r.trigger.maxShowersMm,
    });
    process.stdout.write(`✓ ${e.id} → ${r.level}\n`);
  } catch (err) {
    rows.push({ e, level: 'calm', env: '—', peakTime: '—', muCape: 0, shear: null, lapse: null, t500: null, ship: null, showers: 0, error: String(err) });
    process.stdout.write(`✗ ${e.id}: ${err}\n`);
  }
}

const ok = rows.filter((r) => !r.error);
const inGroup = (g: Group) => ok.filter((r) => groupOf(r.e) === g);
const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((100 * a) / b)}%`);
const median = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const f = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d));
const alerted = (r: Row) => ['yellow', 'orange', 'red'].includes(r.e.inumetAlert.status);
const known = (r: Row) => r.e.inumetAlert.status !== 'unknown';

const lines: string[] = [];
lines.push(`# Test histórico — motor v${ENGINE_VERSION}`, '');
lines.push(`Generado: ${new Date().toISOString().slice(0, 16)} UTC · ${ok.length} casos evaluados${rows.length > ok.length ? ` · ${rows.length - ok.length} con error` : ''}`, '');
lines.push(
  '> Datos: archivo de pronósticos GFS de Open-Meteo, que son las primeras horas de cada corrida (casi un análisis).',
  '> Esto mide si **la receta separa** con datos casi perfectos. Es un techo: el pronóstico real de 12–24 h va a ser peor.',
  '',
);

lines.push('## Qué dijo el motor en cada grupo', '');
lines.push('| Grupo | Casos | Protegelo | Atento | Tranquilo |', '|---|---|---|---|---|');
for (const g of GROUPS) {
  const rs = inGroup(g);
  const c = (l: RiskLevel) => rs.filter((r) => r.level === l).length;
  lines.push(`| ${GROUP_LABEL[g]} | ${rs.length} | ${c('protect')} (${pct(c('protect'), rs.length)}) | ${c('watch')} (${pct(c('watch'), rs.length)}) | ${c('calm')} (${pct(c('calm'), rs.length)}) |`);
}
lines.push('');

const dmg = inGroup('damaging');
const anyHail = ok.filter((r) => r.e.type === 'hail' && r.e.damaging !== false);
const ctl = inGroup('control');
const rate = (rs: Row[], pred: (r: Row) => boolean) => pct(rs.filter(pred).length, rs.length);
lines.push('## Motor vs INUMET', '');
lines.push(
  '- **Detección**: de las granizadas dañinas, en cuántas avisó.',
  '- **Falsas alarmas en controles**: de los días de tormenta sin granizo, en cuántos alarmó de más.',
  '',
);
lines.push(`| Criterio | Detección dañino (n=${dmg.length}) | Detección dañino + sin dato (n=${anyHail.length}) | Falsas alarmas en controles (n=${ctl.length}) |`, '|---|---|---|---|');
lines.push(`| Motor: "Atento" o más | ${rate(dmg, (r) => r.level !== 'calm')} | ${rate(anyHail, (r) => r.level !== 'calm')} | ${rate(ctl, (r) => r.level !== 'calm')} |`);
lines.push(`| Motor: solo "Protegelo" | ${rate(dmg, (r) => r.level === 'protect')} | ${rate(anyHail, (r) => r.level === 'protect')} | ${rate(ctl, (r) => r.level === 'protect')} |`);
lines.push(`| INUMET: había alerta (casos con dato) | ${rate(dmg.filter(known), alerted)} | ${rate(anyHail.filter(known), alerted)} | ${rate(ctl.filter(known), alerted)} |`);
lines.push('');
lines.push('### Entrenamiento vs prueba', '');
lines.push(
  'Los umbrales v0.2 se ajustaron **solo con 2021–2024**. Lo que vale como estimación honesta es la fila de **prueba (2025–2026)**.',
  '',
);
lines.push('| Período | Detección "atento o más" | FA "atento o más" | Detección "protegelo" | FA "protegelo" |', '|---|---|---|---|---|');
for (const [label, inPeriod] of [
  ['Entrenamiento 2021–2024', (r: Row) => r.e.date < '2025-01-01'],
  ['**Prueba 2025–2026**', (r: Row) => r.e.date >= '2025-01-01'],
  ['Prueba, estación fría', (r: Row) => r.e.date >= '2025-01-01' && seasonOf(r.e) === 'cold'],
  ['Prueba, estación cálida', (r: Row) => r.e.date >= '2025-01-01' && seasonOf(r.e) === 'warm'],
] as const) {
  const p = anyHail.filter(inPeriod);
  const n = ctl.filter(inPeriod);
  lines.push(`| ${label} (${p.length} granizo / ${n.length} control) | ${rate(p, (r) => r.level !== 'calm')} | ${rate(n, (r) => r.level !== 'calm')} | ${rate(p, (r) => r.level === 'protect')} | ${rate(n, (r) => r.level === 'protect')} |`);
}
lines.push('');
lines.push('Los controles se eligieron con alerta de INUMET, así que INUMET alarma en casi todos por construcción. La pregunta es si el motor separa **dentro** de los días con alerta.', '');

lines.push('## Ingredientes típicos de cada grupo (mediana del punto más favorable)', '');
lines.push('| Grupo | MUCAPE J/kg | Cizalladura m/s | Gradiente °C/km | T500 °C | SHIP | Lluvia conv. máx mm/h |', '|---|---|---|---|---|---|---|');
for (const g of GROUPS) {
  const rs = inGroup(g);
  lines.push(`| ${GROUP_LABEL[g]} | ${f(median(rs.map((r) => r.muCape)), 0)} | ${f(median(rs.map((r) => r.shear)))} | ${f(median(rs.map((r) => r.lapse)), 2)} | ${f(median(rs.map((r) => r.t500)))} | ${f(median(rs.map((r) => r.ship)), 2)} | ${f(median(rs.map((r) => r.showers)))} |`);
}
lines.push('', `Reglas v${ENGINE_VERSION}: gradiente 700–500 ≥ ${RULES.lapse700500CKm} °C/km y energía×viento (WMAXSHEAR) ≥ ${RULES.wmaxshearWatch} (atento) / ≥ ${RULES.wmaxshearProtect} m²/s² con tormentas en el modelo (protegelo).`, '');

lines.push('## Caso por caso', '');
lines.push('| Fecha | Lugar | Grupo | INUMET | Motor | Pico | MUCAPE | Ciz. | Grad. | T500 | SHIP | Conv. |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${r.e.date} | ${r.e.place} | ${groupOf(r.e)} | ${r.e.inumetAlert.status} | ${r.error ? 'error' : r.level} | ${r.peakTime.slice(5)} | ${f(r.muCape, 0)} | ${f(r.shear)} | ${f(r.lapse, 2)} | ${f(r.t500)} | ${f(r.ship, 2)} | ${f(r.showers)} |`);
}

const reportsDir = join(import.meta.dirname, '../../reports');
await mkdir(reportsDir, { recursive: true });
await writeFile(join(reportsDir, 'backtest.md'), lines.join('\n') + '\n');
const csv = ['id,date,type,group,damaging,inumet,level,environment,peak_time,mucape,shear06,lapse,t500,ship,max_showers,error'];
for (const r of rows) {
  csv.push([r.e.id, r.e.date, r.e.type, groupOf(r.e), r.e.damaging, r.e.inumetAlert.status, r.level, r.env, r.peakTime, r.muCape.toFixed(0), f(r.shear), f(r.lapse, 2), f(r.t500), f(r.ship, 2), r.showers.toFixed(1), r.error ? JSON.stringify(r.error) : ''].join(','));
}
await writeFile(join(reportsDir, 'backtest.csv'), csv.join('\n') + '\n');
console.log(`\nReporte: reports/backtest.md (${ok.length} casos)`);
