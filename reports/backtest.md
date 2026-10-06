# Test histórico — motor v0.2.0

Generado: 2026-10-04T10:24 UTC · 140 casos evaluados

> Datos: archivo de pronósticos GFS de Open-Meteo, que son las primeras horas de cada corrida (casi un análisis).
> Esto mide si **la receta separa** con datos casi perfectos. Es un techo: el pronóstico real de 12–24 h va a ser peor.

## Qué dijo el motor en cada grupo

| Grupo | Casos | Protegelo | Atento | Tranquilo |
|---|---|---|---|---|
| Granizo dañino (≥ 2 cm o con daño) | 16 | 9 (56%) | 6 (38%) | 1 (6%) |
| Granizo sin dato de tamaño | 36 | 18 (50%) | 14 (39%) | 4 (11%) |
| Granizo chico / graupel | 16 | 5 (31%) | 5 (31%) | 6 (38%) |
| Control: tormenta sin granizo | 72 | 7 (10%) | 36 (50%) | 29 (40%) |

## Motor vs INUMET

- **Detección**: de las granizadas dañinas, en cuántas avisó.
- **Falsas alarmas en controles**: de los días de tormenta sin granizo, en cuántos alarmó de más.

| Criterio | Detección dañino (n=16) | Detección dañino + sin dato (n=52) | Falsas alarmas en controles (n=72) |
|---|---|---|---|
| Motor: "Atento" o más | 94% | 90% | 60% |
| Motor: solo "Protegelo" | 56% | 52% | 10% |
| INUMET: había alerta (casos con dato) | 100% | 86% | 100% |

### Entrenamiento vs prueba

Los umbrales v0.2 se ajustaron **solo con 2021–2024**. Lo que vale como estimación honesta es la fila de **prueba (2025–2026)**.

| Período | Detección "atento o más" | FA "atento o más" | Detección "protegelo" | FA "protegelo" |
|---|---|---|---|---|
| Entrenamiento 2021–2024 (24 granizo / 38 control) | 88% | 55% | 63% | 5% |
| **Prueba 2025–2026** (28 granizo / 34 control) | 93% | 65% | 43% | 15% |
| Prueba, estación fría (21 granizo / 16 control) | 100% | 69% | 57% | 19% |
| Prueba, estación cálida (7 granizo / 18 control) | 71% | 61% | 0% | 11% |

Los controles se eligieron con alerta de INUMET, así que INUMET alarma en casi todos por construcción. La pregunta es si el motor separa **dentro** de los días con alerta.

## Ingredientes típicos de cada grupo (mediana del punto más favorable)

| Grupo | MUCAPE J/kg | Cizalladura m/s | Gradiente °C/km | T500 °C | SHIP | Lluvia conv. máx mm/h |
|---|---|---|---|---|---|---|
| Granizo dañino (≥ 2 cm o con daño) | 1175 | 29.3 | 6.67 | -10.7 | 0.58 | 2.8 |
| Granizo sin dato de tamaño | 1184 | 28.5 | 6.64 | -11.7 | 0.57 | 1.9 |
| Granizo chico / graupel | 539 | 33.9 | 6.66 | -14.5 | 0.29 | 1.1 |
| Control: tormenta sin granizo | 693 | 24.1 | 6.56 | -10.5 | 0.16 | 1.5 |

Reglas v0.2.0: gradiente 700–500 ≥ 6.5 °C/km y energía×viento (WMAXSHEAR) ≥ 400 (atento) / ≥ 1200 m²/s² con tormentas en el modelo (protegelo).

## Caso por caso

