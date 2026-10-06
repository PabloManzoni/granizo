// Tipos del motor. Unidades siempre en el nombre del campo.

export interface Wind {
  speedMs: number;
  directionDeg: number; // de dónde viene (convención meteorológica)
}

/** Un nivel de presión del perfil vertical, sobre el suelo. */
export interface ProfileLevel {
  pressureHpa: number;
  temperatureC: number;
  dewPointC: number;
  heightM: number; // sobre el nivel del mar
}

export interface WindLevel {
  pressureHpa: number;
  heightM: number; // sobre el nivel del mar
  wind: Wind;
}

/** Perfil atmosférico de un punto en una hora. */
export interface ProfileHour {
  time: string; // hora local Uruguay, "YYYY-MM-DDTHH:MM"
  lat: number;
  lon: number;
  elevationM: number;
  surface: {
    pressureHpa: number;
    temperatureC: number;
    dewPointC: number;
    wind10m: Wind;
  };
  levels: ProfileLevel[]; // presión descendente, solo niveles sobre el suelo
  winds: WindLevel[]; // presión descendente
  freezingLevelM: number | null; // sobre el nivel del mar
  showersMm: number | null; // precipitación convectiva del modelo en la hora
  precipitationMm: number | null;
  modelCapeJkg: number | null; // CAPE que entrega el modelo (parcela no documentada), solo referencia
}

export interface Ingredients {
  muCapeJkg: number;
  muCinJkg: number; // ≤ 0
  muMixingRatioGkg: number;
  muStartHpa: number;
  shear06Ms: number | null;
  lapse700500CKm: number | null;
  t500C: number | null;
  freezingLevelMAgl: number | null;
  ship: number | null;
  /** √(2·MUCAPE)·cizalladura 0–6 km: energía y viento juntos. */
  wmaxshearM2s2: number | null;
  showersMm: number;
  precipitationMm: number;
  modelCapeJkg: number | null;
}

export type IngredientLevel = 'unfavorable' | 'marginal' | 'favorable' | 'strong';

export interface IngredientLevels {
  instability: IngredientLevel;
  shear: IngredientLevel;
  growth: IngredientLevel;
  /** Energía × viento (WMAXSHEAR). */
  stormPotential: IngredientLevel;
}

/** Qué tan favorable es el ambiente en un punto-hora. */
export type Environment = 'weak' | 'supportive' | 'strong';

/** Nivel de la escalera de acciones. Nombres visibles: a definir en diseño. */
export type RiskLevel = 'calm' | 'watch' | 'protect';

export type ReasonCode =
  | 'GOOD_HAIL_GROWTH'
  | 'POOR_HAIL_GROWTH'
  | 'STRONG_STORM_POTENTIAL'
  | 'MODERATE_STORM_POTENTIAL'
  | 'WEAK_STORM_POTENTIAL'
  | 'HIGH_SHIP'
  | 'MODEL_CONVECTION'
  | 'NO_MODEL_CONVECTION'
  | 'HIGH_FREEZING_LEVEL'
  | 'WARM_SEASON'
  | 'MODELS_AGREE'
  | 'MODELS_DISAGREE';

export type Season = 'warm' | 'cold';
export type Confidence = 'low' | 'medium' | 'high';

export interface PointHourAssessment {
  time: string;
  lat: number;
  lon: number;
  ingredients: Ingredients;
  levels: IngredientLevels;
  environment: Environment;
}

export interface ModelVerdict {
  model: string;
  level: RiskLevel;
  check?: {
    lapse700500CKm: number | null;
    wmaxshearM2s2: number | null;
    maxShowersMm: number;
    maxPrecipitationMm: number;
    triggerPresent: boolean;
  };
}

export interface WindowAssessment {
  level: RiskLevel;
  /**
   * Sin ambiente de granizo ("calm") pero el modelo forma tormentas en la zona (el mismo disparo de `trigger`):
   * lluvia fuerte o rayos, sin piedra. No es un nivel de granizo: el backtest y los niveles no lo usan.
   */
  storm: boolean;
  /** Qué tan confiable es el nivel. En la estación cálida el ambiente distingue poco → baja. */
  confidence: Confidence;
  season: Season;
  reasons: ReasonCode[];
  /** El punto-hora más favorable de la ventana; de ahí salen las razones. */
  peak: PointHourAssessment;
  trigger: { present: boolean; maxShowersMm: number; maxPrecipitationMm: number };
  counts: { pointHours: number; supportive: number; strong: number };
  /** Horas (locales) con ambiente al menos "supportive" en algún punto. */
  favorableHours: string[];
  /** Ambiente más favorable de la zona, hora por hora (para la línea de "horas a vigilar"). */
  hourly: { time: string; environment: Environment }[];
  engineVersion: string;
  /** Nivel según cada modelo, con los valores que usó para decidir (punto-hora más favorable). */
  models?: ModelVerdict[];
}
