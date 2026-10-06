# Revisión del brief — Hail Guard

Fecha: 2026-09-29 · Sobre: [`brief.md`](brief.md)

## Veredicto

La base conceptual está bien: se decide, no se pronostica; primero la meteorología y después la IA; riesgo y confianza van por separado; reglas antes que ML. Los huecos importantes están en seis lugares:

1. La **tasa base** del granizo, que define cómo se va a comportar el producto y todavía no está asumida.
2. Falta la **climatología regional**: tormentas nocturnas, jet de capas bajas, hemisferio sur.
3. El **contrato de datos** no modela ni el tiempo ni el espacio.
4. El **LLM** tiene más poder de decisión del que el propio brief dice que debería tener.
5. Algunas **fuentes** están desactualizadas y otras faltan.
6. El **orden de implementación**: conviene validar contra eventos históricos antes de construir la UI.

---

## 1. Lo que hay que mantener

- La pregunta de producto: "¿qué tan favorables son las condiciones?" y no "¿va a granizar?".
- El pipeline: primero cálculo determinístico, después fusión, después redacción.
- Riesgo y confianza como ejes separados.
- Empezar con reglas legibles y dejar el ML para cuando haya etiquetas.
- El feedback del usuario como fuente de etiquetas.
- No depender del radar en el MVP.
- Principios de confianza (§16): timestamp visible, desacuerdo visible, "Bajo ≠ imposible".

---

## 2. Problemas de fondo

### 2.1 Tasa base: casi siempre la respuesta correcta es "en tu punto no granizó"

El granizo dañino en **un punto concreto** es raro, aun en zonas muy activas. Por eso, incluso con un motor bueno, la mayoría de los "Elevado" no van a terminar en granizo sobre el auto del usuario. Esto no es un bug, es la física del problema. Pero hay que diseñar para eso:

- El valor real está en los dos extremos: un **"tranquilo" confiable** la mayoría de los días y un **salto a "protegelo ya"** cuando hay una celda real acercándose (nowcasting).
- La franja del medio ("Posible/Elevado") siempre va a tener muchas falsas alarmas. La copy tiene que prepararlo: "es un día de granizo en la región", no "te va a granizar".
- La métrica "¿granizó cerca?" (§21) necesita un **radio definido** (por ejemplo 10–20 km) y una ventana temporal. Sin eso no se puede medir nada.

### 2.2 El umbral de acción depende del usuario, no solo de la atmósfera

Es el modelo clásico costo/pérdida: conviene proteger si `p(granizo dañino) > costo_de_proteger / pérdida_esperada`.

- Si tenés garaje en casa, proteger cuesta casi nada, así que se justifica con riesgo bajo.
- Si no tenés garaje, tenés que manejar hasta un shopping o conseguir un techo, y el umbral sube mucho.

**Propuesta:** preguntar una sola vez "¿qué tan fácil te resulta proteger el auto?" (garaje propio / funda / tengo que moverlo / no tengo opción). Eso ajusta la **recomendación**, no el nivel de riesgo. Resuelve buena parte de la pregunta abierta #6.

**Definir el evento objetivo:** granizo de **≥ ~2 cm**, que es el tamaño a partir del cual abolla. Esto también baja la importancia del ingrediente "supervivencia" (§4E): el derretimiento afecta sobre todo al granizo chico, que igual no daña el auto.

### 2.3 Falta la climatología regional

- El sudeste de Sudamérica (cuenca del Plata) es una de las regiones con tormentas convectivas más intensas del mundo. Esto no está en el brief y le da fuerza al caso.
- Una parte importante de los eventos severos son **sistemas convectivos nocturnos (SCM)** alimentados por el **jet de capas bajas sudamericano (SALLJ)**. Es exactamente el caso de uso "¿lo dejo afuera esta noche?".
  - Consecuencia técnica: son tormentas **elevadas**. A la noche el CIN de superficie puede ser grande mientras las parcelas elevadas no tienen tapa. Usar MUCAPE está bien (el brief ya lo hace), pero **el CIN de superficie no puede vetar el riesgo nocturno**.
