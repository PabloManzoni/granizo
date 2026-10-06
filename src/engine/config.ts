// Umbrales del motor. v0.2: calibrados con granizadas y controles de Uruguay 2021–2024 y validados
// fuera de muestra en 2025–2026 (ver docs/como-lo-probamos.md). Muestras chicas: tomarlos como provisorios.

export const ENGINE_VERSION = '0.2.0';

/**
 * Reglas de decisión (por punto-hora). En Uruguay lo que mejor separó granizo de tormenta común,
 * comparando días de la misma época, fue:
 * - gradiente térmico 700–500 hPa (el aire se enfría rápido con la altura → "fábrica de hielo"), y
 * - WMAXSHEAR = √(2·MUCAPE)·cizalladura 0–6 km (energía y viento juntos → corrientes fuertes y organizadas).
 * La CAPE sola y la cizalladura sola casi no separan (la cizalladura acá es alta casi siempre).
 */
export const RULES = {
  /** Gradiente 700–500 mínimo para contar como ambiente de granizo (°C/km). */
  lapse700500CKm: 6.5,
  /** WMAXSHEAR para "atento" (m²/s²): elegido para detectar ≥ 85% en entrenamiento. */
  wmaxshearWatch: 400,
  /** WMAXSHEAR para "protegelo" (m²/s²): el que mejor separó en entrenamiento. */
  wmaxshearProtect: 1200,
} as const;

/**
 * Límites [marginal, favorable, strong] de cada ingrediente. Solo descriptivos (para explicar el "por qué");
 * la decisión usa RULES. Cizalladura recalibrada: en días de tormenta en Uruguay la mediana ronda 30 m/s.
 */
export const THRESHOLDS = {
  muCapeJkg: [250, 1000, 2500],
  shear06Ms: [15, 25, 35],
  lapse700500CKm: [6.0, 6.5, 7.5],
  /** Para T500 "más frío es mejor": se compara −T500. */
  minusT500C: [6, 8, 12],
  wmaxshearM2s2: [400, 800, 1200],
} as const;

/** SHIP a partir del cual se menciona como razón (no decide). */
export const SHIP_NOTABLE = 0.5;

/** Señal de que el modelo dispara tormentas en la ventana (mm en una hora, en algún punto). */
export const TRIGGER = {
  showersMm: 0.5,
  precipitationMm: 2.0,
} as const;

/** Por encima de esto el granizo chico se derrite; el grande igual llega. Solo se informa. */
export const HIGH_FREEZING_LEVEL_M_AGL = 4500;

/**
 * Meses de la estación cálida (oct–mar). En el test, el ambiente del modelo NO distinguió granizo de lluvia
 * en esta época: la confianza baja y la app lo dice.
 */
export const WARM_SEASON_MONTHS = [10, 11, 12, 1, 2, 3];

/** Zona alrededor del punto (ver analisis-motor.md: el SPC usa ~40 km). */
export const NEIGHBORHOOD = {
  radiusKm: 40,
  spacingKm: 25,
} as const;
