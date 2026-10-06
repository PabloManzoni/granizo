// Punto de entrada del motor: lugar + ventana → veredicto.
import { assessPointHour, assessWindow, combineModels } from './engine/classify.ts';
import { NEIGHBORHOOD } from './engine/config.ts';
import { computeIngredients } from './engine/ingredients.ts';
import type { ProfileHour, WindowAssessment } from './engine/types.ts';
import { fetchProfiles, RateLimitError, type Source } from './data/openMeteo.ts';
import { neighborhood, type Point } from './geo/neighborhood.ts';

export interface AssessRequest {
  center: Point;
  /** Hora local "YYYY-MM-DDTHH:MM", inclusive. */
  from: string;
  to: string;
  source: Source;
  radiusKm?: number;
  /** Modelos de Open-Meteo a combinar. Por defecto GFS + ECMWF; si uno no tiene datos, se sigue con el otro. */
  models?: string[];
}

export const DEFAULT_MODELS = ['gfs_seamless', 'ecmwf_ifs025'];
const MODEL_NAMES: Record<string, string> = { gfs_seamless: 'GFS', ecmwf_ifs025: 'ECMWF' };
/** Desde cuándo el archivo histórico de Open-Meteo tiene perfiles completos de cada modelo. */
const HISTORICAL_START: Record<string, string> = { gfs_seamless: '2021-03-01', ecmwf_ifs025: '2024-06-01' };

export async function assess(req: AssessRequest): Promise<WindowAssessment & { dataPoints: number }> {
  const points = neighborhood(req.center, req.radiusKm ?? NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm);
  const results: { model: string; assessment: WindowAssessment & { dataPoints: number } }[] = [];
  let lastError: unknown;
  for (const model of req.models ?? DEFAULT_MODELS) {
    if (req.source === 'historical' && req.from < (HISTORICAL_START[model] ?? '')) continue;
    try {
      const profiles = await fetchProfiles({
        source: req.source,
        points,
        startDate: req.from.slice(0, 10),
        endDate: req.to.slice(0, 10),
        model,
      });
      results.push({ model: MODEL_NAMES[model] ?? model, assessment: assessProfiles(profiles, req.from, req.to) });
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      lastError = err; // p. ej. ECMWF no tiene archivo antes de mediados de 2024: se sigue con el otro modelo
    }
  }
  if (results.length === 0) throw lastError;
  return { ...combineModels(results), dataPoints: Math.max(...results.map((r) => r.assessment.dataPoints)) };
}

/** Evalúa una ventana sobre perfiles ya descargados (permite varias ventanas con una sola descarga). */
export function assessProfiles(
  profiles: ProfileHour[],
  from: string,
  to: string,
): WindowAssessment & { dataPoints: number } {
  const inWindow = profiles.filter((p) => p.time >= from && p.time <= to);
  const pointHours = inWindow.map((p) => assessPointHour(p.time, p.lat, p.lon, computeIngredients(p)));
  return { ...assessWindow(pointHours), dataPoints: new Set(inWindow.map((p) => `${p.lat},${p.lon}`)).size };
}
