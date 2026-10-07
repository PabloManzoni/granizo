# Investigación: cómo mejorar el motor (rumbo a la v0.3)

Fecha: 2026-10-06 · **Solo investigación: no cambia nada del motor ni de la app.** Base: [`bitacora-motor.md`](bitacora-motor.md), [`resultados-test-v0.md`](resultados-test-v0.md), [`analisis-motor.md`](analisis-motor.md).

## Cómo se hizo

Cuatro líneas en paralelo:

1. **Literatura** sobre qué separa una tormenta con granizo de una sin granizo, con foco en Sudamérica y en el verano.
2. **Fuentes de datos:** modelos, ensambles, observación, reportes y alertas. Se probaron las APIs con consultas reales.
3. **Metodología:** cómo validar sin engañarse con 68 granizadas, cómo pasar a probabilidades y cómo verificar hacia adelante.
4. **Análisis con datos propios:**
   - 127 predictores candidatos calculados desde los perfiles ya descargados (GFS en los 140 casos; ECMWF en 93, desde 2024-06).
   - Sin llamadas de red.
   - Bootstrap por bloques de fecha.
   - Antes de analizar se verificó que el pipeline reproduce el v0.2 en los 140 casos.

   Scripts y resultados en [`scripts/research/v0.3/`](../scripts/research/v0.3/).

Los dos hallazgos que más pesan los volví a calcular por mi cuenta (la humedad en verano y la lluvia convectiva de ECMWF).

---

## Resumen

1. **Hay una mejora robusta y barata: cambiar los escalones por una puntuación continua.** √(gradiente × WMAXSHEAR), o una regresión logística con esas dos variables, sube el AUC en los años de prueba de **0,69 a 0,77–0,78**, con un intervalo de la diferencia que no cruza 0. Además elimina las granizadas perdidas "por poco": la causa principal de los fallos de "protegelo" es WMAXSHEAR entre 1.034 y 1.194, apenas debajo del umbral de 1.200.
2. **Por primera vez aparece algo que separa en verano: la humedad en niveles medios.** Los días de granizo de octubre a marzo tienen el aire entre 850 y 500 hPa **más seco** que los días de tormenta sin granizo:
   - AUC 0,21, o 0,79 leído "al revés";
   - es lo único de 127 candidatos que supera el control de azar;
   - se repite en entrenamiento, en prueba, en ECMWF y con otra ventana.

   Son solo 17 granizadas de verano: es una **hipótesis fuerte, no un hecho**.
3. **El AND entre GFS y ECMWF le cuesta detección al "día rojo".** En 10 granizadas un modelo decía "protegelo" y el otro lo bajó. Promediar los modelos rinde igual o mejor (prueba: TSS 0,37 contra 0,28) a cambio de algunas falsas alarmas más.
4. **El "disparo" (el modelo forma tormentas) no aporta para granizo,** y además encontré un error de datos: en el archivo de Open-Meteo, **ECMWF devuelve siempre 0 de lluvia convectiva** (0 de 26.934 punto-horas). Esto también afecta al estado nuevo "Tormenta".
5. **Algunos números que dimos son más optimistas de lo que parecen:**
   - El "71% de las veces que los dos modelos dijeron protegelo, granizó" es un artefacto de la muestra mitad granizo, mitad control. Con la frecuencia real de granizo en días de tormenta, sería ~5–25%.
   - Los años 2025–26 ya se miraron demasiadas veces para seguir sirviendo de prueba limpia.
6. **Lo que más falta no es un algoritmo, son datos para medir.**
   - Una API nueva de Open-Meteo (**Single Runs**) guarda corridas pasadas completas, con niveles de presión, desde abril de 2026. Por fin se puede medir el motor con pronósticos reales a 24–48 h.
   - Programar el registro diario de pronósticos es lo único que no se puede recuperar después.
7. **Techo realista:** el mejor modelo europeo (AR-CHaMo, más de 44.000 reportes) separa granizo ≥ 2 cm de tormenta sin granizo con AUC ~0,76–0,78. Nuestros 0,85–0,90 de la estación fría son seguramente optimistas.

---

## 1. Qué encontramos en nuestros datos

### Ranking de predictores (GFS, AUC con IC 90%)

Granizo = dañino + sin dato de tamaño (52); control = 72. Un AUC menor a 0,5 quiere decir que separa al revés: valores más bajos los días de granizo.

