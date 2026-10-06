import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error módulo JS del navegador, sin declaraciones de tipos
import { dayLabels } from '../public/day-labels.js';

// Uruguay es UTC-3 todo el año: las 12:41 de la noche del miércoles son las 03:41Z.
const uy = (iso: string) => new Date(`${iso}-03:00`);

test('de día: hoy, esta noche y mañana con su fecha', () => {
  assert.deepEqual(dayLabels(uy('2026-10-06T15:00:00')), { today: 'mar 6', tonight: 'mar 6', tomorrow: 'mié 7' });
});

test('de madrugada: "hoy" ya es el día nuevo y la noche es la que arrancó ayer', () => {
  assert.deepEqual(dayLabels(uy('2026-10-07T00:41:00')), { today: 'mié 7', tonight: 'mar→mié', tomorrow: 'jue 8' });
});

test('a las 20 h empieza la noche y cruza al día siguiente', () => {
  assert.equal(dayLabels(uy('2026-10-06T20:00:00')).tonight, 'mar→mié');
  assert.equal(dayLabels(uy('2026-10-06T23:59:00')).tonight, 'mar→mié');
});

test('a las 8 h la noche terminó', () => {
  assert.equal(dayLabels(uy('2026-10-07T07:59:00')).tonight, 'mar→mié');
  assert.equal(dayLabels(uy('2026-10-07T08:00:00')).tonight, 'mié 7');
});

test('cambio de mes y de año', () => {
  assert.deepEqual(dayLabels(uy('2026-12-31T21:00:00')), { today: 'jue 31', tonight: 'jue→vie', tomorrow: 'vie 1' });
});

test('usa la hora de Uruguay aunque el reloj del equipo esté en otra zona', () => {
  // 23:30 en Montevideo = 02:30Z del día siguiente
  assert.equal(dayLabels(new Date('2026-10-07T02:30:00Z')).today, 'mar 6');
});
