import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_SCENARIOS, devScenario } from '../src/dev-scenarios.ts';

const at = '2026-10-05T21:44';
/** El grado por defecto: lo que la app mostraba antes de poder elegirlo. */
const balanced = (name: string) => devScenario(name, at).balanced;

test('todos los escenarios de desarrollo se pueden presentar', () => {
  for (const name of DEV_SCENARIOS) {
    for (const v of Object.values(devScenario(name, at))) {
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

test('tormenta sin granizo: tranquilo para el motor, se muestra "Tormenta"', () => {
  const v = balanced('tormenta');
  assert.equal(v.level, 'storm');
  assert.equal(v.levelName, 'Tormenta');
  assert.equal(v.hailStatus, 'Lluvia fuerte, sin piedra');
  assert.equal(v.note, null);
  assert.deepEqual(v.models.map((m) => m.level), ['storm', 'storm']);
  assert.ok(v.why.some((y) => /forma tormentas/.test(y)));
  assert.match(v.algorithm.combination, /→ Tormenta\.$/);
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
  assert.match(v.watchText ?? '', /^Entre las \d\d y las \d\d h\.$/);
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
  assert.match(v.algorithm.combination, /^GFS: atento · ECMWF: atento\. Regla de «Equilibrado»: protegelo solo si los dos/);
  assert.match(v.algorithm.validation, /"Protegelo" avisó en ~4 de cada 10 granizadas, con ~15% de falsas alarmas/);
});

test('cualquier señal: alcanza con que un modelo lo vea', () => {
  // GFS ve ambiente fuerte con tormentas y ECMWF nada: equilibrado baja a atento, cualquier señal avisa protegelo.
  const all = devScenario('atento_divididos', at);
  assert.equal(all.balanced.level, 'watch');
  assert.equal(all.sensitive.level, 'protect');
  assert.equal(all.sensitive.note, 'modelos divididos');
  assert.match(all.sensitive.algorithm.combination, /alcanza con que un modelo lo vea/);
  assert.match(all.sensitive.algorithm.rows[1].threshold, /^≥ 400 atento · ≥ 1\.200 protegelo$/);
});

test('cualquier señal: "atento" es lo habitual y lo dice con su propia cifra', () => {
  const v = devScenario('atento', at).sensitive;
  assert.equal(v.level, 'watch');
  assert.match(v.notices[0].text, /^Así sale en 8 de cada 10 días de tormenta\./);
});

test('solo señales fuertes: tranquilo cuando los otros avisan, pero dice que hay señales débiles', () => {
  const all = devScenario('atento', at);
  const v = all.strict;
  assert.equal(v.level, 'storm'); // sin ambiente fuerte, y los modelos forman tormentas
  assert.equal(v.hailStatus, 'Señales débiles de granizo');
  assert.equal(v.title, 'Hay algo de ambiente para piedra, pero ninguna señal fuerte.');
  assert.equal(v.algorithm.rows[1].threshold, '≥ 1.200 atento y protegelo');
  // Sin señales en ningún grado, el texto de siempre.
  assert.equal(devScenario('tranquilo', at).strict.hailStatus, 'Sin señales de granizo');
});

test('solo señales fuertes: protegelo cuando los dos modelos lo ven, sin "es lo habitual"', () => {
  const v = devScenario('protegelo', at).strict;
  assert.equal(v.level, 'protect');
  assert.ok(!v.notices.some((x) => x.strong === 'Es lo habitual.'));
});

test('cada resultado trae los tres grados para el selector', () => {
  const all = devScenario('atento_divididos', at);
  assert.deepEqual(
    all.balanced.sensitivityOptions.map((o) => [o.id, o.name]),
    [['sensitive', 'Cualquier señal'], ['balanced', 'Equilibrado'], ['strict', 'Solo señales fuertes']],
  );
  assert.equal(all.balanced.sensitivityOptions[1].summary, 'Recomendado.');
  // El nivel de cada grado sale de las mismas reglas: GFS fuerte con tormentas, ECMWF nada.
  assert.deepEqual([all.sensitive.levelName, all.balanced.levelName, all.strict.levelName], ['Protegelo', 'Atento', 'Tormenta']);
});
