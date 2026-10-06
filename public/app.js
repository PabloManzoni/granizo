// Cubierto — PWA. Abre directo con un resultado (donde estás o el último lugar), sin pasos previos.
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
const K = { places: 'hg.places', useGps: 'hg.useGps', lastPlace: 'hg.lastPlace', installed: 'hg.installed' };

// ---------- Estado ----------
const WHENS = [
  { id: 'today', label: 'Hoy' },
  { id: 'tonight', label: 'Esta noche' },
  { id: 'tomorrow', label: 'Mañana' },
];
const defaultWhen = () => {
  const h = new Date().getHours();
  return h >= 14 || h < 6 ? 'tonight' : 'today';
};

const state = {
  view: 'loading', // result | loading | locating | error | places
  placeId: null,
  when: defaultWhen(),
  result: null,
  error: null,
  techOpen: false,
  adding: null, // null | { lat, lon } mientras se nombra un lugar nuevo
  placesStatus: '',
};

/** Banderas de desarrollo (las activa la botonera de dev.js, solo en local). */
export const devFlags = { offline: false, denyLocation: false };

// Los lugares de la versión anterior no tenían id: se les asigna uno estable a partir del nombre.
const savedPlaces = () => store.get(K.places, []).map((p) => (p.id ? p : { ...p, id: `p-${p.name}` }));
const useGps = () => store.get(K.useGps, true);
function allPlaces() {
  const list = useGps() ? [{ id: 'gps', name: 'Mi ubicación', short: 'Mi ubicación' }] : [];
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
const ERROR_VIEWS = { outside: 'outside', limit: 'limit', offline: 'offline', server: 'server' };

let requestId = 0;
export async function consult() {
  const place = currentPlace();
  const id = ++requestId;
  state.techOpen = false;
  if (!place) {
    state.view = 'places';
    state.placesStatus = 'Agregá un lugar o activá tu ubicación para empezar.';
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
    const view = await engine.assessHere(coords.lat, coords.lon, state.when);
    if (id !== requestId) return;
    showResult(view);
  } catch (err) {
    if (id !== requestId) return;
    // Si ni siquiera cargó el motor, es falta de conexión.
    showError(ERROR_VIEWS[err?.code] ?? (err instanceof TypeError ? 'offline' : 'server'));
  }
}

export function showResult(view) {
  state.view = 'result';
  state.result = view;
  // El selector de abajo siempre refleja la ventana del resultado que se muestra.
  if (WHENS.some((w) => w.id === view.window?.name)) state.when = view.window.name;
  render();
}
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
  const first = savedPlaces()[0];
  const usePlace = first ? { label: `Usar ${first.name}`, action: () => selectPlace(first.id) } : null;
  const retry = { label: 'Reintentar', action: consult };
  const E = {
    offline: { mark: '–', cat: 'Conexión', title: 'Sin conexión', body: 'No pudimos consultar el pronóstico. Revisá la conexión y probá de nuevo.', cta: retry },
    denied: {
      mark: '?', cat: 'Ubicación', title: 'No tenemos tu ubicación',
      body: first ? 'Está bien. Te contestamos para tus lugares guardados.' : 'Activá el permiso de ubicación del navegador para ver tu zona.',
      cta: usePlace ?? retry, cta2: { label: 'Lugares', action: () => showView('places') },
    },
    nolocation: { mark: '?', cat: 'Ubicación', title: 'No pudimos ubicarte', body: 'El GPS tardó demasiado. Probá de nuevo o elegí un lugar guardado.', cta: retry, cta2: usePlace },
    outside: { mark: '×', cat: 'Cobertura', title: 'Por ahora, solo Uruguay', body: 'Ese lugar queda fuera de la zona que miramos. Probá con un punto dentro del país.', cta: { label: 'Elegir otro lugar', action: () => showView('places') } },
    limit: { mark: '~', cat: 'Servicio', title: 'Mucha demanda', body: 'La fuente de datos llegó a su límite gratuito por ahora. Probá en un rato.', cta: retry },
    server: { mark: '!', cat: 'Servicio', title: 'No pudimos consultar', body: 'El problema es nuestro, no tuyo. Probá de nuevo en un rato.', cta: retry },
    // No es un error, pero comparte el molde: mientras el GPS responde.
    locating: { mark: '…', cat: 'Ubicación', title: 'Buscando dónde estás', body: first ? `Tarda unos segundos. Si preferís, mirá ${first.name}.` : 'Tarda unos segundos.', cta: usePlace },
  };
  return E[kind] ?? E.server;
}