| Predictor | Todo el año | Fría (abr–sep) | Cálida (oct–mar) | Entren. / prueba |
|---|---|---|---|---|
| **√(gradiente × WMAXSHEAR)**, p90 de la zona y la ventana | 0,77 [0,67–0,86] | **0,91** [0,83–0,98] | 0,49 | **0,76 / 0,77** |
| WMAXSHEAR, p90 | 0,76 | 0,87 | 0,57 | 0,75 / 0,76 |
| WMAXSHEAR, máximo (lo que usa v0.2) | 0,73 | 0,86 | 0,55 | 0,71 / 0,73 |
| Gradiente 700–500, p90 | 0,72 | 0,89 | 0,44 | 0,73 / 0,72 |
| Gradiente 3–6 km | 0,73 | 0,86 | 0,49 | 0,71 / 0,74 |
| Cizalladura efectiva de la parcela MU | 0,72 | 0,85 | 0,53 | 0,69 / 0,73 |
| SHIP | 0,68 | 0,79 | 0,55 | 0,70 / 0,65 |
| MUCAPE sobre −10 °C (recomendada en la literatura) | 0,63 | 0,73 | 0,57 | 0,71 / **0,54** |
| MUCAPE / MLCAPE / CAPE de superficie | 0,59 / 0,55 / 0,50 | 0,72 / 0,66 / 0,60 | ~0,57 | — |
| **HR media 850–500 hPa, p90** | 0,29 | 0,27 | **0,21** [0,12–0,32] | 0,18 / 0,40 |
| Altura del cero de bulbo húmedo | 0,41 | 0,54 | 0,40 | — |
| Lluvia convectiva del modelo, p90 | 0,57 | 0,75 | **0,29** (al revés) | — |

ECMWF repite el ranking: √(gradiente × WMAXSHEAR) da 0,80 y su cizalladura efectiva, 0,82.

**Cómo agregar la zona y la ventana:** casi no importa. Percentil 90, máximo, punto central o mediana entre puntos difieren ≤ 0,02; solo la mediana de punto-horas pierde. Calcular en el punto-hora donde el modelo forma convección tampoco mejora.

### La estación cálida

Probé 127 predictores en 17 granizadas contra 46 controles. Para no confundir azar con señal hice un control por permutación: por puro azar, el mejor de 127 podría llegar a |AUC − 0,5| = 0,27. **Solo la HR 850–500 queda afuera de esa banda.** Por qué parece real:

- **Estable:** 0,17 en entrenamiento y 0,25 en prueba.
- **Se repite en ECMWF:** 0,16. Los dos modelos correlacionan 0,81 en esta variable.
- **No depende del tipo de control:** 0,22 contra METAR y 0,20 contra prensa.
- **No es un efecto de la ventana:** con ventanas iguales para todos los casos, 0,18.
- **Es casi independiente** del gradiente (−0,11) y de WMAXSHEAR (−0,22).
- **Tiene sentido físico:** los controles de verano parecen sistemas húmedos (complejos convectivos o frentes) con más lluvia del modelo, más viento en 850 hPa y nubes más bajas. Las granizadas ocurren con niveles medios más secos y bases más altas. La literatura apunta en el mismo sentido: la sequedad en niveles medios entra en los modelos de ESSL y en los cambios de granizo en Sudamérica.

**Cuidado:** puede reflejar en parte cómo se eligieron los controles, que son tormentas notables y lluviosas.

**Uso posible:** hacer más selectivo el "atento" de verano. Con HR < 0,85 (umbral elegido en entrenamiento), en la prueba las falsas alarmas bajan de 61% a 33% y la detección baja de 71% a 57%. No alcanza para un "protegelo" de verano.

### Modelos simples contra v0.2 (prueba 2025–26, umbral elegido en entrenamiento)

| Modelo | AUC | Brier | Detección / falsas alarmas | TSS | AUC cálida / fría |
|---|---|---|---|---|---|
| v0.2 GFS ("protegelo") | 0,69 | 0,246 | 50% / 21% | 0,29 | 0,56 / 0,71 |
| v0.2 combinado (AND, "protegelo") | 0,71 | — | 43% / 15% | 0,28 | 0,51 / 0,76 |
| Logística: √(gradiente × WMAXSHEAR) | 0,77 | 0,194 | 61% / 26% | 0,34 | 0,56 / 0,84 |
| Logística: gradiente + WMAXSHEAR | 0,78 | 0,191 | 82% / 29% | 0,53 | 0,52 / 0,85 |
| Un modelo por estación (fría: √(g×W); cálida: HR) | — | 0,189 | 93% / 56% | 0,37 | **0,75 / 0,84** |
| Árbol de decisión (2 niveles) | 0,64 | 0,281 | 54% / 24% | 0,30 | — |

