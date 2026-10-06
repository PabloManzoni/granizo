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
 * Grado de alerta que elige cada persona (se guarda en su teléfono). No cambia los datos ni los ingredientes:
 * cambia cuánta señal hace falta para subir el nivel. "Equilibrado" es el motor tal cual (RULES + la regla de los dos
 * modelos); los otros dos solo mueven perillas que ya estaban calibradas.
 */
export type Sensitivity = 'sensitive' | 'balanced' | 'strict';
export const SENSITIVITIES: Sensitivity[] = ['sensitive', 'balanced', 'strict'];
export const DEFAULT_SENSITIVITY: Sensitivity = 'balanced';

export interface SensitivityRules {
  /** WMAXSHEAR para "atento" en cada modelo (m²/s²). */
  wmaxshearWatch: number;
  /** WMAXSHEAR para ambiente fuerte ("protegelo" si además el modelo forma tormentas). */
  wmaxshearProtect: number;
  /**
   * Cómo se juntan GFS y ECMWF:
   * - either: alcanza con uno (vale el nivel más alto);
   * - both: protegelo si los dos dicen protegelo; atento si alguno dice protegelo o los dos al menos atento (v0.2);
   * - both-strict: los dos lo tienen que ver (vale el nivel más bajo).
   */
  combine: 'either' | 'both' | 'both-strict';
}

/**
 * Barrido en scripts/sweep-sensitivity.ts, mismos 124 casos que el umbral de "atento" (granizo dañino o sin dato de
 * tamaño contra días de tormenta sin granizo). Detección / falsas alarmas:
 *
 *                          Atento o más                   Protegelo
 *                        entren. 21–24  prueba 25–26   entren. 21–24  prueba 25–26
 *   Cualquier señal        88% / 63%     96% / 79%      75% / 13%     68% / 29%
 *   Equilibrado            75% / 34%     82% / 38%      63% /  5%     43% / 15%
 *   Solo señales fuertes   63% /  5%     46% / 18%      63% /  5%     43% / 15%
 *
 * "Cualquier señal" vuelve al umbral de atento de la v0.2.0 (400) y no pide que coincidan los modelos.
 * "Solo señales fuertes" pide ambiente fuerte (1200) en los dos: atento queda para cuando los dos lo ven pero alguno
 * no forma tormentas, y protegelo no cambia. Subir el umbral de protegelo para este grado no convenía: con 1400
 * baja la detección de 43% a 32% y las falsas alarmas apenas de 15% a 12% (prueba).
 * Los grados se eligieron mirando todos los años: los números de prueba no son una validación limpia.
 */
export const SENSITIVITY_RULES: Record<Sensitivity, SensitivityRules> = {
  sensitive: { wmaxshearWatch: 400, wmaxshearProtect: RULES.wmaxshearProtect, combine: 'either' },
  balanced: { wmaxshearWatch: RULES.wmaxshearWatch, wmaxshearProtect: RULES.wmaxshearProtect, combine: 'both' },
  strict: { wmaxshearWatch: RULES.wmaxshearProtect, wmaxshearProtect: RULES.wmaxshearProtect, combine: 'both-strict' },
};

/** Fracciones de la tabla de arriba (prueba 2025–2026), para los textos de la app. */
export const SENSITIVITY_STATS: Record<Sensitivity, { watch: { hit: number; falseAlarm: number }; protect: { hit: number; falseAlarm: number } }> = {
  sensitive: { watch: { hit: 0.96, falseAlarm: 0.79 }, protect: { hit: 0.68, falseAlarm: 0.29 } },
  balanced: { watch: { hit: 0.82, falseAlarm: 0.38 }, protect: { hit: 0.43, falseAlarm: 0.15 } },
  strict: { watch: { hit: 0.46, falseAlarm: 0.18 }, protect: { hit: 0.43, falseAlarm: 0.15 } },
};

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
