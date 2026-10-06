# Eventos de granizo y días de control (Uruguay, jul-2021 a set-2026)

Archivo de datos: [`events.json`](events.json). Compilado el 2026-10-02 para el test histórico del motor de riesgo (ver `docs/analisis-motor.md`).

## Resumen

| Tipo | Cantidad | Rango de fechas |
|---|---|---|
| Granizo (`hail`) | 68 | 2021-07-28 a 2026-09-27 |
| … de ellos dañino (`damaging: true`) | 16 | 2022-07-10 a 2026-09-27 |
| … no dañino (`false`) | 16 | sobre todo granizo pequeño o graupel en METAR |
| … sin dato (`null`) | 36 | se sabe que granizó, pero no hay tamaño ni daño |
| Control (`control`) | 20 (14 fechas distintas) | 2022-01-17 a 2026-08-01 |

Granizo por año: 2021: 4 · 2022: 4 · 2023: 7 · 2024: 20 · 2025: 13 · 2026: 20.
Controles por año: 2022: 2 · 2023: 6 · 2024: 5 · 2025: 3 · 2026: 4.

## Método

Cada entrada tiene al menos una fuente que abrí y que dice la fecha y el lugar. La mayoría tiene entre 2 y 6 fuentes.

1. **METAR (Iowa Environmental Mesonet, red `UY__ASOS`).** Bajé el archivo completo de SUMU, SUAA, SULS, SUCA, SUDU, SUSO, SURV, SUPU (solo desde 2025-04), SUMO (solo desde 2025-09) y SUAG (casi vacío). SUME y SUTB no tienen datos en el período. Busqué los códigos `GR`/`GS`, actuales y recientes (`REGR`/`REGS`). Hubo 20 combinaciones estación-día con granizo, en 18 días distintos, y todas entraron. Cuando coinciden con un evento de prensa en la misma zona, se fusionaron en esa entrada. En `evidence` va la línea METAR cruda, y la fuente es la URL de IEM restringida a ese día.
2. **Prensa uruguaya.** Bajé y filtré cerca de 1.550 notas de Montevideo Portal (etiquetas Granizo, Tormentas, Temporal, Inumet, Lluvias, Mal tiempo, Alerta, Sinae). Sumé notas de Subrayado, El Observador, La Mañana y Prensa Mercosur. Separé las menciones de granizo **observado** del texto estándar de las alertas ("ocasional caída de granizo").
3. **INUMET.**
   - Los boletines climáticos y pluviométricos mensuales (83 PDF, ago-2021 a ago-2026) tienen una sección "Granizo" con los días con reportes, y desde 2024 también las localidades. Los usé para confirmar fechas, sumar eventos con fecha y lugar, y descartar días de control.
   - Los informes post-evento de abr-2022, nov-2022, mar-2024, may-2024, dic-2024 y oct-2025.
   - El histórico oficial de advertencias, un JSON embebido en `inumet.gub.uy/tiempo/historico-alertas-meteorologicas`, con la hora y el fenómeno de cada emisión.
   - Los PDF de cada advertencia, con color y localidades. En inumet.gub.uy solo siguen en línea los de ago-set 2026. Para fechas anteriores usé copias de web.archive.org cuando existían.
4. **Sinae** (informes de situación en gub.uy), como complemento.
5. **Coordenadas.** Son el centroide de la localidad según OpenStreetMap/Nominatim, redondeado a 2 decimales. Para los aeropuertos uso las coordenadas de la estación en IEM.

### Convenciones de campos