**Validación cruzada agrupada por fecha** (5 pliegues × 40 repeticiones): v0.2 da AUC 0,69 y 0,49 en verano; la puntuación continua más HR, 0,79 y 0,64; el modelo por estación, 0,84 y 0,66.

Lectura:
- La puntuación continua mejora de forma consistente.
- La HR solo sirve en verano. En invierno agrega ruido (0,85 → 0,79), así que va **en un modelo por estación**, no sumada a todo.
- El árbol sobreajusta.
- Los AUC "de todo el año" de los modelos con estación están inflados por el diseño: la estación sola ya da 0,66, porque la proporción de granizo en la muestra es 57% en invierno y 27% en verano. **Hay que compararlos dentro de cada estación.**

### Errores de "protegelo" (v0.2 combinado)

- **Granizadas perdidas (25 de 52):**
  - La causa dominante es WMAXSHEAR apenas debajo de 1.200: 23 veces, sumando los dos modelos.
  - En 10, el AND con el otro modelo bajó un "protegelo".
  - En 7, gradiente y WMAXSHEAR se cumplían, pero no en el mismo punto-hora.
  - En 5, el gradiente no llegaba.
  - **El disparo nunca fue la causa.**
- **Falsas alarmas (7 de 72):** todas las que tienen hora son **nocturnas** (00–07 h): 6 de 28 controles nocturnos contra 0 de 35 diurnos. Puede ser tormenta elevada sin granizo, o granizo nocturno que nadie reportó.
- **Umbral de 1.200:** fue el mejor en entrenamiento. En la prueba, 900–1.100 rinden igual o mejor (TSS 0,40–0,49 contra 0,29). Es el típico sobreajuste de un escalón.
- **Radio:** usar solo el punto central hunde la detección (52% → 25%). **Los 9 puntos se quedan.**
- **Ventana:** la actual es la mejor de las probadas, aunque con solo 13 granizadas con hora es orientativo.

### Combinar modelos (prueba, "protegelo")

| | TSS | Falsas alarmas |
|---|---|---|
| GFS | 0,29 | 21% |
| ECMWF | 0,37 | 24% |
| **AND (actual)** | 0,28 | 15% |
| Promedio de los dos | 0,37 | 21% |
| OR | 0,38 | 29% |

Las diferencias están dentro del ruido (IC del TSS ±0,2). El AND fue una decisión de producto ("día rojo" estricto). La alternativa con mejor base es **promediar y pedir un corte alto**.

### Un error de datos: ECMWF no trae lluvia convectiva

En los 26.934 punto-horas de ECMWF, `showers` vale siempre 0, aunque `precipitation` tenga valores. Por eso, para ECMWF:
- el "disparo" depende solo de lluvia total ≥ 2 mm/h, que se cumple en 79 de 93 casos;
- el estado **"Tormenta"** también se apoya solo en la lluvia total, que puede ser lluvia de frente sin tormenta.

Falta verificar si la API de pronóstico vigente hace lo mismo.

---

## 2. Qué dice la literatura

- **El modelo de referencia es AR-CHaMo (ESSL):** P(granizo) = P(tormenta) × P(granizo | tormenta). La tormenta se aprende con **rayos** como etiqueta, que no dependen de que haya gente para reportar. El término de granizo se aprende con reportes en zonas bien cubiertas.
  - Condicional para ≥ 2 cm: AUC 0,78 en Europa y 0,76 en EE.UU. (Battaglioli et al. 2023, JAMC).
  - Sobre los repronósticos de ECMWF, el modelo completo da AUC > 0,95 hasta 60 h (Battaglioli et al. 2023, NHESS).
  - Es exactamente nuestra arquitectura ("si se forman tormentas, ¿tienen condiciones de granizo?"), pero con probabilidades y con los rayos como verdad de "hubo tormenta".
- **Predictores recomendados:**
  - MUCAPE contada solo por encima de −10 °C;
  - cizalladura efectiva;
  - cero de bulbo húmedo como freno (derretimiento);
  - HR 850–500;
  - gradiente 3–6 km.

  **En nuestros datos:**
  - la cizalladura efectiva y el gradiente 3–6 km **igualan** a lo actual, pero no lo superan;
  - la MUCAPE sobre −10 °C **no se sostuvo** en la prueba (0,54);
  - el cero de bulbo húmedo **no separa**;
  - la HR **sí**, y es lo más nuevo.
