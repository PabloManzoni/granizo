// Textos en plantillas (sin LLM). Redacción provisoria: el diseño y los nombres de nivel se definen después.
import type { Confidence, ReasonCode, RiskLevel, Season } from './types.ts';

export const HEADLINES: Record<RiskLevel, string> = {
  calm: 'Tranquilo: no es clima de granizo en tu zona.',
  watch: 'Atento: hay ingredientes para granizo en tu zona. Tené a mano con qué cubrirlo.',
  protect: 'Protegelo: ambiente fuerte para granizo y el modelo forma tormentas en tu zona.',
};

export const REASONS: Record<ReasonCode, string> = {
  GOOD_HAIL_GROWTH: 'El aire se enfría rápido con la altura: buenas condiciones para que crezca el granizo',
  POOR_HAIL_GROWTH: 'El aire no se enfría lo suficiente con la altura para piedras grandes',
  STRONG_STORM_POTENTIAL: 'Energía y viento en altura alcanzan para tormentas fuertes y organizadas',
  MODERATE_STORM_POTENTIAL: 'Energía y viento moderados para tormentas organizadas',
  WEAK_STORM_POTENTIAL: 'Poca energía o poco viento para tormentas fuertes',
  HIGH_SHIP: 'El índice de granizo significativo (SHIP) está elevado',
  MODEL_CONVECTION: 'El modelo forma tormentas en la zona',
  NO_MODEL_CONVECTION: 'El modelo no forma tormentas en la zona (el disparo es lo más incierto)',
  HIGH_FREEZING_LEVEL: 'Nivel de congelamiento alto: el granizo chico se derrite antes de llegar',
  WARM_SEASON:
    'Entre octubre y marzo, el pronóstico distingue poco una tormenta con granizo de una con lluvia: mirá el cielo y las alertas',
  MODELS_AGREE: 'Los dos modelos (GFS y ECMWF) coinciden',
  MODELS_DISAGREE: 'Los modelos no coinciden: tomalo con pinzas',
};

export const CONFIDENCE: Record<Confidence, string> = {
  low: 'Confianza baja',
  medium: 'Confianza media',
  high: 'Confianza alta',
};

export const SEASON_NOTE: Record<Season, string> = {
  warm: 'Estación cálida: en el test histórico el ambiente no separó granizo de lluvia.',
  cold: 'Estación fría: en el test histórico el ambiente separó granizo de tormenta común en ~2 de cada 3 casos.',
};

export const DISCLAIMER =
  'Habla de una zona de ~40 km, no de tu techo. "Muy pocas chances" no significa imposible. Mirá siempre las alertas oficiales de INUMET.';
