// Convierte el resultado del motor en lo que muestra la interfaz (textos de plantilla, sin IA).
// Separado del motor: el motor decide el nivel; acá solo se redacta.
import { RULES, TRIGGER } from './engine/config.ts';
import { DISCLAIMER, REASONS } from './engine/messages.ts';
import type { RiskLevel, WindowAssessment } from './engine/types.ts';

/** Lo que se muestra: los tres niveles de granizo más "tormenta" (tranquilo para granizo, pero con tormentas). */
export type ViewLevel = RiskLevel | 'storm';

export const LEVEL_NAMES: Record<ViewLevel, string> = {
  calm: 'Tranquilo',
  storm: 'Tormenta',
  watch: 'Atento',
  protect: 'Protegelo',
};

/** La palabra "granizo" siempre visible junto al nivel: la app es solo para granizo. */
export const HAIL_STATUS: Record<ViewLevel, string> = {
  calm: 'Sin señales de granizo',
  storm: 'Lluvia fuerte, sin piedra',
  watch: 'Posible granizo',
  protect: 'Peligro de granizo',
};

export interface WindowInfo {
  name: string;
  label: string;
  from: string;
  to: string;
}

export interface ResultView {
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
  /** 0 = nada, 1 = vigilar, 2 = fuerte. */
  hours: { time: string; label: string; level: 0 | 1 | 2 }[];
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

function titleFor(level: ViewLevel, lowConfidence: boolean, agree: boolean): string {
  if (level === 'protect') return 'Chances reales de piedra en tu zona.';
  if (level === 'storm') return lowConfidence ? 'Se forman tormentas en tu zona; pocas chances de piedra.' : 'Se forman tormentas en tu zona, pero no es clima de piedra.';
  if (level === 'watch') return agree ? 'Hay ingredientes para piedra en tu zona.' : 'Los modelos no se ponen de acuerdo.';
  return lowConfidence ? 'Pocas chances de piedra en tu zona.' : 'No es clima de piedra en tu zona.';
}

function noteFor(level: ViewLevel, lowConfidence: boolean, agree: boolean, singleModel: boolean): string | null {
  if (singleModel) return 'un solo modelo';
  if (!agree) return 'modelos divididos';
  if ((level === 'calm' || level === 'storm') && lowConfidence) return 'con reservas';
  if (level === 'watch') return 'lo habitual con tormenta';
  return null;
}

function watchTextFor(hours: ResultView['hours']): string | null {
  const flagged = hours.filter((h) => h.level > 0);
  if (!flagged.length) return null;
  const first = hh(flagged[0].time);
  if (flagged.length === 1) return `Alrededor de las ${first} h.`;
  const lastHour = (Number(hh(flagged[flagged.length - 1].time)) + 1) % 24;
  return `Entre las ${first} y las ${String(lastHour).padStart(2, '0')} h.`;
}

export function present(r: WindowAssessment, window: WindowInfo, generatedAt: string): ResultView {
  const level: ViewLevel = r.storm ? 'storm' : r.level;
  // Cada modelo con el mismo criterio: tranquilo para granizo pero formando tormentas → "Tormenta".
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
  if (agree && r.level === 'watch') {
    notices.push({
      strong: 'Es lo habitual.',
      text: 'Así salen 2 de cada 3 días de tormenta. No es para correr: es para tener pensado dónde guardarlo.',
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

  const hours = r.hourly.map((h) => ({
    time: h.time,
    label: hh(h.time),
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
      threshold: `≥ ${fmt(RULES.wmaxshearWatch)} atento · ≥ ${fmt(RULES.wmaxshearProtect)} protegelo`,
      values: verdicts.map((m) => {
        const w = m.check!.wmaxshearM2s2 ?? 0;
        // ✓✓ supera el umbral de "protegelo"; ✓ solo el de "atento".
        return { model: m.model, text: n(m.check!.wmaxshearM2s2, 0), pass: w >= RULES.wmaxshearWatch, mark: w >= RULES.wmaxshearProtect ? '✓✓' : w >= RULES.wmaxshearWatch ? '✓' : '✗' };
      }),
    },
    {
      rule: 'El modelo forma tormentas en la ventana',
      threshold: `lluvia convectiva ≥ ${fmt(TRIGGER.showersMm, 1)} o total ≥ ${fmt(TRIGGER.precipitationMm, 0)} mm/h`,
      values: verdicts.map((m) => ({ model: m.model, text: `${n(m.check!.maxShowersMm, 1)} · ${n(m.check!.maxPrecipitationMm, 1)} mm/h`, pass: m.check!.triggerPresent, mark: m.check!.triggerPresent ? '✓' : '✗' })),
    },
  ];
  const perModel = verdicts.map((m) => `${m.model}: ${LEVEL_NAMES[m.level].toLowerCase()}`).join(' · ');
  const stormRule = r.storm ? ' Sin ambiente de granizo, pero el modelo forma tormentas en la zona → Tormenta.' : '';
  const combination = (singleModel
    ? `Un solo modelo disponible (${perModel}): su nivel es el resultado.`
    : `${perModel}. Regla: protegelo solo si los dos dicen protegelo; atento si alguno dice protegelo o los dos dicen al menos atento. → ${LEVEL_NAMES[r.level]}.`) + stormRule;
  const confidenceWhy = r.season === 'warm'
    ? 'Entre octubre y marzo la confianza es siempre baja: en la prueba histórica el ambiente no distinguió granizo de lluvia.'
    : singleModel
      ? 'Con un solo modelo no hay con qué contrastar → baja.'
      : agree
        ? 'Abril–septiembre y los modelos coinciden → media. No damos "alta": la prueba histórica no lo justifica.'
        : 'Los modelos no coinciden → baja.';

  return {
    algorithm: {
      rows,
      combination,
      confidenceWhy,
      validation:
        'Reglas calibradas con granizadas y días de tormenta de Uruguay 2021–2024 y probadas en 2025–2026: "Protegelo" avisó en ~4 de cada 10 granizadas, con ~15% de falsas alarmas en días de tormenta. Es un motor de reglas, sin IA.',
      moreUrl: 'https://github.com/PabloManzoni/granizo/blob/main/docs/como-lo-probamos.md',
    },
    level,
    levelName: LEVEL_NAMES[level],
    hailStatus: HAIL_STATUS[level],
    note: noteFor(level, lowConfidence, agree, singleModel),
    title: titleFor(level, lowConfidence, agree),
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
    watchText: watchTextFor(hours),
    tech,
    generatedAt,
    engineVersion: r.engineVersion,
    disclaimer: DISCLAIMER,
  };
}
