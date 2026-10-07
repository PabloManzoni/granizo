// Extrae predictores candidatos por punto-hora desde la caché de Open-Meteo (SIN red).
// Salida: research/pointhours.csv (todas las horas descargadas, con flag inWindow) y research/verdicts.json
// (veredicto oficial v0.2 por modelo y combinado, replicando assess()).
// Uso: node extract.ts
const REPO = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
// Bloquear la red: cualquier fallo de caché revienta en vez de consultar Open-Meteo.
globalThis.fetch = (async () => {
  throw new Error('NO_NETWORK');
}) as typeof fetch;

const { configureOpenMeteo, fetchProfiles } = await import(`${REPO}/src/data/openMeteo.ts`);
await import(`${REPO}/src/data/nodeCache.ts`);
configureOpenMeteo({ attempts: 1 });
const { loadEvents, windowFor, seasonOf } = await import(`${REPO}/src/data/events.ts`);
const { neighborhood } = await import(`${REPO}/src/geo/neighborhood.ts`);
const { NEIGHBORHOOD } = await import(`${REPO}/src/engine/config.ts`);
const { computeIngredients, bulkShear06, freezingLevelFromProfile } = await import(`${REPO}/src/engine/ingredients.ts`);
const { classifyEnvironment, assessPointHour, assessWindow, combineModels } = await import(`${REPO}/src/engine/classify.ts`);
const T = await import(`${REPO}/src/engine/thermo.ts`);
import { mkdirSync, writeFileSync } from 'node:fs';

// Salida: .cache/research-v0.3 (los CSV de punto-horas pesan ~30 MB, no van al repo).
const OUT = `${REPO}/.cache/research-v0.3`;
const RD = 287.04, KAPPA = 0.2857, ZERO = 273.15, G = 9.80665, EPS = 0.622;

type Lvl = { p: number; t: number; td: number; z: number };

function tdFromMixing(wKgKg: number, p: number) {
  const e = (wKgKg * p) / (EPS + wKgKg);
  const l = Math.log(e / 6.112);
  return (243.5 * l) / (17.67 - l);
}
function wetBulbC(t: number, td: number, p: number) {
  const e = T.satVaporPressureHpa(Math.min(td, t));
  let lo = Math.min(td, t) - 1, hi = t;
  for (let i = 0; i < 40; i++) {
    const tw = (lo + hi) / 2;
    const f = T.satVaporPressureHpa(tw) - 0.00066 * (1 + 0.00115 * tw) * p * (t - tw) - e;
    if (f > 0) hi = tw; else lo = tw;
  }
  return (lo + hi) / 2;
}
/** Interpolación en ln p de T, Td, z dentro de env (presión descendente). */
function at(env: Lvl[], p: number): Lvl | null {
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i], b = env[i + 1];
    if (p <= a.p && p >= b.p) {
      const f = Math.log(a.p / p) / Math.log(a.p / b.p);
      return { p, t: a.t + f * (b.t - a.t), td: a.td + f * (b.td - a.td), z: a.z + f * (b.z - a.z) };
    }
  }
  return null;
}
/** Altura (m s.n.m.) donde la serie (z, x) cruza `iso` bajando (primer cruce desde abajo). */
function crossHeight(pts: { z: number; x: number }[], iso: number): number | null {
  if (pts[0].x <= iso) return pts[0].z;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (a.x > iso && b.x <= iso) return a.z + ((a.x - iso) / (a.x - b.x)) * (b.z - a.z);
  }
  return null;
}
function pressureAtHeight(env: Lvl[], z: number): number | null {
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i], b = env[i + 1];
    if (z >= a.z && z <= b.z) {
      const f = (z - a.z) / (b.z - a.z);
      return Math.exp(Math.log(a.p) + f * (Math.log(b.p) - Math.log(a.p)));
    }
  }
  return null;
}

