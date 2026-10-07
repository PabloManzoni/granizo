import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_SCENARIOS, devScenario } from '../src/dev-scenarios.ts';
import { momentOf, watchTextFor } from '../src/presenter.ts';

/** El grado por defecto: lo que la app mostraba antes de poder elegirlo. */
const balanced = (name: string) => devScenario(name).balanced;

test('todos los escenarios de desarrollo se pueden presentar', () => {
  for (const name of DEV_SCENARIOS) {
    for (const v of Object.values(devScenario(name))) {
      assert.ok(v.title && v.levelName && v.why.length > 0, `${name} · ${v.sensitivity}`);
    }
  }
});

test('tranquilo en verano: con reservas, confianza baja y aviso de estación', () => {
  const v = balanced('tranquilo_verano');
  assert.equal(v.level, 'calm');
  assert.equal(v.hailStatus, 'Sin señales de granizo');
  assert.equal(v.note, 'con reservas');
  assert.equal(v.confidenceDots, 1);
  assert.match(v.confidenceReason, /octubre y marzo/);
  assert.equal(v.watchText, null);
});

test('tormenta sin granizo: muy pocas chances, y la tormenta se dice abajo', () => {
  const v = balanced('tormenta');
  assert.equal(v.level, 'storm');
  assert.equal(v.levelName, 'Muy pocas chances');
  assert.equal(v.hailStatus, 'Tormenta, sin señales de granizo');
  assert.equal(v.note, null);
  assert.deepEqual(v.models.map((m) => m.level), ['storm', 'storm']);
  assert.ok(v.why.some((y) => /forma tormentas/.test(y)));
  assert.match(v.algorithm.combination, /se avisa la tormenta\.$/);
});

test('tormenta en verano, un modelo la ve: con reservas y sin "modelos divididos"', () => {
  const v = balanced('tormenta_verano');
  assert.equal(v.level, 'storm');
  assert.equal(v.note, 'con reservas');
  assert.equal(v.modelsAgree, true);
  assert.deepEqual(v.models.map((m) => m.level), ['storm', 'calm']);
});

test('modelos divididos: atento, nota y aviso que explica quién ve qué', () => {
  const v = balanced('atento_divididos');
  assert.equal(v.level, 'watch');
  assert.equal(v.note, 'modelos divididos');
  assert.equal(v.modelsAgree, false);
  assert.match(v.confidenceReason, /no coinciden/);
  assert.deepEqual(v.models.map((m) => m.level), ['protect', 'calm']);
});

test('protegelo: horas fuertes marcadas y texto de horas', () => {
  const v = balanced('protegelo');
  assert.equal(v.level, 'protect');
  assert.equal(v.hailStatus, 'Peligro de granizo');
  assert.ok(v.hours.some((h) => h.level === 2));
  assert.equal(v.watchText, 'Peligro de granizo mañana de tarde.');
});

test('un solo modelo: confianza baja y aviso de que falta uno', () => {
  const v = balanced('un_modelo');
  assert.equal(v.confidence, 'low');
  assert.match(v.confidenceReason, /^Solo respondió GFS/);
});

test('el grado equilibrado dice lo mismo que antes de poder elegirlo', () => {
  const v = balanced('atento');
  assert.equal(v.sensitivity, 'balanced');
  assert.equal(v.level, 'watch');
  assert.equal(v.note, 'lo habitual con tormenta');
  assert.deepEqual(v.notices[0], {
    strong: 'Es lo habitual.',
    text: 'Así sale en 4 de cada 10 días de tormenta. No es para correr: es para tener pensado dónde guardarlo.',
  });
  assert.match(v.algorithm.combination, /^GFS: algunas chances · ECMWF: algunas chances\. Regla de «Equilibrado»: chances reales solo si los dos/);
  assert.match(v.algorithm.validation, /"Chances reales" avisó en ~4 de cada 10 granizadas, con ~15% de falsas alarmas/);
});

test('cualquier señal: alcanza con que un modelo lo vea', () => {
  // GFS ve ambiente fuerte con tormentas y ECMWF nada: equilibrado baja a atento, cualquier señal avisa protegelo.
  const all = devScenario('atento_divididos');
  assert.equal(all.balanced.level, 'watch');
  assert.equal(all.sensitive.level, 'protect');
  assert.equal(all.sensitive.note, 'modelos divididos');
  assert.match(all.sensitive.algorithm.combination, /alcanza con que un modelo lo vea/);
  assert.match(all.sensitive.algorithm.rows[1].threshold, /^≥ 400 algunas · ≥ 1\.200 reales$/);
});

test('cualquier señal: "atento" es lo habitual y lo dice con su propia cifra', () => {
  const v = devScenario('atento').sensitive;
  assert.equal(v.level, 'watch');
  assert.match(v.notices[0].text, /^Así sale en 8 de cada 10 días de tormenta\./);
});