- **Por qué cuesta el verano en ambientes cálidos y húmedos:** la CAPE alta abunda, pero viene con gradientes modestos y corrientes ascendentes cargadas de agua. En el sudeste de EE.UU., un ambiente parecido, la CAPE es "particularmente mal predictor" y el gradiente 3–6 km la supera.
- **Lo regional:**
  - En el este argentino el granizo es sobre todo de primavera (Mezher et al. 2012).
  - Los granizos subtropicales se extienden de 20 a 06 UTC, ligados al jet de capas bajas y a sistemas nocturnos (Bruick et al. 2019; Salio et al. 2007).
  - La cuenca del Plata es uno de los focos mundiales de granizo grande.
  - **No encontramos ninguna climatología publicada de ambientes de granizo para Uruguay.** Este trabajo sería la primera.
- **Machine learning:** solo con miles de casos. Con 70 el sobreajuste está asegurado; el árbol de decisión lo confirmó.

---

## 3. Metodología: cuidar lo que creemos saber

- **Qué se puede afirmar con el diseño caso-control:**
  - **Sirven:** detección, falsas alarmas sobre días de tormenta, TSS y AUC.
  - **No sirven:** "cuando avisó, granizó X%", el Brier y las probabilidades. Dependen de la frecuencia real del granizo, y en la muestra es ~50%.
  - Con detección 43% y falsas alarmas 15%:
    - tasa base 2% de los días de tormenta → acierto real ~5%;
    - tasa base 5% → ~13%;
    - tasa base 10% → ~24%.

  **La frase del 71% de la bitácora no debería usarse fuera de contexto.**
- **Las falsas alarmas dependen de qué controles se elijan:** 13% contra METAR (tormentas comunes) y 25% contra prensa (tormentas notables). La cifra "real" sobre un día de tormenta típico no la sabemos todavía.
- **Los años de prueba ya están gastados.** 2025–26 se miró para v0, v0.2, ECMWF y AND/OR. La prueba limpia de una v0.3 es **hacia adelante**: temporada 2026–27, o corridas guardadas desde abril de 2026. Por dentro conviene validación dejando un año afuera, con todo el ajuste repetido en cada pliegue y agrupando por fecha (68 granizadas en 57 fechas).
- **Tamaño de muestra:** con ~50 eventos, como mucho **2 predictores continuos más la estación**, fijados de antemano por razones físicas.
- **Modelo:** logística con corrección de Firth, o bayesiana con priors suaves y la estación con *partial pooling*. Recalibrar con intercepto y pendiente (Platt), no isotónica. El intercepto se corrige con la tasa base real (King & Zeng 2001), que hay que estimar.
- **Umbrales por costo/pérdida, no por TSS máximo:**
  - Cubrir el auto cuesta poco (USD 5–20 y la molestia) y reparar granizo cuesta mucho (USD 1.000–3.000), así que protegerse conviene ya con probabilidades de 1–5%.
  - Propuesta: "atento" a ~2–5% y "protegelo" a ~10–15%.
  - Agregar un **presupuesto de alarmas**: como mucho N "protegelo" por temporada y ciudad (por ejemplo 6–10), para que no pase lo del lobo.
- **Potencia:** demostrar una mejora de 0,1 de TSS necesita ~100–400 granizadas verificadas, o sea años. Conviene comparar los motores **pareados**, en los mismos días y con puntajes continuos (log score o Brier). La regla de adopción realista es "no peor, mejor calibrado y más simple".
- **Comunicación:**
  - Decir a qué se refiere la probabilidad: "a menos de 40 km de Casa, esta noche".
  - La gente decide mejor con números que sin ellos.
  - En verano, mejor que "confianza baja": "en esta época el pronóstico casi no distingue; la chance es la de cualquier día de tormenta".

---

## 4. Fuentes de datos

