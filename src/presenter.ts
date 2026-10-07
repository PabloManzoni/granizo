// Convierte el resultado del motor en lo que muestra la interfaz (textos de plantilla, sin IA).
// Separado del motor: el motor decide el nivel; acá solo se redacta.
import {
  DEFAULT_SENSITIVITY,
  RULES,
  SENSITIVITIES,
  SENSITIVITY_RULES,
  SENSITIVITY_STATS,
  TRIGGER,
  type Sensitivity,
  type SensitivityRules,
} from './engine/config.ts';
import { DISCLAIMER, REASONS } from './engine/messages.ts';
import type { RiskLevel, WindowAssessment } from './engine/types.ts';

/**
 * Lo que se muestra: los tres niveles de granizo más "tormenta" (tranquilo para granizo, pero con tormentas).
 * El nombre habla solo de las chances de granizo: con tormenta y sin granizo, "Muy pocas chances"; la tormenta
 * se dice en la línea de abajo y se ve en el dibujo.
 */
export type ViewLevel = RiskLevel | 'storm';

export const LEVEL_NAMES: Record<ViewLevel, string> = {
  calm: 'Muy pocas chances',
  storm: 'Muy pocas chances',
  watch: 'Algunas chances',
  protect: 'Chances reales',
};

/** La palabra "granizo" siempre visible junto al nivel: la app es solo para granizo. */
export const HAIL_STATUS: Record<ViewLevel, string> = {
  calm: 'Sin señales de granizo',
  storm: 'Tormenta, sin señales de granizo',
  // Condiciones, no pronóstico: muchas veces no cae nada (ver SENSITIVITY_STATS).
  watch: 'Condiciones para granizo',
  protect: 'Peligro de granizo',
};

/** Los grados que ofrece la app. "Cualquier señal" sigue en el motor (consola y pruebas), pero no se ofrece. */
export const APP_SENSITIVITIES: Sensitivity[] = ['balanced', 'strict'];

/** Grado de alerta: nombre visible y una línea de qué hace. */
export const SENSITIVITY_NAMES: Record<Sensitivity, string> = {
  sensitive: 'Cualquier señal',
  balanced: 'Equilibrado',
  strict: 'Solo señales fuertes',
};
const SENSITIVITY_SUMMARY: Record<Sensitivity, string> = {
  sensitive: 'Más avisos, más falsas alarmas.',
  balanced: 'Recomendado.',
  strict: 'Menos avisos, alguna se escapa.',
};
const COMBINE_RULE: Record<SensitivityRules['combine'], string> = {
  either: 'alcanza con que un modelo lo vea, vale el nivel más alto',
  both: 'chances reales solo si los dos lo ven; algunas chances si uno ve chances reales o los dos ven al menos algunas',
  'both-strict': 'los dos modelos lo tienen que ver, vale el nivel más bajo',
};

export interface WindowInfo {
  name: string;
  label: string;
  from: string;
  to: string;
}

export interface ResultView {
  /** Grado de alerta con el que se armó este resultado. */
  sensitivity: Sensitivity;
  sensitivityName: string;
  /** Los grados que ofrece la app, para el selector. */
  sensitivityOptions: {
    id: Sensitivity;
    name: string;
    /** Una línea: qué se gana y qué se pierde. Los números están en `algorithm.validation`. */
    summary: string;
  }[];
  level: ViewLevel;
  levelName: string;
  /** "Sin señales de granizo", "Lluvia fuerte, sin piedra", "Posible granizo", "Peligro de granizo". */
  hailStatus: string;
  /** Pastilla corta debajo del nivel ("con reservas", "modelos divididos"…) o null. */
  note: string | null;
  title: string;
  confidence: 'low' | 'medium' | 'high';
  confidenceLabel: string;
  /** Puntos de confianza encendidos, de 3. */
  confidenceDots: number;
  season: 'warm' | 'cold';
  models: { model: string; level: ViewLevel; levelName: string }[];
  modelsAgree: boolean;
  /** Motivo corto de la confianza (modelos, estación). */
  confidenceReason: string;
  /** Avisos de interpretación que no son de confianza ("es lo habitual", INUMET). */
  notices: { strong: string; text: string }[];
  why: string[];
  window: WindowInfo;
  /**
   * Hora por hora. `label`: "Ahora" la primera, después "11", "12"…; `day`: el día ("mié") en la primera hora de
   * cada día nuevo; `level`: 0 = nada, 1 = vigilar, 2 = fuerte.
   */
  hours: { time: string; label: string; day: string | null; level: 0 | 1 | 2 }[];
  /** "Posible granizo esta tarde." — por momento del día, sin prometer la hora exacta. */
  watchText: string | null;
  tech: { k: string; v: string }[];
  /** Cómo se llegó al nivel: reglas, umbrales y valores de cada modelo. */
  algorithm: {
    rows: { rule: string; threshold: string; values: { model: string; text: string; pass: boolean; mark: string }[] }[];
    combination: string;
    confidenceWhy: string;
    validation: string;
    moreUrl: string;
  };
  generatedAt: string;
  engineVersion: string;
  disclaimer: string;
}