- **Estacionalidad:** hay que sacarla del archivo de alertas de INUMET y no asumirla. Probablemente pese mucho la primavera, pero hay que verificarlo.
- **Hemisferio sur:** la helicidad relativa a la tormenta (SRH) cambia de signo y la supercelda favorecida se mueve hacia la izquierda (Bunkers *left-mover*). Cualquier código o umbral portado de EE.UU. tiene que invertir el signo o se equivoca en silencio.

### 2.4 El contrato de datos (§19) ignora el tiempo y el espacio

| Problema | Por qué importa | Cambio |
|---|---|---|
| Un solo valor por modelo para toda la ventana | Los ingredientes varían por hora; el pico importa | Serie horaria/trihoraria + agregación (máx/p90 en la ventana + hora del pico) |
| Punto exacto | Los modelos globales (9–25 km) no resuelven tormentas; la celda puede pasar a 15 km | **Vecindario**: máx o p90 en un radio de ~25–40 km |
| Sin `runTime` / `validTime` | Sin eso no se puede calcular la confianza ni mostrar "dato de hace X h" | Agregar corrida, hora válida y lead time |
| GEFS en el mismo array que los determinísticos | Un ensemble es una distribución, no un valor | `% de miembros que superan el umbral X` |
| Unidades implícitas | m s.n.m. vs m sobre el suelo, m/s vs kt | Unidades en el nombre del campo |
| Faltan campos de §5 | La razón de mezcla MU es necesaria para SHIP; tampoco están el agua precipitable ni la señal de precipitación convectiva | Agregarlos |
| `inumet.warningActive: boolean` | Las alertas son por departamento/zona, con nivel y vigencia, y no siempre mencionan granizo | Zona, nivel (amarilla/naranja/roja), vigencia, `mentionsHail` |
| Observaciones sin geometría | Lo que importa es si la celda **viene hacia mí** | Distancia, rumbo, desplazamiento, timestamp |
| Salida sin desglose | Sin desglose no se puede depurar ni explicar el "por qué" | `ingredients` por clase, `peakWindow`, `engineVersion`, `sources`, `nextCheckAt` |

Borrador de contrato revisado:

```ts
type Level = 'unfavorable' | 'marginal' | 'favorable' | 'strong';

interface ModelSeries {
  source: 'ECMWF-IFS' | 'ECMWF-ENS' | 'GFS' | 'GEFS';
  runTime: string;               // init UTC
  steps: {
    validTime: string;
    // agregados en vecindario (p90 o máx), unidades explícitas
    mucapeJkg?: number;
    muMixingRatioGkg?: number;
    cinJkg?: number;
    shear06Ms?: number;
    lapse700500Ckm?: number;
    t500C?: number;
    freezingLevelMAgl?: number;
    wetBulbZeroMAgl?: number;
    pwMm?: number;
    convPrecipMm?: number;
    // solo ensembles
    probMucapeGt1000?: number;   // 0–1, fracción de miembros
    probShear06Gt15?: number;
  }[];
}

interface OfficialWarning {
  status: 'active' | 'none' | 'unknown';   // "unknown" si falló la ingesta
  level?: 'yellow' | 'orange' | 'red';
  zone?: string;
  validFrom?: string;
  validTo?: string;
  mentionsHail?: boolean;
}

interface ObservedCell {
  source: 'glm' | 'satellite' | 'radar';
  distanceKm: number;
  bearingDeg: number;
  movingTowardPoint?: boolean;
  trend: 'stable' | 'increasing' | 'rapidly_increasing';
  observedAt: string;
}

interface HailRiskResult {
  risk: 'low' | 'possible' | 'elevated' | 'protect';
  confidence: 'low' | 'medium' | 'high';
  validFrom: string;
  validTo: string;
  peakWindow?: { from: string; to: string };
  ingredients: Record<'instability' | 'trigger' | 'shear' | 'growth' | 'survival', Level>;
  reasonCodes: string[];         // p.ej. 'HIGH_MUCAPE', 'STRONG_SHEAR', 'MODELS_DISAGREE'
  contradictionCodes: string[];
  officialWarning: OfficialWarning;
  sources: { source: string; runTime: string }[];
  engineVersion: string;
  nextCheckAt?: string;
}
```

### 2.5 El horizonte temporal no coincide con las fuentes