- `date`: la fecha local de Uruguay (UTC-3). Los METAR se convirtieron a hora local. Para eventos nocturnos, ver las advertencias.
- `localTime`: solo cuando la fuente da una hora (METAR, "13:45 hs", "antes de las 17"). Si la hora es aproximada, se aclara en `evidence`.
- `hailSizeCm`: solo cuando la fuente da un número en cm. Las comparaciones ("huevo", "manzana", "pelota de ping pong") quedan en `null` y se describen en `evidence`.
- `damaging`: es `true` si hay daño explícito atribuido al granizo o un tamaño ≥ 2 cm. Es `false` si la fuente dice granizo pequeño o graupel (o `GS` en METAR) y no hay daño. Es `null` si no se sabe.
- `damage`: solo daño atribuible al granizo. Si la fuente mezcla viento y granizo sin separarlos (por ejemplo, Salto 2023-11-08), queda en `null`.
- `inumetAlert.status`: el color más alto de advertencia **por tormentas** que, según pude verificar, cubría **esa localidad** ese día.
  - Si es `unknown`, hubo advertencias en el país pero no pude verificar que cubrieran la localidad.
  - Si es `none`, el histórico no muestra advertencias por tormenta ese día, o solo las hubo por viento, o la localidad no figuraba en la lista (se aclara en `evidence`).
  - `mentionsHail` es `true` solo si leí el texto de esa advertencia (todas las que leí mencionan granizo).
- `confidence`:
  - `high`: fuente clara con fecha y lugar, y en general más de una fuente.
  - `medium`: fuente única y escueta (boletín de INUMET sin detalle), fecha nocturna ambigua, ubicación aproximada o control con impactos modestos.

### Criterio de los días de control

Para que un día cuente como control tienen que cumplirse cuatro condiciones:

1. Había una advertencia de INUMET por tormentas que, según pude verificar, cubría la localidad.
2. La prensa cubrió el temporal en esa localidad: lluvia intensa, viento, inundación, cortes de luz o voladuras.
3. No hay granizo observado en el boletín mensual de INUMET para esa fecha, ni en la prensa revisada, ni en el METAR cercano (sin `GR`/`GS`).
4. No hay granizo reportado a menos de ~50 km ese día. Cuando hubo granizo ese mismo día, estaba a más de 300 km (Montevideo 2024-12-01 con granizo en Isidoro Noblía; Salto 2026-08-01 con granizo en Migues).

## Huecos de cobertura

- **2021-2023 tiene poca prensa.** Montevideo Portal no etiquetó notas de tormentas entre jul-2021 y ene-2022, así que el granizo de 2021 sale solo de METAR y boletines de INUMET. No encontré ningún control de 2021: no hallé cobertura de prensa de tormentas de esos meses que se pudiera verificar.
- **Sesgo geográfico.** El granizo en Montevideo, el litoral oeste, Salto, Rivera y Artigas está bien cubierto. El interior rural (Tacuarembó, Durazno, Flores) tiene muy pocos reportes. Los METAR son puntos de aeropuerto y registran sobre todo granizo pequeño (`GS`).
- **Las advertencias antiguas no están en línea.** INUMET solo mantiene los PDF recientes. De 2021 a 2025 el color sale de la prensa o de copias en Wayback, y en 31 de las 68 entradas de granizo quedó `unknown`. El histórico JSON no tiene registros de jun-2022 ni de jun-jul 2026.
- **Los boletines de INUMET son incompletos.** No registran Cebollatí (2026-02-11), Barra del Chuy (2026-04-26) ni Salto (2023-11-08 queda como discrepancia), que sí están en la prensa. Que un boletín no liste granizo no prueba que no granizó.

## Advertencias

1. **Sesgo de reporte.** Para los controles, "sin granizo reportado" no es "sin granizo". Hay más reportes donde hay más gente y redes sociales, y el volumen crece fuerte en 2024-2026. Los controles en Montevideo (6 de 20) son los más seguros por la densidad de observación.
2. **Fechas nocturnas.** Para eventos de la noche del 27 al 28 de agosto de 2026 (Vichadero, Salto, Piedras Coloradas) uso el 27, que es la fecha que les asigna el boletín de INUMET. La hora real puede ser del 28 de madrugada. Muchos eventos no tienen hora.
3. **Tamaño y daño vienen de redes sociales.** Muchos tamaños son estimaciones de vecinos o del cazador de tormentas Matías Mederos, retomadas por la prensa. En varios temporales el daño mezcla viento y granizo (por ejemplo, Isidoro Noblía 2024-12-01, Young 2025-02-14, Tranqueras 2024-02-23).
4. **Una ubicación es aproximada.** "La Víbora" (rutas 2 y 24, Río Negro) no se pudo geocodificar y usa el centroide de Fray Bentos, la ciudad más cercana.
5. **`inumetAlert` es estricto.** Se refiere a la localidad exacta. Por ejemplo, Rivera 2026-09-27 y el aeropuerto de Salto 2024-10-17 quedan en `none`, aunque había localidades vecinas en alerta. Para el baseline "¿había alerta?" en un radio de 30-50 km, conviene revisar `evidence`.

