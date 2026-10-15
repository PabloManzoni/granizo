// Textos del presentador en cada idioma de la app: español (el original), inglés y suajili (Kenia).
// El motor decide el nivel; acá solo cambia cómo se dice. Si cambia un texto en español, cambiarlo en los tres.
import type { Sensitivity, SensitivityRules } from './engine/config.ts';
import type { ReasonCode } from './engine/types.ts';
import type { WindowName } from './windows.ts';

export type Lang = 'es' | 'en' | 'sw';
export const LANGS: Lang[] = ['es', 'en', 'sw'];

type ViewLevel = 'calm' | 'storm' | 'watch' | 'protect';
type TitleKey = 'weak' | 'protect' | 'stormLow' | 'storm' | 'watchAgree' | 'watchDisagree' | 'calmLow' | 'calm';
type NoteKey = 'singleModel' | 'divided' | 'reservations' | 'usual';
/** madrugada (0–6), mañana (6–12), tarde (12–20), noche (20–24). */
type Part = 0 | 1 | 2 | 3;
interface Stats {
  protect: { hit: number; falseAlarm: number };
  watch: { hit: number; falseAlarm: number };
}

export interface PresenterText {
  /** Formato de números ("1.200" en español, "1,200" en inglés). */
  locale: string;
  levelNames: Record<ViewLevel, string>;
  hailStatus: Record<ViewLevel, string>;
  weakSignals: string;
  sensitivityNames: Record<Sensitivity, string>;
  sensitivitySummary: Record<Sensitivity, string>;
  combineRule: Record<SensitivityRules['combine'], string>;
  windowLabels: Record<WindowName, string>;
  titles: Record<TitleKey, string>;
  notes: Record<NoteKey, string>;
  confidenceLabels: Record<'low' | 'medium' | 'high', string>;
  usual: { strong: string; text: (falseAlarm: number) => string };
  inumet: { strong: string; protect: string; storm: string };
  reason: { onlyModel: (model: string) => string; disagree: string; agree: string; warm: string };
  reasons: Record<ReasonCode, string>;
  now: string;
  /** El momento en la frase ("ahora", "esta tarde"): en español, en minúscula. */
  nowInText: string;
  shortDays: string[];
  /** `days`: 0 hoy, 1 mañana, más: el día de la semana (`weekday`, 0 = domingo). */
  moment: (part: Part, days: number, weekday: number) => string;
  watchText: (worst: 1 | 2, moments: string[]) => string;
  tech: {
    zone: string;
    zoneValue: string;
    peak: string;
    peakValue: (hhmm: string) => string;
    mucape: string;
    shear: string;
    lapse: string;
    wmaxshear: string;
    freezing: string;
    showers: string;
    source: string;
    sourceValue: (sources: string, hhmm: string, version: string) => string;
  };
  rules: {
    lapse: string;
    wmaxshear: string;
    trigger: string;
    wmaxshearThreshold: (watch: string, protect: string) => string;
    wmaxshearSame: (protect: string) => string;
    triggerThreshold: (showers: string, precip: string) => string;
  };
  combination: {
    single: (perModel: string) => string;
    multi: (perModel: string, name: string, rule: string, level: string) => string;
    storm: string;
  };
  confidenceWhy: { warm: string; single: string; agree: string; disagree: string };
  validation: (name: string, s: Stats, pct: (x: number) => string) => string;
  disclaimer: string;
}

const tenths = (x: number) => Math.round(x * 10);

