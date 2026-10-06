# Cómo funciona Cubierto y cómo lo probamos

Cubierto responde una pregunta concreta: **¿conviene proteger el auto del granizo esta noche, hoy o mañana?** Este documento explica qué mira el motor, cómo se decidieron sus reglas, qué tan bien funcionan y dónde fallan. Describe la versión 0.2 del motor.

## En pocas palabras

- El motor es un **conjunto de reglas meteorológicas legibles**, no un modelo de inteligencia artificial. Dos reglas y un umbral por nivel; cualquiera puede revisarlas en `src/engine/config.ts`.
- Mira el pronóstico de **dos modelos globales** (GFS y ECMWF) sobre una zona de unos 40 km alrededor del lugar elegido.
- Distingue tres niveles: **Tranquilo**, **Atento** y **Protegelo**. Un cuarto estado, **Tormenta**, avisa de lluvia fuerte sin ambiente de granizo.
- Fue probado contra **140 casos históricos** de Uruguay (2021–2026). El nivel "Protegelo" avisó en alrededor de **4 de cada 10 granizadas** y se equivocó en alrededor de **15 de cada 100 días de tormenta sin granizo**.
- Es una herramienta de **decisión orientativa**. No reemplaza los avisos oficiales de INUMET.

## Qué datos usa