- Los modelos globales se actualizan cada 6 h y llegan con horas de latencia. Con esos datos **no se puede contestar "próxima 1 h" de forma honesta**. El rango de 0–2 h es nowcasting (rayos, satélite, radar) y la V0 no tiene nada de eso.
- **V0:** sacar "1 h", o contestarla aclarando "solo con datos de modelo, sin observación en tiempo real".
- El punto fuerte de la V0 es **"hoy de tarde / esta noche / mañana" (6–36 h)**, que además coincide con el caso nocturno de §2.3.

### 2.6 El LLM tiene más poder del que el brief dice

Los §6 y §7 le asignan al LLM "reconciliar señales / modelos en conflicto". Eso es **decidir**. La reconciliación tiene que ser determinística y el LLM solo debería redactar.

**Para la V0: nada de LLM.** Plantillas a partir de `reasonCodes` y `contradictionCodes`. Son determinísticas, testeables, instantáneas, no cuestan nada, y no hay riesgo de que la redacción contradiga el nivel o viole los principios de §16. Si más adelante se agrega un LLM, que sea solo para mejorar la redacción, con un validador que rechace cualquier salida que cambie el nivel o que use lenguaje de certeza.

### 2.7 La escala mezcla riesgo con acción

"Low / Possible / Elevated" describen riesgo, pero "Protect" es una acción. Además el CTA es una pregunta de sí/no ("¿lo puedo dejar afuera?"). Conviene que la respuesta principal sea **la acción** y que el nivel quede como dato secundario:

| Nivel | Respuesta principal (borrador) |
|---|---|
| low | "Dejalo tranquilo." |
| possible | "Por ahora sí. Mirá de nuevo a las 18:00." |
| elevated | "Si tenés dónde, guardalo." |
| protect | "Protegelo ahora." |

- **Confianza:** 4 niveles × 3 grados de confianza son 12 combinaciones, demasiadas para el usuario. En la V0 la confianza queda en los datos y aparece en la copy ("los modelos no coinciden") en vez de como un badge aparte.
- La copy tiene que estar en **español rioplatense**; todos los ejemplos del brief están en inglés.

---

## 3. Fuentes de datos: correcciones y agregados