const es: PresenterText = {
  locale: 'es-UY',
  levelNames: { calm: 'Muy pocas chances', storm: 'Muy pocas chances', watch: 'Algunas chances', protect: 'Chances reales' },
  hailStatus: {
    calm: 'Sin señales de granizo',
    storm: 'Tormenta, sin señales de granizo',
    // Condiciones, no pronóstico: muchas veces no cae nada (ver SENSITIVITY_STATS).
    watch: 'Condiciones para granizo',
    protect: 'Peligro de granizo',
  },
  weakSignals: 'Señales débiles de granizo',
  sensitivityNames: { sensitive: 'Cualquier señal', balanced: 'Equilibrado', strict: 'Solo señales fuertes' },
  sensitivitySummary: { sensitive: 'Más avisos, más falsas alarmas.', balanced: 'Recomendado.', strict: 'Menos avisos, alguna se escapa.' },
  combineRule: {
    either: 'alcanza con que un modelo lo vea, vale el nivel más alto',
    both: 'chances reales solo si los dos lo ven; algunas chances si uno ve chances reales o los dos ven al menos algunas',
    'both-strict': 'los dos modelos lo tienen que ver, vale el nivel más bajo',
  },
  windowLabels: {
    tonight: 'Esta noche (20 a 8 h)',
    today: 'Hoy (hasta mañana a las 8 h)',
    tomorrow: 'Mañana (8 a 8 h)',
    next12h: 'Próximas 12 horas',
    next24h: 'Próximas 24 h',
  },
  titles: {
    weak: 'Hay algo de ambiente para piedra, pero ninguna señal fuerte.',
    protect: 'Chances reales de piedra en tu zona.',
    stormLow: 'Se forman tormentas en tu zona; pocas chances de piedra.',
    storm: 'Se forman tormentas en tu zona, pero no es clima de piedra.',
    watchAgree: 'Hay ingredientes para piedra en tu zona.',
    watchDisagree: 'Los modelos no se ponen de acuerdo.',
    calmLow: 'Pocas chances de piedra en tu zona.',
    calm: 'No es clima de piedra en tu zona.',
  },
  notes: { singleModel: 'un solo modelo', divided: 'modelos divididos', reservations: 'con reservas', usual: 'lo habitual con tormenta' },
  confidenceLabels: { low: 'Confianza baja', medium: 'Confianza media', high: 'Confianza alta' },
  usual: {
    strong: 'Es lo habitual.',
    text: (x) =>
      `Así sale en ${x >= 0.95 ? 'casi todos los' : `${tenths(x)} de cada 10`} días de tormenta. No es para correr: es para tener pensado dónde guardarlo.`,
  },
  inumet: { strong: 'Mirá también INUMET.', protect: 'Esto no reemplaza los avisos oficiales.', storm: 'Una tormenta puede traer lluvia fuerte, rayos o viento.' },
  reason: {
    onlyModel: (m) => `Solo respondió ${m}: no hay con qué contrastar`,
    disagree: 'Los modelos no coinciden: te damos el punto medio',
    agree: 'Los modelos coinciden',
    warm: 'Entre octubre y marzo el pronóstico distingue poco granizo de lluvia',
  },
  reasons: {
    GOOD_HAIL_GROWTH: 'El aire se enfría rápido con la altura: buenas condiciones para que crezca el granizo',
    POOR_HAIL_GROWTH: 'El aire no se enfría lo suficiente con la altura para piedras grandes',
    STRONG_STORM_POTENTIAL: 'Energía y viento en altura alcanzan para tormentas fuertes y organizadas',
    MODERATE_STORM_POTENTIAL: 'Energía y viento moderados para tormentas organizadas',
    WEAK_STORM_POTENTIAL: 'Poca energía o poco viento para tormentas fuertes',
    HIGH_SHIP: 'El índice de granizo significativo (SHIP) está elevado',
    MODEL_CONVECTION: 'El modelo forma tormentas en la zona',
    NO_MODEL_CONVECTION: 'El modelo no forma tormentas en la zona (el disparo es lo más incierto)',
    HIGH_FREEZING_LEVEL: 'Nivel de congelamiento alto: el granizo chico se derrite antes de llegar',
    WARM_SEASON:
      'Entre octubre y marzo, el pronóstico distingue poco una tormenta con granizo de una con lluvia: mirá el cielo y las alertas',
    MODELS_AGREE: 'Los dos modelos (GFS y ECMWF) coinciden',
    MODELS_DISAGREE: 'Los modelos no coinciden: tomalo con pinzas',
  },
  now: 'Ahora',
  nowInText: 'ahora',
  shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  moment: (part, days, wd) => {
    const p = ['madrugada', 'mañana', 'tarde', 'noche'][part];
    if (days <= 0) return `esta ${p}`;
    if (days === 1) return `mañana de ${p}`;
    return `el ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][wd]} de ${p}`;
  },
  watchText: (worst, m) => `${worst === 2 ? 'Peligro de granizo' : 'Condiciones para granizo'} ${m.join(' y ')}.`,
  tech: {
    zone: 'Zona',
    zoneValue: '~40 km alrededor del lugar',
    peak: 'Momento más favorable',
    peakValue: (t) => `${t} h`,
    mucape: 'Energía (MUCAPE)',
    shear: 'Viento en altura 0–6 km',
    lapse: 'Enfriamiento 700–500 hPa',
    wmaxshear: 'Energía × viento',
    freezing: 'Nivel de 0 °C',
    showers: 'Lluvia convectiva máx.',
    source: 'Fuente',
    sourceValue: (s, t, v) => `${s} vía Open-Meteo · ${t} · motor v${v}`,
  },
  rules: {
    lapse: 'El aire se enfría rápido con la altura (700–500 hPa)',
    wmaxshear: 'Energía × viento (WMAXSHEAR)',
    trigger: 'El modelo forma tormentas en la ventana',
    wmaxshearThreshold: (w, p) => `≥ ${w} algunas · ≥ ${p} reales`,
    wmaxshearSame: (p) => `≥ ${p} algunas y reales`,
    triggerThreshold: (s, p) => `lluvia convectiva ≥ ${s} o total ≥ ${p} mm/h`,
  },
  combination: {
    single: (pm) => `Un solo modelo disponible (${pm}): su nivel es el resultado.`,
    multi: (pm, name, rule, level) => `${pm}. Regla de «${name}»: ${rule}. → ${level}.`,
    storm: ' Sin ambiente de granizo, pero el modelo forma tormentas en la zona: se avisa la tormenta.',
  },
  confidenceWhy: {
    warm: 'Entre octubre y marzo la confianza es siempre baja: en la prueba histórica el ambiente no distinguió granizo de lluvia.',
    single: 'Con un solo modelo no hay con qué contrastar → baja.',
    agree: 'Abril–septiembre y los modelos coinciden → media. No damos "alta": la prueba histórica no lo justifica.',
    disagree: 'Los modelos no coinciden → baja.',
  },
  validation: (name, s, pct) => {
    const n = (x: number) => (x >= 0.95 ? 'casi todas las' : `~${tenths(x)} de cada 10`);
    return `Reglas calibradas con granizadas y días de tormenta de Uruguay 2021–2024 y probadas en 2025–2026. Con «${name}», "Chances reales" avisó en ${n(s.protect.hit)} granizadas, con ~${pct(s.protect.falseAlarm)} de falsas alarmas en días de tormenta; "Algunas chances" o más, en ${n(s.watch.hit)} granizadas, con ~${pct(s.watch.falseAlarm)}. Es un motor de reglas, sin IA.`;
  },
  disclaimer:
    'Habla de una zona de ~40 km, no de tu techo. "Muy pocas chances" no significa imposible. Mirá siempre las alertas oficiales de INUMET.',
};

