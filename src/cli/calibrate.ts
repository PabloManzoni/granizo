// Calibración: qué variables separan los días de granizo de los controles.
// Para cada caso toma el valor extremo de cada variable en la zona y la ventana, y calcula:
// - AUC: probabilidad de que un día de granizo tenga un valor "peor" que un día sin granizo (0.5 = no sirve, 1 = perfecto).
// - El umbral que maximiza detección − falsas alarmas (Peirce / True Skill Statistic).
// Uso: npm run calibrate
import '../data/nodeCache.ts'; // caché en disco de Open-Meteo
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NEIGHBORHOOD } from '../engine/config.ts';
import { computeIngredients } from '../engine/ingredients.ts';
import type { Ingredients } from '../engine/types.ts';
import { fetchProfiles } from '../data/openMeteo.ts';
import { loadEvents, seasonOf, windowFor, type HailEvent } from '../data/events.ts';
import { neighborhood } from '../geo/neighborhood.ts';

/** WMAXSHEAR = √(2·MUCAPE)·cizalladura 0–6 km (m²/s²), usado en climatologías globales de tormentas severas. */
const wmaxshear = (i: Ingredients) => Math.sqrt(2 * i.muCapeJkg) * (i.shear06Ms ?? 0);

const VARIABLES: { key: string; label: string; perPointHour: (i: Ingredients) => number | null }[] = [
  { key: 'mucape', label: 'MUCAPE (J/kg)', perPointHour: (i) => i.muCapeJkg },
  { key: 'shear', label: 'Cizalladura 0–6 km (m/s)', perPointHour: (i) => i.shear06Ms },
  { key: 'lapse', label: 'Gradiente 700–500 (°C/km)', perPointHour: (i) => i.lapse700500CKm },
  { key: 'coldAloft', label: '−T500 (°C, más = más frío)', perPointHour: (i) => (i.t500C === null ? null : -i.t500C) },
  { key: 'ship', label: 'SHIP', perPointHour: (i) => i.ship },
  { key: 'wmaxshear', label: 'WMAXSHEAR (m²/s²)', perPointHour: wmaxshear },
  { key: 'mixr', label: 'Humedad parcela MU (g/kg)', perPointHour: (i) => i.muMixingRatioGkg },
  { key: 'showers', label: 'Lluvia convectiva modelo (mm/h)', perPointHour: (i) => i.showersMm },
  { key: 'precip', label: 'Lluvia total modelo (mm/h)', perPointHour: (i) => i.precipitationMm },
  // Combinados en el mismo punto-hora: solo cuentan si hay energía.
  { key: 'coldWithCape', label: '−T500 donde MUCAPE ≥ 500', perPointHour: (i) => (i.muCapeJkg >= 500 && i.t500C !== null ? -i.t500C : null) },
  { key: 'shearWithCape', label: 'Cizalladura donde MUCAPE ≥ 500', perPointHour: (i) => (i.muCapeJkg >= 500 ? i.shear06Ms : null) },
];

interface CaseStats {
  e: HailEvent;
  values: Record<string, number | null>;
}

async function caseStats(e: HailEvent): Promise<CaseStats> {
  const { from, to } = windowFor(e);
  const profiles = await fetchProfiles({
    source: 'historical',
    points: neighborhood({ lat: e.lat, lon: e.lon }, NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm),
    startDate: from.slice(0, 10),
    endDate: to.slice(0, 10),
  });
  const ings = profiles.filter((p) => p.time >= from && p.time <= to).map(computeIngredients);
  const values: Record<string, number | null> = {};
  for (const v of VARIABLES) {
    const xs = ings.map(v.perPointHour).filter((x): x is number => x !== null);
    values[v.key] = xs.length ? Math.max(...xs) : null;
  }
  return { e, values };
}