const fmt = (x: number | null, digits = 0, unit = '') =>
  x === null || !Number.isFinite(x)
    ? '—'
    : `${x.toLocaleString('es-UY', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`;

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const hh = (time: string) => time.slice(11, 13);
/** 0,82 → "8 de cada 10"; casi todo → "casi todas las" (o lo que se pase, para concordar con el sustantivo). */
const outOfTen = (x: number, almostAll = 'casi todas las') => (x >= 0.95 ? almostAll : `${Math.round(x * 10)} de cada 10`);
const approxOutOfTen = (x: number) => (x >= 0.95 ? outOfTen(x) : `~${outOfTen(x)}`);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const viewLevelOf = (r: WindowAssessment): ViewLevel => (r.storm ? 'storm' : r.level);
/** "Algunas chances" sale seguido en días de tormenta sin granizo con este grado (no es una señal rara). */
const watchIsCommon = (s: Sensitivity) => SENSITIVITY_STATS[s].watch.falseAlarm >= 0.3;

function titleFor(level: ViewLevel, lowConfidence: boolean, agree: boolean, weakSignals: boolean): string {
  if (weakSignals) return 'Hay algo de ambiente para piedra, pero ninguna señal fuerte.';
  if (level === 'protect') return 'Chances reales de piedra en tu zona.';
  if (level === 'storm') return lowConfidence ? 'Se forman tormentas en tu zona; pocas chances de piedra.' : 'Se forman tormentas en tu zona, pero no es clima de piedra.';
  if (level === 'watch') return agree ? 'Hay ingredientes para piedra en tu zona.' : 'Los modelos no se ponen de acuerdo.';
  return lowConfidence ? 'Pocas chances de piedra en tu zona.' : 'No es clima de piedra en tu zona.';
}