/** Perfil de parcela con muestras cada 10 hPa: p, z, diff Tv. */
function parcelSamples(start: { p: number; t: number; td: number }, env: Lvl[]) {
  const t0 = start.t + ZERO;
  const td0 = Math.min(start.td, start.t) + ZERO;
  const w0 = T.satMixingRatio(td0 - ZERO, start.p);
  const tLcl = T.lclTempK(t0, td0);
  const pLcl = start.p * Math.pow(tLcl / t0, 1 / KAPPA);
  const the = T.thetaE(t0, start.p, w0, tLcl);
  const top = env[env.length - 1].p;
  const s: { p: number; z: number; diff: number; tp: number }[] = [];
  for (let p = start.p; p >= top; p -= 10) {
    const e = at(env, p);
    if (!e) continue;
    let tp: number, wp: number;
    if (p >= pLcl) { tp = t0 * Math.pow(p / start.p, KAPPA); wp = w0; }
    else { tp = T.moistAdiabatTempK(the, p); wp = T.satMixingRatio(tp - ZERO, p); }
    const tve = T.virtualTempK(e.t + ZERO, T.satMixingRatio(e.td, p));
    s.push({ p, z: e.z, diff: T.virtualTempK(tp, wp) - tve, tp: tp - ZERO });
  }
  return { s, pLcl, the };
}
function capeBetween(s: { p: number; z: number; diff: number }[], zLo: number, zHi: number) {
  let c = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    const zm = (a.z + b.z) / 2;
    if (zm < zLo || zm > zHi) continue;
    const seg = RD * ((a.diff + b.diff) / 2) * Math.log(a.p / b.p);
    if (seg > 0) c += seg;
  }
  return c;
}

function toUV(w: { speedMs: number; directionDeg: number }) {
  const r = (w.directionDeg * Math.PI) / 180;
  return { u: -w.speedMs * Math.sin(r), v: -w.speedMs * Math.cos(r) };
}
function windAt(prof: any, zAsl: number) {
  const pts = [{ z: prof.elevationM + 10, ...toUV(prof.surface.wind10m) }, ...prof.winds.map((w: any) => ({ z: w.heightM, ...toUV(w.wind) }))].sort((a, b) => a.z - b.z);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (zAsl >= a.z && zAsl <= b.z) {
      const f = (zAsl - a.z) / (b.z - a.z);
      return { u: a.u + f * (b.u - a.u), v: a.v + f * (b.v - a.v) };
    }
  }
  return null;
}
const mag = (a: any, b: any) => (a && b ? Math.hypot(a.u - b.u, a.v - b.v) : null);

