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
} from './engine/config.ts';
import type { RiskLevel, WindowAssessment } from './engine/types.ts';
import { LANGS, TEXT, type Lang } from './presenter-text.ts';

export { LANGS, type Lang } from './presenter-text.ts';

/**
 * Lo que se muestra: los tres niveles de granizo más "tormenta" (tranquilo para granizo, pero con tormentas).
 * El nombre habla solo de las chances de granizo: con tormenta y sin granizo, "Muy pocas chances"; la tormenta
 * se dice en la línea de abajo y se ve en el dibujo.
 */
export type ViewLevel = RiskLevel | 'storm';

// Los textos de cada idioma están en presenter-text.ts; estos son los de español, para la consola y las pruebas.
export const LEVEL_NAMES: Record<ViewLevel, string> = TEXT.es.levelNames;

/** La palabra "granizo" siempre visible junto al nivel: la app es solo para granizo. */
export const HAIL_STATUS: Record<ViewLevel, string> = TEXT.es.hailStatus;

/** Los grados que ofrece la app. "Cualquier señal" sigue en el motor (consola y pruebas), pero no se ofrece. */
export const APP_SENSITIVITIES: Sensitivity[] = ['balanced', 'strict'];

/** Grado de alerta: nombre visible y una línea de qué hace. */
export const SENSITIVITY_NAMES: Record<Sensitivity, string> = TEXT.es.sensitivityNames;

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

const fmtIn = (locale: string) => (x: number | null, digits = 0, unit = '') =>
  x === null || !Number.isFinite(x)
    ? '—'
    : `${x.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`;

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const hh = (time: string) => time.slice(11, 13);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const viewLevelOf = (r: WindowAssessment): ViewLevel => (r.storm ? 'storm' : r.level);
/** "Algunas chances" sale seguido en días de tormenta sin granizo con este grado (no es una señal rara). */
const watchIsCommon = (s: Sensitivity) => SENSITIVITY_STATS[s].watch.falseAlarm >= 0.3;

function titleFor(lang: Lang, level: ViewLevel, lowConfidence: boolean, agree: boolean, weakSignals: boolean): string {
  const t = TEXT[lang].titles;
  if (weakSignals) return t.weak;
  if (level === 'protect') return t.protect;
  if (level === 'storm') return lowConfidence ? t.stormLow : t.storm;
  if (level === 'watch') return agree ? t.watchAgree : t.watchDisagree;
  return lowConfidence ? t.calmLow : t.calm;
}

function noteFor(lang: Lang, level: ViewLevel, lowConfidence: boolean, agree: boolean, singleModel: boolean, sensitivity: Sensitivity): string | null {
  const t = TEXT[lang].notes;
  if (singleModel) return t.singleModel;
  if (!agree) return t.divided;
  if ((level === 'calm' || level === 'storm') && lowConfidence) return t.reservations;
  if (level === 'watch' && watchIsCommon(sensitivity)) return t.usual;
  return null;
}

const dayIndex = (time: string) => Date.parse(`${time.slice(0, 10)}T00:00:00Z`) / 86_400_000;
const weekday = (time: string) => new Date(`${time.slice(0, 10)}T00:00:00Z`).getUTCDay();
/** 0 madrugada, 1 mañana, 2 tarde, 3 noche. */
const partOfDay = (hour: number) => (hour < 6 ? 0 : hour < 12 ? 1 : hour < 20 ? 2 : 3);

/** "esta tarde", "mañana de noche", "el jueves de madrugada": el momento del día, contado desde la consulta. */
export function momentOf(time: string, consultedAt: string, lang: Lang = 'es'): string {
  return TEXT[lang].moment(partOfDay(Number(hh(time))), dayIndex(time) - dayIndex(consultedAt), weekday(time));
}

/**
 * Solo lo más grave de las 24 h, por momento del día: si hay horas fuertes, "Peligro de granizo esta noche." aunque
 * antes haya condiciones; si no, "Condiciones para granizo esta tarde." La tira muestra todo, con sus colores.
 * No se promete la hora exacta: los modelos no la aciertan. Como mucho dos momentos.
 */
export function watchTextFor(hours: { time: string; level: number }[], consultedAt: string, lang: Lang = 'es'): string | null {
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
    add(run.from === 0 ? TEXT[lang].nowInText : momentOf(hours[run.from].time, consultedAt, lang));
    if (moments.length < 2 && run.to > run.from) {
      const end = momentOf(hours[run.to].time, consultedAt, lang);
      if (end !== momentOf(hours[run.from].time, consultedAt, lang)) add(end);
    }
  }
  return TEXT[lang].watchText(worst === 2 ? 2 : 1, moments);
}