| Fuente | Qué aporta | Acceso | Esfuerzo |
|---|---|---|---|
| **Open-Meteo Single Runs API** | Corridas pasadas completas, con niveles de presión: medir el motor real a 24–72 h. GFS, ECMWF 0,25° e ICON desde 2026-04 | Gratis, CORS abierto | **Bajo** |
| Open-Meteo Previous Runs | CAPE y LI de GFS con 1–7 días de anticipación, desde 2024 (sin niveles de presión) | Ídem | Bajo |
| Más modelos en Open-Meteo | ICON 11 km y UKMO 10 km con niveles y CAPE; LI y CIN de GFS/CMA; CAPE/CIN de ECMWF 9 km | Ídem, más llamadas | Bajo |
| Ensambles en Open-Meteo | ECMWF ENS 0,25° (51 miembros) con niveles y CAPE: probabilidad real | Ídem, caro en cupo | Medio |
| Alertas CAP de INUMET y SMN | Alertas oficiales con polígonos (RSS + XML) | Gratis, sin CORS: necesita un cron (GitHub Actions) que las deje como JSON | Bajo |
| GOES-19 (ABI + GLM) | Topes fríos, enfriamiento rápido de la nube y rayos: nowcasting de 0–2 h | Gratis (AWS, CORS) | Medio (preprocesar) |
| WRF del SMN Argentina, 4 km | Único modelo abierto con convección explícita sobre Uruguay; lluvia cada 10 min; desde 2022 | Gratis (AWS, CORS), archivos de 11–36 MB | Medio |
| Climatología de granizo por microondas (GPM) | Probabilidad de base por zona y estación, 1998–2026 | Gratis (NASA) | Bajo, una vez |

**No sirven por ahora:**
- **Radares de INUMET:** sin datos públicos; no está claro si ya operan.
- **Radares del SMN:** sin datos abiertos.
- **ProbSevere y LightningCast:** no cubren Sudamérica.
- **Blitzortung:** su licencia lo prohíbe.
- **APIs comerciales de granizo:** ninguna cubre Uruguay.
- **ESWD:** es solo Europa.

**Reportes para verificar:** no hay una base abierta lista. Hay que seguir armando la propia: prensa, informes de INUMET, METAR, alertas CAP y rayos como filtro de "hubo tormenta". Existe una base de reportes de alto impacto de Sudamérica (BAMS 2024) que vale la pena pedir.

**Costo si el producto crece:** el plan gratis es solo para uso no comercial. El plan pago más barato excluye las APIs históricas, de corridas y de ensambles, así que haría falta el Professional: el último precio publicado era ~USD 99/mes, en 2023.

---

## 5. Propuesta para la v0.3

Por orden; cada paso es independiente y se puede frenar en cualquiera.

**Paso 0. Empezar a medir (no se puede recuperar después).**
- Programar `npm run log-forecast` todos los días. Que guarde la salida por modelo, la hora de corrida, la puntuación continua y el commit del motor, además del nivel.
- Usar la **Single Runs API** para reconstruir los pronósticos reales desde abril de 2026 y medir v0.2 a 24–48 h por primera vez.
- Definir un protocolo ciego de verdad de terreno para cada ventana (METAR, boletín de INUMET, prensa): sí / no / sin cobertura.

**Paso 1. Frecuencia real.** Correr v0.2 sobre **todos los días** 2021–2026 en las 16 ciudades. Da:
- cuántos "protegelo" por temporada siente un usuario;
- una cota inferior de la tasa base;
- el porcentaje real de aciertos cuando avisa.

Con eso se corrige el "71%".

**Paso 2. Puntuación continua** en lugar de escalones:
- logística con gradiente 700–500 y log(WMAXSHEAR), una por modelo;
- **promedio de GFS y ECMWF** en lugar del AND;
- intercepto corregido por la tasa base del paso 1;
- niveles como cortes de probabilidad (costo/pérdida más presupuesto de alarmas), fijados antes de mirar datos nuevos.

Es la mejora con más evidencia.

**Paso 3. Verano: HR 850–500 como modelo propio de la estación cálida,** para hacer "atento" más selectivo. Se valida solo hacia adelante, en esta temporada, antes de mostrarlo en la app.

**Paso 4. Arreglos chicos:**
- Resolver la lluvia convectiva de ECMWF: verificar en el pronóstico vigente y, si sigue en 0, usar solo GFS para el disparo o usar CAPE/LI.
- Revisar el estado "Tormenta" con ese dato.
- Evaluar sacar el disparo del cálculo de granizo, porque no aporta.

**Paso 5. Más adelante:**
- Alertas CAP de INUMET en la app.
- Nowcasting con GOES-19 + GLM ("tormenta fuerte a X km, ahora").
- ICON/UKMO como tercer y cuarto modelo.
- Ensamble de ECMWF para probabilidad.
- Arquitectura de dos etapas tipo AR-CHaMo, con rayos como etiqueta de "hubo tormenta".