const en: PresenterText = {
  locale: 'en',
  levelNames: { calm: 'Very low chance', storm: 'Very low chance', watch: 'Some chance', protect: 'Real chance' },
  hailStatus: { calm: 'No signs of hail', storm: 'Storms, no signs of hail', watch: 'Conditions for hail', protect: 'Hail danger' },
  weakSignals: 'Weak signs of hail',
  sensitivityNames: { sensitive: 'Any signal', balanced: 'Balanced', strict: 'Strong signals only' },
  sensitivitySummary: { sensitive: 'More alerts, more false alarms.', balanced: 'Recommended.', strict: 'Fewer alerts, some may slip through.' },
  combineRule: {
    either: 'one model seeing it is enough, the higher level wins',
    both: 'real chance only if both see it; some chance if one sees a real chance or both see at least some',
    'both-strict': 'both models have to see it, the lower level wins',
  },
  windowLabels: {
    tonight: 'Tonight (20:00 to 08:00)',
    today: 'Today (until 08:00 tomorrow)',
    tomorrow: 'Tomorrow (08:00 to 08:00)',
    next12h: 'Next 12 hours',
    next24h: 'Next 24 h',
  },
  titles: {
    weak: "There's some hail-friendly air, but no strong signal.",
    protect: 'Real chance of hail in your area.',
    stormLow: 'Storms are forming in your area; low chance of hail.',
    storm: "Storms are forming in your area, but it isn't hail weather.",
    watchAgree: 'The ingredients for hail are there in your area.',
    watchDisagree: "The models don't agree.",
    calmLow: 'Low chance of hail in your area.',
    calm: "It isn't hail weather in your area.",
  },
  notes: { singleModel: 'one model only', divided: 'models split', reservations: 'with caveats', usual: 'usual with storms' },
  confidenceLabels: { low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' },
  usual: {
    strong: "It's the usual.",
    text: (x) =>
      `It comes out like this on ${x >= 0.95 ? 'almost all' : `${tenths(x)} in 10`} storm days. No need to rush: just have a place in mind to put the car.`,
  },
  inumet: { strong: 'Check INUMET too.', protect: "This doesn't replace official warnings.", storm: 'A storm can bring heavy rain, lightning or wind.' },
  reason: {
    onlyModel: (m) => `Only ${m} responded: nothing to compare against`,
    disagree: "The models don't agree: we give you the middle ground",
    agree: 'The models agree',
    warm: 'Between October and March the forecast barely tells hail from rain',
  },
  reasons: {
    GOOD_HAIL_GROWTH: 'The air cools quickly with height: good conditions for hail to grow',
    POOR_HAIL_GROWTH: "The air doesn't cool enough with height for large hailstones",
    STRONG_STORM_POTENTIAL: 'Energy and upper-level wind are enough for strong, organized storms',
    MODERATE_STORM_POTENTIAL: 'Moderate energy and wind for organized storms',
    WEAK_STORM_POTENTIAL: 'Little energy or wind for strong storms',
    HIGH_SHIP: 'The significant hail parameter (SHIP) is high',
    MODEL_CONVECTION: 'The model forms storms in the area',
    NO_MODEL_CONVECTION: "The model doesn't form storms in the area (the trigger is the most uncertain part)",
    HIGH_FREEZING_LEVEL: 'High freezing level: small hail melts before reaching the ground',
    WARM_SEASON:
      'Between October and March, the forecast barely tells a hailstorm from a rainstorm: watch the sky and the warnings',
    MODELS_AGREE: 'Both models (GFS and ECMWF) agree',
    MODELS_DISAGREE: "The models don't agree: take it with a grain of salt",
  },
  now: 'Now',
  nowInText: 'now',
  shortDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  moment: (part, days, wd) => {
    const day = days <= 0 ? '' : days === 1 ? 'tomorrow' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd];
    if (!day) return ['in the early hours', 'this morning', 'this afternoon', 'tonight'][part];
    return part === 0 ? `early ${day}` : `${day} ${['', 'morning', 'afternoon', 'night'][part]}`;
  },
  watchText: (worst, m) => `${worst === 2 ? 'Hail danger' : 'Conditions for hail'} ${m.join(' and ')}.`,
  tech: {
    zone: 'Area',
    zoneValue: '~40 km around the place',
    peak: 'Most favorable time',
    peakValue: (t) => t,
    mucape: 'Energy (MUCAPE)',
    shear: 'Upper-level wind 0–6 km',
    lapse: 'Cooling 700–500 hPa',
    wmaxshear: 'Energy × wind',
    freezing: '0 °C level',
    showers: 'Max. convective rain',
    source: 'Source',
    sourceValue: (s, t, v) => `${s} via Open-Meteo · ${t} · engine v${v}`,
  },
  rules: {
    lapse: 'The air cools quickly with height (700–500 hPa)',
    wmaxshear: 'Energy × wind (WMAXSHEAR)',
    trigger: 'The model forms storms in the window',
    wmaxshearThreshold: (w, p) => `≥ ${w} some · ≥ ${p} real`,
    wmaxshearSame: (p) => `≥ ${p} some and real`,
    triggerThreshold: (s, p) => `convective rain ≥ ${s} or total ≥ ${p} mm/h`,
  },
  combination: {
    single: (pm) => `Only one model available (${pm}): its level is the result.`,
    multi: (pm, name, rule, level) => `${pm}. "${name}" rule: ${rule}. → ${level}.`,
    storm: ' No hail environment, but the model forms storms in the area: the storm is flagged.',
  },
  confidenceWhy: {
    warm: 'Between October and March confidence is always low: in the historical test the environment did not tell hail from rain.',
    single: 'With only one model there is nothing to compare against → low.',
    agree: 'April–September and the models agree → medium. We don\'t give "high": the historical test doesn\'t justify it.',
    disagree: "The models don't agree → low.",
  },
  validation: (name, s, pct) => {
    const n = (x: number) => (x >= 0.95 ? 'almost all' : `~${tenths(x)} in 10`);
    return `Rules calibrated on hailstorms and storm days in Uruguay 2021–2024 and tested on 2025–2026. With "${name}", "Real chance" flagged ${n(s.protect.hit)} hailstorms, with ~${pct(s.protect.falseAlarm)} false alarms on storm days; "Some chance" or higher, ${n(s.watch.hit)} hailstorms, with ~${pct(s.watch.falseAlarm)}. It's a rule-based engine, no AI.`;
  },
  disclaimer:
    'It covers an area of ~40 km, not your roof. "Very low chance" doesn\'t mean impossible. Always check the official INUMET warnings.',
};

