# Brief de diseño — "¿Lo dejo afuera?"

Fecha: 2026-10-05 · Para: diseño de producto · Prototipo funcional de referencia: `npm run serve` → http://localhost:8787

## 1. Qué es

Una app que contesta **una sola pregunta**: *¿puedo dejar el auto afuera, o conviene protegerlo del granizo?*

No es una app del clima: no muestra temperatura, lluvia ni pronóstico general. Es un **asistente de decisión**. Mira si la atmósfera tiene condiciones para granizo **en tu zona** y lo traduce en **qué hacer**.

**La diferencia con INUMET.** INUMET pone "posible granizo" en casi todas sus alertas por tormenta, para departamentos enteros. Esta app trata de separar la **tormenta de piedra** de la **tormenta de agua**, para tu zona y tu horario, y se anima a decir "hoy no".

## 2. Para quién y cuándo se usa

**Usuario:** gente que deja el auto en la calle o en estacionamientos descubiertos, sin garaje o sin garaje siempre. En temporada de tormentas (con El Niño, por ejemplo) está ansiosa "día por medio".

**Momentos de uso:**

| Momento | Pregunta | Dónde está el auto |
|---|---|---|
| **Antes de dormir** | ¿Lo dejo afuera esta noche? | Casa |
| **A la mañana** | ¿Voy al trabajo en auto? ¿Lo dejo en la calle? | Trabajo |
| **Se puso feo el cielo** | ¿Esto es de piedra o de agua? ¿Lo muevo ya? | Donde esté (*futuro: capa de rayos en tiempo real*) |

**Características del uso:**
- **Por temporadas:** se usa mucho en los períodos de tormenta y casi nada el resto del año.
- **Rápido:** se abre, se mira y se cierra. Es una consulta de segundos, no un lugar donde quedarse.
- **El valor está en el "no"** la mayoría de las veces: "llueve, pero no es de piedra, dormí tranquilo".
- **Lo que importa es dónde va a estar el auto**, no dónde está el teléfono. De noche es la casa; de día, el trabajo.

## 3. Principios de diseño

1. **Primero la respuesta, después el porqué y al final los detalles** (revelación progresiva). El titular tiene que alcanzar para decidir.
2. **Honestidad sobre la incertidumbre:**
   - Nunca "va a granizar" ni "no va a granizar". Siempre se habla de condiciones y chances.
   - La **confianza** se ve siempre.
   - **"Tranquilo" no significa imposible.**
3. **Una zona, no tu techo.** El motor mira ~40 km alrededor del punto, y el diseño no tiene que sugerir más precisión que esa.
4. **No confundir con las alertas oficiales.** No copiar los colores ni los nombres de INUMET (amarilla, naranja, roja) y siempre ofrecer el link a sus alertas.
5. **Tono calmo, en rioplatense:** sin alarmismo ni dramatismo. El objetivo es **bajar la ansiedad sin alarmar de más**.
6. **De abrir a respuesta, un toque o ninguno.** La app recuerda el último lugar y propone la ventana según la hora.
7. **Accesible:** el color nunca es la única señal (siempre va con palabra o ícono), contraste AA, áreas táctiles de 44 px, el resultado se anuncia al lector de pantalla y hay modo oscuro.

## 4. Los niveles (la pieza central)

El motor devuelve **3 niveles**. Son una escalera de **acciones**, no de "cuánto llueve":

| Código | Nombre provisorio | Qué significa | Qué hace la persona |
|---|---|---|---|
| `calm` | **Tranquilo** | No es clima de granizo en la zona | Nada |
| `watch` | **Atento** | Hay ingredientes para granizo | Tener a mano con qué cubrirlo, volver a mirar |
| `protect` | **Protegelo** | Ambiente fuerte para granizo, los dos modelos coinciden y forman tormentas | Guardarlo, cubrirlo o no estacionar al descubierto |