function auc(pos: number[], neg: number[]): number {
  let s = 0;
  for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

function bestThreshold(pos: number[], neg: number[]) {
  const candidates = [...new Set([...pos, ...neg])].sort((a, b) => a - b);
  let best = { threshold: NaN, pod: 0, pofd: 0, tss: -Infinity };
  for (const t of candidates) {
    const pod = pos.filter((x) => x >= t).length / pos.length;
    const pofd = neg.filter((x) => x >= t).length / neg.length;
    if (pod - pofd > best.tss) best = { threshold: t, pod, pofd, tss: pod - pofd };
  }
  return best;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

const events = await loadEvents();
const stats: CaseStats[] = [];
for (const e of events) stats.push(await caseStats(e));

const isDamaging = (s: CaseStats) => s.e.type === 'hail' && s.e.damaging === true;
const isHail = (s: CaseStats) => s.e.type === 'hail' && s.e.damaging !== false;
const isControl = (s: CaseStats) => s.e.type === 'control';

const lines: string[] = ['# Calibración — qué variables separan granizo de controles', ''];
lines.push(
  'Valor de cada caso = el máximo en la zona (~40 km) y la ventana de 24 h.',
  '',
  '- **AUC**: probabilidad de que un día de granizo tenga un valor más alto que un día de control. 0.5 = no separa, 1 = separa perfecto; por debajo de 0.5 separa "al revés".',
  '- **Mejor umbral**: el que maximiza detección − falsas alarmas. Con muestras chicas es orientativo: puede estar sobreajustado.',
  '- Se muestra también **por estación**, porque el ciclo anual puede fingir una señal (p. ej. "más frío en altura" = "es invierno").',
  '',
);

function section(title: string, pos: CaseStats[], neg: CaseStats[]) {
  lines.push(`## ${title}`, '', `Granizo n=${pos.length} · controles n=${neg.length}`, '');
  if (pos.length < 3 || neg.length < 3) {
    lines.push('_Muy pocos casos para concluir._', '');
    return;
  }
  lines.push('| Variable | Mediana granizo | Mediana control | AUC | Mejor umbral | Detección | Falsas alarmas |', '|---|---|---|---|---|---|---|');
  const rows = VARIABLES.map((v) => {
    const p = pos.map((s) => s.values[v.key]).filter((x): x is number => x !== null);
    const n = neg.map((s) => s.values[v.key]).filter((x): x is number => x !== null);
    return { v, p, n, auc: p.length && n.length ? auc(p, n) : NaN, best: bestThreshold(p, n) };
  }).sort((a, b) => Math.abs(b.auc - 0.5) - Math.abs(a.auc - 0.5));
  for (const r of rows) {
    lines.push(
      `| ${r.v.label} | ${median(r.p).toFixed(1)} | ${median(r.n).toFixed(1)} | ${r.auc.toFixed(2)} | ≥ ${r.best.threshold.toFixed(1)} | ${Math.round(r.best.pod * 100)}% | ${Math.round(r.best.pofd * 100)}% |`,
    );
  }
  lines.push('');
}

section('Granizo dañino vs controles (todo el año)', stats.filter(isDamaging), stats.filter(isControl));
section('Granizo (dañino + sin dato) vs controles (todo el año)', stats.filter(isHail), stats.filter(isControl));
for (const [season, label] of [['warm', 'cálida (oct–mar)'], ['cold', 'fría (abr–sep)']] as const) {
  const inSeason = (s: CaseStats) => seasonOf(s.e) === season;
  section(`Estación ${label}: granizo (dañino + sin dato) vs controles`, stats.filter((s) => isHail(s) && inSeason(s)), stats.filter((s) => isControl(s) && inSeason(s)));
}

// Pares emparejados: cada control con su granizada de la misma época.
const byId = new Map(stats.map((s) => [s.e.id, s]));
const pairs = stats
  .filter((s) => isControl(s) && s.e.matchedTo && byId.has(s.e.matchedTo))
  .map((c) => ({ hail: byId.get(c.e.matchedTo!)!, control: c }));
if (pairs.length) {
  lines.push('## Pares emparejados (granizada vs control de la misma época)', '', `Pares: ${pairs.length}. "Gana granizo" = en cuántos pares el día de granizo tuvo el valor más alto.`, '');
  lines.push('| Variable | Gana granizo | Gana control |', '|---|---|---|');
  for (const v of VARIABLES) {
    const valid = pairs.filter((p) => p.hail.values[v.key] !== null && p.control.values[v.key] !== null);
    const wins = valid.filter((p) => p.hail.values[v.key]! > p.control.values[v.key]!).length;
    lines.push(`| ${v.label} | ${wins}/${valid.length} | ${valid.length - wins}/${valid.length} |`);
  }
  lines.push('');
}

const dir = join(import.meta.dirname, '../../reports');
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'calibration.md'), lines.join('\n') + '\n');
const csv = ['id,date,season,type,damaging,matched_to,' + VARIABLES.map((v) => v.key).join(',')];
for (const s of stats) csv.push([s.e.id, s.e.date, seasonOf(s.e), s.e.type, s.e.damaging, s.e.matchedTo ?? '', ...VARIABLES.map((v) => s.values[v.key]?.toFixed(2) ?? '')].join(','));
await writeFile(join(dir, 'calibration.csv'), csv.join('\n') + '\n');
console.log(lines.join('\n'));