// Suajili: "mvua ya mawe" es granizo; "dhoruba", tormenta. Las horas van en formato de 24 h, no en la hora suajili.
const sw: PresenterText = {
  locale: 'sw-KE',
  levelNames: { calm: 'Uwezekano mdogo sana', storm: 'Uwezekano mdogo sana', watch: 'Uwezekano fulani', protect: 'Uwezekano halisi' },
  hailStatus: {
    calm: 'Hakuna dalili za mvua ya mawe',
    storm: 'Dhoruba, bila dalili za mvua ya mawe',
    watch: 'Hali zinafaa mvua ya mawe',
    protect: 'Hatari ya mvua ya mawe',
  },
  weakSignals: 'Dalili hafifu za mvua ya mawe',
  sensitivityNames: { sensitive: 'Dalili yoyote', balanced: 'Wastani', strict: 'Dalili kali tu' },
  sensitivitySummary: {
    sensitive: 'Tahadhari zaidi, kengele za uongo zaidi.',
    balanced: 'Inapendekezwa.',
    strict: 'Tahadhari chache, baadhi zinaweza kupita.',
  },
  combineRule: {
    either: 'inatosha modeli moja ikiona, kiwango cha juu ndicho kinachotumika',
    both: 'uwezekano halisi tu ikiwa modeli zote mbili zinauona; uwezekano fulani ikiwa moja inaona uwezekano halisi au zote mbili zinaona angalau uwezekano fulani',
    'both-strict': 'modeli zote mbili lazima zione, kiwango cha chini ndicho kinachotumika',
  },
  windowLabels: {
    tonight: 'Usiku wa leo (20:00 hadi 08:00)',
    today: 'Leo (hadi kesho 08:00)',
    tomorrow: 'Kesho (08:00 hadi 08:00)',
    next12h: 'Saa 12 zijazo',
    next24h: 'Saa 24 zijazo',
  },
  titles: {
    weak: 'Kuna hali kidogo ya mvua ya mawe, lakini hakuna dalili kali.',
    protect: 'Uwezekano halisi wa mvua ya mawe katika eneo lako.',
    stormLow: 'Dhoruba zinatokea katika eneo lako; uwezekano mdogo wa mvua ya mawe.',
    storm: 'Dhoruba zinatokea katika eneo lako, lakini si hali ya mvua ya mawe.',
    watchAgree: 'Kuna viambato vya mvua ya mawe katika eneo lako.',
    watchDisagree: 'Modeli hazikubaliani.',
    calmLow: 'Uwezekano mdogo wa mvua ya mawe katika eneo lako.',
    calm: 'Si hali ya mvua ya mawe katika eneo lako.',
  },
  notes: { singleModel: 'modeli moja tu', divided: 'modeli zinatofautiana', reservations: 'kwa tahadhari', usual: 'kawaida wakati wa dhoruba' },
  confidenceLabels: { low: 'Uhakika mdogo', medium: 'Uhakika wa wastani', high: 'Uhakika mkubwa' },
  usual: {
    strong: 'Ni kawaida.',
    text: (x) =>
      `Hutokea hivi katika ${x >= 0.95 ? 'karibu siku zote' : `siku ${tenths(x)} kati ya 10`} za dhoruba. Si jambo la kukimbilia: ni kuwa na mahali pa kuliweka gari akilini.`,
  },
  inumet: { strong: 'Angalia pia INUMET.', protect: 'Hii haichukui nafasi ya tahadhari rasmi.', storm: 'Dhoruba inaweza kuleta mvua kubwa, radi au upepo.' },
  reason: {
    onlyModel: (m) => `Ni ${m} pekee iliyojibu: hakuna cha kulinganisha`,
    disagree: 'Modeli hazikubaliani: tunakupa kiwango cha kati',
    agree: 'Modeli zinakubaliana',
    warm: 'Kati ya Oktoba na Machi utabiri hautofautishi vizuri mvua ya mawe na mvua ya kawaida',
  },
  reasons: {
    GOOD_HAIL_GROWTH: 'Hewa inapoa haraka kadiri inavyopanda juu: hali nzuri kwa mvua ya mawe kukua',
    POOR_HAIL_GROWTH: 'Hewa haipoi vya kutosha kadiri inavyopanda juu kwa mawe makubwa',
    STRONG_STORM_POTENTIAL: 'Nishati na upepo wa juu vinatosha kwa dhoruba kali zilizopangika',
    MODERATE_STORM_POTENTIAL: 'Nishati na upepo wa wastani kwa dhoruba zilizopangika',
    WEAK_STORM_POTENTIAL: 'Nishati au upepo mdogo kwa dhoruba kali',
    HIGH_SHIP: 'Kipimo cha mvua kubwa ya mawe (SHIP) kiko juu',
    MODEL_CONVECTION: 'Modeli inaonyesha dhoruba katika eneo hili',
    NO_MODEL_CONVECTION: 'Modeli haionyeshi dhoruba katika eneo hili (kuanza kwa dhoruba ndiko kusikotabirika zaidi)',
    HIGH_FREEZING_LEVEL: 'Kiwango cha kuganda kiko juu: mawe madogo huyeyuka kabla ya kufika ardhini',
    WARM_SEASON:
      'Kati ya Oktoba na Machi, utabiri hautofautishi vizuri dhoruba yenye mvua ya mawe na yenye mvua tu: angalia anga na tahadhari',
    MODELS_AGREE: 'Modeli zote mbili (GFS na ECMWF) zinakubaliana',
    MODELS_DISAGREE: 'Modeli hazikubaliani: lichukulie kwa tahadhari',
  },
  now: 'Sasa',
  nowInText: 'sasa',
  shortDays: ['Jpi', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Iju', 'Jmo'],
  moment: (part, days, wd) => {
    const p = ['alfajiri', 'asubuhi', 'mchana', 'usiku'][part];
    if (days <= 0) return `leo ${p}`;
    if (days === 1) return `kesho ${p}`;
    return `${['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'][wd]} ${p}`;
  },
  watchText: (worst, m) => `${worst === 2 ? 'Hatari ya mvua ya mawe' : 'Hali za mvua ya mawe'} ${m.join(' na ')}.`,
  tech: {
    zone: 'Eneo',
    zoneValue: '~km 40 kuzunguka mahali',
    peak: 'Wakati unaofaa zaidi',
    peakValue: (t) => t,
    mucape: 'Nishati (MUCAPE)',
    shear: 'Upepo wa juu km 0–6',
    lapse: 'Kupoa 700–500 hPa',
    wmaxshear: 'Nishati × upepo',
    freezing: 'Kiwango cha 0 °C',
    showers: 'Mvua ya dhoruba ya juu zaidi',
    source: 'Chanzo',
    sourceValue: (s, t, v) => `${s} kupitia Open-Meteo · ${t} · injini v${v}`,
  },
  rules: {
    lapse: 'Hewa inapoa haraka kadiri inavyopanda (700–500 hPa)',
    wmaxshear: 'Nishati × upepo (WMAXSHEAR)',
    trigger: 'Modeli inaonyesha dhoruba katika kipindi hiki',
    wmaxshearThreshold: (w, p) => `≥ ${w} fulani · ≥ ${p} halisi`,
    wmaxshearSame: (p) => `≥ ${p} fulani na halisi`,
    triggerThreshold: (s, p) => `mvua ya dhoruba ≥ ${s} au jumla ≥ ${p} mm/saa`,
  },
  combination: {
    single: (pm) => `Modeli moja tu inapatikana (${pm}): kiwango chake ndicho matokeo.`,
    multi: (pm, name, rule, level) => `${pm}. Kanuni ya «${name}»: ${rule}. → ${level}.`,
    storm: ' Hakuna hali ya mvua ya mawe, lakini modeli inaonyesha dhoruba katika eneo: tunataja dhoruba.',
  },
  confidenceWhy: {
    warm: 'Kati ya Oktoba na Machi uhakika huwa mdogo kila mara: katika jaribio la kihistoria hali ya hewa haikutofautisha mvua ya mawe na mvua.',
    single: 'Kwa modeli moja tu hakuna cha kulinganisha → mdogo.',
    agree: 'Aprili–Septemba na modeli zinakubaliana → wastani. Hatutoi "mkubwa": jaribio la kihistoria halithibitishi.',
    disagree: 'Modeli hazikubaliani → mdogo.',
  },
  validation: (name, s, pct) => {
    const n = (x: number) => (x >= 0.95 ? 'karibu yote' : `~${tenths(x)} kati ya 10`);
    return `Kanuni zimepimwa kwa matukio ya mvua ya mawe na siku za dhoruba nchini Uruguay 2021–2024 na kujaribiwa 2025–2026. Kwa «${name}», "Uwezekano halisi" ulitahadharisha ${n(s.protect.hit)} ya matukio ya mvua ya mawe, na ~${pct(s.protect.falseAlarm)} ya kengele za uongo katika siku za dhoruba; "Uwezekano fulani" au zaidi, ${n(s.watch.hit)}, na ~${pct(s.watch.falseAlarm)}. Ni injini ya kanuni, bila AI.`;
  },
  disclaimer:
    'Inahusu eneo la ~km 40, si paa lako. "Uwezekano mdogo sana" haimaanishi haiwezekani. Daima angalia tahadhari rasmi za INUMET.',
};

export const TEXT: Record<Lang, PresenterText> = { es, en, sw };
