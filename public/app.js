// Cubierto — PWA. Abre directo con un resultado (donde estás o el último lugar), sin pasos previos.
import { LANGS, UI } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Almacenamiento local (solo en este teléfono) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // modo privado o almacenamiento bloqueado: la app sigue funcionando sin recordar
    }
  },
};
const K = { places: 'hg.places', useGps: 'hg.useGps', lastPlace: 'hg.lastPlace', installed: 'hg.installed', sensitivity: 'hg.sensitivity', lang: 'hg.lang' };

// ---------- Estado ----------
// El resultado vale para las próximas 24 h (ver src/windows.ts); las horas se ven en una tira que se desliza.

// Grado de alerta: cuánta señal hace falta para avisar. El motor calcula los tres; acá se elige cuál mostrar.
// "Cualquier señal" ya no se ofrece: quien la tenía guardada vuelve a "Equilibrado".
const SENSITIVITIES = ['balanced', 'strict'];
/** Hacia dónde apunta la aguja del ícono: a la derecha, más sensible (avisa más). */
const SENSITIVITY_NEEDLE = { balanced: 'M12 14V8', strict: 'M12 14L6.8 11' };
const sensitivity = () => {
  const s = store.get(K.sensitivity, 'balanced');
  return SENSITIVITIES.includes(s) ? s : 'balanced';
};

// Idioma: español (el original), inglés y suajili (Kenia). Los textos del resultado vienen del motor en los tres idiomas,
// así que cambiar de idioma no vuelve a consultar el pronóstico.
const lang = () => {
  const l = store.get(K.lang, 'es');
  return UI[l] ? l : 'es';
};
const ui = () => UI[lang()];

const state = {
  view: 'loading', // result | loading | locating | error | places
  placeId: null,
  stripX: 0, // cuánto se deslizó la tira de horas (se conserva al redibujar)
  result: null, // { sensitive, balanced, strict }: el mismo pronóstico con cada grado
  error: null,
  techOpen: false,
  adding: null, // null | { lat, lon } mientras se nombra un lugar nuevo
  placesStatus: '', // clave de ui().status
};

/** Banderas de desarrollo (las activa la botonera de dev.js, solo en local). */
export const devFlags = { offline: false, denyLocation: false };

// Los lugares de la versión anterior no tenían id: se les asigna uno estable a partir del nombre.
const savedPlaces = () => store.get(K.places, []).map((p) => (p.id ? p : { ...p, id: `p-${p.name}` }));
const useGps = () => store.get(K.useGps, true);
function allPlaces() {
  const list = useGps() ? [{ id: 'gps', name: ui().myLocation, short: ui().myLocation }] : [];
  return [...list, ...savedPlaces().map((p) => ({ ...p, short: p.name }))];
}
function currentPlace() {
  return allPlaces().find((p) => p.id === state.placeId) ?? allPlaces()[0] ?? null;
}