function features(prof: any) {
  const ing = computeIngredients(prof);
  const elev = prof.elevationM;
  const env: Lvl[] = [
    { p: prof.surface.pressureHpa, t: prof.surface.temperatureC, td: prof.surface.dewPointC, z: elev + 2 },
    ...prof.levels.map((l: any) => ({ p: l.pressureHpa, t: l.temperatureC, td: l.dewPointC, z: l.heightM })),
  ];
  const lv = (p: number) => prof.levels.find((l: any) => l.pressureHpa === p) ?? null;
  const psfc = env[0].p;
  const f: Record<string, number | null> = {};
  f.mucape = ing.muCapeJkg;
  f.mucin = ing.muCinJkg;
  f.mu_start = ing.muStartHpa;
  f.mu_elevated = psfc - ing.muStartHpa; // hPa sobre la superficie
  f.mu_mixr = ing.muMixingRatioGkg;
  f.shear06 = ing.shear06Ms;
  f.lapse75 = ing.lapse700500CKm;
  f.t500 = ing.t500C;
  f.ship = ing.ship;
  f.wmax = ing.wmaxshearM2s2;
  f.showers = ing.showersMm;
  f.precip = ing.precipitationMm;
  f.model_cape = ing.modelCapeJkg;
  f.env_v02 = ['weak', 'supportive', 'strong'].indexOf(classifyEnvironment(ing));
  // Temperaturas y gradientes
  const l850 = lv(850), l700 = lv(700), l500 = lv(500), l600 = lv(600);
  f.t700 = l700?.temperatureC ?? null;
  f.lapse85 = l850 && l500 ? (l850.temperatureC - l500.temperatureC) / ((l500.heightM - l850.heightM) / 1000) : null;
  const z3 = elev + 3000;
  const e3 = (() => { const p3 = pressureAtHeight(env, z3); return p3 ? at(env, p3) : null; })();
  f.lapse03 = e3 ? (env[0].t - e3.t) / ((e3.z - env[0].z) / 1000) : null;
  f.kindex = l850 && l700 && l500 ? l850.temperatureC - l500.temperatureC + l850.dewPointC - (l700.temperatureC - l700.dewPointC) : null;
  f.totals = l850 && l500 ? l850.temperatureC + l850.dewPointC - 2 * l500.temperatureC : null;
  // Humedad
  const rh = (l: any) => (l ? T.satVaporPressureHpa(Math.min(l.dewPointC, l.temperatureC)) / T.satVaporPressureHpa(l.temperatureC) : null);
  const rhm = (ps: number[]) => { const v = ps.map((p) => rh(lv(p))).filter((x): x is number => x !== null); return v.length === ps.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  f.rh75 = rhm([700, 600, 500]);
  f.rh87 = rhm([850, 700]);
  f.rh85_50 = rhm([850, 700, 600, 500]);
  {
    const p3 = pressureAtHeight(env, elev + 3000), p6 = pressureAtHeight(env, elev + 6000);
    const a3 = p3 ? at(env, p3) : null, a6 = p6 ? at(env, p6) : null;
    f.lapse36 = a3 && a6 ? (a3.t - a6.t) / 3 : null;
  }
  let pw = 0;
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i], b = env[i + 1];
    if (b.p < 300) break;
    const wa = T.satMixingRatio(Math.min(a.td, a.t), a.p), wb = T.satMixingRatio(Math.min(b.td, b.t), b.p);
    pw += (((wa + wb) / 2) * (a.p - b.p) * 100) / G; // kg/m2 = mm
  }
  f.pw = pw;
  f.td2 = prof.surface.dewPointC;
  f.t2 = prof.surface.temperatureC;
  // Isotermas y bulbo húmedo
  const ptsT = env.map((e) => ({ z: e.z, x: e.t }));
  const ptsW = env.map((e) => ({ z: e.z, x: wetBulbC(e.t, e.td, e.p) }));
  const fz = crossHeight(ptsT, 0);
  f.frz_agl = fz === null ? null : fz - elev;
  const wbz = crossHeight(ptsW, 0);
  f.wbz_agl = wbz === null ? null : wbz - elev;
  const z10 = crossHeight(ptsT, -10), z20 = crossHeight(ptsT, -20), z30 = crossHeight(ptsT, -30);
  f.z10_agl = z10 === null ? null : z10 - elev;
  f.hgz_depth = z10 !== null && z30 !== null ? z30 - z10 : null;
  // Parcelas
  const mu = parcelSamples({ p: ing.muStartHpa, t: at(env, ing.muStartHpa)?.t ?? env[0].t, td: at(env, ing.muStartHpa)?.td ?? env[0].td }, env);
  f.cape_hgz = z10 !== null && z30 !== null ? capeBetween(mu.s, z10, z30) : null;
  f.cape_below_m10 = z10 !== null ? capeBetween(mu.s, -1e9, z10) : null;
  f.cape_above_frz = fz !== null ? capeBetween(mu.s, fz, 1e9) : null;
  f.cape_above_m10 = z10 !== null ? capeBetween(mu.s, z10, 1e9) : null;
  const s500 = mu.s.find((x) => x.p === 500) ?? mu.s.reduce((b, x) => (Math.abs(x.p - 500) < Math.abs(b.p - 500) ? x : b), mu.s[0]);
  f.li_mu = l500 && s500 ? l500.temperatureC - s500.tp : null;
  // EL (última muestra con flotación positiva)
  let elz: number | null = null;
  for (const x of mu.s) if (x.diff > 0) elz = x.z;
  f.el_agl = elz === null ? null : elz - elev;
  {
    // Cizalladura efectiva de la parcela MU: del origen de la parcela a la mitad de su EL
    const zo = at(env, ing.muStartHpa)?.z ?? env[0].z;
    if (elz !== null && elz > zo && ing.muCapeJkg >= 100) {
      const lo = zo <= elev + 10 ? toUV(prof.surface.wind10m) : windAt(prof, zo);
      const hi = windAt(prof, zo + (elz - zo) / 2);
      f.eff_shear = mag(hi, lo);
    } else f.eff_shear = 0;
  }
  // SB
  const sb = T.liftParcel({ pressureHpa: env[0].p, temperatureC: env[0].t, dewPointC: env[0].td }, env.map((e) => ({ pressureHpa: e.p, temperatureC: e.t, dewPointC: e.td })));
  f.sbcape = sb.capeJkg;
  f.sbcin = sb.cinJkg;
  // ML 100 hPa
  let th = 0, w = 0, n = 0;
  for (let p = psfc; p >= psfc - 100; p -= 5) {
    const e = at(env, p);
    if (!e) continue;
    th += (e.t + ZERO) * Math.pow(1000 / p, KAPPA);
    w += T.satMixingRatio(Math.min(e.td, e.t), p);
    n++;
  }
  if (n) {
    th /= n; w /= n;
    const tml = th * Math.pow(psfc / 1000, KAPPA) - ZERO;
    const tdml = Math.min(tdFromMixing(w, psfc), tml);
    const ml = T.liftParcel({ pressureHpa: psfc, temperatureC: tml, dewPointC: tdml }, env.map((e) => ({ pressureHpa: e.p, temperatureC: e.t, dewPointC: e.td })));
    f.mlcape = ml.capeJkg;
    f.mlcin = ml.cinJkg;
    f.ml_mixr = w * 1000;
    const zl = at(env, ml.lclHpa);
    f.lcl_agl = zl ? zl.z - elev : null;
  } else { f.mlcape = f.mlcin = f.ml_mixr = f.lcl_agl = null; }
  // Viento
  const sfc = toUV(prof.surface.wind10m);
  const wl = (p: number) => { const x = prof.winds.find((q: any) => q.pressureHpa === p); return x ? toUV(x.wind) : null; };
  f.shear03 = mag(windAt(prof, elev + 3000), sfc);
  f.shear0_850 = mag(wl(850), sfc);
  f.shear850_500 = mag(wl(500), wl(850));
  f.shear700_400 = mag(wl(400), wl(700));
  const w5 = prof.winds.find((q: any) => q.pressureHpa === 500);
  f.wspd500 = w5 ? w5.wind.speedMs : null;
  const w8 = prof.winds.find((q: any) => q.pressureHpa === 850);
  f.wspd850 = w8 ? w8.wind.speedMs : null;
  const whgz = z20 !== null ? windAt(prof, z20) : null;
  f.wspd_hgz = whgz ? Math.hypot(whgz.u, whgz.v) : null;
  f.v850 = w8 ? toUV(w8.wind).v : null; // v>0 = del norte? (v = componente hacia el norte). Viento del N => v<0
  // Compuestos
  f.wmax_ml = f.shear06 !== null && f.mlcape !== null ? Math.sqrt(2 * f.mlcape) * f.shear06 : null;
  f.wmax_hgz = f.cape_hgz !== null && f.shear06 !== null ? Math.sqrt(2 * f.cape_hgz) * f.shear06 : null;
  f.lapse_x_wmax = f.wmax !== null && f.lapse75 !== null ? (f.wmax * Math.max(f.lapse75 - 5.5, 0)) / 1000 : null;
  f.lhp_termA = f.hgz_depth !== null && f.lapse75 !== null ? (f.sbcape - 2000) / 1000 + (3200 - f.hgz_depth) / 500 + (f.lapse75 - 6.5) / 2 : null;
  f.wmax_m10 = f.cape_above_m10 !== null && f.shear06 !== null ? Math.sqrt(2 * f.cape_above_m10) * f.shear06 : null;
  f.wmax_eff = f.eff_shear !== null ? Math.sqrt(2 * ing.muCapeJkg) * f.eff_shear : null;
  f.cape_x_lapse = f.lapse75 !== null ? (ing.muCapeJkg * Math.max(f.lapse75 - 5.5, 0)) / 1000 : null;
  return f;
}

