// Escenarios de desarrollo: pasan por el motor (reglas, combinación de modelos) y el presentador reales,
// con ingredientes armados a mano. Sirven para ver cada estado de la UI sin esperar a que el cielo colabore.
// Solo se exponen fuera de producción (ver server.ts).
import { assessPointHour, assessWindow, combineModels } from './engine/classify.ts';
import { SENSITIVITIES, SENSITIVITY_RULES, type Sensitivity, type SensitivityRules } from './engine/config.ts';
import type { Ingredients, WindowAssessment } from './engine/types.ts';
import { presentAll, type ResultView } from './presenter.ts';

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

/** Ventana de 24 h desde `start`; `pattern` asigna un ambiente por hora (índice), el resto queda "weak". */
const windowAssessment = (date: string, startHour: number, pattern: Record<number, Env>) => (rules: SensitivityRules): WindowAssessment => {
  const pts = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00Z`);
    t.setUTCHours(t.getUTCHours() + i);
    const time = t.toISOString().slice(0, 16);
    return assessPointHour(time, -34.8, -55.9, INGREDIENTS[pattern[i] ?? 'weak'], rules);
  });
  return assessWindow(pts, rules);
};

const range = (a: number, b: number, env: Env) => Object.fromEntries(Array.from({ length: b - a + 1 }, (_, k) => [a + k, env]));

type Scenario = { models: { model: string; assessment: (rules: SensitivityRules) => WindowAssessment }[]; window: { name: string; label: string } };
const TODAY = { name: 'today', label: 'Hoy (hasta mañana a las 8 h)' };
const TOMORROW = { name: 'tomorrow', label: 'Mañana (8 a 8 h)' };

const SCENARIOS: Record<string, () => Scenario> = {
  tranquilo: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-07-15', 20, {}) },
      { model: 'ECMWF', assessment: windowAssessment('2026-07-15', 20, {}) },
    ],
    window: TODAY,
  }),
  tranquilo_verano: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-01-15', 8, {}) },
      { model: 'ECMWF', assessment: windowAssessment('2026-01-15', 8, {}) },
    ],
    window: TODAY,
  }),
  tormenta: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-06-12', 8, range(6, 9, 'storm')) },
      { model: 'ECMWF', assessment: windowAssessment('2026-06-12', 8, range(7, 10, 'storm')) },
    ],
    window: TODAY,
  }),
  tormenta_verano: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-01-20', 20, range(1, 4, 'storm')) },
      { model: 'ECMWF', assessment: windowAssessment('2026-01-20', 20, {}) },
    ],
    window: TODAY,
  }),
  atento: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-08-20', 8, range(8, 10, 'watch')) },
      { model: 'ECMWF', assessment: windowAssessment('2026-08-20', 8, range(8, 11, 'watch')) },
    ],
    window: TODAY,
  }),
  atento_divididos: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-08-20', 8, { ...range(6, 9, 'watch'), 7: 'strong', 8: 'strong' }) },
      { model: 'ECMWF', assessment: windowAssessment('2026-08-20', 8, {}) },
    ],
    window: TODAY,
  }),
  protegelo: () => ({
    models: [
      { model: 'GFS', assessment: windowAssessment('2026-09-10', 8, { 8: 'watch', ...range(9, 11, 'strong') }) },
      { model: 'ECMWF', assessment: windowAssessment('2026-09-10', 8, { ...range(9, 11, 'strong') }) },
    ],
    window: TOMORROW,
  }),
  un_modelo: () => ({
    models: [{ model: 'GFS', assessment: windowAssessment('2026-08-20', 8, range(7, 9, 'watch')) }],
    window: TODAY,
  }),
};

export const DEV_SCENARIOS = Object.keys(SCENARIOS);

/** El escenario con cada grado de alerta, igual que lo devuelve assessHere. */
export function devScenario(name: string, generatedAt: string): Record<Sensitivity, ResultView> {
  const s = SCENARIOS[name]();
  const bySensitivity = Object.fromEntries(
    SENSITIVITIES.map((sens) => {
      const rules = SENSITIVITY_RULES[sens];
      return [sens, combineModels(s.models.map((m) => ({ model: m.model, assessment: m.assessment(rules) })), rules.combine)];
    }),
  ) as Record<Sensitivity, WindowAssessment>;
  const hours = bySensitivity.balanced.hourly.map((h) => h.time);
  return presentAll(bySensitivity, { ...s.window, from: hours[0], to: hours[hours.length - 1] }, generatedAt);
}