## Lo que quedó afuera

- **Sin localidad.** Florida 2022-09-09 ("algunas zonas del departamento de Florida").
- **Fecha ambigua.** Los reportes del 6 al 7 de mayo de 2024 del post-evento de INUMET (ventana de 07 a 07 h). Canelón Grande 2022-11-20, porque el granizo no está ubicado y el daño fue por viento.
- **Fuera del período o del país.** La granizada de Salto con pérdidas de arándanos (es de 2017, aunque un buscador la atribuía a 2021). Montevideo 2018. Córdoba 2026, Río Grande 2025 y Santa Rosa (La Pampa) 2025.
- **Controles descartados por mención de granizo.**
  - Montevideo 2022-04-27: un tweet citado habla de "tormenta con granizo" a las 4:10.
  - Montevideo 2023-08-16/17: INUMET reporta granizo el día 16.
  - Florida 2024-03-19/20: INUMET reporta granizo el 19 y el post-evento lo menciona el 20.
  - Montevideo 2023-12-01: `GS` en el METAR de Colonia y mención en el Sinae.
  - Salto 2026-07-17/18: granizo en Constitución, a ~50 km.
  - Paysandú 2024-01-16: había granizo en Artigas ese día y no se conocen todas las ubicaciones.
  - Paysandú y Soriano 2025-12-11: un meteorólogo menciona posible granizo.
- **Controles descartados por la alerta.**
  - Maldonado 2026-01-10 y Montevideo 2024-08-31: solo hubo alertas por viento o lluvia.
  - San Gregorio de Polanco 2023-02-08, Carmelo 2026-04-03 y Salto 2023-12-28: no pude verificar que la alerta cubriera la localidad.
  - Montevideo 2024-03-12: era un aviso por lluvias.

## Controles emparejados por época (agregados el 2026-10-04)

Los 20 controles originales estaban sesgados hacia el verano (10 de 20; solo 3 entre abril y septiembre), y eso fingía una señal ("más frío en altura" = "es invierno"). Para corregirlo se agregaron **52 controles automáticos**, uno por cada granizada dañina o sin dato de tamaño, todos con el campo `matchedTo`.

**Criterio** (scripts en [`scripts/controls/`](../scripts/controls/)):
- Tormenta **observada** en un aeropuerto: códigos `TS` en el METAR, sin contar lo que viene después de `TEMPO`/`BECMG`, que es pronóstico. Al menos 2 reportes, o 1 con lluvia fuerte.
- Sin `GR`/`GS` en **ningún** aeropuerto, sin granizo en el boletín mensual de INUMET ([`hail-dates-inumet-bulletins.json`](hail-dates-inumet-bulletins.json)) y sin granizo en esta lista, el día anterior, el mismo día y el siguiente. Se excluyen además los meses en que el boletín no detalla los días.
- Advertencia de INUMET por tormentas emitida ese día o el anterior, en algún lugar del país. La cobertura local no está verificada, así que queda `inumetAlert.status = "unknown"`.
- Emparejado con su granizada a ±45 días del mismo momento del año (de cualquier año), prefiriendo el aeropuerto más cercano y la tormenta más fuerte.

**Resultado:** 52 controles (29 en oct–mar, 23 en abr–sep). Las 16 granizadas dañinas tienen pareja. Se verificaron a mano 3 controles contra el METAR crudo.

**Advertencias:**
- Exigir "sin granizo en todo el país" deja afuera los días de tormenta generalizada. Por eso estos controles tienden a ser tormentas **más débiles** que los 20 de prensa, y las falsas alarmas sobre ellos salen más bajas.
- Que no haya reporte de granizo no prueba que no granizó, aunque el criterio es más estricto que el de prensa.