// ---------- Render ----------
const WHEN_SHORT = { today: 'Hoy', tonight: 'Esta noche', tomorrow: 'Mañana' };

function renderPlacesBar() {
  const bar = $('#places-bar');
  const show = ['result', 'loading', 'locating'].includes(state.view) && allPlaces().length > 0;
  bar.hidden = !show;
  if (!show) return;
  const current = currentPlace();
  bar.innerHTML =
    allPlaces()
      .map((p) => `<button type="button" data-place="${esc(p.id)}" aria-pressed="${p.id === current?.id}">${esc(p.short)}</button>`)
      .join('') + `<button type="button" class="more" data-go="places" aria-label="Lugares">⋯</button>`;
}

function renderResult(r) {
  document.body.dataset.level = r.level;
  document.title = `${r.levelName} · ${r.hailStatus} — Cubierto`;
  const place = currentPlace();
  const models = r.models
    .map((m) => `<span class="conf-model"><span class="mini-orb ${m.level}"></span><span class="mono">${esc(m.model)}</span> ${esc(m.levelName)}</span>`)
    .join('');
  return `
    <section class="hero" aria-label="Resultado">
      <div class="shield" aria-hidden="true"><car-shield level="${esc(r.level)}"></car-shield></div>
      <div class="hero-text">
        <div class="kicker">${esc(place?.name ?? '')} · ${esc(WHEN_SHORT[r.window.name] ?? r.window.label)}</div>
        <h1 class="level">${esc(r.levelName)}</h1>
        <p class="hail">${esc(r.hailStatus)}</p>
        ${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}
      </div>
      <p class="title">${esc(r.title)}</p>
    </section>

    <section class="card why">
      <h2 class="eyebrow">Por qué</h2>
      ${r.why.map((y) => `<p>${esc(y)}</p>`).join('')}
      ${r.notices.map((x) => `<p class="notice"><strong>${esc(x.strong)}</strong> ${esc(x.text)}</p>`).join('')}
    </section>

    <section class="card">
      <h2 class="eyebrow">Horas a vigilar</h2>
      <div class="hours" aria-hidden="true">
        ${r.hours.map((h) => `<div class="hour l${h.level}"><i></i><span class="mono">${esc(h.label)}</span></div>`).join('')}
      </div>
      ${r.watchText ? `<p class="watch-text">${esc(r.watchText)}</p>` : ''}
    </section>

    <section class="conf" aria-label="${esc(r.confidenceLabel)}">
      <div class="conf-row">
        <span class="conf-label">${esc(r.confidenceLabel)}</span>
        <span class="dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= r.confidenceDots ? 'on' : ''}"></i>`).join('')}</span>
      </div>
      ${models ? `<div class="conf-models">${models}</div>` : ''}
      ${r.confidenceReason ? `<p class="conf-reason">${esc(r.confidenceReason)}</p>` : ''}
    </section>

    <section class="card tech">
      <button type="button" data-toggle="tech" aria-expanded="${state.techOpen}"><span>Algoritmo</span><span>${state.techOpen ? '−' : '+'}</span></button>
      ${state.techOpen ? renderTech(r) : ''}
    </section>

    ${isInstalled() ? '' : `<button type="button" class="install" data-install><span>Instalar aplicación</span><span aria-hidden="true">↓</span></button>`}

    <p class="fine">Zona de ~40 km, no tu techo · No reemplaza a <a href="https://www.inumet.gub.uy/alerta" target="_blank" rel="noopener">INUMET</a><br />
    Pronósticos GFS (NOAA) y ECMWF vía Open-Meteo (CC BY 4.0). Contiene datos de ECMWF.</p>
    <p class="fine contact"><a href="mailto:pablo.j.manzoni@gmail.com?subject=Cubierto">¿Ideas o dudas? Escribime</a></p>`;
}

function renderTech(r) {
  const a = r.algorithm;
  const rules = a.rows
    .map(
      (row) => `
      <div class="rule">
        <div class="rule-head"><span>${esc(row.rule)}</span><span class="mono thr">${esc(row.threshold)}</span></div>
        <div class="rule-vals">${row.values
          .map((v) => `<span class="val mono ${v.pass ? 'pass' : 'fail'}">${esc(v.model)} ${esc(v.text)} <b aria-label="${v.pass ? 'cumple' : 'no cumple'}">${esc(v.mark)}</b></span>`)
          .join('')}</div>
      </div>`,
    )
    .join('');
  return `
    <div class="tech-body">
      <h3 class="eyebrow">Cómo se decidió</h3>
      <p class="algo-note">Miramos 9 puntos en ~40 km, hora por hora, con cada modelo. En el momento más favorable:</p>
      ${rules}
      <p class="algo-note"><strong>Combinación.</strong> ${esc(a.combination)}</p>
      <p class="algo-note"><strong>Confianza.</strong> ${esc(a.confidenceWhy)}</p>
      <h3 class="eyebrow">Datos del momento más favorable</h3>
      <dl class="mono">${r.tech.map((t) => `<div><dt>${esc(t.k)}</dt><dd>${esc(t.v)}</dd></div>`).join('')}</dl>
      <p class="algo-note">${esc(a.validation)} <a href="${esc(a.moreUrl)}" target="_blank" rel="noopener">Ver cómo lo probamos</a></p>
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
  const gpsOn = useGps();
  const gps = `
    <div class="place${gpsOn ? '' : ' off'}">
      <span class="mini-orb"></span>
      <div class="info"><span class="name" id="gps-label">Mi ubicación</span><span class="addr mono">${gpsOn ? 'Donde estés, aproximada' : 'Apagada'}</span></div>
      <button type="button" class="switch" role="switch" aria-labelledby="gps-label" aria-checked="${gpsOn}" data-toggle="gps"></button>
    </div>`;
  const list = savedPlaces()
    .map(
      (p) => `<div class="place"><span class="mini-orb"></span><div class="info"><span class="name">${esc(p.name)}</span><span class="addr mono">${esc(`${p.lat.toFixed(2)}, ${p.lon.toFixed(2)} · aproximada`)}</span></div><button type="button" class="del" data-delete="${esc(p.id)}" aria-label="Borrar ${esc(p.name)}">×</button></div>`,
    )
    .join('');
  const add = state.adding
    ? `<form class="add-form" data-form="add"><input name="name" placeholder="Casa, Trabajo…" maxlength="24" required autofocus aria-label="Nombre del lugar" /><button type="submit" class="cta" style="width:auto;height:50px;padding:0 22px;font-size:15px">Guardar</button></form>`
    : `<button type="button" class="add" data-add>+ Guardar dónde estoy</button>`;
  return `
    <section class="places">
      <button type="button" class="back" data-go="back">‹ Volver</button>
      <h1>Lugares</h1>
      ${gps}
      ${list}
      ${add}
      ${state.placesStatus ? `<p class="status">${esc(state.placesStatus)}</p>` : ''}
      <p class="fine">Los lugares se guardan solo en este teléfono, redondeados a ~1 km.</p>
    </section>`;
}