- **ECMWF:** desde el **1 de octubre de 2025 todo el catálogo en tiempo real es CC-BY 4.0**, no solo un subset. Hay un subset gratuito online a 0,25°; bajar el volumen completo puede tener costos de distribución. Esto incluye el **ENS**, así que la dispersión no depende solo de GEFS. Hay que verificar qué niveles de presión y qué parámetros trae el subset gratuito, porque de eso depende si se puede calcular la cizalladura efectiva (probablemente no: **sacarla del MVP**).
- **Open-Meteo** como atajo para el paso 3 (la "API fácil"): devuelve en JSON CAPE, *lifted index*, nivel de congelamiento y variables por nivel de presión para GFS/ECMWF/ICON, y tiene API de ensembles. Hay que verificar el CIN por modelo. Cuidado: el tier gratuito es para uso no comercial. Sirve para validar rápido; después se puede migrar a ingesta propia.
- **WRF del SMN Argentina (4 km, AWS Open Data):** cubre Uruguay, corridas 00/12 UTC, hasta 72 h. **Pero el dataset abierto solo trae variables de superficie** (T2, HR, viento, precipitación), sin CAPE ni *updraft helicity*. Sirve como mucho como señal de precipitación, no para los ingredientes de granizo.
- **Rayos** (pregunta abierta #3): **GLM del GOES-East (GOES-19)** es gratuito, cubre Uruguay y tiene baja latencia. El "*lightning jump*" es un precursor documentado de granizo severo.
- **Satélite:** el ABI del mismo GOES (enfriamiento de topes, topes sobresalientes).
- **Radar** (pregunta abierta #2), pistas para investigar: la red SINARAME del SMN (radares en el litoral y Buenos Aires, que cubrirían el oeste de Uruguay), radares de Rio Grande do Sul (norte/este) y el estado actual del radar de INUMET.
- **Calibración:** usar **ERA5** (reanálisis horario y consistente, gratis vía Copernicus CDS) en vez de corridas operativas históricas de GFS/ECMWF, que cambiaron de versión muchas veces.
- **Etiquetas:** una alerta de INUMET no es lo mismo que una ocurrencia. La mejor verdad de campo son los **siniestros de las aseguradoras** (BSE y privadas). Eso además abre un posible canal B2B2C, y hoy el brief no tiene modelo de negocio.
- **Ingesta de INUMET:** averiguar si hay feed (CAP/RSS/JSON) o si hay que scrapear. **Si la ingesta falla, mostrar "estado de alerta desconocido" y nunca "sin alertas".** Es un punto de seguridad.

---

## 4. Arquitectura: precalcular la grilla, no calcular por request

Uruguay a 0,25° son ~500 puntos, y si se incluye el AMBA son unos cuantos cientos más. Un cron por corrida de modelo:

```
ingesta (por corrida) → ingredientes por punto×hora → agregación en vecindario
  → reglas de clasificación → store → API por punto → plantillas → PWA
```

Ventajas:

- La respuesta es instantánea.
- Todos los usuarios ven lo mismo.
- El costo no crece con el uso.
- Más adelante habilita una vista de mapa.
- **El mismo código corre sobre ERA5 para el backtesting.**

---

## 5. Orden de implementación revisado (reemplaza §18)

0. **Lista de eventos:** 20–40 granizadas conocidas en Uruguay (archivo de INUMET + prensa), más días control sin granizo con condiciones parecidas.
1. **Motor de ingredientes y reglas sobre ERA5** para esas fechas. ¿Separa eventos de controles? Ajustar. *Esto valida el núcleo sin escribir una línea de UI.*
2. Ingesta operativa de un modelo (Open-Meteo o ECMWF open) + precálculo de la grilla.
3. **Logging desde el día uno** (`engineVersion`, entradas, salida, coordenadas redondeadas).
4. PWA V0 con plantillas.
5. Alertas de INUMET (con estado "desconocido").
6. Botón de feedback.
7. Segundo modelo / ensemble → confianza.
8. GLM + satélite → nowcast de 0–2 h.
9. (Opcional) LLM para la redacción; push.

---

## 6. Umbrales de partida (literatura general, **no calibrados**)

Sirven para arrancar el motor y hay que reemplazarlos en el paso 1. En la región la CAPE suele ser muy alta, así que **por sí sola discrimina poco**: la cizalladura y el gradiente térmico vertical probablemente pesen más.

| Ingrediente | Marginal | Favorable | Muy favorable |
|---|---|---|---|
| MUCAPE (J/kg) | 500–1000 | 1000–2500 | > 2500 |
| Cizalladura 0–6 km (m/s) | 10–15 | 15–20 | > 20 |
| Gradiente 700–500 hPa (°C/km) | 6–6.5 | 6.5–7.5 | > 7.5 |
| T500 (°C) | > −8 | −8 a −12 | < −12 |
| SHIP | 0.5–1 | 1–2 | > 2 |

---

## 7. Otros puntos

- **Privacidad:** loguear lat/lon es un dato personal (Ley 18.331). En los logs, redondear a ~1 km (2 decimales) y no asociar las coordenadas a una identidad en la V0.
- **Push en iOS (V2):** el web push solo funciona si la PWA está instalada en la pantalla de inicio (iOS 16.4+).
- **Lenguaje oficial:** no usar "alerta" de una forma que se pueda confundir con las alertas de INUMET. Poner la atribución CC-BY de ECMWF.
- **Nombre:** "Hail Guard" probablemente ya lo usan productos de fundas antigranizo. Chequear antes de invertir en la marca.
- **Mercado:** "Río de la Plata" incluye el AMBA, que tiene muchos más autos y más granizo. Incluirlo en la grilla desde el principio cuesta casi nada.
- **Evidencia del problema (§15):** hoy es anecdótica. Antes de ampliar el alcance conviene una validación rápida: 10 conversaciones, segmentadas por **tiene garaje / no tiene** (es el eje que cambia todo, ver §2.2).

---

## Fuentes consultadas

- [ECMWF Open Data](https://ecmwf.int/en/forecasts/datasets/open-data)
- [ECMWF abre todo su catálogo en tiempo real (oct 2025)](https://sciencebusiness.net/network-updates/ecmwf-makes-its-entire-real-time-catalogue-open-all)
- [SMN-Arg WRF en AWS Open Data](https://registry.opendata.aws/smn-ar-wrf-dataset)