El pronóstico se descarga desde [Open-Meteo](https://open-meteo.com/), que publica los resultados de los modelos GFS (NOAA) y ECMWF IFS. Para cada hora de la ventana consultada, y para 9 puntos distribuidos en un radio de unos 40 km, el motor toma el perfil vertical de la atmósfera: temperatura, humedad y viento a distintas alturas.

Todo el cálculo ocurre en el teléfono. Las coordenadas se redondean a unos 1 km y los lugares guardados no salen del dispositivo.

La app solo funciona dentro de Uruguay y su entorno inmediato, porque es la región donde se calibró.

## Qué calcula

A partir del perfil vertical, el motor obtiene los ingredientes que la meteorología asocia con el granizo grande:

| Ingrediente | Qué expresa |
|---|---|
| **MUCAPE** | La energía disponible para que el aire suba, calculada con la parcela de aire más inestable de los primeros 300 hPa sobre el suelo (unos 3 km). Detecta también las tormentas nocturnas que se alimentan desde la altura. |
| **Cizalladura 0–6 km** | Cuánto cambia el viento entre el suelo y 6 km de altura. Una cizalladura fuerte organiza las tormentas y las hace durar. |
| **Gradiente 700–500 hPa** | Cuán rápido se enfría el aire entre unos 3 y 5,5 km. Un enfriamiento rápido favorece que las piedras crezcan. |
| **WMAXSHEAR** | √(2·MUCAPE) × cizalladura. Combina energía y viento en un solo número. |
| **Nivel de 0 °C** | Altura a la que se congela el agua. Si está muy alto, el granizo chico se derrite antes de llegar al suelo. |
| **SHIP** | Índice de granizo significativo de uso internacional. Se muestra como información, pero no decide el nivel. |

## Cómo decide

Las reglas se aplican a cada punto y a cada hora; el resultado de la ventana es el del momento más favorable.

| Nivel | Condición en un modelo |
|---|---|
| **Protegelo** | Gradiente ≥ 6,5 °C/km **y** WMAXSHEAR ≥ 1200 m²/s², y además el modelo forma tormentas en la zona. |
| **Atento** | Gradiente ≥ 6,5 °C/km y WMAXSHEAR ≥ 400 m²/s² (o ambiente fuerte, pero sin tormentas en el modelo). |
| **Tranquilo** | Todo lo demás. |

Los números de la tabla salen de la calibración, no de la bibliografía de otras regiones. En Uruguay la CAPE sola y la cizalladura sola separaron poco las tormentas con granizo de las comunes: la cizalladura es alta casi siempre, y el umbral usual de 20 m/s no discrimina. Lo que sí separó fue el gradiente 700–500 hPa y la combinación de energía con viento.

### Dos modelos

Cada modelo se evalúa por separado y después se combinan:

- **Protegelo** solo si **los dos** dicen Protegelo.
- **Atento** si alguno dice Protegelo, o si los dos dicen al menos Atento.
- **Tranquilo** en el resto de los casos.

Los modelos difieren bastante entre sí caso a caso (la correlación del gradiente entre ambos es de 0,58 y la de WMAXSHEAR, de 0,81). Pedir que coincidan baja las falsas alarmas. Si ECMWF no responde, el motor sigue con GFS solo y lo indica.

### Estado "Tormenta"

Cuando el ambiente no es de granizo pero el modelo pronostica lluvia convectiva (≥ 0,5 mm/h) o precipitación total (≥ 2 mm/h) en la zona, la app muestra **Tormenta**: lluvia fuerte, rayos o viento, sin señales de piedra.

### Confianza

La confianza nunca llega a "alta", porque la prueba histórica no lo justifica.

- **Octubre a marzo:** siempre baja.
- **Abril a septiembre:** media si los dos modelos coinciden; baja si no.
- **Con un solo modelo:** baja.

## Cómo se probó

### Los datos

- **68 granizadas** ocurridas entre 2021 y 2026, todas con fuente verificable. 16 fueron dañinas, 16 de piedra chica o graupel y 36 no informan el tamaño.
- **72 controles**: días de tormenta **sin** granizo. 20 vienen de la prensa (tormentas notables con alerta de INUMET) y 52 se emparejaron por época del año con tormentas observadas en aeropuertos.
- Para cada caso se reconstruyó la atmósfera con el archivo histórico de Open-Meteo, que se parece mucho a un análisis meteorológico.

La pregunta de la prueba no fue "¿hay tormenta?", sino **si el motor distingue una tormenta con piedra de una tormenta con agua**, y si lo hace mejor que "había alerta de INUMET". La alerta no sirve para eso: estaba vigente prácticamente en todos los casos, con y sin granizo.

### El método

1. **Calibración (2021–2024).** Se probaron varias familias de reglas y se eligieron las de mejor puntaje (TSS, que combina detección y falsas alarmas).
2. **Validación (2025–2026).** Con los umbrales congelados, se evaluó el motor sobre casos que no participaron de la calibración.
3. **Comparación de a pares.** Para no confundir invierno con granizo, cada granizada se comparó con tormentas de la misma época.

### Resultados fuera de muestra (2025–2026, días de tormenta)

| Nivel | Detección de granizadas | Falsas alarmas |
|---|---|---|
| **Protegelo** (GFS + ECMWF) | **43%** | **15%** |
| Protegelo, abril–septiembre | 57% | 19% |
| Protegelo, octubre–marzo | 0% (de 7 casos) | 11% |
| Atento o más | 93% | 65% |

- **Detección** es el porcentaje de granizadas que el nivel avisó. **Falsas alarmas** es el porcentaje de tormentas sin granizo en las que el nivel se activó igual.
- **Protegelo** es el nivel útil para decidir. Cuando GFS dice Protegelo y ECMWF coincide, hubo granizo en el 71% de los casos; cuando no coincide, en el 50%.
- **Atento** casi no se pierde granizadas, pero se activa en la mayoría de los días de tormenta. Funciona como un "tené pensado dónde guardarlo", no como un discriminador.
- El puntaje TSS de Protegelo fue de 0,28 en la validación, contra 0,58 en la calibración. La caída a la mitad es esperable con una muestra de unos 25 casos por grupo, y es la razón por la que los umbrales se consideran provisorios.

### Qué aporta frente a una alerta oficial

En días de tormenta de abril a septiembre, el motor puede indicar "hoy no es de piedra" en unos 4 de cada 5 días sin granizo y avisar en más de la mitad de los días con granizo. Una alerta general de tormenta, en cambio, no separa unos de otros. De octubre a marzo no aporta información adicional.

## Limitaciones conocidas

- **Verano sin habilidad.** De octubre a marzo, el ambiente que ven los modelos globales es casi idéntico en tormentas con y sin granizo. Por eso la confianza es siempre baja en esos meses y la app lo advierte. Para esa época habría que sumar observaciones en tiempo real (rayos, radar, satélite).
- **Muestra chica.** Hay 17 granizadas en la estación cálida y unos 25 casos por grupo en la validación. Los intervalos de confianza son amplios: el TSS de Protegelo en la validación tiene un intervalo del 90% de 0,10 a 0,48. Las diferencias entre combinaciones de modelos están dentro del ruido; elegir "los dos modelos" fue una decisión de producto (que el nivel máximo alarme poco), no un ganador estadístico.
- **Datos casi de análisis.** La prueba usó el archivo histórico de los modelos, que es mejor que cualquier pronóstico real. Se espera que el desempeño con un pronóstico emitido el día anterior sea algo menor. Una medición indirecta indica que el ambiente termodinámico pronosticado un día antes se mantiene muy parecido al real (correlación de 0,91 en CAPE de superficie), mientras que el disparo de la lluvia convectiva se degrada más (0,65). A dos días de anticipación se pierde bastante.
- **Resolución espacial.** El motor habla de una zona de unos 40 km, no de una calle. El granizo puede caer en una franja de pocos kilómetros: "Tranquilo" no significa imposible y "Protegelo" no garantiza que caiga sobre el auto.
- **Sesgo de reporte.** Se informa más granizo donde hay más gente, y más desde 2024. Los controles de aeropuerto son tormentas más débiles que los de prensa, lo que puede hacer parecer mejor el desempeño.
- **Solo Uruguay.** Los umbrales no deben extrapolarse a otras regiones: los valores habituales en otros países no separan bien en el Río de la Plata.
- **Depende de un servicio externo.** Open-Meteo tiene un cupo gratuito por hora y por día. Si se agota, la app lo informa y no puede mostrar un veredicto hasta que se renueve.

## Rayos: evaluado, no incluido

Se evaluó el uso de las descargas eléctricas del satélite GOES (instrumento GLM, con menos de 30 segundos de latencia) como señal adicional, sobre 75 casos con hora conocida. Un aumento brusco de rayos apareció en 10 de 12 granizadas, pero también en 16 de 63 controles, y entre las tormentas eléctricamente fuertes se dio casi igual con y sin granizo (10 de 10 contra 16 de 18). La señal indica que **hay una tormenta fuerte cerca**, no que haya granizo.

Por eso los rayos no entran en el veredicto. Podrían servir más adelante como aviso de tormenta inminente a una a dos horas, especialmente en verano, cuando el pronóstico distingue menos.

## Cómo seguir mejorando

- Medir el desempeño con pronósticos reales a 12–36 horas, guardando cada día la salida del motor y cruzándola con las granizadas de la temporada.
- Reunir más casos de verano con hora conocida.
- Sumar observaciones en tiempo real para la estación cálida.

## Reproducibilidad

Todo el código, los datos de la prueba y los reportes están en este repositorio:

- `src/engine/` — reglas y umbrales del motor
- `data/events.json` — granizadas y controles usados en la prueba
- `reports/backtest.md` y `reports/calibration.md` — resultados completos
- `npm run backtest` y `npm run calibrate` — repiten la evaluación

Para el detalle cronológico de cómo se llegó a estos números, ver [`bitacora-motor.md`](bitacora-motor.md).
