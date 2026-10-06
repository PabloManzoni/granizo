# Bitácora del motor

Registro de avances del trabajo autónomo. El más reciente va abajo.

## 2026-10-04 01:50: punto de partida

- **Motor v0** funcionando: `npm run check`, `npm run backtest`, `npm run calibrate`. 13 tests verdes.
- **Datos:** 68 granizadas y 72 controles (52 emparejados por época), en `data/events.json`.
- **Resultados v0:** [`resultados-test-v0.md`](resultados-test-v0.md). Hay señal moderada en abr–sep (gradiente 700–500, SHIP, WMAXSHEAR) y ninguna en oct–mar. Fuera de la muestra: 57% de detección con 35% de falsas alarmas.
- **Agendado:** retomar desde las 6:07, con disparos cada hora hasta las 12:07, para el plan A–F:
  - A. motor v0.2
  - B. pronóstico real
  - C. ECMWF
  - D. rayos GLM
  - E. API + PWA básica
  - F. cierre

## 2026-10-04 06:35: A. Motor v0.2 ✅

**Qué cambió**

Las reglas ahora usan lo que separó en Uruguay comparando días de la misma época:
- **gradiente 700–500 ≥ 6,5 °C/km** ("fábrica de hielo"), y
- **WMAXSHEAR** = √(2·MUCAPE)·cizalladura, que combina energía y viento en el mismo punto-hora: ≥ 400 da "atento"; ≥ 1200 más tormentas en el modelo da "protegelo".

Además:
- La cizalladura sola y la CAPE sola quedan como descriptivas. Recalibré la cizalladura a [15, 25, 35] m/s, porque en días de tormenta la mediana ronda 30.
- Cada veredicto lleva **estación** y **confianza**: media en abr–sep, baja en oct–mar, con un mensaje honesto ("entre octubre y marzo, el pronóstico distingue poco una tormenta con granizo de una con lluvia").

**Cómo se ajustó**

Probé tres familias de reglas en 2021–2024 y elegí la de mejor TSS. En 2025–2026 no se tocó nada.

| Regla | Prueba: detección | Prueba: falsas alarmas | TSS prueba |
|---|---|---|---|
| v0 "atento o más" | 93% | 76% | 0,16 |
| **v0.2 "atento"** | 93% | 71% | 0,22 |
| v0 "protegelo" | 43% | 18% | 0,25 |
| **v0.2 "protegelo"** | 50% | 21% | **0,29** (IC 90% bootstrap: 0,10–0,48) |
| SHIP ≥ 0,1 (mejor SHIP en entrenamiento) | 96% | 79% | 0,17 |

En entrenamiento el TSS de "protegelo" daba 0,58: **cae a la mitad fuera de la muestra**, señal de que con ~25 casos por lado los umbrales se sobreajustan.

**Por estación** (prueba, "protegelo"):
- fría: 57% de detección con 25% de falsas alarmas;
- cálida: 29% con 17%, sin habilidad práctica.

**Lectura honesta.** v0.2 mejora poco sobre v0, y la diferencia está dentro del ruido. La mejora es más de claridad (reglas físicas, dos variables, honestidad por estación) que de puntaje. El nivel útil es "protegelo". "Atento" detecta casi todo, pero alarma en ~70% de los días de tormenta, así que sirve de "preparate", no de discriminador.

**Falsas alarmas por tipo de control** (todos los años): "protegelo" alarma en el 25% de los de prensa (tormentas notables) y en el 13% de los METAR.

## 2026-10-04 06:43: B. Pronóstico real vs análisis ✅ (parcial, con un límite de la fuente)

**Límite.** La API de corridas anteriores de Open-Meteo (Previous Runs) **no guarda variables en niveles de presión**: `temperature_500hPa_previous_day1` da error. Solo trae superficie (CAPE de superficie, lluvia convectiva, índice de elevación), desde ~2024. Por eso **no se puede medir el motor completo a 24–48 h con esta fuente**.

**Lo que sí medí** (93 casos 2024–2026, máximo diario en el punto), correlación entre lo pronosticado y el casi-análisis:

