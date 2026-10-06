# Resultados del test histórico — motor v0

> **Actualización 2026-10-04:** el motor v0.2 (calibrado, dos modelos, confianza por estación) y la evaluación de rayos están en [`bitacora-motor.md`](bitacora-motor.md). Este documento queda como registro del v0.

Fecha: 2026-10-04 · Reportes completos: [`reports/backtest.md`](../reports/backtest.md), [`reports/calibration.md`](../reports/calibration.md)

## La pregunta

¿La receta distingue **tormenta con piedra** de **tormenta con agua** mejor que "había alerta de INUMET"?

## Datos

- **68 granizadas** de 2021 a 2026: 16 dañinas, 36 sin dato de tamaño y 16 chicas o graupel. Todas tienen fuente.
- **72 controles**, días de tormenta sin granizo:
  - 20 de prensa, tormentas notables con alerta de INUMET, sesgadas hacia el verano;
  - 52 emparejados por época, tormentas observadas en aeropuertos, en general más débiles.
- **Atmósfera:** el archivo GFS de Open-Meteo, que es casi un análisis. **Es un techo:** el pronóstico real del día anterior va a ser peor.

## Hallazgos

1. **La primera señal era falsa.** "Más frío en altura los días de granizo" era en realidad el efecto invierno contra verano. Con controles de la misma época, T500 no separa: 26 de 52 pares.
2. **Con controles emparejados, hay señal real pero moderada.** En pares de la misma época, el día de granizo tuvo el valor más alto en:
   - gradiente térmico 700–500 hPa: **40/52**
   - SHIP: **38/52**
   - WMAXSHEAR (energía × cizalladura): **38/52**
   - cizalladura: 36/52
   - MUCAPE: 34/52
3. **Depende de la estación:**
   - **Fría (abr–sep):** separa bien. Gradiente AUC 0,86, WMAXSHEAR 0,86, SHIP 0,79. Ahí están 35 de las 52 granizadas.
   - **Cálida (oct–mar):** **hoy no separa** (AUC 0,37–0,57). En verano, las tormentas con y sin granizo se ven iguales para el modelo a esta escala.
4. **Fuera de la muestra la señal se achica.** Una regla simple (gradiente ≥ 6,5 y WMAXSHEAR ≥ 1200) ajustada con 2021–2024 y probada en 2025–2026:

   | | Detección | Falsas alarmas en días de tormenta |
   |---|---|---|
   | Entrenamiento 2021–2024 | 75% | 26% |
   | **Prueba 2025–2026** | **57%** | **35%** |
   | Prueba, estación fría | 67% | 31% |
   | Prueba, estación cálida | 29% | 39% (sin habilidad) |
   | SHIP ≥ 0,5 en la prueba | 68% | 38% |
   | INUMET "había alerta" | ~100% | ~100% (no separa) |

5. **Motor v0 (umbrales de EE.UU.), sobre los 72 controles:** "Protegelo" detecta el 50% de las dañinas con 17% de falsas alarmas. "Atento o más" detecta el 94%, con 65% de falsas alarmas. Contra los 20 controles de prensa, que son tormentas fuertes, alarma en el 90%.

## Qué significa

- **El motor agrega algo respecto de INUMET, pero no mucho, y solo en la estación fría.** En días de tormenta de abril a septiembre, puede decir "hoy no es de piedra" en ~2 de cada 3 días sin granizo y avisar en ~2 de cada 3 con granizo.
- **De octubre a marzo, que es justo ahora, con El Niño, todavía no aporta** mirando solo el ambiente del modelo global. Para el verano, lo que puede funcionar es la capa de observación en tiempo real (rayos, satélite, radar), no un mejor ambiente.
- Las variables que importan acá **no son las de EE.UU.**:
  - la CAPE sola casi no sirve;
  - el gradiente térmico y la combinación energía × viento sí;
  - la cizalladura en Uruguay es alta casi siempre, así que el umbral de 20 m/s no discrimina.

## Advertencias

- Muestras chicas: 17 granizadas en la estación cálida. Cualquier umbral puede estar sobreajustado.
- Los controles METAR son tormentas más débiles que los de prensa.
- El sesgo de reporte: hay más granizo reportado donde hay más gente, y más desde 2024.
- Los datos son casi análisis: el pronóstico real va a rendir menos.

## Próximos pasos posibles (a decidir)

1. **Motor v0.2** con lo aprendido: sumar el gradiente y WMAXSHEAR, subir el umbral de cizalladura y validar siempre fuera de la muestra.
2. **Mensaje honesto por estación:** en verano, la app debería decir que el ambiente no alcanza para distinguir.
3. **Rayos (GLM) para el verano:** un salto brusco de rayos es un precursor documentado de granizo, y es la capa que podría servir de octubre a marzo.
4. **Medir el pronóstico real** (corridas anteriores, no análisis) para saber cuánto se pierde a 12–24 h.
