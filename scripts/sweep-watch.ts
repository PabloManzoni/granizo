// Barrido del umbral de "Atento" (RULES.wmaxshearWatch) sobre los casos históricos, sin red (usa la caché de Open-Meteo).
// "Protegelo" no cambia: se fija en 1200. Uso: node scripts/sweep-watch.ts
import '../src/data/nodeCache.ts';
import { assessPointHour, assessWindow, combineModels } from '../src/engine/classify.ts';
import { NEIGHBORHOOD, RULES } from '../src/engine/config.ts';
import { computeIngredients } from '../src/engine/ingredients.ts';
import { fetchProfiles } from '../src/data/openMeteo.ts';
import { neighborhood } from '../src/geo/neighborhood.ts';
import { loadEvents, seasonOf, windowFor } from '../src/data/events.ts';

const MODELS = [['GFS', 'gfs_seamless', '2021-03-01'], ['ECMWF', 'ecmwf_ifs025', '2024-06-01']] as const;
const events = await loadEvents();
// Granizo = dañino o sin dato de tamaño (se excluye graupel / chico), igual que la investigación v0.3.
const cases = events.filter((e) => e.type === 'control' || e.damaging !== false);
const prof: { e: (typeof cases)[number]; ph: Record<string, ReturnType<typeof computeIngredients>[] & any> }[] = [];
for (const e of cases) {
  const { from, to } = windowFor(e);
  const pts = neighborhood({ lat: e.lat, lon: e.lon }, NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm);
  const per: Record<string, any> = {};
  for (const [name, id, start] of MODELS) {
    if (from < start) continue;
    try {
      const ps = await fetchProfiles({ source: 'historical', points: pts, startDate: from.slice(0, 10), endDate: to.slice(0, 10), model: id });
      per[name] = ps.filter((p) => p.time >= from && p.time <= to).map((p) => ({ p, ing: computeIngredients(p) }));
    } catch {}
  }
  prof.push({ e, ph: per });
}

const classify = (watch: number) => {
  (RULES as { wmaxshearWatch: number }).wmaxshearWatch = watch;
  return prof.map(({ e, ph }) => {
    const res = Object.entries(ph).filter(([, v]) => (v as any[]).length).map(([model, v]) => ({
      model,
      assessment: { ...assessWindow((v as any[]).map(({ p, ing }) => assessPointHour(p.time, p.lat, p.lon, ing))), dataPoints: 0 },
    }));
    return { e, level: res.length ? combineModels(res as any).level : 'calm' };
  });
};

const rate = (rows: ReturnType<typeof classify>, pred: (e: any) => boolean, atLeast: 'watch' | 'protect') => {
  const rs = rows.filter((r) => pred(r.e));
  const hit = (r: (typeof rows)[number]) => (atLeast === 'watch' ? r.level !== 'calm' : r.level === 'protect');
  const h = rs.filter((r) => r.e.type === 'hail'), c = rs.filter((r) => r.e.type === 'control');
  const pod = h.filter(hit).length / (h.length || 1), pofd = c.filter(hit).length / (c.length || 1);
  return { pod, pofd, tss: pod - pofd, nh: h.length, nc: c.length };
};
const f = (r: ReturnType<typeof rate>) => `${(100 * r.pod).toFixed(0)}%/${(100 * r.pofd).toFixed(0)}% TSS ${r.tss.toFixed(2)} (${r.nh}/${r.nc})`;
const train = (e: any) => e.date < '2025-01-01', test = (e: any) => e.date >= '2025-01-01';
const cold = (e: any) => seasonOf(e) === 'cold', warm = (e: any) => seasonOf(e) === 'warm';
console.log('umbral | entrenamiento (det/FA) | prueba | prueba fría | prueba cálida | todos');
for (const w of [400, 500, 600, 700, 800, 900, 1000, 1100]) {
  const rows = classify(w);
  console.log(w, '|', f(rate(rows, train, 'watch')), '|', f(rate(rows, test, 'watch')), '|', f(rate(rows, (e) => test(e) && cold(e), 'watch')), '|', f(rate(rows, (e) => test(e) && warm(e), 'watch')), '|', f(rate(rows, () => true, 'watch')));
}
const rows = classify(400);
console.log('protegelo (fijo)', f(rate(rows, train, 'protect')), '|', f(rate(rows, test, 'protect')));
