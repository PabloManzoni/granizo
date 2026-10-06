// Punto de entrada del motor: lugar + ventana → veredicto.
import { assessPointHour, assessWindow, combineModels } from './engine/classify.ts';
import { DEFAULT_SENSITIVITY, NEIGHBORHOOD, SENSITIVITIES, SENSITIVITY_RULES, type Sensitivity } from './engine/config.ts';
import { computeIngredients } from './engine/ingredients.ts';
import type { Ingredients, ProfileHour, WindowAssessment } from './engine/types.ts';
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
  /** Grado de alerta. Por defecto, equilibrado. */
  sensitivity?: Sensitivity;
}

export const DEFAULT_MODELS = ['gfs_seamless', 'ecmwf_ifs025'];
const MODEL_NAMES: Record<string, string> = { gfs_seamless: 'GFS', ecmwf_ifs025: 'ECMWF' };
/** Desde cuándo el archivo histórico de Open-Meteo tiene perfiles completos de cada modelo. */
const HISTORICAL_START: Record<string, string> = { gfs_seamless: '2021-03-01', ecmwf_ifs025: '2024-06-01' };

type Assessed = WindowAssessment & { dataPoints: number };
/** Ingredientes de un punto-hora: lo caro de calcular, y lo mismo para cualquier grado de alerta. */
type Sample = { time: string; lat: number; lon: number; ingredients: Ingredients };

export async function assess(req: AssessRequest): Promise<Assessed> {
  return combineFor(await sampleModels(req), req.sensitivity ?? DEFAULT_SENSITIVITY);
}

/** El veredicto con cada grado de alerta, con una sola descarga y un solo cálculo de ingredientes. */
export async function assessBySensitivity(req: AssessRequest): Promise<Record<Sensitivity, Assessed>> {
  const models = await sampleModels(req);
  return Object.fromEntries(SENSITIVITIES.map((s) => [s, combineFor(models, s)])) as Record<Sensitivity, Assessed>;
}

async function sampleModels(req: AssessRequest): Promise<{ model: string; samples: Sample[] }[]> {
  const points = neighborhood(req.center, req.radiusKm ?? NEIGHBORHOOD.radiusKm, NEIGHBORHOOD.spacingKm);
  const out: { model: string; samples: Sample[] }[] = [];
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
      const samples = samplesInWindow(profiles, req.from, req.to);
      if (samples.length === 0) throw new Error('No hay datos para la ventana pedida');
      out.push({ model: MODEL_NAMES[model] ?? model, samples });
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      lastError = err; // p. ej. ECMWF no tiene archivo antes de mediados de 2024: se sigue con el otro modelo
    }
  }
  if (out.length === 0) throw lastError;
  return out;
}

function combineFor(models: { model: string; samples: Sample[] }[], sensitivity: Sensitivity): Assessed {
  const results = models.map((m) => ({ model: m.model, assessment: assessSamples(m.samples, sensitivity) }));
  return {
    ...combineModels(results, SENSITIVITY_RULES[sensitivity].combine),
    dataPoints: Math.max(...results.map((r) => r.assessment.dataPoints)),
  };
}

function samplesInWindow(profiles: ProfileHour[], from: string, to: string): Sample[] {
  return profiles
    .filter((p) => p.time >= from && p.time <= to)
    .map((p) => ({ time: p.time, lat: p.lat, lon: p.lon, ingredients: computeIngredients(p) }));
}

function assessSamples(samples: Sample[], sensitivity: Sensitivity): Assessed {
  const rules = SENSITIVITY_RULES[sensitivity];
  const pointHours = samples.map((s) => assessPointHour(s.time, s.lat, s.lon, s.ingredients, rules));
  return { ...assessWindow(pointHours, rules), dataPoints: new Set(samples.map((s) => `${s.lat},${s.lon}`)).size };
}

/** Evalúa una ventana sobre perfiles ya descargados (permite varias ventanas con una sola descarga). */
export function assessProfiles(
  profiles: ProfileHour[],
  from: string,
  to: string,
  sensitivity: Sensitivity = DEFAULT_SENSITIVITY,
): Assessed {
  return assessSamples(samplesInWindow(profiles, from, to), sensitivity);
}
