import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error módulo JS del navegador, sin declaraciones de tipos
import { dayLabels } from '../public/day-labels.js';

// Uruguay es UTC-3 todo el año: las 12:41 de la noche del miércoles son las 03:41Z.
const uy = (iso: string) => new Date(`${iso}-03:00`);

test('de día: hoy y mañana con su fecha', () => {
  assert.deepEqual(dayLabels(uy('2026-10-06T15:00:00')), { today: 'mar 6', tomorrow: 'mié 7' });
});

test('de noche, antes de las 24, hoy sigue siendo hoy', () => {
  assert.deepEqual(dayLabels(uy('2026-10-06T23:59:00')), { today: 'mar 6', tomorrow: 'mié 7' });
});

test('de madrugada: "hoy" ya es el día nuevo', () => {
  assert.deepEqual(dayLabels(uy('2026-10-07T00:41:00')), { today: 'mié 7', tomorrow: 'jue 8' });
});

test('cambio de mes y de año', () => {
  assert.deepEqual(dayLabels(uy('2026-12-31T21:00:00')), { today: 'jue 31', tomorrow: 'vie 1' });
});

test('usa la hora de Uruguay aunque el reloj del equipo esté en otra zona', () => {
  // 23:30 en Montevideo = 02:30Z del día siguiente
  assert.equal(dayLabels(new Date('2026-10-07T02:30:00Z')).today, 'mar 6');
});
