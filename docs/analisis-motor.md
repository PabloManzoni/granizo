# Análisis: motor de riesgo de granizo

Fecha: 2026-09-30 · Reemplaza, donde se contradicen, a [`revision-brief.md`](revision-brief.md). Base: [`brief.md`](brief.md).

## Qué exploramos

Si el producto tiene sentido y qué valor agrega frente a leer INUMET. Qué pregunta tiene que contestar el motor. Qué tan precisa puede ser la respuesta. Si hay historia disponible para validar. Si la PWA sirve como vehículo.

**Contexto del producto:** es una app para cualquier persona en Uruguay y **no se hardcodea para nadie**. El primer usuario es el autor. Diseño visual mínimo al principio; lo resuelve el autor, que es product designer.

## Problemas (implementación / UX)

1. **INUMET no discrimina granizo.** Todas sus alertas por tormenta mencionan granizo. Experiencia del autor: en ~1 de cada 20 días con alerta cayó granizo, y ese no dañaba autos. Además las alertas son por departamento, lo que es demasiado amplio.
2. **Tasa base baja.** El granizo dañino en una zona concreta es raro. Aun con un buen motor, la mayoría de los "atento" no van a terminar en granizo.
3. **Detección y falsas alarmas se contraponen.** No se puede mejorar una sin empeorar la otra. Un motor miedoso asusta día por medio. Uno valiente alguna vez falla con "tranquilo".
4. **El tamaño no se pronostica.** Antes de la tormenta, lo máximo es decir que hay condiciones para granizo grande o para granizo chico, con mucho solapamiento. El tamaño real solo se estima con radar, con la tormenta ya formada.
5. **Clima regional:**
   - Muchas tormentas severas son **nocturnas**, alimentadas por el jet de capas bajas.
   - De noche el combustible está **en altura**: el aire de superficie puede parecer estable mientras hay energía a 1–2 km. Por eso se usa MUCAPE y el CIN de superficie no puede vetar el riesgo nocturno.
   - **Hemisferio sur:** las supercélulas giran y se desvían al revés que en EE.UU. Las fórmulas y el código de EE.UU. se equivocan en silencio si no se ajustan.
6. **La "chispa" es el ingrediente más difícil.** Los modelos dicen bien si hay condiciones y mal si la tormenta se va a formar justo ahí. La respuesta realista es del tipo "si se forman tormentas, tienen condiciones de granizo".
7. **La ubicación que importa es la del auto**, no la del teléfono. De noche es la casa. De día, el trabajo o donde se estacione.
8. **Horizonte.** Los modelos globales se actualizan cada 6 h, con horas de latencia. "Próxima 1 h" no se puede contestar sin datos en tiempo real, así que se saca de la V0.
9. **No existe un registro de granizadas en Uruguay.** Hay que compilarlo de fuentes sueltas. Además hay sesgo de reporte: que no haya reporte no prueba que no granizó, y eso complica elegir los días de control.
10. **Limitaciones de las PWA en iOS.** El push exige "Agregar a pantalla de inicio" (iOS 16.4+). Una PWA cerrada no puede hacer nada por su cuenta.
11. **Lenguaje de colores.** Si la app usa "día rojo", choca con las alertas rojas de INUMET y puede confundir.

## Opciones consideradas

