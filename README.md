# Hail Guard

Asistente de decisión sobre granizo para el auto: *¿lo puedo dejar afuera o conviene protegerlo?* Pensado para Uruguay y el Río de la Plata.

## Docs

- [`docs/brief.md`](docs/brief.md): brief original de producto y técnico
- [`docs/revision-brief.md`](docs/revision-brief.md): revisión del brief, con los cambios propuestos al contrato de datos, las fuentes y el orden de implementación
- [`docs/analisis-motor.md`](docs/analisis-motor.md): **decisiones vigentes** (problema, alcance, próximos pasos). Si contradice a la revisión, manda este
- [`docs/resultados-test-v0.md`](docs/resultados-test-v0.md): resultados del test histórico del motor v0: qué separa granizo de tormenta común y qué no
- [`docs/bitacora-motor.md`](docs/bitacora-motor.md): **bitácora del motor v0.2**: calibración, pronóstico real, ECMWF, rayos, PWA y números fuera de muestra

## Principio

Meteorología primero, IA después. El riesgo lo decide un motor determinístico; la redacción viene de plantillas (o de un LLM más adelante), y la redacción nunca cambia el nivel.

## Uso

Requiere Node 24+ (corre TypeScript directo, sin compilar).

```bash
npm install
npm run serve                                                 # API + PWA básica en http://localhost:8787
npm run check -- --lat -34.80 --lon -55.90 --window tonight   # tonight | today | tomorrow | next12h
npm run log-forecast                                          # guarda el pronóstico de 16 ciudades en data/forecast-log/ (correr 1 vez por día)
npm run backtest                                              # test histórico sobre data/events.json → reports/backtest.md
npm run calibrate                                             # qué variables separan granizo de controles → reports/calibration.md
python3 scripts/glm/glm_point.py -34.80 -55.91 now            # rayos (GOES GLM) en la última hora a ≤30/50 km, con "lightning jump"
npm test
npm run typecheck
```

## Cómo funciona el motor (v0.2)

1. **Zona**: 9 puntos en un radio de ~40 km alrededor del lugar.
2. **Datos**: perfil vertical horario de **GFS y ECMWF** vía Open-Meteo (pronóstico vigente, o archivo desde 2021 para GFS y desde 2024-06 para ECMWF).
3. **Ingredientes por punto y hora**:
   - MUCAPE calculada por nosotros (parcela más inestable: ve el combustible en altura de las tormentas nocturnas);
   - cizalladura 0–6 km;
   - **gradiente 700–500 hPa**;
   - **WMAXSHEAR** = √(2·MUCAPE)·cizalladura;
   - T500, nivel de congelamiento y SHIP.
4. **Reglas legibles**, calibradas en Uruguay 2021–2024 y validadas en 2025–2026 (`src/engine/classify.ts`, umbrales en `src/engine/config.ts`):
   - gradiente ≥ 6,5 °C/km y WMAXSHEAR ≥ 1200, más tormentas en el modelo → **protect**
   - gradiente ≥ 6,5 y WMAXSHEAR ≥ 400 (o ambiente fuerte sin tormentas en el modelo) → **watch**
   - resto → **calm**
5. **Dos modelos**: protect solo si GFS **y** ECMWF dicen protect; watch si alguno dice protect o los dos dicen al menos watch.
6. **Confianza**: baja en oct–mar (en el test el ambiente no distinguió granizo de lluvia en verano); en abr–sep, media si los modelos coinciden y baja si no.
7. **Razones y textos** desde plantillas (`src/engine/messages.ts`). Los nombres visibles de los niveles están a definir en diseño.

Habilidad estimada **fuera de muestra** (2025–2026, en días de tormenta): "protegelo" detecta el **43%** de las granizadas con **15%** de falsas alarmas (57% y 19% en abr–sep; nada en oct–mar). "Atento o más" detecta el 93% con 65% de falsas alarmas. Son datos casi de análisis: el pronóstico real del día anterior va a rendir algo menos. Detalle en [`docs/bitacora-motor.md`](docs/bitacora-motor.md).

**Rayos (prototipo, `scripts/glm/`)**: el GLM del GOES llega con < 30 s de latencia. Avisa bien "tormenta fuerte cerca, ahora", pero en la muestra no distinguió granizo de tormenta fuerte sin granizo. Sirve como capa de nowcasting de 0–1 h, no como detector de granizo.

## Estructura

```
src/engine/     termodinámica, ingredientes, reglas, textos (sin I/O)
src/data/       Open-Meteo (con caché) y lista de eventos
src/cli/        check, backtest, calibrate, log-forecast
src/server.ts   API + estáticos de la PWA
public/         PWA básica (sin diseño)
scripts/        controles METAR y rayos GLM (Python)
data/           eventos, fechas de granizo de INUMET, registro de pronósticos
docs/           brief, análisis, resultados, bitácora
reports/        salidas del test histórico
```

## Datos del test

- [`data/events.json`](data/events.json): granizadas y días de control 2021–2026, cada uno con fuentes (ver [`data/events-sources.md`](data/events-sources.md)).
- Open-Meteo se cachea en `.cache/` (no versionado), así que repetir el test no vuelve a descargar.
