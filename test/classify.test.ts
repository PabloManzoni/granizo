import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessPointHour, assessWindow, classifyEnvironment, seasonOfTime } from '../src/engine/classify.ts';
import { RULES } from '../src/engine/config.ts';
import { ship } from '../src/engine/ingredients.ts';
import type { Ingredients } from '../src/engine/types.ts';
import { neighborhood } from '../src/geo/neighborhood.ts';

const base: Ingredients = {
  muCapeJkg: 2000,
  muCinJkg: -20,
  muMixingRatioGkg: 13,
  muStartHpa: 900,
  shear06Ms: 30,
  lapse700500CKm: 7.2,
  t500C: -13,
  freezingLevelMAgl: 3800,
  ship: 1.2,
  wmaxshearM2s2: Math.sqrt(2 * 2000) * 30, // ≈ 1897
  showersMm: 2,
  precipitationMm: 4,
  modelCapeJkg: 1800,
};

test('SHIP con un ejemplo calculado a mano', () => {
  // 2000·12·7·12·20 / 42e6 = 0.96
  const v = ship({ muCapeJkg: 2000, muMixingRatioGkg: 12, lapse700500CKm: 7, t500C: -12, shear06Ms: 20, freezingLevelMAgl: 3500 });
  assert.ok(Math.abs(v - 0.96) < 0.001, `SHIP ${v}`);
});

test('SHIP aplica los recortes de SPC', () => {
  const low = ship({ muCapeJkg: 650, muMixingRatioGkg: 8, lapse700500CKm: 7, t500C: -12, shear06Ms: 20, freezingLevelMAgl: 3500 });
  const expected = ((650 * 11 * 7 * 12 * 20) / 42e6) * 0.5; // mixr→11, ×650/1300
  assert.ok(Math.abs(low - expected) < 1e-9);
});

test('gradiente fuerte + WMAXSHEAR alto + disparo → protect (estación fría, confianza media)', () => {
  const ph = assessPointHour('2024-09-09T16:00', -34.8, -55.9, base);
  assert.equal(ph.environment, 'strong');
  const w = assessWindow([ph]);
  assert.equal(w.level, 'protect');
  assert.equal(w.season, 'cold');
  assert.equal(w.confidence, 'medium');
});

test('ambiente fuerte sin disparo del modelo → watch, no protect', () => {
  const ph = assessPointHour('2024-09-09T16:00', -34.8, -55.9, { ...base, showersMm: 0, precipitationMm: 0 });
  const w = assessWindow([ph]);
  assert.equal(w.level, 'watch');
  assert.ok(w.reasons.includes('NO_MODEL_CONVECTION'));
});

test('mucha energía y lluvia pero el aire no se enfría con la altura → calm (tormenta de agua)', () => {
  const ph = assessPointHour('2024-09-09T16:00', -34.8, -55.9, { ...base, lapse700500CKm: 5.9, precipitationMm: 20 });
  const w = assessWindow([ph]);
  assert.equal(w.level, 'calm');
  assert.equal(w.storm, true);
  assert.ok(w.reasons.includes('POOR_HAIL_GROWTH'));
});

test('tormenta solo si es calm: sin disparo no hay tormenta, y con ambiente de granizo manda el granizo', () => {
  const dry = assessWindow([assessPointHour('2024-09-09T16:00', -34.8, -55.9, { ...base, lapse700500CKm: 5.9, showersMm: 0, precipitationMm: 0 })]);
  assert.equal(dry.storm, false);
  assert.equal(assessWindow([assessPointHour('2024-09-09T16:00', -34.8, -55.9, base)]).storm, false);
});

test('WMAXSHEAR entre los umbrales → supportive → watch', () => {
  const mid = (RULES.wmaxshearWatch + RULES.wmaxshearProtect) / 2;
  assert.equal(classifyEnvironment({ ...base, wmaxshearM2s2: mid }), 'supportive');
  assert.equal(classifyEnvironment({ ...base, wmaxshearM2s2: RULES.wmaxshearWatch - 1 }), 'weak');
});

test('"atento" arranca en 900 y "protegelo" sigue en 1200 (v0.2.1)', () => {
  assert.equal(RULES.wmaxshearWatch, 900);
  assert.equal(RULES.wmaxshearProtect, 1200);
  assert.equal(classifyEnvironment({ ...base, wmaxshearM2s2: 899 }), 'weak');
  assert.equal(classifyEnvironment({ ...base, wmaxshearM2s2: 900 }), 'supportive');
});

test('estación cálida: confianza baja y lo dice', () => {
  const w = assessWindow([assessPointHour('2025-01-15T20:00', -34.8, -55.9, base)]);
  assert.equal(seasonOfTime('2025-01-15T20:00'), 'warm');
  assert.equal(w.confidence, 'low');
  assert.ok(w.reasons.includes('WARM_SEASON'));
});

test('el veredicto toma el punto-hora más favorable de la zona', () => {
  const weak = assessPointHour('2024-09-09T10:00', -34.6, -55.9, { ...base, wmaxshearM2s2: 100 });
  const strong = assessPointHour('2024-09-09T21:00', -34.9, -56.1, base);
  const w = assessWindow([weak, strong]);
  assert.equal(w.peak.time, '2024-09-09T21:00');
  assert.deepEqual(w.favorableHours, ['2024-09-09T21:00']);
});

test('vecindario de 40 km con 25 km de separación = 9 puntos', () => {
  assert.equal(neighborhood({ lat: -34.8, lon: -55.9 }, 40, 25).length, 9);
});

test('dos modelos: protect solo si los dos dicen protect', async () => {
  const { combineModels } = await import('../src/engine/classify.ts');
  const strong = assessWindow([assessPointHour('2024-09-09T16:00', -34.8, -55.9, base)]);
  const weak = assessWindow([assessPointHour('2024-09-09T16:00', -34.8, -55.9, { ...base, lapse700500CKm: 5 })]);
  const both = combineModels([{ model: 'GFS', assessment: strong }, { model: 'ECMWF', assessment: strong }]);
  assert.equal(both.level, 'protect');
  assert.equal(both.confidence, 'medium');
  assert.ok(both.reasons.includes('MODELS_AGREE'));
  const split = combineModels([{ model: 'GFS', assessment: strong }, { model: 'ECMWF', assessment: weak }]);
  assert.equal(split.level, 'watch');
  assert.equal(split.confidence, 'low');
  assert.ok(split.reasons.includes('MODELS_DISAGREE'));
  assert.deepEqual(split.models?.map((m) => [m.model, m.level]), [['GFS', 'protect'], ['ECMWF', 'calm']]);
  assert.equal(split.models?.[1].check?.lapse700500CKm, 5);
});

test('dos modelos: uno "watch" y otro "calm" → calm', async () => {
  const { combineModels } = await import('../src/engine/classify.ts');
  const watch = assessWindow([assessPointHour('2024-09-09T16:00', -34.8, -55.9, { ...base, wmaxshearM2s2: 600 })]);
  const calm = assessWindow([assessPointHour('2024-09-09T16:00', -34.8, -55.9, { ...base, lapse700500CKm: 5 })]);
  const combined = combineModels([{ model: 'GFS', assessment: watch }, { model: 'ECMWF', assessment: calm }]);
  assert.equal(combined.level, 'calm');
  assert.equal(combined.storm, true); // tranquilo para granizo, pero los modelos forman tormentas
});