| Opción | Pros / contras | Buena práctica en la que se apoya |
|---|---|---|
| **Basarse en INUMET** vs **motor propio por ingredientes** | INUMET: simple, pero dice granizo siempre. Motor propio: puede decir "hoy no", pero hay que validarlo | Pronóstico por ingredientes (Doswell et al., 1996) |
| **Punto exacto** vs **radio de 30–50 km** | El punto finge una precisión que no existe. El radio es honesto, pero habla de la zona y no del auto | El SPC (EE.UU.) define sus probabilidades "dentro de 25 millas (~40 km) de un punto" |
| **4 niveles del brief** vs **escalera de 3 acciones** | Los 4 niveles mezclan riesgo con acción. La escalera liga cada nivel a lo que hacés | Modelo costo/pérdida. *Watch* vs *warning* del NWS |
| **LLM** vs **plantillas** en la V0 | El LLM agrega costo y el riesgo de contradecir el nivel. Las plantillas son determinísticas y testeables | "Meteorología primero, IA después" (principio del propio brief) |
| **PWA** vs **nativa** | PWA: un solo código, se comparte por link, sin tiendas. Contra: limitaciones en iOS | Validar con lo mínimo antes de invertir en lo caro |
| **Motor completo** vs **test histórico simple primero** | El motor completo tendría umbrales de EE.UU. sin probar. El test simple valida la hipótesis central barato | Ley de Gall |
| **Validar con alertas** vs **validar con granizo real** | Validar con alertas que siempre dicen granizo es circular | Verificación de pronósticos: contra observaciones y contra una referencia (*skill score*) |

## Trade-offs y hacia dónde nos inclinamos

- **La pregunta del producto:** "¿hay chances de granizo que dañe un auto en mi zona? ¿pocas o muchas?", para **la noche** (auto en casa) y para **el día de trabajo** (auto afuera). No es "¿cae granizo de 5 cm a las 3:30?".
- **Unidad espacial:** una zona de 30–50 km de radio, con copy que aclare que habla de la zona.
- **Qué cuenta como acierto:** granizo dañino, ~2 cm o más. Es la vara para medir, no algo que se pronostica.
- **Escalera de acciones**, cada una con su propia exigencia:

  | Nivel | Acción del usuario | Qué tan exigente |
  |---|---|---|
  | Tranquilo | Nada | — |
  | Atento | Acolchados a mano, volver a mirar | Puede ser miedoso: avisar de más cuesta poco |
  | Día rojo *(nombre a definir)* | No ir o no estacionar al descubierto | Muy estricto: solo con señales fuertes |

- **El valor principal está en el "no":** decir "llueve, pero no es clima de granizo" en los ~19 de cada 20 días de alerta.
- **INUMET** es la **referencia a superar** y una segunda opinión, no la base. Las alertas de Argentina (SMN) y Brasil (INMET) sirven más para ver qué viene que para confirmar.
- **Primero el test histórico, después el motor operativo, después la PWA.**
- **Caso durable:** para quien tiene garaje en casa, el caso de la noche pierde peso y **el del día de trabajo queda**. Probablemente sea el núcleo del producto a largo plazo.

## Buenas prácticas de referencia

- **Pronóstico por ingredientes** (Doswell, Brooks & Maddox, 1996): combustible, chispa, organización, crecimiento del hielo y supervivencia.
- **Pronóstico basado en impactos** (OMM, 2015): pasar de "qué tiempo va a hacer" a "qué va a hacer el tiempo".
- **Modelo costo/pérdida:** conviene actuar si la probabilidad supera costo de proteger / pérdida.
- ***Watch* vs *warning*** (NWS): "hay condiciones, preparate" vs "está pasando, actuá".
- **Probabilidades del SPC dentro de 25 millas de un punto.**
- **Verificación contra una referencia** (*skill score*): detección y tasa de falsas alarmas.
- **Separar probabilidad y confianza** (como en el lenguaje calibrado del IPCC).
- **Método de análogos:** "¿las otras veces que la atmósfera estuvo así, granizó?".
- **Diseño caso-control** para la validación: eventos contra días de control comparables.
- **Rules of ML #1** (Google): lanzar sin ML y empezar con reglas.
- **Ley de Gall:** los sistemas complejos que funcionan evolucionan desde sistemas simples que funcionaban.
- **Sesgo de reporte** en las climatologías de granizo: hay más reportes donde hay más gente.

## Preguntas abiertas

