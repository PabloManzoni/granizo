import {
  ENGINE_VERSION,
  HIGH_FREEZING_LEVEL_M_AGL,
  RULES,
  SHIP_NOTABLE,
  THRESHOLDS,
  TRIGGER,
  WARM_SEASON_MONTHS,
} from './config.ts';
import type {
  Confidence,
  Environment,
  IngredientLevel,
  IngredientLevels,
  Ingredients,
  ModelVerdict,
  PointHourAssessment,
  ReasonCode,
  RiskLevel,
  Season,
  WindowAssessment,
} from './types.ts';

const ORDER: IngredientLevel[] = ['unfavorable', 'marginal', 'favorable', 'strong'];
const rank = (l: IngredientLevel) => ORDER.indexOf(l);
const ENV_ORDER: Environment[] = ['weak', 'supportive', 'strong'];

function bucket(value: number | null, limits: readonly [number, number, number]): IngredientLevel {
  if (value === null) return 'unfavorable';
  if (value >= limits[2]) return 'strong';
  if (value >= limits[1]) return 'favorable';
  if (value >= limits[0]) return 'marginal';
  return 'unfavorable';
}

/** Niveles descriptivos de cada ingrediente (para explicar; la decisión usa RULES). */
export function classifyIngredients(i: Ingredients): IngredientLevels {
  const lapse = bucket(i.lapse700500CKm, THRESHOLDS.lapse700500CKm);
  const cold = bucket(i.t500C === null ? null : -i.t500C, THRESHOLDS.minusT500C);
  return {
    instability: bucket(i.muCapeJkg, THRESHOLDS.muCapeJkg),
    shear: bucket(i.shear06Ms, THRESHOLDS.shear06Ms),
    growth: rank(lapse) <= rank(cold) ? lapse : cold,
    stormPotential: bucket(i.wmaxshearM2s2, THRESHOLDS.wmaxshearM2s2),
  };
}

/**
 * Ambiente de un punto-hora (v0.2, calibrado en Uruguay):
 * - strong: gradiente 700–500 ≥ RULES.lapse700500CKm Y WMAXSHEAR ≥ RULES.wmaxshearProtect
 * - supportive: gradiente ≥ RULES.lapse700500CKm Y WMAXSHEAR ≥ RULES.wmaxshearWatch
 * - weak: el resto
 */
export function classifyEnvironment(i: Ingredients): Environment {
  if ((i.lapse700500CKm ?? 0) < RULES.lapse700500CKm) return 'weak';
  const w = i.wmaxshearM2s2 ?? 0;
  if (w >= RULES.wmaxshearProtect) return 'strong';
  if (w >= RULES.wmaxshearWatch) return 'supportive';
  return 'weak';
}

export function assessPointHour(
  time: string,
  lat: number,
  lon: number,
  ingredients: Ingredients,
): PointHourAssessment {
  return {
    time,
    lat,
    lon,
    ingredients,
    levels: classifyIngredients(ingredients),
    environment: classifyEnvironment(ingredients),
  };
}

export function seasonOfTime(time: string): Season {
  return WARM_SEASON_MONTHS.includes(Number(time.slice(5, 7))) ? 'warm' : 'cold';
}

function reasonsFor(peak: PointHourAssessment, triggerPresent: boolean, season: Season): ReasonCode[] {
  const r: ReasonCode[] = [];
  const i = peak.ingredients;
  r.push((i.lapse700500CKm ?? 0) >= RULES.lapse700500CKm ? 'GOOD_HAIL_GROWTH' : 'POOR_HAIL_GROWTH');
  const w = i.wmaxshearM2s2 ?? 0;
  r.push(
    w >= RULES.wmaxshearProtect
      ? 'STRONG_STORM_POTENTIAL'
      : w >= RULES.wmaxshearWatch
        ? 'MODERATE_STORM_POTENTIAL'
        : 'WEAK_STORM_POTENTIAL',
  );
  if ((i.ship ?? 0) >= SHIP_NOTABLE) r.push('HIGH_SHIP');
  r.push(triggerPresent ? 'MODEL_CONVECTION' : 'NO_MODEL_CONVECTION');
  if ((i.freezingLevelMAgl ?? 0) > HIGH_FREEZING_LEVEL_M_AGL) r.push('HIGH_FREEZING_LEVEL');
  if (season === 'warm') r.push('WARM_SEASON');
  return r;
}

/**
 * Junta todos los puntos-hora de la zona y la ventana en un solo veredicto.
 * - protect: ambiente fuerte en algún punto-hora Y el modelo forma tormentas en la ventana.
 * - watch: ambiente fuerte sin tormentas en el modelo, o ambiente favorable.
 * - calm: el resto.
 * Aparte, `storm`: calm pero el modelo forma tormentas (tormenta sin granizo).
 * Confianza: media en la estación fría (donde el test mostró señal), baja en la cálida (donde no).
 */
