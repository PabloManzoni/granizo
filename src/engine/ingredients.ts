import { mostUnstableParcel, type EnvLevel } from './thermo.ts';
import type { Ingredients, ProfileHour, Wind, WindLevel } from './types.ts';

function toUV(w: Wind): { u: number; v: number } {
  const rad = (w.directionDeg * Math.PI) / 180;
  return { u: -w.speedMs * Math.sin(rad), v: -w.speedMs * Math.cos(rad) };
}

/** Viento interpolado linealmente en altura (m s.n.m.). */
function windAtHeight(winds: WindLevel[], heightM: number): { u: number; v: number } | null {
  const sorted = [...winds].sort((a, b) => a.heightM - b.heightM);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (heightM >= a.heightM && heightM <= b.heightM) {
      const f = (heightM - a.heightM) / (b.heightM - a.heightM);
      const ua = toUV(a.wind);
      const ub = toUV(b.wind);
      return { u: ua.u + f * (ub.u - ua.u), v: ua.v + f * (ub.v - ua.v) };
    }
  }
  return null;
}

/** Cizalladura 0–6 km: diferencia vectorial entre el viento a 10 m y a 6 km sobre el suelo. */
export function bulkShear06(profile: ProfileHour): number | null {
  const top = windAtHeight(profile.winds, profile.elevationM + 6000);
  if (!top) return null;
  const sfc = toUV(profile.surface.wind10m);
  return Math.hypot(top.u - sfc.u, top.v - sfc.v);
}

function level(profile: ProfileHour, pressureHpa: number) {
  return profile.levels.find((l) => l.pressureHpa === pressureHpa) ?? null;
}

/** Gradiente térmico 700–500 hPa (°C/km). Aire frío arriba = "fábrica de hielo". */
export function lapseRate700500(profile: ProfileHour): number | null {
  const l7 = level(profile, 700);
  const l5 = level(profile, 500);
  if (!l7 || !l5) return null;
  return (l7.temperatureC - l5.temperatureC) / ((l5.heightM - l7.heightM) / 1000);
}

/**
 * Significant Hail Parameter (SPC). No es una probabilidad: resume si el ambiente sostiene granizo
 * significativo. Ojo: se diseñó para granizo ≥ 5 cm, más grande que el que abolla un auto.
 */
export function ship(i: {
  muCapeJkg: number;
  muMixingRatioGkg: number;
  lapse700500CKm: number;
  t500C: number;
  shear06Ms: number;
  freezingLevelMAgl: number;
}): number {
  const mixr = Math.min(Math.max(i.muMixingRatioGkg, 11), 13.6);
  const t500 = Math.min(i.t500C, -5.5);
  const shear = Math.min(Math.max(i.shear06Ms, 7), 27);
  let value = (i.muCapeJkg * mixr * i.lapse700500CKm * -t500 * shear) / 42_000_000;
  if (i.muCapeJkg < 1300) value *= i.muCapeJkg / 1300;
  if (i.lapse700500CKm < 5.8) value *= i.lapse700500CKm / 5.8;
  if (i.freezingLevelMAgl < 2400) value *= i.freezingLevelMAgl / 2400;
  return Math.max(value, 0);
}

/** Altura (m s.n.m.) donde la temperatura cruza 0 °C, interpolando entre niveles. Para modelos que no la entregan. */
export function freezingLevelFromProfile(profile: ProfileHour): number | null {
  const pts = [
    { t: profile.surface.temperatureC, z: profile.elevationM + 2 },
    ...profile.levels.map((l) => ({ t: l.temperatureC, z: l.heightM })),
  ];
  if (pts[0].t <= 0) return profile.elevationM;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.t > 0 && b.t <= 0) return a.z + ((a.t - 0) / (a.t - b.t)) * (b.z - a.z);
  }
  return null;
}

export function computeIngredients(profile: ProfileHour): Ingredients {
  const env: EnvLevel[] = [
    {
      pressureHpa: profile.surface.pressureHpa,
      temperatureC: profile.surface.temperatureC,
      dewPointC: profile.surface.dewPointC,
    },
    ...profile.levels,
  ];
  const mu = mostUnstableParcel(env);
  const shear06Ms = bulkShear06(profile);
  const lapse700500CKm = lapseRate700500(profile);
  const t500C = level(profile, 500)?.temperatureC ?? null;
  const freezingLevelM = profile.freezingLevelM ?? freezingLevelFromProfile(profile);
  const freezingLevelMAgl = freezingLevelM === null ? null : Math.max(freezingLevelM - profile.elevationM, 0);

  const shipValue =
    shear06Ms !== null && lapse700500CKm !== null && t500C !== null && freezingLevelMAgl !== null
      ? ship({
          muCapeJkg: mu.capeJkg,
          muMixingRatioGkg: mu.mixingRatioGkg,
          lapse700500CKm,
          t500C,
          shear06Ms,
          freezingLevelMAgl,
        })
      : null;

  return {
    wmaxshearM2s2: shear06Ms === null ? null : Math.sqrt(2 * mu.capeJkg) * shear06Ms,
    muCapeJkg: mu.capeJkg,
    muCinJkg: mu.cinJkg,
    muMixingRatioGkg: mu.mixingRatioGkg,
    muStartHpa: mu.startHpa,
    shear06Ms,
    lapse700500CKm,
    t500C,
    freezingLevelMAgl,
    ship: shipValue,
    showersMm: profile.showersMm ?? 0,
    precipitationMm: profile.precipitationMm ?? 0,
    modelCapeJkg: profile.modelCapeJkg,
  };
}