**Lo que no conviene:**
- CAPE en cualquier versión como regla.
- Cizalladura sola.
- Cero de bulbo húmedo.
- SHIP como regla.
- Árboles y machine learning.
- Achicar la zona a un punto.
- Elegir umbrales maximizando TSS con los mismos datos.

---

## 6. Advertencias

- **Muestras chicas:**
  - prueba: 28 granizadas y 34 controles;
  - verano: 17 granizadas (7 en prueba);
  - invierno de entrenamiento: 14 contra 10, que por eso da AUC ≈ 1.
- **Los datos históricos son casi análisis:** el pronóstico real va a rendir menos.
- **Muchos candidatos:** se probaron 127 predictores, y cualquier AUC ~0,7 en verano puede ser azar, salvo la HR.
- **Sesgo de reporte creciente desde 2024:** cambia la mezcla de casos entre entrenamiento y prueba.
- **Referencias:** algunos DOI y números de página se citaron de memoria y conviene revisarlos antes de citarlos en público.

## 7. Decisiones para vos

1. ¿Programamos el registro diario de pronósticos? Es lo más urgente.
2. ¿El "día rojo" sigue siendo "los dos modelos de acuerdo", o pasamos a "probabilidad promediada alta"? Es una decisión de producto, y los datos no la deciden.
3. ¿Cuántos "protegelo" por temporada te parece tolerable para un usuario? Fija el corte.
4. ¿Mostramos probabilidad en números en la app, o seguimos solo con niveles?

## Referencias principales

- Battaglioli, F., et al. (2023). Modeled multidecadal trends of lightning and (very) large hail in Europe and North America (1950–2021). *JAMC* 62, 1627–1653. doi:10.1175/JAMC-D-22-0195.1
- Battaglioli, F., Groenemeijer, P., Tsonevsky, I., Púčik, T. (2023). Forecasting large hail and lightning using additive logistic regression models and the ECMWF reforecasts. *NHESS* 23, 3651–3669. doi:10.5194/nhess-23-3651-2023
- Battaglioli, F., et al. (2026). Contrasting trends in very large hail events and related economic losses across the globe. *Nature Geoscience* 19, 52–58. doi:10.1038/s41561-025-01868-0
- Bruick, Z. S., Rasmussen, K. L., Cecil, D. J. (2019). Subtropical South American hailstorm characteristics and environments. *MWR* 147. doi:10.1175/MWR-D-19-0011.1
- Dos Santos, L. O., Nascimento, E. L., Allen, J. T. (2023). Discriminant analysis for severe storm environments in south-central Brazil. *MWR* 151, 2659–2681. doi:10.1175/MWR-D-22-0347.1
- Hitchens, N. M., Brooks, H. E., Kay, M. P. (2013). Objective limits on forecasting skill of rare events. *Wea. Forecasting* 28, 525–534. doi:10.1175/WAF-D-12-00113.1
- King, G., Zeng, L. (2001). Logistic regression in rare events data. *Political Analysis* 9, 137–163.
- Mezher, R. N., Doyle, M., Barros, V. (2012). Climatology of hail in Argentina. *Atmos. Res.* 114–115, 70–82.
- Nixon, C. J., Allen, J. T., Taszarek, M. (2023). Hodographs and skew-Ts of hail-producing storms. *Wea. Forecasting* 38, 2217–2236. doi:10.1175/WAF-D-23-0031.1
- Peters, J. M., et al. (2023). An analytic formula for entraining CAPE in midlatitude storm environments. *JAS* 80(9).
- Rädler, A. T., et al. (2018). Detecting severe weather trends using an additive regressive convective hazard model (AR-CHaMo). *JAMC* 57, 569–587. doi:10.1175/JAMC-D-17-0132.1
- Richardson, D. S. (2000). Skill and relative economic value of the ECMWF ensemble prediction system. *QJRMS* 126, 649–667.
- Riley, R. D., et al. (2020). Calculating the sample size required for developing a clinical prediction model. *BMJ* 368, m441.
- Salio, P., Nicolini, M., Zipser, E. J. (2007). Mesoscale convective systems over southeastern South America and their relationship with the South American low-level jet. *MWR* 135, 1290–1309.
- Toward a South American High-Impact Weather Reports Database (2024). *BAMS* 105(7). doi:10.1175/BAMS-D-23-0063.1
- Open-Meteo Single Runs API: https://open-meteo.com/en/docs/single-runs-api