function renderBottom() {
  const bottom = $('#bottom');
  if (['result', 'loading'].includes(state.view)) {
    const idx = WHENS.findIndex((w) => w.id === state.when);
    bottom.innerHTML = `
      <div class="when" role="radiogroup" aria-label="Cuándo">
        <div class="thumb" style="transform:translateX(${idx * 100}%)"></div>
        ${WHENS.map((w) => `<button type="button" role="radio" aria-checked="${w.id === state.when}" data-when="${w.id}">${w.label}</button>`).join('')}
      </div>`;
  } else if (state.view === 'error' || state.view === 'locating') {
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
  renderPlacesBar();
  const screen = $('#screen');
  if (state.view === 'result' && state.result) screen.innerHTML = renderResult(state.result);
  else if (state.view === 'loading') screen.innerHTML = `<div class="loading" role="status"><div class="shield pulse" aria-hidden="true"><car-shield level="calm"></car-shield></div><p>Consultando el pronóstico…</p></div>`;
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
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Edg\/|Android/.test(ua);
  if (iOS) {
    return {
      intro: 'En iPhone se instala desde el menú Compartir.',
      steps: ['Tocá Compartir (el cuadrado con la flecha hacia arriba).', 'Elegí "Agregar a inicio".', 'Confirmá con "Agregar".'],
      note: safari ? '' : 'Si no ves la opción, abrí esta página en Safari.',
    };
  }
  if (android) {
    return {
      intro: 'Tu navegador no ofrece instalarla directo, pero se puede desde su menú.',
      steps: ['Abrí el menú del navegador (⋮).', 'Elegí "Instalar app" o "Agregar a pantalla principal".'],
      note: '',
    };
  }
  if (safari) {
    return { intro: 'En Mac, Safari la agrega al Dock.', steps: ['En la barra de menú: Archivo → "Agregar al Dock".'], note: '' };
  }
  if (firefox) {
    return { intro: 'Firefox en computadora no instala aplicaciones web.', steps: ['Abrí esta página en Chrome, Edge o Safari y volvé a tocar "Instalar aplicación".'], note: '' };
  }
  return {
    intro: 'Tu navegador no ofrece instalarla directo desde acá.',
    steps: ['Buscá el ícono de instalar a la derecha de la barra de direcciones.', 'O abrí el menú del navegador y elegí "Instalar Cubierto".'],
    note: '',
  };
}

export function openInstallModal() {
  const s = installSteps();
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
      <h2 id="install-title">Instalar Cubierto</h2>
      <p>Queda en tu pantalla de inicio y se abre como una app, sin la barra del navegador.</p>
      <p class="modal-intro">${esc(s.intro)}</p>
      <ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${s.note ? `<p class="modal-note">${esc(s.note)}</p>` : ''}
      <button type="button" class="cta" data-close>Entendido</button>
    </div>`;
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

// ---------- Acciones ----------
function selectPlace(id) {
  state.placeId = id;
  consult();
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.place) return selectPlace(t.dataset.place);
  if (t.dataset.when) {
    state.when = t.dataset.when;
    return consult();
  }
  if (t.dataset.go === 'places') return showView('places');
  if (t.dataset.go === 'back') {
    state.adding = null;
    state.placesStatus = '';
    return consult();
  }
  if (t.hasAttribute('data-install')) return install();
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
    state.placesStatus = 'Pidiendo tu ubicación…';
    render();
    try {
      await getPosition();
      store.set(K.useGps, true);
      state.placeId = 'gps';
      state.placesStatus = '';
    } catch (err) {
      state.placesStatus = err?.code === 1 ? 'Sin permiso de ubicación: activalo en el navegador para usarla.' : 'No pudimos ubicarte. Probá de nuevo.';
    }
    return render();
  }
  if (t.dataset.delete) {
    store.set(K.places, savedPlaces().filter((p) => p.id !== t.dataset.delete));
    if (state.placeId === t.dataset.delete) state.placeId = null;
    return render();
  }
  if (t.hasAttribute('data-add')) {
    state.placesStatus = 'Buscando dónde estás…';
    render();
    try {
      const pos = await getPosition();
      state.adding = { lat: Math.round(pos.lat * 100) / 100, lon: Math.round(pos.lon * 100) / 100 };
      state.placesStatus = '¿Cómo le ponemos a este lugar?';
    } catch (err) {
      state.placesStatus = err?.code === 1 ? 'Sin permiso de ubicación: activalo en el navegador para guardar dónde estás.' : 'No pudimos ubicarte. Probá de nuevo.';
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