test('solo señales fuertes: tranquilo cuando los otros avisan, pero dice que hay señales débiles', () => {
  const all = devScenario('atento');
  const v = all.strict;
  assert.equal(v.level, 'storm'); // sin ambiente fuerte, y los modelos forman tormentas
  assert.equal(v.hailStatus, 'Señales débiles de granizo');
  assert.equal(v.title, 'Hay algo de ambiente para piedra, pero ninguna señal fuerte.');
  assert.equal(v.algorithm.rows[1].threshold, '≥ 1.200 algunas y reales');
  // Sin señales en ningún grado, el texto de siempre.
  assert.equal(devScenario('tranquilo').strict.hailStatus, 'Sin señales de granizo');
});

test('solo señales fuertes: protegelo cuando los dos modelos lo ven, sin "es lo habitual"', () => {
  const v = devScenario('protegelo').strict;
  assert.equal(v.level, 'protect');
  assert.ok(!v.notices.some((x) => x.strong === 'Es lo habitual.'));
});

test('el selector ofrece dos grados: equilibrado y solo señales fuertes', () => {
  const all = devScenario('atento_divididos');
  assert.deepEqual(
    all.balanced.sensitivityOptions.map((o) => [o.id, o.name]),
    [['balanced', 'Equilibrado'], ['strict', 'Solo señales fuertes']],
  );
  assert.equal(all.balanced.sensitivityOptions[0].summary, 'Recomendado.');
  // El nivel de cada grado sale de las mismas reglas: GFS fuerte con tormentas, ECMWF nada.
  assert.deepEqual([all.sensitive.levelName, all.balanced.levelName, all.strict.levelName], ['Chances reales', 'Algunas chances', 'Muy pocas chances']);
});

test('la tira: "Ahora" la primera hora y el día en la primera hora de cada día nuevo', () => {
  const v = balanced('protegelo'); // consulta el 9 a las 20 h
  assert.equal(v.window.label, 'Próximas 24 h');
  assert.equal(v.hours.length, 24);
  assert.equal(v.hours[0].label, 'Ahora');
  assert.deepEqual(v.hours.filter((h) => h.day).map((h) => [h.time.slice(11, 13), h.day]), [['00', 'jue']]);
});

// Horas desde `start` ("YYYY-MM-DDTHH"), con las marcadas en `marks` (índice → nivel).
const strip = (start: string, marks: Record<number, number>) =>
  Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.parse(`${start}:00:00Z`) + i * 3600_000).toISOString().slice(0, 16),
    level: marks[i] ?? 0,
  }));

test('momento del día, contado desde la consulta', () => {
  const at = '2026-10-06T10:40';
  assert.equal(momentOf('2026-10-06T16:00', at), 'esta tarde');
  assert.equal(momentOf('2026-10-06T21:00', at), 'esta noche');
  assert.equal(momentOf('2026-10-07T03:00', at), 'mañana de madrugada');
  assert.equal(momentOf('2026-10-07T09:00', at), 'mañana de mañana');
  assert.equal(momentOf('2026-10-08T02:00', at), 'el jueves de madrugada');
});

test('texto de las horas: por momento del día, sin hora exacta', () => {
  const at = '2026-10-06T10:40';
  assert.equal(watchTextFor(strip('2026-10-06T10', {}), at), null);
  assert.equal(watchTextFor(strip('2026-10-06T10', { 6: 1, 7: 1 }), at), 'Condiciones para granizo esta tarde.');
  // Un tramo que pasa de la tarde a la noche.
  assert.equal(watchTextFor(strip('2026-10-06T10', { 9: 1, 10: 1, 11: 1 }), at), 'Condiciones para granizo esta tarde y esta noche.');
  // Ya empezó.
  assert.equal(watchTextFor(strip('2026-10-06T10', { 0: 1, 1: 1 }), at), 'Condiciones para granizo ahora.');
  // Dos tramos separados: los dos; un tercero ya no entra.
  assert.equal(watchTextFor(strip('2026-10-06T10', { 6: 1, 14: 1, 20: 1 }), at), 'Condiciones para granizo esta tarde y mañana de madrugada.');
});

test('texto de las horas: solo lo más grave, aunque lo leve venga antes', () => {
  const at = '2026-10-06T10:40';
  // Condiciones en 2 h y peligro en 10 h: se dice solo el peligro (la tira muestra los dos).
  assert.equal(watchTextFor(strip('2026-10-06T10', { 2: 1, 3: 1, 10: 2, 11: 2 }), at), 'Peligro de granizo esta noche.');
  // Solo las horas fuertes cuentan para el momento, no las condiciones que las rodean.
  assert.equal(watchTextFor(strip('2026-10-06T10', { 6: 1, 7: 2 }), at), 'Peligro de granizo esta tarde.');
});
