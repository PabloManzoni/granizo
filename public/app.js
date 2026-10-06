// PWA básica: elegir lugar (guardado o GPS) + ventana → consultar /api/assess.
const $ = (sel) => document.querySelector(sel);
const PLACES_KEY = 'hg.places';
const LAST_KEY = 'hg.last';

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // sin almacenamiento (modo privado): se sigue funcionando sin recordar
    }
  },
};

let current = store.get(LAST_KEY, null); // { name, lat, lon }

function renderPlaces() {
  const places = store.get(PLACES_KEY, []);
  const box = $('#places');
  box.innerHTML = '';
  for (const p of places) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.setAttribute('aria-pressed', String(current?.name === p.name));
    b.addEventListener('click', () => selectPlace(p));
    box.append(b);
  }
  if (!places.length) box.innerHTML = '<span class="muted">Todavía no guardaste lugares (por ejemplo, Casa y Trabajo).</span>';
}

function selectPlace(p) {
  current = p;
  store.set(LAST_KEY, p);
  $('#place-status').textContent = `${p.name} (${p.lat.toFixed(2)}, ${p.lon.toFixed(2)})`;
  $('#check').disabled = false;
  $('#save-place').hidden = p.name !== 'Mi ubicación';
  renderPlaces();
}

$('#locate').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    $('#place-status').textContent = 'Este navegador no permite usar la ubicación.';
    return;
  }
  $('#place-status').textContent = 'Buscando tu ubicación…';
  navigator.geolocation.getCurrentPosition(
    (pos) => selectPlace({ name: 'Mi ubicación', lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => ($('#place-status').textContent = 'No pudimos obtener tu ubicación. Revisá el permiso del navegador.'),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
  );
});

$('#save-place').addEventListener('click', () => {
  const name = prompt('¿Cómo le ponemos a este lugar? (por ejemplo, Casa o Trabajo)')?.trim();
  if (!name || !current) return;
  const places = store.get(PLACES_KEY, []).filter((p) => p.name !== name);
  // Se guarda redondeado a ~1 km: alcanza para una zona de 40 km.
  const place = { name, lat: Math.round(current.lat * 100) / 100, lon: Math.round(current.lon * 100) / 100 };
  store.set(PLACES_KEY, [...places, place]);
  selectPlace(place);
});

function defaultWindow() {
  const h = new Date().getHours();
  return h >= 14 || h < 6 ? 'tonight' : 'today';
}
const initialWindow = defaultWindow();
document.querySelector(`input[name=window][value=${initialWindow}]`).checked = true;

const LEVEL_NAMES = { calm: 'tranquilo', watch: 'atento', protect: 'protegelo' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hhmm = (iso) => iso.slice(11, 16);
const fmt = (x, d = 0) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));

$('#check').addEventListener('click', async () => {
  if (!current) return;
  const win = document.querySelector('input[name=window]:checked').value;
  const out = $('#result');
  out.hidden = false;
  out.className = '';
  out.innerHTML = '<p class="muted">Consultando el pronóstico…</p>';
  $('#check').disabled = true;
  try {
    const res = await fetch(`/api/assess?lat=${current.lat}&lon=${current.lon}&window=${win}`);
    const r = await res.json();
    if (!res.ok) throw new Error(r.error ?? 'Error');
    out.className = `level-${r.level}`;
    out.innerHTML = `
      <h2>${esc(r.headline)}</h2>
      <p class="meta">${esc(r.window.label)} · ${esc(r.confidenceLabel)}</p>
      ${r.models?.length > 1 ? `<p class="meta">Según cada modelo: ${r.models.map((m) => `${esc(m.model)} ${esc(LEVEL_NAMES[m.level])}`).join(' · ')}</p>` : ''}
      ${r.season === 'warm' ? `<p class="season">${esc(r.seasonNote)}</p>` : ''}
      <h3>Por qué</h3>
      <ul>${r.reasons.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>
      ${r.favorableHours ? `<p>Horas con ingredientes para granizo: <strong>${hhmm(r.favorableHours.from)} a ${hhmm(r.favorableHours.to)}</strong>.</p>` : ''}
      <details>
        <summary>Datos técnicos</summary>
        <p>Punto más favorable: ${esc(r.peak.time.replace('T', ' '))}</p>
        <ul class="tech">
          <li>Energía (MUCAPE): ${fmt(r.peak.muCapeJkg)} J/kg</li>
          <li>Viento en altura (cizalladura 0–6 km): ${fmt(r.peak.shear06Ms, 1)} m/s</li>
          <li>Gradiente 700–500 hPa: ${fmt(r.peak.lapse700500CKm, 1)} °C/km</li>
          <li>Temperatura a 500 hPa: ${fmt(r.peak.t500C, 1)} °C</li>
          <li>Energía × viento (WMAXSHEAR): ${fmt(r.peak.wmaxshearM2s2)} m²/s²</li>
          <li>SHIP: ${fmt(r.peak.ship, 2)}</li>
          <li>Lluvia convectiva máx. del modelo: ${fmt(r.peak.maxShowersMm, 1)} mm/h</li>
        </ul>
      </details>
      <p class="muted small">${esc(r.disclaimer)}</p>
      <p class="muted small">${esc(r.model)} · consultado ${esc(r.generatedAt.replace('T', ' '))} · motor v${esc(r.engineVersion)}</p>`;
  } catch (err) {
    out.innerHTML = `<p class="error">${esc(err.message === 'Failed to fetch' ? 'Sin conexión. Probá de nuevo.' : err.message)}</p>`;
  } finally {
    $('#check').disabled = false;
  }
});

if (current) selectPlace(current);
else renderPlaces();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