const events = await loadEvents();
const HIST_START: Record<string, string> = { gfs_seamless: '2021-03-01', ecmwf_ifs025: '2024-06-01' };
const MODEL_NAMES: Record<string, string> = { gfs_seamless: 'GFS', ecmwf_ifs025: 'ECMWF' };
let header: string[] | null = null;
const rows: string[] = [];
const verdicts: any = {};
const R = (x: number) => Math.round(x * 1000) / 1000;
let missing = 0;
for (const e of events) {
  const { from, to } = windowFor(e);
  const points = neighborhood({ lat: e.lat, lon: e.lon }, NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm);
  const per: any[] = [];
  verdicts[e.id] = { models: {} };
  for (const model of ['gfs_seamless', 'ecmwf_ifs025']) {
    if (from < HIST_START[model]) continue;
    let profiles: any[];
    try {
      profiles = await fetchProfiles({ source: 'historical', points, startDate: from.slice(0, 10), endDate: to.slice(0, 10), model });
    } catch (err) {
      missing++;
      console.error('MISS', e.id, model, String(err).slice(0, 80));
      continue;
    }
    // Veredicto oficial por modelo
    const inW = profiles.filter((p) => p.time >= from && p.time <= to);
    const pha = inW.map((p) => assessPointHour(p.time, p.lat, p.lon, computeIngredients(p)));
    const a = assessWindow(pha);
    per.push({ model: MODEL_NAMES[model], assessment: a });
    verdicts[e.id].models[model] = { level: a.level, trigger: a.trigger.present, peakTime: a.peak.time, peakEnv: a.peak.environment, strongCount: a.counts.strong, supportiveCount: a.counts.supportive, n: a.counts.pointHours };
    // Distancia al centro
    const kmLon = 111.32 * Math.cos((e.lat * Math.PI) / 180);
    const cells = [...new Set(profiles.map((p) => `${p.lat},${p.lon}`))].map((k) => { const [la, lo] = k.split(',').map(Number); return { k, d: Math.hypot((la - e.lat) * 111.32, (lo - e.lon) * kmLon) }; });
    const nearest = cells.reduce((b, c) => (c.d < b.d ? c : b)).k;
    for (const p of profiles) {
      const f = features(p);
      const meta: Record<string, string | number> = {
        id: e.id, model, time: p.time, lat: p.lat, lon: p.lon,
        dist_km: R(Math.hypot((p.lat - e.lat) * 111.32, (p.lon - e.lon) * kmLon)),
        center: `${p.lat},${p.lon}` === nearest ? 1 : 0,
        in_window: p.time >= from && p.time <= to ? 1 : 0,
        elev: p.elevationM,
      };
      if (!header) header = [...Object.keys(meta), ...Object.keys(f)];
      rows.push(header.map((h) => { const v = h in meta ? meta[h] : f[h]; return v === null || v === undefined ? '' : typeof v === 'number' ? String(R(v)) : String(v); }).join(','));
    }
  }
  if (per.length) {
    const c = combineModels(per);
    verdicts[e.id].combined = c.level;
    verdicts[e.id].storm = c.storm;
  }
  verdicts[e.id].event = { type: e.type, date: e.date, localTime: e.localTime, damaging: e.damaging, season: seasonOf(e), matchedTo: e.matchedTo ?? null, place: e.place, lat: e.lat, lon: e.lon, inumet: e.inumetAlert.status, confidence: e.confidence, from, to, hailSizeCm: e.hailSizeCm };
  process.stdout.write('.');
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/pointhours.csv`, [header!.join(','), ...rows].join('\n') + '\n');
writeFileSync(`${OUT}/verdicts.json`, JSON.stringify(verdicts, null, 1));
console.log(`\nrows=${rows.length} missing=${missing}`);
