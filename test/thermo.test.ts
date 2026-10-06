import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  liftParcel,
  moistAdiabatTempK,
  mostUnstableParcel,
  satVaporPressureHpa,
  thetaE,
  type EnvLevel,
} from '../src/engine/thermo.ts';

test('presión de vapor de saturación a 0 °C ≈ 6.11 hPa', () => {
  assert.ok(Math.abs(satVaporPressureHpa(0) - 6.112) < 0.01);
});

test('la adiabática húmeda devuelve la temperatura de partida en su propio nivel', () => {
  const tK = 293.15;
  const p = 900;
  const theta = thetaE(tK, p, 0.0165, tK); // ~saturado
  const back = moistAdiabatTempK(theta, p);
  assert.ok(Math.abs(back - tK) < 1.5, `got ${back}`);
});

// Sondeo idealizado de tarde de verano inestable (tipo "loaded gun").
const unstable: EnvLevel[] = [
  { pressureHpa: 1000, temperatureC: 30, dewPointC: 22 },
  { pressureHpa: 950, temperatureC: 26, dewPointC: 20 },
  { pressureHpa: 900, temperatureC: 22, dewPointC: 17 },
  { pressureHpa: 850, temperatureC: 19, dewPointC: 12 },
  { pressureHpa: 700, temperatureC: 8, dewPointC: -2 },
  { pressureHpa: 600, temperatureC: -2, dewPointC: -15 },
  { pressureHpa: 500, temperatureC: -12, dewPointC: -28 },
  { pressureHpa: 400, temperatureC: -24, dewPointC: -40 },
  { pressureHpa: 300, temperatureC: -40, dewPointC: -55 },
  { pressureHpa: 250, temperatureC: -50, dewPointC: -62 },
  { pressureHpa: 200, temperatureC: -56, dewPointC: -70 },
];

test('sondeo inestable: CAPE alta y CIN chica', () => {
  const r = liftParcel(unstable[0], unstable);
  assert.ok(r.capeJkg > 2000 && r.capeJkg < 6000, `CAPE ${r.capeJkg}`);
  assert.ok(r.cinJkg <= 0 && r.cinJkg > -100, `CIN ${r.cinJkg}`);
});

test('sondeo estable (inversión, aire seco): CAPE ≈ 0', () => {
  const stable: EnvLevel[] = unstable.map((l) => ({
    ...l,
    temperatureC: l.pressureHpa >= 850 ? 10 + (1000 - l.pressureHpa) / 30 : l.temperatureC + 8,
    dewPointC: l.dewPointC - 15,
  }));
  assert.ok(liftParcel(stable[0], stable).capeJkg < 50);
});

test('MU elige una parcela elevada cuando la superficie está fría (tormenta nocturna)', () => {
  const night = unstable.map((l) =>
    l.pressureHpa === 1000 ? { ...l, temperatureC: 16, dewPointC: 14 } : l,
  );
  const mu = mostUnstableParcel(night);
  const sfc = liftParcel(night[0], night);
  assert.ok(mu.startHpa < 1000, `start ${mu.startHpa}`);
  assert.ok(mu.capeJkg > sfc.capeJkg);
});

test('nivel de congelamiento desde el perfil cuando el modelo no lo da', async () => {
  const { freezingLevelFromProfile } = await import('../src/engine/ingredients.ts');
  const z = freezingLevelFromProfile({
    time: '2024-09-09T12:00', lat: -34.8, lon: -55.9, elevationM: 20,
    surface: { pressureHpa: 1010, temperatureC: 20, dewPointC: 15, wind10m: { speedMs: 5, directionDeg: 90 } },
    levels: [
      { pressureHpa: 850, temperatureC: 10, dewPointC: 5, heightM: 1500 },
      { pressureHpa: 700, temperatureC: 2, dewPointC: -5, heightM: 3100 },
      { pressureHpa: 600, temperatureC: -6, dewPointC: -15, heightM: 4400 },
    ],
    winds: [], freezingLevelM: null, showersMm: 0, precipitationMm: 0, modelCapeJkg: null,
  });
  // entre 3100 m (+2 °C) y 4400 m (−6 °C): 3100 + 2/8·1300 = 3425
  assert.ok(z !== null && Math.abs(z - 3425) < 1, `z ${z}`);
});