| Variable | 1 día antes | 2 días antes |
|---|---|---|
| CAPE de superficie | 0,91 | 0,78 |
| Índice de elevación (LI) | 0,92 | 0,83 |
| Lluvia convectiva (el "disparo") | 0,65 | 0,56 |

**Lectura.**
- El ambiente termodinámico pronosticado el día anterior se parece mucho al real. Los campos de altura que usa el motor (gradiente, viento) suelen ser aún más predecibles que la CAPE.
- El "disparo" se degrada bastante, y además casi no distingue granizo de control (76% contra 83% en el análisis).
- Conclusión práctica: consultar a la tarde por esa noche debería conservar la mayor parte de la habilidad. A 2 días, bastante menos. **Es una estimación indirecta, no una medición del motor.**

**Para medirlo de verdad hacia adelante:** `npm run log-forecast` corre el motor con el pronóstico vigente para 16 ciudades (esta noche y mañana) y lo guarda en `data/forecast-log/AAAA-MM.jsonl`. Corriéndolo una vez por día, al cruzarlo con las granizadas de la temporada se obtiene la habilidad real a 12–36 h. Primera corrida: 32 pronósticos. Programarlo como tarea diaria queda **pendiente de que lo apruebe el usuario**.

**Ajustes de infraestructura.**
- Open-Meteo gratis tiene un límite de 5.000 consultas por hora y cada consulta nuestra cuenta como unas 21, porque pide unas 70 variables.
- Ahora se descarga una sola vez por ciudad para varias ventanas, se corta con un mensaje claro si se agota el cupo por hora o por día, y el pronóstico queda en caché una hora.

## 2026-10-04 06:49: E. API + PWA básica ✅

**Cómo correrla:** `npm run serve` → http://localhost:8787. También se puede abrir desde el panel de vista previa, con `.claude/launch.json`.

**API:** `GET /api/assess?lat&lon&window=tonight|today|tomorrow|next12h`. Devuelve:
- nivel, titular y confianza;
- estación y su nota;
- razones con texto;
- ventana y horas con ingredientes;
- datos técnicos del punto más favorable;
- modelo, hora de consulta, versión del motor y aviso legal.

Decisiones de la API:
- Solo acepta Uruguay con margen (lat −35,5 a −29,5; lon −59 a −52,5), porque el motor está calibrado acá.
- Redondea lat/lon a 2 decimales (~1 km), por privacidad y para aprovechar la caché.
- Si se agota el cupo de Open-Meteo, responde 503 con un mensaje claro.

**PWA** (`public/`), sin diseño, deliberadamente básica:
- **Lugar:** "¿Dónde va a estar el auto?" con lugares guardados (Casa, Trabajo…) en localStorage, redondeados a ~1 km, o "Usar mi ubicación" con opción de guardarla.
- **Ventana:** "¿Cuándo?". Por defecto "esta noche" después de las 14 h y "hoy" antes.
- **Resultado:** titular, confianza, nota de estación cálida, "Por qué", horas y "Datos técnicos" plegables.
- **Manifest y service worker:** cachea solo la interfaz. **El veredicto nunca sale de caché**, porque un pronóstico viejo podría engañar.

**Probado en el panel de navegador:**
- flujo completo Casa → Esta noche → Consultar;
- vista en celular (375 px);
- error de geolocalización (el panel no da permiso: se muestra el mensaje);
- sin errores de consola;
- la API devuelve 400 fuera de Uruguay y con ventana inválida, y 404 ante intentos de leer archivos fuera de `public/`.

**Para el diseño (abierto):**
- En la estación cálida, "Tranquilo" con borde verde convive con "Confianza baja" y la nota de estación. ¿Alcanza, o conviene otro tratamiento visual?
- Faltan los nombres definitivos de los niveles (choque con los colores de INUMET).
- Falta un ícono real.

## 2026-10-04 06:58: C. Segundo modelo (ECMWF) ✅

**Datos.** El archivo de Open-Meteo tiene perfiles completos de **ECMWF IFS 0,25°** desde ~junio de 2024, sin nivel de congelamiento: el motor ahora lo calcula desde el perfil, con su test. Evalué los 86 casos desde 2024-06 aplicando a ECMWF **las mismas reglas calibradas en GFS**.