**Cómo se comporta cada nivel** (medido con datos históricos de 2025–2026, en días de tormenta):
- **Protegelo** es **estricto**: detecta ~4 de cada 10 granizadas y falla en ~15% de los días de tormenta sin granizo.
- **Atento** es **generoso**: detecta ~9 de cada 10 granizadas, pero aparece en ~2 de cada 3 días de tormenta.
- Hay que diseñarlo así: **"Atento" va a ser frecuente** en temporada, y no puede sentirse como una alarma.

**A definir en diseño:**
- **Los nombres.** Evitar "rojo/amarillo/naranja". Nombrar por acción funciona bien: Tranquilo, Atento, Protegelo.
- **El sistema visual de nivel:** ícono, color y forma, sin depender solo del color.

## 5. Qué entrega el motor (los datos reales que tiene la interfaz)

`GET /api/assess?lat&lon&window=tonight|today|tomorrow` devuelve:

| Campo | Ejemplo | Uso en la interfaz |
|---|---|---|
| `level` | `calm` / `watch` / `protect` | El nivel |
| `headline` | "Tranquilo: no es clima de granizo en tu zona." | Titular (copy provisorio) |
| `confidence` | `low` / `medium` | Confianza (por ahora nunca "alta") |
| `season` + `seasonNote` | `warm`: "en el test histórico el ambiente no separó granizo de lluvia" | Aviso de estación (oct–mar) |
| `reasons[]` | "El aire no se enfría lo suficiente con la altura para piedras grandes" | Lista "Por qué" (2 a 6 ítems) |
| `models[]` | GFS: tranquilo · ECMWF: tranquilo | Si los dos modelos coinciden o no |
| `favorableHours` | 21:00 a 03:00 | "Horas a vigilar" (puede no venir) |
| `window` | "Esta noche (20 a 8 h)" | Ventana consultada |
| `peak` | energía, viento, gradiente, SHIP… | Panel técnico opcional |
| `generatedAt`, `engineVersion` | 06:59 · v0.2.0 | Cuándo se calculó |
| `disclaimer` | "Habla de una zona de ~40 km…" | Letra chica |

**Las razones posibles** (el motor elige cuáles mostrar): el aire se enfría rápido o no con la altura · energía y viento fuertes, moderados o débiles · índice SHIP elevado · el modelo forma tormentas o no · nivel de congelamiento alto · estación cálida · los modelos coinciden o no.

## 6. Pantallas y flujos

### 6.1 Primera vez (onboarding liviano)
- Qué es y qué no es, en una frase. "No reemplaza a INUMET".
- Pedir la ubicación **opcionalmente**, explicando para qué. También se puede elegir el lugar a mano.
- Guardar **Casa** y **Trabajo**: el auto vive ahí.
- *Futuro:* "¿Qué tan fácil te resulta proteger el auto?" (garaje / funda / tengo que moverlo / no tengo opción). Sirve para ajustar la recomendación, no el riesgo.

### 6.2 Consulta (la pantalla principal)
- **Lugar:** chips con los lugares guardados, "Mi ubicación" y agregar.
- **Ventana:** Esta noche / Hoy / Mañana. Por defecto "esta noche" desde las 14 h y "hoy" antes.
- **Recomendación:** al abrir, mostrar **directamente** el resultado para el último lugar y la ventana sugerida, sin obligar a tocar "Consultar". El prototipo hoy pide tocar el botón.

### 6.3 Resultado
Jerarquía sugerida:
1. **Nivel y acción** (lo más grande).
2. **Confianza** y, si corresponde, el **aviso de estación** o el de **modelos que no coinciden**.
3. **Por qué:** 2 a 4 razones en lenguaje llano.
4. **Horas a vigilar**, si las hay.
5. **Detalles técnicos**, plegables, para quien quiera mirar.
6. Hora de cálculo · "zona de ~40 km" · link a INUMET.

### 6.4 Lugares
Lista para agregar, renombrar y borrar. Nota de privacidad: se guarda en el teléfono, redondeado a ~1 km.

