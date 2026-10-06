# Calibración — qué variables separan granizo de controles

Valor de cada caso = el máximo en la zona (~40 km) y la ventana de 24 h.

- **AUC**: probabilidad de que un día de granizo tenga un valor más alto que un día de control. 0.5 = no separa, 1 = separa perfecto; por debajo de 0.5 separa "al revés".
- **Mejor umbral**: el que maximiza detección − falsas alarmas. Con muestras chicas es orientativo: puede estar sobreajustado.
- Se muestra también **por estación**, porque el ciclo anual puede fingir una señal (p. ej. "más frío en altura" = "es invierno").

## Granizo dañino vs controles (todo el año)

Granizo n=16 · controles n=72

| Variable | Mediana granizo | Mediana control | AUC | Mejor umbral | Detección | Falsas alarmas |
|---|---|---|---|---|---|---|
| WMAXSHEAR (m²/s²) | 1515.3 | 969.5 | 0.79 | ≥ 1177.4 | 88% | 35% |
| Cizalladura donde MUCAPE ≥ 500 | 34.8 | 25.9 | 0.78 | ≥ 26.6 | 88% | 42% |
| Gradiente 700–500 (°C/km) | 7.5 | 7.0 | 0.73 | ≥ 7.4 | 56% | 17% |
| SHIP | 0.7 | 0.4 | 0.71 | ≥ 0.9 | 44% | 10% |
| Lluvia convectiva modelo (mm/h) | 3.0 | 1.9 | 0.61 | ≥ 2.6 | 69% | 35% |
| Lluvia total modelo (mm/h) | 3.3 | 5.1 | 0.39 | ≥ 34.3 | 6% | 1% |
| MUCAPE (J/kg) | 1597.0 | 1270.0 | 0.61 | ≥ 592.5 | 100% | 68% |
| −T500 donde MUCAPE ≥ 500 | 12.4 | 10.7 | 0.61 | ≥ 12.4 | 50% | 26% |
| Cizalladura 0–6 km (m/s) | 36.9 | 32.9 | 0.59 | ≥ 35.3 | 63% | 38% |
| −T500 (°C, más = más frío) | 12.6 | 12.1 | 0.54 | ≥ 16.6 | 19% | 6% |
| Humedad parcela MU (g/kg) | 13.8 | 14.9 | 0.46 | ≥ 18.7 | 13% | 3% |

## Granizo (dañino + sin dato) vs controles (todo el año)

Granizo n=52 · controles n=72

| Variable | Mediana granizo | Mediana control | AUC | Mejor umbral | Detección | Falsas alarmas |
|---|---|---|---|---|---|---|
| WMAXSHEAR (m²/s²) | 1446.4 | 969.5 | 0.73 | ≥ 1097.1 | 79% | 38% |
| Gradiente 700–500 (°C/km) | 7.5 | 7.0 | 0.72 | ≥ 7.5 | 46% | 7% |
| Cizalladura donde MUCAPE ≥ 500 | 32.1 | 25.9 | 0.71 | ≥ 28.1 | 76% | 36% |
| SHIP | 0.6 | 0.4 | 0.68 | ≥ 0.6 | 54% | 24% |
| −T500 donde MUCAPE ≥ 500 | 12.6 | 10.7 | 0.65 | ≥ 13.3 | 46% | 16% |
| MUCAPE (J/kg) | 1366.7 | 1270.0 | 0.59 | ≥ 592.5 | 96% | 68% |
| −T500 (°C, más = más frío) | 13.1 | 12.1 | 0.58 | ≥ 13.5 | 46% | 31% |
| Lluvia total modelo (mm/h) | 3.3 | 5.1 | 0.42 | ≥ 0.1 | 100% | 97% |
| Cizalladura 0–6 km (m/s) | 36.5 | 32.9 | 0.57 | ≥ 36.2 | 52% | 31% |
| Humedad parcela MU (g/kg) | 13.6 | 14.9 | 0.44 | ≥ 20.3 | 4% | 0% |
| Lluvia convectiva modelo (mm/h) | 2.2 | 1.9 | 0.56 | ≥ 1.6 | 67% | 51% |

## Estación cálida (oct–mar): granizo (dañino + sin dato) vs controles

Granizo n=17 · controles n=46