**Prueba 2025–2026** (62 casos: 28 de granizo y 34 controles), nivel "protegelo":

| | Detección | Falsas alarmas | TSS |
|---|---|---|---|
| GFS | 50% | 21% | 0,29 |
| ECMWF | 61% | 24% | 0,37 |
| **Los dos (AND)** | **43%** | **15%** | 0,28 |
| Alguno (OR) | 68% | 29% | 0,38 |

- Cuando GFS dice "protegelo" y ECMWF coincide, granizó en el **71%** de los casos (17). Cuando no coincide, en el 50% (4).
- Los modelos difieren bastante caso a caso. Correlación del punto más favorable: gradiente 0,58, WMAXSHEAR 0,81, MUCAPE 0,57. **Por eso tener los dos aporta.**

**Decisión** (según la preferencia del usuario: "atento" generoso y "día rojo" estricto):
- **protegelo** = los dos modelos dicen protegelo.
- **atento** = alguno dice protegelo, o los dos dicen al menos atento.
- **tranquilo** = el resto.
- **Confianza:** baja en la estación cálida; en la fría, media si coinciden y baja si no.
- Si ECMWF no tiene datos, sigue con GFS solo. En el archivo, ECMWF se saltea antes de 2024-06.

**Motor combinado en el test** (`reports/backtest.md`), prueba 2025–2026:

| | Detección | Falsas alarmas |
|---|---|---|
| "atento o más" | 93% | 65% (GFS solo: 71%) |
| **"protegelo"** | **43%** | **15%** |
| "protegelo", estación fría | 57% | 19% |
| "protegelo", estación cálida | 0% de 7 | 11% |

**Advertencia.** Las diferencias entre combinaciones están dentro del ruido (IC del TSS de ±0,2). La elección es de producto (un "día rojo" que no alarme de más), no un ganador estadístico.

**Costo.** Dos modelos duplican las consultas a Open-Meteo. Se agotó el cupo por hora una vez al correr el test entero; se corrigió salteando ECMWF fuera de su archivo.

## 2026-10-04 07:00: D. Rayos GLM ⏳ (en curso)

**Factibilidad: sí, y barata.**
- Buckets públicos de NOAA en AWS (noaa-goes16 hasta 2025-04-06, noaa-goes19 desde 2025-04-07), producto GLM-L2-LCFA: un NetCDF cada 20 s, ~0,5 MB. No hace falta cuenta.
- **Latencia medida: el archivo se publica ~7 s después de terminar su ventana**, así que lo más nuevo tiene menos de 30 s. Sirve para nowcasting.
- Lectura con `h5py` (Python). Prototipo en `scripts/glm/glm_point.py`: cuenta los flashes a ≤ 30 y ≤ 50 km de un punto en bins de 2 min y detecta el "lightning jump" (2σ, Schultz et al. 2009). El modo `now` mira la última hora: tarda ~15 s.
- Como producto: un proceso de servidor que baja los 3 archivos nuevos por minuto (~1,5 MB/min) y guarda los flashes sobre Uruguay respondería por punto al instante.

**Advertencia.** El archivo tiene huecos. La granizada de El Pinar (2024-09-09 16:24) cae justo en uno: GOES-16 no tiene datos de 17:13 a 19:55 UTC. El lote descarta los casos con menos del 80% de los archivos.

**Evaluación en curso** (`scripts/glm/glm_batch.py`): 76 casos con hora conocida (13 de granizo y 63 controles), ventana de 90 min antes a 30 min después. **Solo 2 granizadas con hora son de la estación cálida**, así que no se va a poder concluir nada sobre el verano.

## 2026-10-04 07:23: D. Rayos GLM ✅

**Evaluación**
- 76 casos con hora conocida y ventana de 90 min antes a 30 min después. 75 con cobertura de archivos ≥ 80%: **12 de granizo** (solo 2 de la estación cálida) y **63 controles** (11 de prensa y 52 METAR).
- Umbrales estándar de la literatura (2σ, ≥ 10 flashes/min), **sin ajustar**: no hay sobreajuste.
- El lote en segundo plano se cortó por el límite de 30 min de esas tareas, en 64/76. Se completó en primer plano, en tandas de 8 (`glm_batch.py <salida> 8`).