/** Presenta el resultado de cada grado de alerta ("solo señales fuertes" mira al equilibrado para avisar señales débiles). */
export function presentAll(
  bySensitivity: Record<Sensitivity, WindowAssessment>,
  window: WindowInfo,
  generatedAt: string,
  lang: Lang = 'es',
): Record<Sensitivity, ResultView> {
  return Object.fromEntries(
    SENSITIVITIES.map((s) => [s, present(bySensitivity[s], window, generatedAt, s, bySensitivity, lang)]),
  ) as Record<Sensitivity, ResultView>;
}

/** Lo mismo en cada idioma: la app cambia de idioma al instante, sin volver a consultar. */
export function presentAllLangs(
  bySensitivity: Record<Sensitivity, WindowAssessment>,
  window: WindowInfo,
  generatedAt: string,
): Record<Lang, Record<Sensitivity, ResultView>> {
  return Object.fromEntries(LANGS.map((l) => [l, presentAll(bySensitivity, window, generatedAt, l)])) as Record<Lang, Record<Sensitivity, ResultView>>;
}

export function present(
  r: WindowAssessment,
  window: WindowInfo,
  generatedAt: string,
  sensitivity: Sensitivity = DEFAULT_SENSITIVITY,
  bySensitivity?: Partial<Record<Sensitivity, WindowAssessment>>,
  lang: Lang = 'es',
): ResultView {
  const t = TEXT[lang];
  const fmt = fmtIn(t.locale);
  const level = viewLevelOf(r);
  const rules = SENSITIVITY_RULES[sensitivity];
  const stats = SENSITIVITY_STATS[sensitivity];
  const name = t.sensitivityNames[sensitivity];
  // "Solo señales fuertes" dice tranquilo, pero con el grado equilibrado ya habría aviso: se dice, sin subir el nivel.
  const balanced = bySensitivity?.balanced;
  const weakSignals = sensitivity === 'strict' && r.level === 'calm' && !!balanced && balanced.level !== 'calm';
  // Cada modelo con el mismo criterio: tranquilo para granizo pero formando tormentas → "storm".
  const models = (r.models ?? []).map((m) => {
    const lv: ViewLevel = m.level === 'calm' && m.check?.triggerPresent ? 'storm' : m.level;
    return { model: m.model, level: lv, levelName: t.levelNames[lv] };
  });
  const singleModel = models.length === 1;
  // Acuerdo en granizo (lo que usa el motor para la confianza); la tormenta no cuenta.
  const hailLevels = (r.models ?? []).map((m) => m.level);
  const agree = hailLevels.length < 2 || hailLevels[0] === hailLevels[1];
  const lowConfidence = r.confidence === 'low';

  const notices: ResultView['notices'] = [];
  if (agree && r.level === 'watch' && watchIsCommon(sensitivity)) {
    notices.push({ strong: t.usual.strong, text: t.usual.text(stats.watch.falseAlarm) });
  }
  if (r.level === 'protect') notices.push({ strong: t.inumet.strong, text: t.inumet.protect });
  if (level === 'storm') notices.push({ strong: t.inumet.strong, text: t.inumet.storm });

  // Motivo de la confianza, corto: modelos y estación.
  const reasonParts: string[] = [];
  if (singleModel) reasonParts.push(t.reason.onlyModel(models[0].model));
  else if (!agree) reasonParts.push(t.reason.disagree);
  else if (models.length === 2) reasonParts.push(t.reason.agree);
  if (r.season === 'warm') reasonParts.push(t.reason.warm);
  const confidenceReason = reasonParts.map(sentence).join(' ');

  // El "por qué": razones del motor menos las que ya se muestran como aviso.
  const why = r.reasons
    .filter((c) => c !== 'WARM_SEASON' && c !== 'MODELS_DISAGREE' && c !== 'MODELS_AGREE')
    .map((c) => sentence(t.reasons[c]));

  const hours = r.hourly.map((h, i, all) => ({
    time: h.time,
    label: i === 0 ? t.now : hh(h.time),
    day: i > 0 && h.time.slice(0, 10) !== all[i - 1].time.slice(0, 10) ? t.shortDays[weekday(h.time)] : null,
    level: (h.environment === 'strong' ? 2 : h.environment === 'supportive' ? 1 : 0) as 0 | 1 | 2,
  }));

  const i = r.peak.ingredients;
  const sources = models.map((m) => m.model).join(' + ') || 'GFS';
  const tech = [
    { k: t.tech.zone, v: t.tech.zoneValue },
    { k: t.tech.peak, v: t.tech.peakValue(r.peak.time.slice(11, 16)) },
    { k: t.tech.mucape, v: fmt(i.muCapeJkg, 0, ' J/kg') },
    { k: t.tech.shear, v: fmt(i.shear06Ms, 0, ' m/s') },
    { k: t.tech.lapse, v: fmt(i.lapse700500CKm, 1, ' °C/km') },
    { k: t.tech.wmaxshear, v: fmt(i.wmaxshearM2s2, 0, ' m²/s²') },
    { k: t.tech.freezing, v: fmt(i.freezingLevelMAgl === null ? null : Math.round(i.freezingLevelMAgl / 100) * 100, 0, ' m') },
    { k: t.tech.showers, v: fmt(r.trigger.maxShowersMm, 1, ' mm/h') },
    { k: t.tech.source, v: t.tech.sourceValue(sources, generatedAt.slice(11, 16), r.engineVersion) },
  ];

  // ---- Cómo se decidió (mismos umbrales que usa el motor) ----
  const n = (x: number | null, d: number) => fmt(x, d);
  const verdicts = (r.models ?? []).filter((m) => m.check);
  const rows: ResultView['algorithm']['rows'] = [
    {
      rule: t.rules.lapse,
      threshold: `≥ ${fmt(RULES.lapse700500CKm, 1)} °C/km`,
      values: verdicts.map((m) => ({
        model: m.model,
        text: `${n(m.check!.lapse700500CKm, 1)} °C/km`,
        pass: (m.check!.lapse700500CKm ?? 0) >= RULES.lapse700500CKm,
        mark: (m.check!.lapse700500CKm ?? 0) >= RULES.lapse700500CKm ? '✓' : '✗',
      })),
    },
    {
      rule: t.rules.wmaxshear,
      threshold:
        rules.wmaxshearWatch < rules.wmaxshearProtect
          ? t.rules.wmaxshearThreshold(fmt(rules.wmaxshearWatch), fmt(rules.wmaxshearProtect))
          : t.rules.wmaxshearSame(fmt(rules.wmaxshearProtect)),
      values: verdicts.map((m) => {
        const w = m.check!.wmaxshearM2s2 ?? 0;
        // ✓✓ supera el umbral de "chances reales"; ✓ solo el de "algunas chances".
        return { model: m.model, text: n(m.check!.wmaxshearM2s2, 0), pass: w >= rules.wmaxshearWatch, mark: w >= rules.wmaxshearProtect ? '✓✓' : w >= rules.wmaxshearWatch ? '✓' : '✗' };
      }),
    },
    {
      rule: t.rules.trigger,
      threshold: t.rules.triggerThreshold(fmt(TRIGGER.showersMm, 1), fmt(TRIGGER.precipitationMm, 0)),
      values: verdicts.map((m) => ({ model: m.model, text: `${n(m.check!.maxShowersMm, 1)} · ${n(m.check!.maxPrecipitationMm, 1)} mm/h`, pass: m.check!.triggerPresent, mark: m.check!.triggerPresent ? '✓' : '✗' })),
    },
  ];
  const perModel = verdicts.map((m) => `${m.model}: ${t.levelNames[m.level].toLowerCase()}`).join(' · ');
  const stormRule = r.storm ? t.combination.storm : '';
  const combination = (singleModel
    ? t.combination.single(perModel)
    : t.combination.multi(perModel, name, t.combineRule[rules.combine], t.levelNames[r.level])) + stormRule;
  const confidenceWhy = r.season === 'warm'
    ? t.confidenceWhy.warm
    : singleModel
      ? t.confidenceWhy.single
      : agree
        ? t.confidenceWhy.agree
        : t.confidenceWhy.disagree;

  const sensitivityOptions = APP_SENSITIVITIES.map((id) => ({ id, name: t.sensitivityNames[id], summary: t.sensitivitySummary[id] }));

  return {
    sensitivity,
    sensitivityName: name,
    sensitivityOptions,
    algorithm: {
      rows,
      combination,
      confidenceWhy,
      validation: t.validation(name, stats, pct),
      moreUrl: 'https://github.com/PabloManzoni/granizo/blob/main/docs/como-lo-probamos.md',
    },
    level,
    levelName: t.levelNames[level],
    hailStatus: weakSignals ? t.weakSignals : t.hailStatus[level],
    note: noteFor(lang, level, lowConfidence, agree, singleModel, sensitivity),
    title: titleFor(lang, level, lowConfidence, agree, weakSignals),
    confidence: r.confidence,
    confidenceLabel: t.confidenceLabels[r.confidence],
    confidenceDots: { low: 1, medium: 2, high: 3 }[r.confidence],
    season: r.season,
    models,
    modelsAgree: agree,
    confidenceReason,
    notices,
    why,
    window: { ...window, label: t.windowLabels[window.name as keyof typeof t.windowLabels] ?? window.label },
    hours,
    watchText: watchTextFor(hours, generatedAt, lang),
    tech,
    generatedAt,
    engineVersion: r.engineVersion,
    disclaimer: t.disclaimer,
  };
}