| Variable | Mediana granizo | Mediana control | AUC | Mejor umbral | Detección | Falsas alarmas |
|---|---|---|---|---|---|---|
| Cizalladura 0–6 km (m/s) | 29.1 | 32.5 | 0.37 | ≥ 36.5 | 29% | 22% |
| Lluvia convectiva modelo (mm/h) | 0.9 | 2.4 | 0.37 | ≥ 5.3 | 12% | 4% |
| Lluvia total modelo (mm/h) | 2.8 | 5.1 | 0.40 | ≥ 17.1 | 18% | 13% |
| MUCAPE (J/kg) | 1737.4 | 1440.0 | 0.57 | ≥ 3401.3 | 18% | 0% |
| −T500 donde MUCAPE ≥ 500 | 9.6 | 10.0 | 0.43 | ≥ 12.8 | 25% | 16% |
| SHIP | 0.6 | 0.4 | 0.55 | ≥ 0.6 | 53% | 26% |
| Gradiente 700–500 (°C/km) | 7.0 | 7.1 | 0.45 | ≥ 7.4 | 29% | 24% |
| −T500 (°C, más = más frío) | 10.0 | 10.5 | 0.45 | ≥ 13.3 | 24% | 15% |
| WMAXSHEAR (m²/s²) | 1193.7 | 1058.8 | 0.55 | ≥ 1097.1 | 65% | 46% |
| Humedad parcela MU (g/kg) | 15.3 | 16.1 | 0.51 | ≥ 17.2 | 41% | 24% |
| Cizalladura donde MUCAPE ≥ 500 | 28.1 | 25.8 | 0.51 | ≥ 26.5 | 63% | 42% |

## Estación fría (abr–sep): granizo (dañino + sin dato) vs controles

Granizo n=35 · controles n=26

| Variable | Mediana granizo | Mediana control | AUC | Mejor umbral | Detección | Falsas alarmas |
|---|---|---|---|---|---|---|
| Gradiente 700–500 (°C/km) | 7.6 | 6.8 | 0.86 | ≥ 7.5 | 69% | 8% |
| WMAXSHEAR (m²/s²) | 1515.3 | 723.0 | 0.86 | ≥ 1175.5 | 86% | 23% |
| SHIP | 0.6 | 0.1 | 0.79 | ≥ 0.2 | 94% | 38% |
| Cizalladura donde MUCAPE ≥ 500 | 37.3 | 26.6 | 0.78 | ≥ 34.8 | 59% | 8% |
| Lluvia convectiva modelo (mm/h) | 3.0 | 1.4 | 0.72 | ≥ 1.8 | 77% | 38% |
| MUCAPE (J/kg) | 1248.3 | 483.2 | 0.72 | ≥ 592.5 | 97% | 42% |
| −T500 donde MUCAPE ≥ 500 | 14.0 | 12.6 | 0.63 | ≥ 13.8 | 56% | 25% |
| Lluvia total modelo (mm/h) | 3.3 | 5.1 | 0.40 | ≥ 0.4 | 100% | 96% |
| Humedad parcela MU (g/kg) | 13.3 | 12.7 | 0.59 | ≥ 12.9 | 69% | 42% |
| Cizalladura 0–6 km (m/s) | 38.8 | 35.8 | 0.59 | ≥ 28.1 | 94% | 69% |
| −T500 (°C, más = más frío) | 14.2 | 14.0 | 0.52 | ≥ 16.3 | 26% | 8% |

## Pares emparejados (granizada vs control de la misma época)

Pares: 52. "Gana granizo" = en cuántos pares el día de granizo tuvo el valor más alto.

| Variable | Gana granizo | Gana control |
|---|---|---|
| MUCAPE (J/kg) | 34/52 | 18/52 |
| Cizalladura 0–6 km (m/s) | 36/52 | 16/52 |
| Gradiente 700–500 (°C/km) | 40/52 | 12/52 |
| −T500 (°C, más = más frío) | 26/52 | 26/52 |
| SHIP | 38/52 | 14/52 |
| WMAXSHEAR (m²/s²) | 38/52 | 14/52 |
| Humedad parcela MU (g/kg) | 33/52 | 19/52 |
| Lluvia convectiva modelo (mm/h) | 33/52 | 19/52 |
| Lluvia total modelo (mm/h) | 23/52 | 29/52 |
| −T500 donde MUCAPE ≥ 500 | 15/31 | 16/31 |
| Cizalladura donde MUCAPE ≥ 500 | 22/31 | 9/31 |