### 6.5 Estados a diseñar
| Estado | Mensaje actual (provisorio) |
|---|---|
| Cargando | "Consultando el pronóstico…" (tarda ~2–10 s) |
| Sin permiso de ubicación | "No pudimos obtener tu ubicación. Revisá el permiso del navegador." |
| Fuera de Uruguay | "Por ahora el motor solo funciona en Uruguay." |
| Límite de la fuente de datos | "La fuente de datos llegó a su límite gratuito por ahora. Probá en un rato." |
| Error del servicio | "No pudimos obtener el pronóstico. Probá de nuevo en unos minutos." |
| Sin conexión | "Sin conexión. Probá de nuevo." Nunca se muestra un veredicto viejo como si fuera actual. |
| Sin lugares guardados | Invitar a guardar Casa y Trabajo |

## 7. Las combinaciones difíciles (la matriz)

No alcanza con diseñar 3 niveles. Estas combinaciones van a aparecer seguido:

| Caso | Por qué es difícil |
|---|---|
| **Tranquilo + confianza baja (verano)** | Es **el más delicado**. Entre oct y mar el pronóstico no distingue granizo de lluvia. El verde de "tranquilo" no puede transmitir una seguridad que no tenemos. Hoy convive con la nota de estación: ¿alcanza? |
| **Atento + modelos que no coinciden** | Uno dice "protegelo" y el otro no. Hay que transmitir "preparate" sin pánico. |
| **Protegelo + confianza media** | Es el máximo que da el motor hoy. Tiene que ser claro y accionable, sin dramatismo. |
| **Atento frecuente** | En temporada va a salir 2 de cada 3 días de tormenta. Si se diseña como alarma, la gente lo ignora. |
| **Sin horas a vigilar** | A veces el nivel es atento pero las horas no son claras: el bloque tiene que poder no estar. |

## 8. Guía de redacción

- **Sí:** "condiciones para granizo", "chances", "en tu zona", "si se forman tormentas", "tené a mano con qué cubrirlo", "mirá de nuevo a las 18".
- **No:** "va a granizar", "no va a granizar", "seguro", "alerta" (es la palabra de INUMET), "100%".
- Siempre en voseo, en frases cortas y con la acción primero.
- Los términos técnicos (CAPE, cizalladura, SHIP) solo en el panel de detalles, explicados en llano.

## 9. Plataforma y restricciones técnicas

- **PWA mobile-first**, desde 360 px de ancho. Instalable en la pantalla de inicio. Modo oscuro.
- **iPhone:** las notificaciones push solo funcionan si la PWA está instalada (iOS 16.4+). No hacen falta ahora, pero conviene tenerlo en cuenta para el flujo de instalación.
- **Offline:** se cachea la interfaz, nunca el veredicto.
- **Atribución obligatoria:** "Pronósticos GFS (NOAA) y ECMWF vía Open-Meteo (CC BY 4.0). Contiene datos de ECMWF."
- **Nombre:** "Hail Guard" ya existe como marca de fundas antigranizo. Falta nombre e ícono propios.

## 10. Fuera de alcance por ahora (pero conviene dejar lugar)

- **Capa de rayos en tiempo real:** "tormenta eléctrica fuerte a X km, ahora". Está prototipada y no distingue granizo, pero sirve para "si lo vas a mover, es ahora". Probablemente un banner o estado especial arriba del resultado.
- **Feedback "¿Granizó acá?"** después de la ventana consultada (sí / no / no sé). Es **muy valioso**: es la forma de medir si la app acierta.
- **Notificaciones** del tipo "vigilar mi auto hasta las 18".
- Mapa, cuentas de usuario, otros países.

## 11. Cómo saber si el diseño funciona

- De abrir a entender qué hacer en **menos de 5 segundos**.
- Que la persona pueda decir con sus palabras **qué tiene que hacer** y **cuánto confiar**.
- Que "Tranquilo" en verano **no se lea como garantía**.
- Que "Atento" no se lea como alarma ni se vuelva ruido.
- Que nadie lo confunda con una alerta oficial.
