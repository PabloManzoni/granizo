import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveWindow } from '../src/windows.ts';

// Las fechas "locales" se representan como Date con la hora de Uruguay en UTC (ver cli/args.ts).
const at = (iso: string) => new Date(`${iso}:00Z`);

test('esta noche, consultando a la tarde: 20 h a 8 h del día siguiente', () => {
  assert.deepEqual(resolveWindow('tonight', at('2026-10-04T15:30')), { from: '2026-10-04T20:00', to: '2026-10-05T08:00' });
});

test('esta noche, consultando de madrugada: desde ahora hasta las 8', () => {
  assert.deepEqual(resolveWindow('tonight', at('2026-10-04T02:10')), { from: '2026-10-04T02:00', to: '2026-10-04T08:00' });
});

test('esta noche, consultando a las 22: desde ahora hasta las 8', () => {
  assert.deepEqual(resolveWindow('tonight', at('2026-10-04T22:05')), { from: '2026-10-04T22:00', to: '2026-10-05T08:00' });
});

test('hoy: desde ahora hasta las 20', () => {
  assert.deepEqual(resolveWindow('today', at('2026-10-04T09:45')), { from: '2026-10-04T09:00', to: '2026-10-04T20:00' });
});

test('mañana: 8 a 20 del día siguiente', () => {
  assert.deepEqual(resolveWindow('tomorrow', at('2026-12-31T18:00')), { from: '2027-01-01T08:00', to: '2027-01-01T20:00' });
});