function noteFor(level: ViewLevel, lowConfidence: boolean, agree: boolean, singleModel: boolean, sensitivity: Sensitivity): string | null {
  if (singleModel) return 'un solo modelo';
  if (!agree) return 'modelos divididos';
  if ((level === 'calm' || level === 'storm') && lowConfidence) return 'con reservas';
  if (level === 'watch' && watchIsCommon(sensitivity)) return 'lo habitual con tormenta';
  return null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const SHORT_DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dayIndex = (time: string) => Date.parse(`${time.slice(0, 10)}T00:00:00Z`) / 86_400_000;
const weekday = (time: string) => new Date(`${time.slice(0, 10)}T00:00:00Z`).getUTCDay();
const partOfDay = (hour: number) => (hour < 6 ? 'madrugada' : hour < 12 ? 'mañana' : hour < 20 ? 'tarde' : 'noche');

/** "esta tarde", "mañana de noche", "el jueves de madrugada": el momento del día, contado desde la consulta. */
export function momentOf(time: string, consultedAt: string): string {
  const part = partOfDay(Number(hh(time)));
  const days = dayIndex(time) - dayIndex(consultedAt);
  if (days <= 0) return `esta ${part}`;
  if (days === 1) return `mañana de ${part}`;
  return `el ${WEEKDAYS[weekday(time)]} de ${part}`;
}

/**
 * Solo lo más grave de las 24 h, por momento del día: si hay horas fuertes, "Peligro de granizo esta noche." aunque
 * antes haya condiciones; si no, "Condiciones para granizo esta tarde." La tira muestra todo, con sus colores.
 * No se promete la hora exacta: los modelos no la aciertan. Como mucho dos momentos.
 */
export function watchTextFor(hours: { time: string; level: number }[], consultedAt: string): string | null {
  const worst = Math.max(0, ...hours.map((h) => h.level));
  if (worst === 0) return null;
  // Tramos seguidos de horas con el nivel más grave.
  const runs: { from: number; to: number }[] = [];
  hours.forEach((h, i) => {
    if (h.level < worst) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i });
  });
  const moments: string[] = [];
  const add = (m: string) => moments.includes(m) || moments.push(m);
  for (const run of runs) {
    if (moments.length >= 2) break;
    // Si ya empezó, "ahora"; si sigue en otro momento del día, también ese ("esta tarde y esta noche").
    add(run.from === 0 ? 'ahora' : momentOf(hours[run.from].time, consultedAt));
    if (moments.length < 2 && run.to > run.from) {
      const end = momentOf(hours[run.to].time, consultedAt);
      if (end !== momentOf(hours[run.from].time, consultedAt)) add(end);
    }
  }
  return `${worst === 2 ? 'Peligro de granizo' : 'Condiciones para granizo'} ${moments.join(' y ')}.`;
}

/** Presenta el resultado de cada grado de alerta ("solo señales fuertes" mira al equilibrado para avisar señales débiles). */
export function presentAll(
  bySensitivity: Record<Sensitivity, WindowAssessment>,
  window: WindowInfo,
  generatedAt: string,
): Record<Sensitivity, ResultView> {
  return Object.fromEntries(
    SENSITIVITIES.map((s) => [s, present(bySensitivity[s], window, generatedAt, s, bySensitivity)]),
  ) as Record<Sensitivity, ResultView>;
}