// ---------- Datos ----------
function getPosition() {
  return new Promise((resolve, reject) => {
    if (devFlags.denyLocation) return reject({ code: 1 });
    if (!('geolocation' in navigator)) return reject({ code: 2 });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

// El motor corre en el teléfono (engine.js, empaquetado desde src/browser.ts).
let enginePromise = null;
const loadEngine = () => (enginePromise ??= import('/engine.js'));
const ERROR_VIEWS = { outside: 'outside', limit: 'limit', offline: 'offline', slow: 'slow', server: 'server' };

let requestId = 0;
export async function consult() {
  const place = currentPlace();
  const id = ++requestId;
  state.techOpen = false;
  state.stripX = 0;
  if (!place) {
    state.view = 'places';
    state.placesStatus = 'addPlace';
    return render();
  }
  store.set(K.lastPlace, place.id);
  let coords = place;
  if (place.id === 'gps') {
    state.view = 'locating';
    render();
    try {
      coords = await getPosition();
    } catch (err) {
      if (id !== requestId) return;
      return showError(err?.code === 1 ? 'denied' : 'nolocation');
    }
  }
  if (id !== requestId) return;
  state.view = 'loading';
  render();
  try {
    if (devFlags.offline || !navigator.onLine) throw { code: 'offline' };
    const engine = await loadEngine();
    const views = await engine.assessHere(coords.lat, coords.lon, 'next24h');
    if (id !== requestId) return;
    showResult(views);
  } catch (err) {
    if (id !== requestId) return;
    // Si ni siquiera cargó el motor, es falta de conexión.
    showError(ERROR_VIEWS[err?.code] ?? (err instanceof TypeError ? 'offline' : 'server'));
  }
}

/** `views`: el resultado en cada idioma y con cada grado de alerta ({ es: { sensitive, balanced, strict }, en, sw }). */
export function showResult(views) {
  // Justo después de publicar, el navegador puede tener un engine.js viejo en caché que devuelve solo español
  // (con grados, o un solo resultado sin selector): se muestra ese en vez de romper la pantalla.
  if (views?.level) views = { es: { balanced: views } };
  else if (views && !views.es) views = { es: views };
  state.view = 'result';
  state.result = views;
  state.stripX = 0;
  render();
}
const currentResult = () => {
  const byLang = state.result?.[lang()] ?? state.result?.es;
  return byLang?.[sensitivity()] ?? byLang?.balanced ?? null;
};
export function showError(kind) {
  state.view = 'error';
  state.error = kind;
  render();
}
export function showView(view) {
  state.view = view;
  render();
}

// ---------- Errores ----------
function errorCopy(kind) {
  const u = ui();
  const first = savedPlaces()[0];
  const usePlace = first ? { label: u.use(first.name), action: () => selectPlace(first.id) } : null;
  const retry = { label: u.retry, action: consult };
  const marks = { offline: '–', denied: '?', nolocation: '?', outside: '×', limit: '~', slow: '–', server: '!', locating: '…' };
  const ctas = {
    offline: { cta: retry },
    denied: { cta: usePlace ?? retry, cta2: { label: u.places, action: () => showView('places') } },
    nolocation: { cta: retry, cta2: usePlace },
    outside: { cta: { label: u.chooseOther, action: () => showView('places') } },
    limit: { cta: retry },
    slow: { cta: retry },
    server: { cta: retry },
    // No es un error, pero comparte el molde: mientras el GPS responde.
    locating: { cta: usePlace },
  };
  const k = u.err[kind] ? kind : 'server';
  const { cat, title, body } = u.err[k];
  return { mark: marks[k], cat, title, body: typeof body === 'function' ? body(first?.name) : body, ...ctas[k] };
}

// ---------- Render ----------
// Ícono del grado de alerta: un medidor con la aguja según el grado (no una campana: no es una notificación).
const gauge = (sens) =>
  `<svg class="gauge" viewBox="0 0 24 16" aria-hidden="true"><path d="M3 14a9 9 0 0 1 18 0"/><path d="${SENSITIVITY_NEEDLE[sens]}"/><circle cx="12" cy="14" r="1.4"/></svg>`;

function renderPlacesBar() {
  const bar = $('#places-bar');
  bar.setAttribute('aria-label', ui().placeNav);
  const show = ['result', 'loading', 'locating'].includes(state.view) && allPlaces().length > 0;
  bar.hidden = !show;
  if (!show) return;
  const current = currentPlace();
  bar.innerHTML =
    allPlaces()
      .map((p) => `<button type="button" data-place="${esc(p.id)}" aria-pressed="${p.id === current?.id}">${esc(p.short)}</button>`)
      .join('') + `<button type="button" class="more" data-go="places" aria-label="${esc(ui().places)}">⋯</button>`;
}

function renderResult(r) {
  const u = ui();
  document.body.dataset.level = r.level;
  document.title = `${r.levelName} · ${r.hailStatus} — Cubierto`;
  const models = r.models
    .map((m) => `<span class="conf-model"><span class="mini-orb ${m.level}"></span><span class="mono">${esc(m.model)}</span> ${esc(m.levelName)}</span>`)
    .join('');
  return `
    <section class="hero" aria-label="${esc(u.result)}">
      <div class="shield" aria-hidden="true"><car-shield level="${esc(r.level)}"></car-shield></div>
      <div class="hero-text">
        <div class="kicker">${esc(r.window.label)}</div>
        <h1 class="level">${esc(r.levelName)}</h1>
        <p class="hail">${esc(r.hailStatus)}</p>
        <div class="chips">
          ${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}
          ${r.sensitivityOptions ? `<button type="button" class="sens-gauge" data-open="sensitivity" aria-haspopup="dialog" aria-label="${esc(u.alertDegree)}: ${esc(r.sensitivityName)}. ${esc(u.change)}" title="${esc(r.sensitivityName)}">${gauge(r.sensitivity)}</button>` : ''}
        </div>
      </div>
    </section>

    ${renderHours(r)}

    <section class="conf" aria-label="${esc(r.confidenceLabel)}">
      <div class="conf-row">
        <span class="conf-label">${esc(r.confidenceLabel)}</span>
        <span class="dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= r.confidenceDots ? 'on' : ''}"></i>`).join('')}</span>
      </div>
      ${models ? `<div class="conf-models">${models}</div>` : ''}
      ${r.confidenceReason ? `<p class="conf-reason">${esc(r.confidenceReason)}</p>` : ''}
    </section>

    <section class="card why">
      <h2 class="eyebrow">${esc(u.explanation)}</h2>
      <p class="lead">${esc(r.title)}</p>
      ${r.why.map((y) => `<p>${esc(y)}</p>`).join('')}
      ${r.notices.map((x) => `<p class="notice"><strong>${esc(x.strong)}</strong> ${esc(x.text)}</p>`).join('')}
    </section>

    <section class="card tech">
      <button type="button" data-toggle="tech" aria-expanded="${state.techOpen}"><span>${esc(u.algorithm)}</span><span>${state.techOpen ? '−' : '+'}</span></button>
      ${state.techOpen ? renderTech(r) : ''}
    </section>

    ${isInstalled() ? '' : `<button type="button" class="install" data-install><span>${esc(u.install)}</span><span aria-hidden="true">↓</span></button>`}

    <p class="fine">${esc(u.fine1)} <a href="https://www.inumet.gub.uy/alerta" target="_blank" rel="noopener">INUMET</a><br />
    ${esc(u.fine2)}</p>
    <p class="fine contact"><a href="mailto:pablo.j.manzoni@gmail.com?subject=Cubierto">${esc(u.contact)}</a></p>`;
}

// ---------- Horas: una tira que se desliza ----------
// Se ven unas 8 horas y la siguiente asoma cortada. Abajo, una barrita con las 24 h: la parte clara es lo que se ve
// y las marcas de color, las horas de riesgo (se ven aunque nadie deslice). Con mouse o teclado, flechas a los costados.
function renderHours(r) {
  const n = r.hours.length;
  // Horas marcadas seguidas, para dibujarlas en la barrita.
  const runs = [];
  r.hours.forEach((h, i) => {
    if (!h.level) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) {
      last.to = i;
      last.level = Math.max(last.level, h.level);
    } else runs.push({ from: i, to: i, level: h.level });
  });
  const pct = (x) => `${((x / n) * 100).toFixed(2)}%`;
  const u = ui();
  return `
    <section class="card hours-card" aria-label="${esc(u.hoursToWatch)}">
      <div class="strip-wrap">
        <div class="strip" aria-hidden="true">
          ${r.hours.map((h) => `<div class="hour l${h.level}${h.day ? ' newday' : ''}"><span class="day mono">${esc(h.day ?? '')}</span><i></i><span class="mono">${esc(h.label)}</span></div>`).join('')}
        </div>
        <button type="button" class="strip-arrow prev" data-strip="-1" aria-label="${esc(u.hoursPrev)}">‹</button>
        <button type="button" class="strip-arrow next" data-strip="1" aria-label="${esc(u.hoursNext)}">›</button>
      </div>
      <div class="track" aria-hidden="true">
        ${runs.map((x) => `<span class="track-mark ${x.level === 2 ? 'protect' : 'watch'}" style="left:${pct(x.from)};width:${pct(x.to - x.from + 1)}"></span>`).join('')}
        <span class="track-thumb"></span>
      </div>
      ${r.watchText ? `<p class="watch-text">${esc(r.watchText)}</p>` : ''}
    </section>`;
}

/** Acomoda la barrita, los difuminados y las flechas a lo que se ve de la tira. */
function updateStrip() {
  const strip = document.querySelector('.strip');
  if (!strip) return;
  const { scrollLeft: x, scrollWidth: w, clientWidth: v } = strip;
  const atStart = x <= 1;
  const atEnd = x + v >= w - 1;
  strip.classList.toggle('at-start', atStart);
  strip.classList.toggle('at-end', atEnd);
  const thumb = document.querySelector('.track-thumb');
  if (thumb) {
    thumb.style.left = `${(x / w) * 100}%`;
    thumb.style.width = `${(v / w) * 100}%`;
  }
  const prev = document.querySelector('.strip-arrow.prev');
  const next = document.querySelector('.strip-arrow.next');
  if (prev) prev.hidden = atStart;
  if (next) next.hidden = atEnd;
}

/** Avanza (1) o retrocede (-1) casi una pantalla de horas, animado para que se note que se movió. */
function stepStrip(dir) {
  const strip = document.querySelector('.strip');
  if (!strip) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  strip.scrollBy({ left: dir * strip.clientWidth * 0.85, behavior: smooth ? 'smooth' : 'auto' });
}

// Tocar la tira: mitad derecha avanza, mitad izquierda retrocede. Arrastrar sigue deslizando como siempre:
// el navegador no manda "click" después de un arrastre, así que acá solo llegan los toques.
document.addEventListener('click', (ev) => {
  const strip = ev.target.closest?.('.strip');
  if (!strip) return;
  const { left, width } = strip.getBoundingClientRect();
  stepStrip(ev.clientX < left + width / 2 ? -1 : 1);
});

// "scroll" no burbujea: se escucha en captura. Se guarda cuánto se deslizó para no perderlo al redibujar.
document.addEventListener(
  'scroll',
  (ev) => {
    if (!ev.target.classList?.contains('strip')) return;
    state.stripX = ev.target.scrollLeft;
    updateStrip();
  },
  true,
);

function renderTech(r) {
  const u = ui();
  const a = r.algorithm;
  const rules = a.rows
    .map(
      (row) => `
      <div class="rule">
        <div class="rule-head"><span>${esc(row.rule)}</span><span class="mono thr">${esc(row.threshold)}</span></div>
        <div class="rule-vals">${row.values
          .map((v) => `<span class="val mono ${v.pass ? 'pass' : 'fail'}">${esc(v.model)} ${esc(v.text)} <b aria-label="${v.pass ? u.pass : u.fail}">${esc(v.mark)}</b></span>`)
          .join('')}</div>
      </div>`,
    )
    .join('');
  return `
    <div class="tech-body">
      <h3 class="eyebrow">${esc(u.howDecided)}</h3>
      <p class="algo-note">${esc(u.algoIntro)}</p>
      ${rules}
      <p class="algo-note"><strong>${esc(u.combination)}</strong> ${esc(a.combination)}</p>
      <p class="algo-note"><strong>${esc(u.confidence)}</strong> ${esc(a.confidenceWhy)}</p>
      <h3 class="eyebrow">${esc(u.peakData)}</h3>
      <dl class="mono">${r.tech.map((t) => `<div><dt>${esc(t.k)}</dt><dd>${esc(t.v)}</dd></div>`).join('')}</dl>
      <p class="algo-note">${esc(a.validation)} <a href="${esc(a.moreUrl)}" target="_blank" rel="noopener">${esc(u.seeHow)}</a></p>
    </div>`;
}

function renderError(kind) {
  const e = errorCopy(kind);
  // Buscando el GPS: el logo late. Error: el logo apagado, con el símbolo del problema encima.
  const logo = kind === 'locating'
    ? '<div class="shield pulse" aria-hidden="true"><car-shield level="calm"></car-shield></div>'
    : `<div class="shield dim" aria-hidden="true"><car-shield level="calm"></car-shield><span class="badge">${esc(e.mark)}</span></div>`;
  return `
    <section class="error">
      ${logo}
      <div class="eyebrow">${esc(e.cat)}</div>
      <h1>${esc(e.title)}</h1>
      <p>${esc(e.body)}</p>
    </section>`;
}

function renderPlaces() {
  // "Mi ubicación" es un solo componente: el switch prende o apaga el GPS ahí mismo.
  const u = ui();
  const gpsOn = useGps();
  const gps = `
    <div class="place${gpsOn ? '' : ' off'}">
      <span class="mini-orb"></span>
      <div class="info"><span class="name" id="gps-label">${esc(u.myLocation)}</span><span class="addr mono">${esc(gpsOn ? u.gpsOn : u.gpsOff)}</span></div>
      <button type="button" class="switch" role="switch" aria-labelledby="gps-label" aria-checked="${gpsOn}" data-toggle="gps"></button>
    </div>`;
  const list = savedPlaces()
    .map(
      (p) => `<div class="place"><span class="mini-orb"></span><div class="info"><span class="name">${esc(p.name)}</span><span class="addr mono">${esc(`${p.lat.toFixed(2)}, ${p.lon.toFixed(2)} · ${u.approx}`)}</span></div><button type="button" class="del" data-delete="${esc(p.id)}" aria-label="${esc(u.del(p.name))}">×</button></div>`,
    )
    .join('');
  const add = state.adding
    ? `<form class="add-form" data-form="add"><input name="name" placeholder="${esc(u.placeholder)}" maxlength="24" required autofocus aria-label="${esc(u.placeName)}" /><button type="submit" class="cta" style="width:auto;height:50px;padding:0 22px;font-size:15px">${esc(u.save)}</button></form>`
    : `<button type="button" class="add" data-add>${esc(u.addHere)}</button>`;
  return `
    <section class="places">
      <button type="button" class="back" data-go="back">${esc(u.back)}</button>
      <h1>${esc(u.places)}</h1>
      ${gps}
      ${list}
      ${add}
      ${state.placesStatus ? `<p class="status">${esc(u.status[state.placesStatus])}</p>` : ''}
      <p class="fine">${esc(u.placesFine)}</p>
    </section>`;
}

function renderBottom() {
  const bottom = $('#bottom');
  if (state.view === 'error' || state.view === 'locating') {
    const e = errorCopy(state.view === 'locating' ? 'locating' : state.error);
    if (!e.cta) return void (bottom.innerHTML = '');
    bottom.innerHTML = `<div class="ctas">
      <button type="button" class="cta" data-cta="1">${esc(e.cta.label)}</button>
      ${e.cta2 ? `<button type="button" class="cta secondary" data-cta="2">${esc(e.cta2.label)}</button>` : ''}
    </div>`;
  } else {
    bottom.innerHTML = '';
  }
}

export function render() {
  document.documentElement.lang = ui().htmlLang;
  renderPlacesBar();
  renderLangBar();
  const screen = $('#screen');
  if (state.view === 'result' && state.result) {
    screen.innerHTML = renderResult(currentResult());
    const strip = screen.querySelector('.strip');
    if (strip) strip.scrollLeft = state.stripX;
    updateStrip();
  }
  else if (state.view === 'loading') screen.innerHTML = `<div class="loading" role="status"><div class="shield pulse" aria-hidden="true"><car-shield level="calm"></car-shield></div><p>${esc(ui().loading)}</p></div>`;
  else if (state.view === 'locating') screen.innerHTML = renderError('locating');
  else if (state.view === 'error') screen.innerHTML = renderError(state.error);
  else if (state.view === 'places') screen.innerHTML = renderPlaces();
  renderBottom();
}

// ---------- Instalar ----------
// Chrome/Edge/Android avisan con "beforeinstallprompt" y se puede instalar directo.
// Safari (iPhone/Mac) y Firefox no: ahí explicamos los pasos en un modal.
// Para ocultar el botón también en una pestaña común, recordamos si se instaló:
// - al instalar (o al abrirse como app) se marca;
// - si el navegador vuelve a ofrecer instalarla, es que no está instalada (o se desinstaló): se desmarca.
// Safari no avisa nada de esto, así que en iPhone/Mac el botón puede seguir apareciendo en el navegador.
let installPrompt = null;
const runningAsApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (runningAsApp()) store.set(K.installed, true);
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  installPrompt = ev;
  if (store.get(K.installed, false)) {
    store.set(K.installed, false);
    render();
  }
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  store.set(K.installed, true);
  render();
});

function isInstalled() {
  return runningAsApp() || store.get(K.installed, false);
}

function installSteps() {
  const m = ui().modal;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Edg\/|Android/.test(ua);
  if (iOS) return { intro: m.iosIntro, steps: m.iosSteps, note: safari ? '' : m.iosNote };
  if (android) return { intro: m.androidIntro, steps: m.androidSteps, note: '' };
  if (safari) return { intro: m.safariIntro, steps: m.safariSteps, note: '' };
  if (firefox) return { intro: m.firefoxIntro, steps: m.firefoxSteps, note: '' };
  return { intro: m.otherIntro, steps: m.otherSteps, note: '' };
}

export function openInstallModal() {
  const s = installSteps();
  const m = ui().modal;
  let dlg = document.getElementById('install-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'install-dialog';
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'install-title');
    document.body.append(dlg);
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close();
    });
  }
  dlg.innerHTML = `
    <div class="modal-body">
      <div class="modal-logo" aria-hidden="true"><car-shield level="calm"></car-shield></div>
      <h2 id="install-title">${esc(m.title)}</h2>
      <p>${esc(m.lead)}</p>
      <p class="modal-intro">${esc(s.intro)}</p>
      <ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${s.note ? `<p class="modal-note">${esc(s.note)}</p>` : ''}
      <button type="button" class="cta" data-close>${esc(m.ok)}</button>
    </div>`;
  dlg.showModal();
}

// ---------- Grado de alerta ----------
// Modal con los tres grados. Elegir uno cambia el resultado al instante (el motor ya calculó los tres) y se guarda.
export function openSensitivityModal() {
  const r = currentResult();
  if (!r?.sensitivityOptions) return;
  let dlg = document.getElementById('sensitivity-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'sensitivity-dialog';
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'sensitivity-title');
    document.body.append(dlg);
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg) dlg.close();
    });
    dlg.addEventListener('change', (ev) => {
      if (ev.target.name !== 'sensitivity' || !SENSITIVITIES.includes(ev.target.value)) return;
      store.set(K.sensitivity, ev.target.value);
      render();
    });
    // El botón que lo abrió se volvió a dibujar: el foco vuelve al nuevo.
    dlg.addEventListener('close', () => document.querySelector('[data-open="sensitivity"]')?.focus());
  }
  dlg.innerHTML = `
    <form class="modal-body" method="dialog">
      <h2 id="sensitivity-title">${esc(ui().alertDegree)}</h2>
      <div class="sens-options" role="radiogroup" aria-labelledby="sensitivity-title">
        ${r.sensitivityOptions
          .map(
            (o) => `
          <label class="sens-option">
            <input type="radio" name="sensitivity" value="${esc(o.id)}"${o.id === r.sensitivity ? ' checked' : ''} />
            <span class="sens-head">
              ${gauge(o.id)}
              <span class="sens-name">${esc(o.name)}</span>
            </span>
            <span class="sens-summary">${esc(o.summary)}</span>
          </label>`,
          )
          .join('')}
      </div>
      <button type="submit" class="cta">${esc(ui().done)}</button>
    </form>`;
  dlg.showModal();
}

async function install() {
  if (installPrompt) {
    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') store.set(K.installed, true);
    installPrompt = null;
    return render();
  }
  openInstallModal();
}

// ---------- Idioma ----------
// Selector discreto al pie. Los resultados ya vienen en los tres idiomas: se redibuja sin volver a consultar.
function renderLangBar() {
  const bar = $('#lang-bar');
  bar.setAttribute('aria-label', ui().languageLabel);
  const current = lang();
  bar.innerHTML = LANGS.map(
    ([id, name]) => `<button type="button" lang="${id}" data-lang="${id}" aria-pressed="${id === current}">${esc(name)}</button>`,
  ).join('');
}

function setLang(id) {
  if (!UI[id] || id === lang()) return;
  store.set(K.lang, id);
  // Los diálogos abiertos se arman al abrirlos: se cierran para no quedar en el idioma anterior.
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  render();
}

// ---------- Acciones ----------
function selectPlace(id) {
  state.placeId = id;
  consult();
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.lang) return setLang(t.dataset.lang);
  if (t.dataset.place) return selectPlace(t.dataset.place);
  if (t.dataset.strip) return stepStrip(Number(t.dataset.strip));
  if (t.dataset.go === 'places') return showView('places');
  if (t.dataset.go === 'back') {
    state.adding = null;
    state.placesStatus = '';
    return consult();
  }
  if (t.hasAttribute('data-install')) return install();
  if (t.dataset.open === 'sensitivity') return openSensitivityModal();
  if (t.dataset.toggle === 'tech') {
    state.techOpen = !state.techOpen;
    return render();
  }
  if (t.dataset.toggle === 'gps') {
    if (useGps()) {
      store.set(K.useGps, false);
      if (state.placeId === 'gps') state.placeId = null;
      state.placesStatus = '';
      return render();
    }
    // Al prender, pedimos la ubicación ya: si el navegador no la tiene, muestra el permiso.
    state.placesStatus = 'asking';
    render();
    try {
      await getPosition();
      store.set(K.useGps, true);
      state.placeId = 'gps';
      state.placesStatus = '';
    } catch (err) {
      state.placesStatus = err?.code === 1 ? 'deniedGps' : 'noLocation';
    }
    return render();
  }
  if (t.dataset.delete) {
    store.set(K.places, savedPlaces().filter((p) => p.id !== t.dataset.delete));
    if (state.placeId === t.dataset.delete) state.placeId = null;
    return render();
  }
  if (t.hasAttribute('data-add')) {
    state.placesStatus = 'searching';
    render();
    try {
      const pos = await getPosition();
      state.adding = { lat: Math.round(pos.lat * 100) / 100, lon: Math.round(pos.lon * 100) / 100 };
      state.placesStatus = 'naming';
    } catch (err) {
      state.placesStatus = err?.code === 1 ? 'deniedAdd' : 'noLocation';
    }
    return render();
  }
  if (t.dataset.cta) {
    const e = errorCopy(state.view === 'locating' ? 'locating' : state.error);
    const c = t.dataset.cta === '1' ? e.cta : e.cta2;
    return c?.action();
  }
});

document.addEventListener('submit', (ev) => {
  if (ev.target.dataset.form !== 'add') return;
  ev.preventDefault();
  const name = new FormData(ev.target).get('name')?.toString().trim();
  if (!name || !state.adding) return;
  const place = { id: `p${Date.now().toString(36)}`, name, ...state.adding };
  store.set(K.places, [...savedPlaces().filter((p) => p.name !== name), place]);
  state.adding = null;
  state.placesStatus = '';
  state.placeId = place.id;
  render();
});

// ---------- Inicio ----------
state.placeId = store.get(K.lastPlace, null);
if (!allPlaces().some((p) => p.id === state.placeId)) state.placeId = allPlaces()[0]?.id ?? null;
consult();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
