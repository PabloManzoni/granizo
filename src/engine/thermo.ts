// Termodinámica de parcelas: lo justo para calcular CAPE/CIN de la parcela más inestable.
// Fórmulas de Bolton (1980), "The computation of equivalent potential temperature".

const RD = 287.04; // J/(kg·K)
const EPS = 0.622;
const KAPPA = 0.2857; // Rd/cp
const ZERO_C = 273.15;

/** Presión de vapor de saturación (hPa) sobre agua líquida. */
export function satVaporPressureHpa(tempC: number): number {
  return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
}

/** Razón de mezcla (kg/kg) para una presión de vapor dada. */
export function mixingRatio(vaporHpa: number, pressureHpa: number): number {
  return (EPS * vaporHpa) / (pressureHpa - vaporHpa);
}

/** Razón de mezcla de saturación (kg/kg). Con el punto de rocío da la razón de mezcla real. */
export function satMixingRatio(tempC: number, pressureHpa: number): number {
  return mixingRatio(satVaporPressureHpa(tempC), pressureHpa);
}

export function virtualTempK(tempK: number, mixingRatioKgKg: number): number {
  return (tempK * (1 + mixingRatioKgKg / EPS)) / (1 + mixingRatioKgKg);
}

/** Temperatura en el nivel de condensación (K). Bolton eq. 15. */
export function lclTempK(tempK: number, dewPointK: number): number {
  return 1 / (1 / (dewPointK - 56) + Math.log(tempK / dewPointK) / 800) + 56;
}

/** Temperatura potencial equivalente (K). Bolton eq. 43. */
export function thetaE(tempK: number, pressureHpa: number, mixingRatioKgKg: number, lclK: number): number {
  const r = mixingRatioKgKg * 1000; // g/kg
  return (
    tempK *
    Math.pow(1000 / pressureHpa, 0.2854 * (1 - 0.00028 * r)) *
    Math.exp((3.376 / lclK - 0.00254) * r * (1 + 0.00081 * r))
  );
}

function satThetaE(tempK: number, pressureHpa: number): number {
  return thetaE(tempK, pressureHpa, satMixingRatio(tempK - ZERO_C, pressureHpa), tempK);
}

/** Temperatura (K) sobre la adiabática húmeda con θe dado, a la presión dada (bisección). */
export function moistAdiabatTempK(thetaEK: number, pressureHpa: number): number {
  let lo = 150;
  let hi = 340;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (satThetaE(mid, pressureHpa) > thetaEK) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface EnvLevel {
  pressureHpa: number;
  temperatureC: number;
  dewPointC: number;
}

export interface ParcelResult {
  capeJkg: number;
  cinJkg: number; // ≤ 0
  lclHpa: number;
}

/** Interpola T y Td del ambiente en ln(p). `env` debe venir con presión descendente. */
function envAt(env: EnvLevel[], pressureHpa: number): EnvLevel | null {
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i];
    const b = env[i + 1];
    if (pressureHpa <= a.pressureHpa && pressureHpa >= b.pressureHpa) {
      const f = Math.log(a.pressureHpa / pressureHpa) / Math.log(a.pressureHpa / b.pressureHpa);
      return {
        pressureHpa,
        temperatureC: a.temperatureC + f * (b.temperatureC - a.temperatureC),
        dewPointC: a.dewPointC + f * (b.dewPointC - a.dewPointC),
      };
    }
  }
  return null;
}

/**
 * Eleva una parcela desde `start` y calcula CAPE y CIN (con temperatura virtual).
 * CAPE = toda el área positiva; CIN = área negativa por debajo de la capa positiva principal.
 */
export function liftParcel(start: EnvLevel, env: EnvLevel[], stepHpa = 10): ParcelResult {
  const t0 = start.temperatureC + ZERO_C;
  const td0 = Math.min(start.dewPointC, start.temperatureC) + ZERO_C;
  const w0 = satMixingRatio(td0 - ZERO_C, start.pressureHpa);
  const tLcl = lclTempK(t0, td0);
  const pLcl = start.pressureHpa * Math.pow(tLcl / t0, 1 / KAPPA);
  const thetaEParcel = thetaE(t0, start.pressureHpa, w0, tLcl);
  const top = env[env.length - 1].pressureHpa;

  // Diferencia de temperatura virtual parcela − ambiente en cada paso.
  const samples: { p: number; diff: number }[] = [];
  for (let p = start.pressureHpa; p >= top; p -= stepHpa) {
    const e = envAt(env, p);
    if (!e) continue;
    let tp: number;
    let wp: number;
    if (p >= pLcl) {
      tp = t0 * Math.pow(p / start.pressureHpa, KAPPA);
      wp = w0;
    } else {
      tp = moistAdiabatTempK(thetaEParcel, p);
      wp = satMixingRatio(tp - ZERO_C, p);
    }
    const tve = virtualTempK(e.temperatureC + ZERO_C, satMixingRatio(e.dewPointC, p));
    samples.push({ p, diff: virtualTempK(tp, wp) - tve });
  }

  // Áreas por segmento y capas positivas.
  const segments = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    segments.push(RD * ((a.diff + b.diff) / 2) * Math.log(a.p / b.p));
  }
  let cape = 0;
  let mainLayerStart = -1;
  let bestLayerArea = 0;
  let layerStart = -1;
  let layerArea = 0;
  for (let i = 0; i <= segments.length; i++) {
    const s = i < segments.length ? segments[i] : -1;
    if (s > 0) {
      cape += s;
      if (layerStart < 0) layerStart = i;
      layerArea += s;
    } else if (layerStart >= 0) {
      if (layerArea > bestLayerArea) {
        bestLayerArea = layerArea;
        mainLayerStart = layerStart;
      }
      layerStart = -1;
      layerArea = 0;
    }
  }
  let cin = 0;
  if (mainLayerStart >= 0) {
    for (let i = 0; i < mainLayerStart; i++) if (segments[i] < 0) cin += segments[i];
  }
  return { capeJkg: cape, cinJkg: cin, lclHpa: pLcl };
}

export interface MostUnstable extends ParcelResult {
  startHpa: number;
  mixingRatioGkg: number;
}

/**
 * Parcela más inestable (MU): prueba cada nivel en los `depthHpa` más bajos y se queda con la de mayor CAPE.
 * Importa de noche: las tormentas elevadas se alimentan de aire a 1–2 km, no del de superficie.
 */
export function mostUnstableParcel(env: EnvLevel[], depthHpa = 300): MostUnstable {
  const surfaceP = env[0].pressureHpa;
  let best: MostUnstable | null = null;
  for (const lvl of env) {
    if (lvl.pressureHpa < surfaceP - depthHpa) break;
    const r = liftParcel(lvl, env);
    if (!best || r.capeJkg > best.capeJkg) {
      best = {
        ...r,
        startHpa: lvl.pressureHpa,
        mixingRatioGkg: satMixingRatio(Math.min(lvl.dewPointC, lvl.temperatureC), lvl.pressureHpa) * 1000,
      };
    }
  }
  return best!;
}
