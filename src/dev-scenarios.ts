// Escenarios de desarrollo: pasan por el motor (reglas, combinación de modelos) y el presentador reales,
// con ingredientes armados a mano. Sirven para ver cada estado de la UI sin esperar a que el cielo colabore.
// Solo se exponen fuera de producción (ver server.ts).
import { assessPointHour, assessWindow, combineModels } from './engine/classify.ts';
import { SENSITIVITIES, SENSITIVITY_RULES, type Sensitivity, type SensitivityRules } from './engine/config.ts';
import type { Ingredients, WindowAssessment } from './engine/types.ts';
import { presentAll, type ResultView } from './presenter.ts';
import { WINDOW_LABELS } from './windows.ts';

type Env = 'weak' | 'storm' | 'watch' | 'strong';

const INGREDIENTS: Record<Env, Ingredients> = {
  weak: {
    muCapeJkg: 150, muCinJkg: -60, muMixingRatioGkg: 10, muStartHpa: 950, shear06Ms: 12, lapse700500CKm: 5.8,
    t500C: -9, freezingLevelMAgl: 3900, ship: 0, wmaxshearM2s2: 210, showersMm: 0, precipitationMm: 0, modelCapeJkg: 100,
  },
  // Tormenta de agua: energía y lluvia convectiva, pero el aire no se enfría lo suficiente con la altura.
  storm: {
    muCapeJkg: 900, muCinJkg: -40, muMixingRatioGkg: 12.5, muStartHpa: 950, shear06Ms: 18, lapse700500CKm: 6.0,
    t500C: -8, freezingLevelMAgl: 4100, ship: 0.2, wmaxshearM2s2: 764, showersMm: 3.5, precipitationMm: 7.2, modelCapeJkg: 800,
  },
  watch: {
    muCapeJkg: 700, muCinJkg: -30, muMixingRatioGkg: 12, muStartHpa: 925, shear06Ms: 25, lapse700500CKm: 6.8,
    t500C: -12, freezingLevelMAgl: 3600, ship: 0.4, wmaxshearM2s2: 935, showersMm: 1.2, precipitationMm: 2.4, modelCapeJkg: 600,
  },
  strong: {
    muCapeJkg: 2200, muCinJkg: -15, muMixingRatioGkg: 13.5, muStartHpa: 900, shear06Ms: 34, lapse700500CKm: 7.4,
    t500C: -14, freezingLevelMAgl: 3400, ship: 1.6, wmaxshearM2s2: 2255, showersMm: 6.5, precipitationMm: 9.8, modelCapeJkg: 1900,
  },
};

/** Las 24 h que mira la app. */
const HOURS = 24;

/** Ventana de 24 h desde `start` ("YYYY-MM-DDTHH"); `pattern` asigna un ambiente por hora (índice), el resto queda "weak". */
const windowAssessment = (start: string, pattern: Record<number, Env>) => (rules: SensitivityRules): WindowAssessment => {
  const pts = Array.from({ length: HOURS }, (_, i) =>
    assessPointHour(hourAt(start, i), -34.8, -55.9, INGREDIENTS[pattern[i] ?? 'weak'], rules),
  );
  return assessWindow(pts, rules);
};
const hourAt = (start: string, plus: number) => new Date(Date.parse(`${start}:00:00Z`) + plus * 3600_000).toISOString().slice(0, 16);

const range = (a: number, b: number, env: Env) => Object.fromEntries(Array.from({ length: b - a + 1 }, (_, k) => [a + k, env]));

/** `start`: la hora de la consulta; `pattern`: ambiente por hora desde ahí (índice). */
type Scenario = { models: { model: string; pattern: Record<number, Env> }[]; start: string };

const SCENARIOS: Record<string, () => Scenario> = {
  tranquilo: () => ({ start: '2026-07-15T20', models: [{ model: 'GFS', pattern: {} }, { model: 'ECMWF', pattern: {} }] }),
  tranquilo_verano: () => ({ start: '2026-01-15T08', models: [{ model: 'GFS', pattern: {} }, { model: 'ECMWF', pattern: {} }] }),
  tormenta: () => ({
    start: '2026-06-12T08',
    models: [
      { model: 'GFS', pattern: range(6, 9, 'storm') },
      { model: 'ECMWF', pattern: range(7, 10, 'storm') },
    ],
  }),
  tormenta_verano: () => ({
    start: '2026-01-20T20',
    models: [
      { model: 'GFS', pattern: range(1, 4, 'storm') },
      { model: 'ECMWF', pattern: {} },
    ],
  }),
  atento: () => ({
    start: '2026-08-20T08',
    models: [
      { model: 'GFS', pattern: range(8, 10, 'watch') },
      { model: 'ECMWF', pattern: range(8, 11, 'watch') },
    ],
  }),
  atento_divididos: () => ({
    start: '2026-08-20T08',
    models: [
      { model: 'GFS', pattern: { ...range(6, 9, 'watch'), 7: 'strong', 8: 'strong' } },
      { model: 'ECMWF', pattern: {} },
    ],
  }),
  // La piedra cae en el segundo tramo de 12 h (para probar que el gráfico abre ahí).
  protegelo: () => ({
    start: '2026-09-09T20',
    models: [
      { model: 'GFS', pattern: { 20: 'watch', ...range(21, 23, 'strong') } },
      { model: 'ECMWF', pattern: range(21, 23, 'strong') },
    ],
  }),
  un_modelo: () => ({ start: '2026-08-20T08', models: [{ model: 'GFS', pattern: range(7, 9, 'watch') }] }),
};

export const DEV_SCENARIOS = Object.keys(SCENARIOS);

/** El escenario con cada grado de alerta, igual que lo devuelve assessHere. Se consulta a los 40 minutos de `start`. */
export function devScenario(name: string): Record<Sensitivity, ResultView> {
  const s = SCENARIOS[name]();
  const bySensitivity = Object.fromEntries(
    SENSITIVITIES.map((sens) => {
      const rules = SENSITIVITY_RULES[sens];
      return [sens, combineModels(s.models.map((m) => ({ model: m.model, assessment: windowAssessment(s.start, m.pattern)(rules) })), rules.combine)];
    }),
  ) as Record<Sensitivity, WindowAssessment>;
  const window = { name: 'next24h', label: WINDOW_LABELS.next24h, from: hourAt(s.start, 0), to: hourAt(s.start, HOURS - 1) };
  return presentAll(bySensitivity, window, `${s.start}:40`);
}