| Señal | Granizo | Controles | AUC |
|---|---|---|---|
| Total de flashes a ≤ 30 km (mediana) | 895 | 34 | 0,84 |
| Tasa máxima a ≤ 30 km (flashes/min, mediana) | 23,5 | 2,5 | 0,83 |
| Salto 2σ a ≤ 50 km | **10/12 (83%)** | **16/63 (25%)** | — |
| Ningún rayo a ≤ 30 km | 0/12 | 5/63 | — |

**El chequeo que cambia la lectura.** Si se comparan **solo tormentas eléctricamente fuertes** (≥ 10 flashes/min a ≤ 50 km), el salto aparece en **10/10 granizadas y 16/18 controles**. Lo que parecía "detector de granizo" es en realidad **"hay una tormenta fuerte cerca"**. Además, las ventanas no son simétricas: en el granizo se centran en la hora del granizo, cerca del pico de la tormenta; en los controles, en el primer trueno, que es el inicio. Eso favorece al granizo.

**Conclusión**
- Los rayos **no distinguen granizo de tormenta fuerte sin granizo** en esta muestra, que además es chica: 12 casos, 2 de verano.
- Sí sirven, en tiempo real (latencia < 30 s), para avisar **"tormenta eléctrica fuerte a X km, ahora"**. Ninguna de las 12 granizadas ocurrió sin rayos cerca, y casi todas tuvieron ≥ 10 flashes/min.
- **Uso de producto propuesto:** una capa de **nowcasting de 0–1 h** que convierta "atento" en "si lo vas a mover, es ahora", sobre todo en verano, donde el pronóstico no distingue. No es un detector de granizo. Va a tener falsas alarmas: todas las tormentas fuertes.
- **Pendiente para validarlo en serio:** controles con tormentas fuertes, ventanas simétricas y más granizadas de verano con hora conocida.

## 2026-10-04 07:25: F. Cierre ✅ — PLAN COMPLETO

**Estado**
- 22 tests verdes y chequeo de tipos limpio.
- Test histórico completo: 140 casos.
- README, resultados y bitácora al día.
- Resultados de ECMWF y de rayos copiados a `reports/` (`ecmwf-eval.json`, `glm-results.json`).
- Sin commits ni push.

**Resumen de números, siempre en los años de prueba (2025–2026) y en días de tormenta**

| | Detección | Falsas alarmas |
|---|---|---|
| INUMET "había alerta" | ~100% | ~100% (no separa) |
| Motor v0 "protegelo" (GFS) | 43% | 18% |
| Motor v0.2 "protegelo" (GFS) | 50% | 21% |
| **Motor v0.2 "protegelo" (GFS y ECMWF)** | **43%** | **15%** |
| ↳ estación fría | 57% | 19% |
| ↳ estación cálida | 0% (de 7) | 11% |
| Motor v0.2 "atento o más" (dos modelos) | 93% | 65% |

**Qué no funcionó o quedó limitado**
- La calibración mejora poco: la diferencia está dentro del ruido.
- En la estación cálida no hay habilidad.
- No se pudo medir el motor con pronósticos reales a 24–48 h: Open-Meteo no guarda corridas viejas de niveles de presión. La estimación indirecta sugiere poca pérdida a 1 día.
- Los rayos no distinguen granizo de tormenta fuerte sin granizo.

**Próximos pasos sugeridos (a decidir con el usuario)**
1. **Correr `npm run log-forecast` todos los días** durante esta temporada: es la única forma de medir la habilidad real a 12–36 h. Necesita aprobación para programarlo.
2. **Capa de rayos en la PWA**: "tormenta eléctrica fuerte a X km" como nowcasting de 0–1 h, sobre todo en verano. Requiere un proceso de servidor, idealmente en Python.
3. **Más granizadas de verano con hora conocida** para evaluar los rayos en serio, con controles de tormenta fuerte y ventanas simétricas.
4. **Diseño**: nombres de nivel (choque con INUMET), cómo mostrar "Tranquilo" con confianza baja en verano, ícono.
5. **Deploy** cuando el usuario quiera; no se hizo nada.