- ¿El motor separa los días de granizo de los de lluvia **mejor que "había alerta de INUMET"**? Es la hipótesis central; la contesta el test histórico.
- ¿Cuántas granizadas dañinas se pueden documentar con fuentes públicas? ¿Alcanzan 20–40?
- Ventana horaria del caso de trabajo: ¿a qué hora se decide y hasta qué hora queda el auto afuera?
- ¿Qué caso se prioriza en la V0, la noche o el día?
- Lenguaje de niveles: ¿colores propios, o palabras para evitar el choque con INUMET?
- ¿Qué CAPE devuelve Open-Meteo? ¿MUCAPE o de superficie, y según qué modelo?
- ¿Qué parámetros y niveles trae el subset gratuito de ECMWF?
- ¿INUMET tiene feed de alertas (CAP/RSS/JSON) o hay que scrapear?
- Radares de INUMET (Ismael Cortinas y Pirarajá): ¿están operativos? ¿Los datos van a ser públicos?
- El Niño: está documentado que trae más lluvia en primavera. La relación con más granizo no está clara.

## Parking lot

- **"Te aviso solo cuando importa"** (push, sin abrir la app). Baja prioridad, porque en días feos el usuario ya está mirando. Podría volver para el caso del trabajo.
- Canal por WhatsApp o Telegram.
- Precalcular una grilla regional en vez de calcular por request.
- Contrato de datos revisado de `revision-brief.md` (no está decidido).
- LLM solo para mejorar la redacción, más adelante.
- Nowcasting: rayos GLM (GOES-19), satélite, radar de INUMET.
- Cubrir el AMBA (Buenos Aires).
- Aseguradoras como fuente de siniestros o como socio.
- Vista de mapa.

## Próximos pasos para el build

1. **Compilar la lista de eventos con fuentes públicas.** La arma Claude investigando y el autor la valida con lo que recuerde:
   - prensa: el granizo que rompe autos sale en las noticias;
   - informes post-evento de INUMET;
   - registros de SINAE;
   - partes de estaciones y aeropuertos (METAR/SYNOP). El aeropuerto de Carrasco queda a ~15 km de El Pinar.

   Cada evento lleva fecha, zona y evidencia de daño. Se suman **días de control**: noches con tormenta y alerta en zonas pobladas en las que no hubo granizo reportado.
2. **Acceso a la historia de la atmósfera.** ERA5 requiere una cuenta gratuita en Copernicus, que crea el autor. Antes, verificar si alguna API abierta ya expone lo necesario para las fechas del test.
3. **Test histórico.** Una receta simple de ingredientes, con umbrales de literatura como punto de partida, aplicada en un radio de 30–50 km alrededor de cada evento o control y comparada contra la referencia "¿había alerta de INUMET?". El código tiene que funcionar para cualquier punto de Uruguay, no solo para El Pinar.
4. **Si el test separa bien:** motor operativo con una sola fuente de pronóstico y una PWA básica, abierta a cualquier usuario y ubicación, con lugares guardados (casa y trabajo) y diseño mínimo.
5. **Después:** segundo modelo o ensemble para medir la confianza, alertas de los países vecinos, rayos y satélite.

**Si el test no separa bien:** revisar ingredientes y umbrales, o replantear el producto antes de construir la PWA.

## Glosario

- **CAPE / MUCAPE:** energía disponible para que el aire suba y forme tormentas. La MUCAPE busca esa energía a cualquier altura, no solo en superficie.
- **CIN:** "tapa" que impide que arranquen las tormentas.
- **Cizalladura:** cambio del viento con la altura. Hace que una tormenta dure horas en vez de desarmarse.
- **Supercélula:** tormenta grande que rota. Es la que produce el granizo más grande.
- **Jet de capas bajas:** corriente de aire cálido y húmedo que baja desde el Amazonas y se acelera de noche.
- **Reanálisis / ERA5:** reconstrucción hora por hora de la atmósfera del pasado (desde 1940), combinando observaciones con un modelo.
- **Nowcasting:** pronóstico de las próximas 0–2 h con observación en tiempo real (radar, satélite, rayos).
- **PWA:** web que se instala en el celular como una app, sin pasar por las tiendas.
- **Detección / falsa alarma:** de las veces que pasó, cuántas avisó / de las veces que avisó, cuántas no pasó nada.
- **Análogos:** buscar días pasados con una atmósfera parecida y ver qué pasó.