| Fecha | Lugar | Grupo | INUMET | Motor | Pico | MUCAPE | Ciz. | Grad. | T500 | SHIP | Conv. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2021-07-28 | Aeropuerto de Carrasco | hail_small | none | calm | 07-28T14:00 | 237 | 34.2 | — | — | — | 0.4 |
| 2021-07-28 | Aeropuerto de Laguna del Sauce | hail_small | none | watch | 07-28T12:00 | 361 | 18.3 | 6.75 | -32.2 | 0.03 | 1.1 |
| 2021-08-08 | Aeropuerto de Laguna del Sauce | control | unknown | calm | 08-08T16:00 | 362 | 28.6 | 5.62 | -13.3 | 0.05 | 0.5 |
| 2021-08-08 | Aeropuerto de Carrasco | control | unknown | calm | 08-08T21:00 | 293 | 29.9 | 5.78 | -14.0 | 0.04 | 0.8 |
| 2021-08-21 | Aeropuerto de Laguna del Sauce | hail_small | unknown | protect | 08-22T04:00 | 732 | 34.0 | 6.82 | -14.5 | 0.29 | 1.4 |
| 2021-10-02 | Aeropuerto de Salto | control | unknown | watch | 10-02T17:00 | 1140 | 25.0 | 7.04 | -14.2 | 0.70 | 1.2 |
| 2021-10-10 | Aeropuerto de Salto | control | unknown | watch | 10-10T22:00 | 323 | 23.2 | 6.79 | -14.9 | 0.05 | 3.7 |
| 2021-10-13 | Aeropuerto de Salto | control | unknown | calm | 10-13T12:00 | 191 | 31.5 | 4.83 | -10.0 | 0.01 | 0.5 |
| 2021-12-21 | Rivera | hail_unknown | unknown | protect | 12-21T14:00 | 1549 | 22.4 | 7.27 | -11.2 | 0.80 | 0.8 |
| 2022-01-04 | Aeropuerto de Carrasco | control | unknown | watch | 01-04T15:00 | 1729 | 14.0 | 6.65 | -10.0 | 0.52 | 0.9 |
| 2022-01-17 | Montevideo | control | orange | watch | 01-17T03:00 | 1151 | 25.0 | 6.67 | -9.8 | 0.54 | 2.8 |
| 2022-01-17 | Aeropuerto de Salto | control | unknown | watch | 01-17T02:00 | 591 | 16.1 | 6.61 | -7.2 | 0.07 | 0.8 |
| 2022-04-26 | Casupá | hail_small | unknown | protect | 04-26T22:00 | 1398 | 31.5 | 6.52 | -8.6 | 0.69 | 3.5 |
| 2022-07-10 | San Ramón | damaging | unknown | protect | 07-10T16:00 | 1456 | 28.1 | 8.09 | -14.0 | 1.17 | 2.6 |
| 2022-09-01 | Aeropuerto de Laguna del Sauce | control | unknown | calm | 08-31T22:00 | 103 | 15.2 | 5.94 | -12.8 | 0.00 | 0.3 |
| 2022-09-01 | Aeropuerto de Salto | control | unknown | calm | 09-01T10:00 | 132 | 25.9 | 5.92 | -12.8 | 0.01 | 0.8 |
| 2022-10-20 | Aeropuerto de Salto | control | unknown | watch | 10-19T16:00 | 965 | 15.6 | 6.59 | -13.1 | 0.27 | 4.2 |
| 2022-10-29 | Aeropuerto Ángel Adami (Melilla) | control | unknown | watch | 10-29T14:00 | 85 | 33.6 | 7.02 | -13.1 | 0.00 | 0.5 |
| 2022-10-31 | Aeropuerto de Carrasco | hail_small | none | calm | 10-31T06:00 | 230 | 48.7 | 2.89 | -18.0 | 0.00 | 0.4 |
| 2022-12-10 | Durazno | control | orange | calm | 12-10T16:00 | 728 | 17.0 | 5.62 | -8.9 | 0.09 | 0.3 |
| 2022-12-28 | Salto | hail_unknown | unknown | watch | 12-28T16:00 | 855 | 10.0 | 6.59 | -13.3 | 0.13 | 0.1 |
| 2023-01-01 | Montevideo | control | yellow | watch | 01-01T16:00 | 406 | 27.8 | 6.71 | -11.7 | 0.09 | 0.0 |
| 2023-03-29 | Paysandú | control | orange | watch | 03-29T18:00 | 1753 | 18.5 | 6.56 | -9.8 | 0.68 | 7.6 |
| 2023-05-26 | Aeropuerto de Durazno | control | unknown | watch | 05-26T15:00 | 261 | 30.4 | 6.60 | -14.0 | 0.04 | 1.2 |
| 2023-05-26 | Aeropuerto de Laguna del Sauce | control | unknown | calm | 05-26T12:00 | 180 | 22.5 | 5.24 | -11.9 | 0.01 | 1.5 |
| 2023-07-06 | Mercedes | hail_small | yellow | watch | 07-06T00:00 | 716 | 28.3 | 7.40 | -17.0 | 0.35 | 2.4 |
| 2023-09-17 | Balneario Buenos Aires (La Barra–José Ignacio) | hail_unknown | yellow | protect | 09-17T16:00 | 722 | 38.7 | 6.74 | -10.0 | 0.19 | 1.0 |
| 2023-09-17 | Barros Blancos | hail_unknown | unknown | protect | 09-17T23:00 | 1015 | 37.0 | 6.53 | -11.0 | 0.40 | 0.9 |
| 2023-10-03 | Artigas | damaging | orange | protect | 10-03T22:00 | 1105 | 35.3 | 6.67 | -9.3 | 0.41 | 2.8 |
| 2023-10-11 | Aeropuerto de Laguna del Sauce | control | unknown | watch | 10-11T01:00 | 432 | 33.0 | 7.37 | -16.1 | 0.12 | 2.4 |
| 2023-10-11 | Aeropuerto de Carrasco | control | unknown | protect | 10-11T02:00 | 757 | 33.2 | 6.60 | -15.2 | 0.31 | 3.0 |
| 2023-10-30 | Aeropuerto de Carrasco | hail_small | unknown | protect | 10-30T02:00 | 1239 | 33.9 | 7.05 | -14.5 | 0.87 | 1.9 |
| 2023-11-08 | Salto | hail_unknown | yellow | protect | 11-08T11:00 | 1955 | 26.5 | 6.57 | -7.5 | 0.83 | 2.0 |
| 2023-11-10 | Aeropuerto de Colonia | control | unknown | calm | 11-10T16:00 | 189 | 34.2 | 6.10 | -6.3 | 0.01 | 0.0 |
| 2023-12-01 | Colonia del Sacramento (aeropuerto) | hail_small | orange | protect | 12-01T10:00 | 1350 | 30.6 | 6.66 | -8.9 | 0.70 | 3.8 |
| 2023-12-17 | Colonia del Sacramento | control | orange | watch | 12-17T02:00 | 1901 | 16.3 | 6.63 | -5.6 | 0.37 | 3.2 |
| 2023-12-17 | Mercedes | control | orange | watch | 12-17T14:00 | 1794 | 19.5 | 6.65 | -6.5 | 0.49 | 3.8 |
| 2023-12-17 | Montevideo | control | orange | watch | 12-17T06:00 | 1556 | 15.8 | 6.88 | -6.5 | 0.36 | 3.4 |
| 2023-12-17 | San José de Mayo | control | orange | watch | 12-17T03:00 | 1731 | 16.0 | 6.56 | -5.4 | 0.32 | 4.1 |
| 2024-01-16 | Baltasar Brum | hail_unknown | orange | protect | 01-16T17:00 | 1563 | 28.9 | 6.60 | -6.3 | 0.57 | 5.3 |
| 2024-02-04 | Rivera | hail_unknown | unknown | watch | 02-04T09:00 | 2290 | 9.0 | 6.50 | -8.2 | 0.36 | 5.9 |
| 2024-02-23 | Lascano | hail_unknown | unknown | calm | 02-23T15:00 | 1083 | 13.0 | 4.64 | -7.0 | 0.10 | 0.4 |
| 2024-02-23 | Tranqueras | hail_unknown | unknown | calm | 02-23T15:00 | 801 | 12.2 | 4.87 | -7.2 | 0.05 | 0.2 |
| 2024-03-02 | Montevideo | control | yellow | watch | 03-02T16:00 | 1302 | 18.9 | 6.51 | -9.1 | 0.47 | 1.3 |
| 2024-03-09 | Fray Bentos | control | orange | protect | 03-09T00:00 | 1602 | 28.3 | 6.76 | -8.9 | 0.84 | 4.0 |
| 2024-04-26 | Solís de Mataojo | damaging | orange | protect | 04-26T13:00 | 598 | 34.8 | 6.52 | -10.7 | 0.15 | 3.0 |
| 2024-05-10 | Salto (aeropuerto) | hail_small | yellow | watch | 05-10T13:00 | 188 | 29.3 | 6.50 | -11.2 | 0.01 | 0.9 |
| 2024-06-14 | Florida | hail_unknown | unknown | protect | 06-14T15:00 | 621 | 37.6 | 7.30 | -13.3 | 0.25 | 1.8 |
| 2024-06-14 | Ismael Cortinas | hail_unknown | yellow | protect | 06-14T16:00 | 653 | 40.2 | 7.35 | -14.0 | 0.29 | 2.0 |
| 2024-06-22 | Trinidad | damaging | orange | protect | 06-22T05:00 | 1682 | 24.9 | 7.02 | -12.6 | 1.07 | 3.3 |
| 2024-07-24 | Carmelo | hail_unknown | unknown | watch | 07-24T20:00 | 266 | 27.4 | 7.65 | -18.4 | 0.05 | 0.2 |
| 2024-08-03 | Aeropuerto Ángel Adami (Melilla) | control | unknown | calm | 08-03T04:00 | 112 | 27.6 | 5.85 | -10.3 | 0.00 | 0.5 |
| 2024-08-03 | Aeropuerto de Colonia | control | unknown | calm | 08-03T10:00 | 142 | 41.2 | 6.25 | -12.8 | 0.01 | 0.5 |
| 2024-08-05 | Las Flores | hail_unknown | unknown | protect | 08-05T15:00 | 1008 | 26.9 | 6.76 | -12.8 | 0.57 | 2.2 |
| 2024-08-06 | Salto (aeropuerto) | hail_unknown | unknown | watch | 08-06T14:00 | 1290 | 28.5 | 6.54 | -12.4 | 0.91 | 3.5 |
| 2024-08-20 | Río Branco | hail_small | yellow | calm | 08-20T22:00 | 217 | 26.5 | 6.61 | -10.5 | 0.02 | 0.6 |
| 2024-08-31 | Aeropuerto de Laguna del Sauce | control | unknown | calm | 08-31T06:00 | 101 | 33.7 | 6.20 | -13.5 | 0.00 | 0.1 |
| 2024-08-31 | Aeropuerto de Carrasco | control | unknown | calm | 08-31T05:00 | 102 | 32.2 | 6.21 | -13.5 | 0.00 | 0.5 |
| 2024-09-09 | Barra del Chuy | hail_unknown | unknown | protect | 09-09T23:00 | 1585 | 30.1 | 7.27 | -12.6 | 1.22 | 1.5 |
| 2024-09-09 | El Pinar (Ciudad de la Costa) | damaging | orange | watch | 09-09T20:00 | 706 | 36.0 | 6.60 | -13.8 | 0.25 | 2.0 |
| 2024-09-19 | Salto | hail_unknown | yellow | protect | 09-19T16:00 | 3728 | 17.0 | 6.93 | -10.7 | 1.52 | 1.2 |
| 2024-09-24 | Baltasar Brum | damaging | orange | protect | 09-24T00:00 | 1734 | 29.3 | 6.91 | -7.7 | 0.81 | 0.5 |
| 2024-09-30 | Fray Marcos | hail_small | unknown | protect | 09-30T18:00 | 1949 | 32.0 | 6.66 | -10.0 | 1.13 | 2.8 |
| 2024-10-07 | Aeropuerto de Salto | control | unknown | calm | 10-06T17:00 | 224 | 24.4 | 6.82 | -8.4 | 0.02 | 0.4 |
| 2024-10-17 | Salto (aeropuerto) | hail_unknown | none | calm | 10-17T12:00 | 120 | 28.7 | 5.94 | -9.1 | 0.00 | 0.9 |
| 2024-10-23 | Aeropuerto de Colonia | control | unknown | calm | 10-23T16:00 | 966 | 19.2 | 5.19 | -7.5 | 0.16 | 3.2 |
| 2024-10-23 | Aeropuerto de Carrasco | control | unknown | calm | 10-23T20:00 | 214 | 24.2 | 5.02 | -7.7 | 0.01 | 1.4 |
| 2024-10-24 | Aeropuerto de Laguna del Sauce | control | unknown | calm | 10-24T11:00 | 562 | 18.9 | 6.67 | -10.3 | 0.10 | 4.5 |
| 2024-11-27 | Durazno | control | yellow | watch | 11-27T12:00 | 2389 | 32.2 | 6.60 | -10.5 | 1.45 | 2.9 |
| 2024-11-27 | Trinidad | control | yellow | watch | 11-27T10:00 | 2184 | 26.4 | 6.64 | -11.0 | 1.36 | 3.0 |
| 2024-11-27 | Aeropuerto de Durazno | control | unknown | watch | 11-27T12:00 | 2213 | 32.1 | 6.60 | -10.5 | 1.34 | 2.9 |
| 2024-12-01 | Isidoro Noblía | damaging | red | watch | 12-01T17:00 | 1903 | 34.6 | 6.54 | -5.8 | 0.63 | 0.0 |
| 2024-12-01 | Montevideo | control | orange | calm | 12-01T11:00 | 476 | 37.5 | 6.56 | -9.8 | 0.08 | 1.4 |
| 2025-01-01 | Montevideo | hail_unknown | yellow | watch | 01-01T18:00 | 1562 | 29.1 | 6.58 | -13.3 | 1.19 | 2.4 |
| 2025-02-11 | Carmelo | control | yellow | watch | 02-11T14:00 | 582 | 18.9 | 6.81 | -8.2 | 0.09 | 1.4 |
| 2025-02-11 | Aeropuerto de Colonia | control | unknown | watch | 02-10T22:00 | 3910 | 14.0 | 6.54 | -5.6 | 0.65 | 0.0 |
| 2025-02-11 | Aeropuerto de Laguna del Sauce | control | unknown | watch | 02-11T06:00 | 463 | 17.3 | 6.56 | -8.9 | 0.05 | 2.5 |
| 2025-02-14 | Young (zona rural, Río Negro) | damaging | unknown | calm | 02-14T21:00 | 573 | 26.6 | 5.11 | -7.0 | 0.06 | 0.9 |
| 2025-02-16 | Aeropuerto de Salto | control | unknown | calm | 02-15T16:00 | 296 | 24.2 | 6.54 | -8.9 | 0.03 | 2.4 |
| 2025-02-22 | Juan Lacaze | damaging | unknown | watch | 02-22T19:00 | 2194 | 19.7 | 6.61 | -5.4 | 0.51 | 1.0 |
| 2025-03-03 | Clara | hail_unknown | unknown | watch | 03-03T18:00 | 3524 | 14.6 | 6.58 | -6.5 | 0.71 | 0.0 |
| 2025-03-28 | Piriápolis | hail_unknown | unknown | calm | 03-28T13:00 | 1266 | 20.2 | 6.97 | -13.3 | 0.72 | 3.8 |
| 2025-04-17 | Villa 25 de Agosto | damaging | orange | watch | 04-17T17:00 | 1043 | 26.9 | 6.63 | -15.6 | 0.66 | 0.0 |
| 2025-05-07 | Aeropuerto de Laguna del Sauce | control | unknown | watch | 05-07T04:00 | 371 | 20.3 | 6.53 | -12.1 | 0.04 | 2.1 |
| 2025-05-08 | Aeropuerto de Carrasco | control | unknown | protect | 05-07T18:00 | 1120 | 30.8 | 6.87 | -12.1 | 0.62 | 2.3 |
| 2025-05-17 | Paysandú | hail_unknown | unknown | watch | 05-17T17:00 | 1639 | 22.6 | 6.70 | -11.7 | 0.94 | 0.0 |
| 2025-05-26 | Aeropuerto de Rivera | control | unknown | watch | 05-26T02:00 | 251 | 29.8 | 6.59 | -12.8 | 0.03 | 2.4 |
| 2025-05-26 | Aeropuerto de Salto | control | unknown | watch | 05-26T01:00 | 687 | 21.6 | 6.61 | -12.4 | 0.17 | 3.2 |
| 2025-06-16 | Rivera | damaging | unknown | watch | 06-16T19:00 | 395 | 26.1 | 6.67 | -12.8 | 0.07 | 3.2 |
| 2025-06-18 | Aeropuerto de Salto | control | unknown | watch | 06-18T02:00 | 693 | 34.7 | 6.80 | -14.5 | 0.26 | 1.4 |
| 2025-07-16 | Aeropuerto de Carrasco | control | unknown | calm | 07-15T16:00 | 427 | 16.5 | 5.67 | -14.9 | 0.05 | 1.2 |
| 2025-07-16 | Aeropuerto de Salto | control | unknown | watch | 07-16T11:00 | 390 | 17.1 | 6.82 | -15.4 | 0.06 | 1.9 |
| 2025-07-26 | Termas del Arapey | hail_unknown | yellow | watch | 07-26T22:00 | 556 | 31.0 | 6.51 | -14.2 | 0.16 | 1.9 |
| 2025-08-01 | Colonia del Sacramento (aeropuerto) | hail_small | unknown | watch | 08-01T23:00 | 539 | 37.0 | 6.92 | -14.9 | 0.16 | 0.0 |
| 2025-08-18 | Aeropuerto de Rivera | control | unknown | calm | 08-19T02:00 | 60 | 24.1 | 5.90 | -11.0 | 0.00 | 0.5 |
| 2025-08-18 | Aeropuerto de Salto | control | unknown | calm | 08-18T16:00 | 336 | 20.5 | 6.50 | -12.1 | 0.04 | 0.3 |
| 2025-08-19 | Aeropuerto de Rivera | control | unknown | calm | 08-19T02:00 | 60 | 24.1 | 5.90 | -11.0 | 0.00 | 0.5 |
| 2025-08-31 | Salto (aeropuerto) | hail_small | unknown | watch | 08-31T14:00 | 907 | 23.5 | 6.58 | -11.2 | 0.35 | 1.4 |
| 2025-09-22 | Minas | hail_unknown | none | watch | 09-22T17:00 | 333 | 19.7 | 6.50 | -24.3 | 0.05 | 0.7 |
| 2025-10-05 | Carmelo | control | orange | protect | 10-05T14:00 | 779 | 35.7 | 7.84 | -12.1 | 0.34 | 3.6 |
| 2025-10-05 | Paysandú | control | orange | protect | 10-05T11:00 | 1506 | 28.3 | 6.54 | -8.9 | 0.77 | 1.5 |
| 2025-11-04 | Aeropuerto de Rivera | control | unknown | watch | 11-04T18:00 | 2560 | 23.2 | 6.92 | -11.7 | 1.56 | 0.0 |
| 2025-11-16 | Aeropuerto de Rivera | control | unknown | watch | 11-15T18:00 | 2925 | 12.7 | 6.54 | -8.6 | 0.67 | 2.5 |
| 2025-11-16 | Aeropuerto de Salto | control | unknown | watch | 11-16T00:00 | 1819 | 24.1 | 7.58 | -9.6 | 1.03 | 0.0 |
| 2025-11-20 | Trinidad | hail_unknown | unknown | watch | 11-20T18:00 | 524 | 28.5 | 6.73 | -12.6 | 0.13 | 0.6 |
| 2025-12-01 | Aeropuerto de Rivera | control | unknown | watch | 12-01T14:00 | 1030 | 28.6 | 6.87 | -11.4 | 0.47 | 1.4 |
| 2025-12-20 | Aeropuerto de Salto | control | unknown | calm | 12-20T10:00 | 685 | 21.2 | 6.61 | -7.7 | 0.13 | 0.0 |
| 2025-12-24 | Aeropuerto de Rivera | control | unknown | calm | 12-23T19:00 | 1161 | 17.0 | 6.54 | -7.7 | 0.29 | 2.3 |
| 2026-02-11 | Cebollatí | damaging | unknown | watch | 02-11T00:00 | 1113 | 24.6 | 7.07 | -9.1 | 0.49 | 0.4 |
| 2026-02-19 | Aeropuerto de Rivera | control | unknown | calm | 02-18T14:00 | 2190 | 20.8 | 5.49 | -6.1 | 0.47 | 1.2 |
| 2026-02-23 | San José de Mayo | control | yellow | calm | 02-23T16:00 | 1250 | 20.6 | 5.65 | -11.0 | 0.47 | 4.2 |
| 2026-02-24 | Aeropuerto de Laguna del Sauce | control | unknown | watch | 02-23T19:00 | 1280 | 15.9 | 6.59 | -11.2 | 0.48 | 4.8 |
| 2026-02-24 | Aeropuerto de Rivera | control | unknown | calm | 02-23T16:00 | 1589 | 16.8 | 5.70 | -7.9 | 0.38 | 2.1 |
| 2026-03-17 | Aeropuerto de Durazno | control | unknown | calm | 03-17T20:00 | 379 | 18.4 | 5.25 | -7.2 | 0.02 | 1.3 |
| 2026-03-29 | Aeropuerto de Laguna del Sauce | control | unknown | watch | 03-29T00:00 | 410 | 24.9 | 6.52 | -8.6 | 0.06 | 3.0 |
| 2026-04-03 | Aeropuerto de Carrasco | control | unknown | watch | 04-03T21:00 | 1557 | 26.4 | 6.61 | -10.7 | 0.94 | 0.0 |
| 2026-04-26 | Barra del Chuy | hail_unknown | none | protect | 04-26T13:00 | 1189 | 34.9 | 6.53 | -18.4 | 0.92 | 1.6 |
| 2026-05-05 | San Javier (y Tres Quintas) | hail_unknown | unknown | watch | 05-05T15:00 | 2614 | 18.2 | 7.07 | -11.7 | 1.28 | 0.0 |
| 2026-05-07 | Rivera | control | yellow | calm | 05-07T12:00 | 764 | 28.9 | 6.56 | -9.6 | 0.25 | 0.0 |
| 2026-05-07 | Tacuarembó | control | orange | watch | 05-07T11:00 | 873 | 24.1 | 6.52 | -10.0 | 0.30 | 3.9 |
| 2026-05-07 | Aeropuerto de Laguna del Sauce | control | unknown | protect | 05-06T15:00 | 2575 | 24.9 | 6.64 | -11.7 | 1.61 | 5.1 |
| 2026-05-07 | Aeropuerto de Salto | control | unknown | protect | 05-07T01:00 | 2201 | 23.0 | 6.60 | -10.0 | 1.06 | 4.2 |
| 2026-07-02 | Montevideo | hail_small | unknown | calm | 07-02T13:00 | 112 | 53.0 | 1.78 | -19.1 | 0.00 | 0.3 |
| 2026-07-27 | Tomás Gomensoro | damaging | yellow | protect | 07-27T20:00 | 2147 | 25.1 | 7.48 | -11.2 | 1.46 | 3.0 |
| 2026-07-28 | Artigas | hail_unknown | unknown | protect | 07-28T17:00 | 2623 | 24.9 | 6.73 | -12.6 | 1.79 | 7.2 |
| 2026-08-01 | Salto | control | orange | watch | 08-01T04:00 | 328 | 33.0 | 6.50 | -10.7 | 0.04 | 2.0 |
| 2026-08-06 | Mercedes | hail_unknown | unknown | watch | 08-06T09:00 | 1049 | 32.5 | 7.38 | -15.6 | 0.71 | 0.0 |
| 2026-08-16 | Nico Pérez | hail_unknown | unknown | watch | 08-16T18:00 | 844 | 27.1 | 6.50 | -11.2 | 0.31 | 2.0 |
| 2026-08-17 | Rivera (aeropuerto) | hail_unknown | orange | watch | 08-17T01:00 | 742 | 25.2 | 6.51 | -10.0 | 0.22 | 2.1 |
| 2026-08-27 | Piedras Coloradas | damaging | orange | protect | 08-27T20:00 | 1093 | 46.1 | 6.79 | -13.1 | 0.58 | 6.2 |
| 2026-08-27 | Salto | hail_unknown | orange | protect | 08-27T18:00 | 1743 | 39.0 | 6.69 | -11.0 | 0.98 | 3.0 |
| 2026-08-27 | Treinta y Tres | hail_unknown | orange | protect | 08-27T05:00 | 1184 | 37.8 | 6.97 | -13.5 | 0.73 | 3.9 |
| 2026-08-27 | Vichadero | damaging | orange | protect | 08-27T20:00 | 1303 | 39.3 | 6.88 | -11.9 | 0.84 | 3.8 |
| 2026-09-05 | Aeropuerto de Laguna del Sauce | hail_small | none | calm | 09-05T12:00 | 385 | 36.6 | — | — | — | 0.7 |
| 2026-09-06 | Aeropuerto de Melilla | hail_small | none | calm | 09-05T14:00 | 277 | 35.4 | — | — | — | 0.4 |
| 2026-09-20 | Rivera (aeropuerto) | hail_unknown | orange | protect | 09-21T02:00 | 2039 | 36.8 | 8.48 | -13.3 | 1.97 | 8.0 |
| 2026-09-27 | La Víbora (rutas 2 y 24, cerca de Fray Bentos) | damaging | orange | protect | 09-27T23:00 | 1175 | 36.0 | 6.54 | -8.4 | 0.46 | 3.4 |
| 2026-09-27 | Paysandú | hail_unknown | orange | protect | 09-27T02:00 | 1191 | 31.5 | 6.62 | -10.0 | 0.63 | 3.0 |
| 2026-09-27 | Rivera | hail_unknown | none | protect | 09-27T04:00 | 889 | 35.2 | 6.64 | -9.8 | 0.30 | 3.4 |
| 2026-09-27 | Young | hail_unknown | orange | protect | 09-27T22:00 | 918 | 34.9 | 6.58 | -8.2 | 0.28 | 3.6 |