export function assessWindow(pointHours: PointHourAssessment[]): WindowAssessment {
  if (pointHours.length === 0) throw new Error('No hay datos para la ventana pedida');

  const peak = pointHours.reduce((best, ph) => {
    const d = ENV_ORDER.indexOf(ph.environment) - ENV_ORDER.indexOf(best.environment);
    if (d !== 0) return d > 0 ? ph : best;
    return (ph.ingredients.wmaxshearM2s2 ?? 0) > (best.ingredients.wmaxshearM2s2 ?? 0) ? ph : best;
  });

  const maxShowersMm = Math.max(...pointHours.map((p) => p.ingredients.showersMm));
  const maxPrecipitationMm = Math.max(...pointHours.map((p) => p.ingredients.precipitationMm));
  const triggerPresent = maxShowersMm >= TRIGGER.showersMm || maxPrecipitationMm >= TRIGGER.precipitationMm;

  let level: RiskLevel = 'calm';
  if (peak.environment === 'strong') level = triggerPresent ? 'protect' : 'watch';
  else if (peak.environment === 'supportive') level = 'watch';

  const season = seasonOfTime(peak.time);
  const confidence: Confidence = season === 'warm' ? 'low' : 'medium';

  const favorableHours = [
    ...new Set(pointHours.filter((p) => p.environment !== 'weak').map((p) => p.time)),
  ].sort();

  const byHour = new Map<string, Environment>();
  for (const p of pointHours) {
    const prev = byHour.get(p.time);
    if (!prev || ENV_ORDER.indexOf(p.environment) > ENV_ORDER.indexOf(prev)) byHour.set(p.time, p.environment);
  }
  const hourly = [...byHour.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, environment]) => ({ time, environment }));

  return {
    level,
    storm: level === 'calm' && triggerPresent,
    confidence,
    hourly,
    season,
    reasons: reasonsFor(peak, triggerPresent, season),
    peak,
    trigger: { present: triggerPresent, maxShowersMm, maxPrecipitationMm },
    counts: {
      pointHours: pointHours.length,
      supportive: pointHours.filter((p) => p.environment === 'supportive').length,
      strong: pointHours.filter((p) => p.environment === 'strong').length,
    },
    favorableHours,
    engineVersion: ENGINE_VERSION,
  };
}

const LEVEL_RANK: Record<RiskLevel, number> = { calm: 0, watch: 1, protect: 2 };

/**
 * Combina el veredicto de dos modelos (GFS y ECMWF), validado en 2025–2026:
 * - protect: los DOS dicen protect ("día rojo" estricto: 43% de detección, 15% de falsas alarmas en prueba).
 * - watch: alguno dice protect, o los dos dicen al menos watch (93% / 65% en prueba).
 * - calm: el resto.
 * Tormenta sin granizo (`storm`): calm y alguno de los dos modelos forma tormentas.
 * Confianza: en la estación cálida siempre baja; en la fría, media si coinciden y baja si no.
 */
export function combineModels(results: { model: string; assessment: WindowAssessment }[]): WindowAssessment {
  if (results.length === 0) throw new Error('Sin modelos para combinar');
  const models: ModelVerdict[] = results.map((r) => ({
    model: r.model,
    level: r.assessment.level,
    check: {
      lapse700500CKm: r.assessment.peak.ingredients.lapse700500CKm,
      wmaxshearM2s2: r.assessment.peak.ingredients.wmaxshearM2s2,
      maxShowersMm: r.assessment.trigger.maxShowersMm,
      maxPrecipitationMm: r.assessment.trigger.maxPrecipitationMm,
      triggerPresent: r.assessment.trigger.present,
    },
  }));
  // Con un solo modelo no hay con qué contrastar: la confianza baja.
  if (results.length === 1) return { ...results[0].assessment, confidence: 'low', models };

  const [a, b] = results.map((r) => r.assessment);
  const both = (min: RiskLevel) => LEVEL_RANK[a.level] >= LEVEL_RANK[min] && LEVEL_RANK[b.level] >= LEVEL_RANK[min];
  const level: RiskLevel = both('protect')
    ? 'protect'
    : a.level === 'protect' || b.level === 'protect' || both('watch')
      ? 'watch'
      : 'calm';
  const agree = a.level === b.level;
  // El punto-hora que se muestra sale del modelo más alarmado (a igualdad, el primero).
  const lead = LEVEL_RANK[b.level] > LEVEL_RANK[a.level] ? b : a;
  const confidence: Confidence = lead.season === 'warm' || !agree ? 'low' : 'medium';
  // Hora por hora, con el mismo criterio que el nivel: "strong" solo si los dos modelos lo ven.
  const envOf = (x: WindowAssessment, time: string) => x.hourly.find((h) => h.time === time)?.environment ?? 'weak';
  const times = [...new Set([...a.hourly, ...b.hourly].map((h) => h.time))].sort();
  const hourly = times.map((time) => {
    const ea = envOf(a, time);
    const eb = envOf(b, time);
    const environment: Environment =
      ea === 'strong' && eb === 'strong' ? 'strong' : ea !== 'weak' || eb !== 'weak' ? 'supportive' : 'weak';
    return { time, environment };
  });

  return {
    ...lead,
    level,
    storm: level === 'calm' && (a.trigger.present || b.trigger.present),
    confidence,
    reasons: [...lead.reasons, agree ? 'MODELS_AGREE' : 'MODELS_DISAGREE'],
    favorableHours: [...new Set([...a.favorableHours, ...b.favorableHours])].sort(),
    hourly,
    models,
  };
}
