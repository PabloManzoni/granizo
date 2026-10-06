// Umbrales del motor. v0.2: calibrados con granizadas y controles de Uruguay 2021–2024 y validados
// fuera de muestra en 2025–2026 (ver docs/como-lo-probamos.md). Muestras chicas: tomarlos como provisorios.

export const ENGINE_VERSION = '0.2.1';

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
  /**
   * WMAXSHEAR para "atento" (m²/s²). v0.2.1: 900 (antes 400).
   *
   * Con 400, "atento" se activaba en el 65% de los días de tormenta sin granizo (prueba 2025–26, dos modelos) y en el
   * 55% en entrenamiento: casi un "hoy hay tormenta", sin poder de decisión. Barrido de este umbral sobre los 124
   * casos con granizo dañino o sin dato de tamaño contra controles (scripts/sweep-watch.ts), detección / falsas alarmas:
   *
   *   umbral   entrenamiento 2021–24   prueba 2025–26
   *     400        88% / 55%            93% / 65%   (v0.2.0)
   *     600        83% / 47%            89% / 47%
   *     800        75% / 39%            86% / 44%
   *     900        75% / 34%            82% / 38%   (elegido)
   *    1000        75% / 26%            75% / 35%
   *    1100        75% / 21%            71% / 32%
   *
   * El TSS es una meseta entre 600 y 900 (0,42–0,44 en la prueba) y la detección cae por debajo del 80% más allá de 900.
   * Se eligió 900 como el punto donde todavía se avisa de ~4 de cada 5 granizadas y las falsas alarmas bajan de 65% a 38%.
   * La diferencia entre 800 y 900 está dentro del ruido (±0,2 de TSS con ~30 casos por grupo); los años de prueba ya se
   * habían mirado, así que este valor es provisorio hasta medir hacia adelante con el registro de data/forecast-log/runs/.
   * "Protegelo" no cambia (1200): el nivel de "atento" más alto no lo toca porque el máximo exige también tormentas.
   */
  wmaxshearWatch: 900,
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