export function present(
  r: WindowAssessment,
  window: WindowInfo,
  generatedAt: string,
  sensitivity: Sensitivity = DEFAULT_SENSITIVITY,
  bySensitivity?: Partial<Record<Sensitivity, WindowAssessment>>,
): ResultView {
  const level = viewLevelOf(r);
  const rules = SENSITIVITY_RULES[sensitivity];
  const stats = SENSITIVITY_STATS[sensitivity];
  const name = SENSITIVITY_NAMES[sensitivity];
  // "Solo señales fuertes" dice tranquilo, pero con el grado equilibrado ya habría aviso: se dice, sin subir el nivel.
  const balanced = bySensitivity?.balanced;
  const weakSignals = sensitivity === 'strict' && r.level === 'calm' && !!balanced && balanced.level !== 'calm';
  // Cada modelo con el mismo criterio: tranquilo para granizo pero formando tormentas → "storm".
  const models = (r.models ?? []).map((m) => {
    const lv: ViewLevel = m.level === 'calm' && m.check?.triggerPresent ? 'storm' : m.level;
    return { model: m.model, level: lv, levelName: LEVEL_NAMES[lv] };
  });
  const singleModel = models.length === 1;
  // Acuerdo en granizo (lo que usa el motor para la confianza); la tormenta no cuenta.
  const hailLevels = (r.models ?? []).map((m) => m.level);
  const agree = hailLevels.length < 2 || hailLevels[0] === hailLevels[1];
  const lowConfidence = r.confidence === 'low';

  const notices: ResultView['notices'] = [];
  if (agree && r.level === 'watch' && watchIsCommon(sensitivity)) {
    notices.push({
      strong: 'Es lo habitual.',
      text: `Así sale en ${outOfTen(stats.watch.falseAlarm, 'casi todos los')} días de tormenta. No es para correr: es para tener pensado dónde guardarlo.`,
    });
  }
  if (r.level === 'protect') notices.push({ strong: 'Mirá también INUMET.', text: 'Esto no reemplaza los avisos oficiales.' });
  if (level === 'storm') notices.push({ strong: 'Mirá también INUMET.', text: 'Una tormenta puede traer lluvia fuerte, rayos o viento.' });

  // Motivo de la confianza, corto: modelos y estación.
  const reasonParts: string[] = [];
  if (singleModel) reasonParts.push(`Solo respondió ${models[0].model}: no hay con qué contrastar`);
  else if (!agree) reasonParts.push('Los modelos no coinciden: te damos el punto medio');
  else if (models.length === 2) reasonParts.push('Los modelos coinciden');
  if (r.season === 'warm') reasonParts.push('Entre octubre y marzo el pronóstico distingue poco granizo de lluvia');
  const confidenceReason = reasonParts.map(sentence).join(' ');

  // El "por qué": razones del motor menos las que ya se muestran como aviso.
  const why = r.reasons
    .filter((c) => c !== 'WARM_SEASON' && c !== 'MODELS_DISAGREE' && c !== 'MODELS_AGREE')
    .map((c) => sentence(REASONS[c]));

  const hours = r.hourly.map((h, i, all) => ({
    time: h.time,
    label: i === 0 ? 'Ahora' : hh(h.time),
    day: i > 0 && h.time.slice(0, 10) !== all[i - 1].time.slice(0, 10) ? SHORT_DAYS[weekday(h.time)] : null,
    level: (h.environment === 'strong' ? 2 : h.environment === 'supportive' ? 1 : 0) as 0 | 1 | 2,
  }));

  const i = r.peak.ingredients;
  const sources = models.map((m) => m.model).join(' + ') || 'GFS';
  const tech = [
    { k: 'Zona', v: '~40 km alrededor del lugar' },
    { k: 'Momento más favorable', v: `${r.peak.time.slice(11, 16)} h` },
    { k: 'Energía (MUCAPE)', v: fmt(i.muCapeJkg, 0, ' J/kg') },
    { k: 'Viento en altura 0–6 km', v: fmt(i.shear06Ms, 0, ' m/s') },
    { k: 'Enfriamiento 700–500 hPa', v: fmt(i.lapse700500CKm, 1, ' °C/km') },
    { k: 'Energía × viento', v: fmt(i.wmaxshearM2s2, 0, ' m²/s²') },
    { k: 'Nivel de 0 °C', v: fmt(i.freezingLevelMAgl === null ? null : Math.round(i.freezingLevelMAgl / 100) * 100, 0, ' m') },
    { k: 'Lluvia convectiva máx.', v: fmt(r.trigger.maxShowersMm, 1, ' mm/h') },
    { k: 'Fuente', v: `${sources} vía Open-Meteo · ${generatedAt.slice(11, 16)} · motor v${r.engineVersion}` },
  ];

  // ---- Cómo se decidió (mismos umbrales que usa el motor) ----
  const n = (x: number | null, d: number) => fmt(x, d);
  const verdicts = (r.models ?? []).filter((m) => m.check);
  const rows: ResultView['algorithm']['rows'] = [
    {
      rule: 'El aire se enfría rápido con la altura (700–500 hPa)',
      threshold: `≥ ${fmt(RULES.lapse700500CKm, 1)} °C/km`,
      values: verdicts.map((m) => ({
        model: m.model,
        text: `${n(m.check!.lapse700500CKm, 1)} °C/km`,
        pass: (m.check!.lapse700500CKm ?? 0) >= RULES.lapse700500CKm,
        mark: (m.check!.lapse700500CKm ?? 0) >= RULES.lapse700500CKm ? '✓' : '✗',
      })),
    },
    {
      rule: 'Energía × viento (WMAXSHEAR)',
      threshold:
        rules.wmaxshearWatch < rules.wmaxshearProtect
          ? `≥ ${fmt(rules.wmaxshearWatch)} algunas · ≥ ${fmt(rules.wmaxshearProtect)} reales`
          : `≥ ${fmt(rules.wmaxshearProtect)} algunas y reales`,
      values: verdicts.map((m) => {
        const w = m.check!.wmaxshearM2s2 ?? 0;
        // ✓✓ supera el umbral de "chances reales"; ✓ solo el de "algunas chances".
        return { model: m.model, text: n(m.check!.wmaxshearM2s2, 0), pass: w >= rules.wmaxshearWatch, mark: w >= rules.wmaxshearProtect ? '✓✓' : w >= rules.wmaxshearWatch ? '✓' : '✗' };
      }),
    },
    {
      rule: 'El modelo forma tormentas en la ventana',
      threshold: `lluvia convectiva ≥ ${fmt(TRIGGER.showersMm, 1)} o total ≥ ${fmt(TRIGGER.precipitationMm, 0)} mm/h`,
      values: verdicts.map((m) => ({ model: m.model, text: `${n(m.check!.maxShowersMm, 1)} · ${n(m.check!.maxPrecipitationMm, 1)} mm/h`, pass: m.check!.triggerPresent, mark: m.check!.triggerPresent ? '✓' : '✗' })),
    },
  ];
  const perModel = verdicts.map((m) => `${m.model}: ${LEVEL_NAMES[m.level].toLowerCase()}`).join(' · ');
  const stormRule = r.storm ? ' Sin ambiente de granizo, pero el modelo forma tormentas en la zona: se avisa la tormenta.' : '';
  const combination = (singleModel
    ? `Un solo modelo disponible (${perModel}): su nivel es el resultado.`
    : `${perModel}. Regla de «${name}»: ${COMBINE_RULE[rules.combine]}. → ${LEVEL_NAMES[r.level]}.`) + stormRule;
  const confidenceWhy = r.season === 'warm'
    ? 'Entre octubre y marzo la confianza es siempre baja: en la prueba histórica el ambiente no distinguió granizo de lluvia.'
    : singleModel
      ? 'Con un solo modelo no hay con qué contrastar → baja.'
      : agree
        ? 'Abril–septiembre y los modelos coinciden → media. No damos "alta": la prueba histórica no lo justifica.'
        : 'Los modelos no coinciden → baja.';

  const sensitivityOptions = APP_SENSITIVITIES.map((id) => ({ id, name: SENSITIVITY_NAMES[id], summary: SENSITIVITY_SUMMARY[id] }));

  return {
    sensitivity,
    sensitivityName: name,
    sensitivityOptions,
    algorithm: {
      rows,
      combination,
      confidenceWhy,
      validation:
        `Reglas calibradas con granizadas y días de tormenta de Uruguay 2021–2024 y probadas en 2025–2026. Con «${name}», "Chances reales" avisó en ${approxOutOfTen(stats.protect.hit)} granizadas, con ~${pct(stats.protect.falseAlarm)} de falsas alarmas en días de tormenta; "Algunas chances" o más, en ${approxOutOfTen(stats.watch.hit)} granizadas, con ~${pct(stats.watch.falseAlarm)}. Es un motor de reglas, sin IA.`,
      moreUrl: 'https://github.com/PabloManzoni/granizo/blob/main/docs/como-lo-probamos.md',
    },
    level,
    levelName: LEVEL_NAMES[level],
    hailStatus: weakSignals ? 'Señales débiles de granizo' : HAIL_STATUS[level],
    note: noteFor(level, lowConfidence, agree, singleModel, sensitivity),
    title: titleFor(level, lowConfidence, agree, weakSignals),
    confidence: r.confidence,
    confidenceLabel: { low: 'Confianza baja', medium: 'Confianza media', high: 'Confianza alta' }[r.confidence],
    confidenceDots: { low: 1, medium: 2, high: 3 }[r.confidence],
    season: r.season,
    models,
    modelsAgree: agree,
    confidenceReason,
    notices,
    why,
    window,
    hours,
    watchText: watchTextFor(hours, generatedAt),
    tech,
    generatedAt,
    engineVersion: r.engineVersion,
    disclaimer: DISCLAIMER,
  };
}
