import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_SCENARIOS, devScenario } from '../src/dev-scenarios.ts';

const at = '2026-10-05T21:44';

test('todos los escenarios de desarrollo se pueden presentar', () => {
  for (const name of DEV_SCENARIOS) {
    const v = devScenario(name, at);
    assert.ok(v.title && v.levelName && v.why.length > 0, name);
  }
});

test('tranquilo en verano: con reservas, confianza baja y aviso de estación', () => {
  const v = devScenario('tranquilo_verano', at);
  assert.equal(v.level, 'calm');
  assert.equal(v.hailStatus, 'Sin señales de granizo');
  assert.equal(v.note, 'con reservas');
  assert.equal(v.confidenceDots, 1);
  assert.match(v.confidenceReason, /octubre y marzo/);
  assert.equal(v.watchText, null);
});

test('tormenta sin granizo: tranquilo para el motor, se muestra "Tormenta"', () => {
  const v = devScenario('tormenta', at);
  assert.equal(v.level, 'storm');
  assert.equal(v.levelName, 'Tormenta');
  assert.equal(v.hailStatus, 'Lluvia fuerte, sin piedra');
  assert.equal(v.note, null);
  assert.deepEqual(v.models.map((m) => m.level), ['storm', 'storm']);
  assert.ok(v.why.some((y) => /forma tormentas/.test(y)));
  assert.match(v.algorithm.combination, /→ Tormenta\.$/);
});

test('tormenta en verano, un modelo la ve: con reservas y sin "modelos divididos"', () => {
  const v = devScenario('tormenta_verano', at);
  assert.equal(v.level, 'storm');
  assert.equal(v.note, 'con reservas');
  assert.equal(v.modelsAgree, true);
  assert.deepEqual(v.models.map((m) => m.level), ['storm', 'calm']);
});

test('modelos divididos: atento, nota y aviso que explica quién ve qué', () => {
  const v = devScenario('atento_divididos', at);
  assert.equal(v.level, 'watch');
  assert.equal(v.note, 'modelos divididos');
  assert.equal(v.modelsAgree, false);
  assert.match(v.confidenceReason, /no coinciden/);
  assert.deepEqual(v.models.map((m) => m.level), ['protect', 'calm']);
});

test('protegelo: horas fuertes marcadas y texto de horas', () => {
  const v = devScenario('protegelo', at);
  assert.equal(v.level, 'protect');
  assert.equal(v.hailStatus, 'Peligro de granizo');
  assert.ok(v.hours.some((h) => h.level === 2));
  assert.match(v.watchText ?? '', /^Entre las \d\d y las \d\d h\.$/);
});

test('un solo modelo: confianza baja y aviso de que falta uno', () => {
  const v = devScenario('un_modelo', at);
  assert.equal(v.confidence, 'low');
  assert.match(v.confidenceReason, /^Solo respondió GFS/);
});
