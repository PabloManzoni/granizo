// Botonera de desarrollo: SOLO se carga en localhost (ver index.html). Muestra cada estado de la UI.
// Los resultados vienen de engine.devScenario: pasan por el motor y el presentador reales, en el navegador.
import { consult, devFlags, openInstallModal, render, showError, showResult, showView } from '/app.js';

const SCENARIOS = [
  ['tranquilo', 'Tranquilo'],
  ['tranquilo_verano', 'Tranq. verano'],
  ['tormenta', 'Tormenta'],
  ['tormenta_verano', 'Torm. verano'],
  ['atento', 'Atento'],
  ['atento_divididos', 'Divididos'],
  ['protegelo', 'Protegelo'],
  ['un_modelo', '1 modelo'],
];
const STATES = [
  ['loading', 'Cargando', () => showView('loading')],
  ['locating', 'Buscando GPS', () => showView('locating')],
  ['offline', 'Sin conexión', () => showError('offline')],
  ['denied', 'Sin permiso GPS', () => showError('denied')],
  ['nolocation', 'GPS no responde', () => showError('nolocation')],
  ['outside', 'Fuera de UY', () => showError('outside')],
  ['limit', 'Límite datos', () => showError('limit')],
  ['slow', 'Pronóstico lento', () => showError('slow')],
  ['server', 'Error servidor', () => showError('server')],
  ['places', 'Lugares', () => showView('places')],
  ['install', 'Modal instalar', () => openInstallModal()],
];

const css = `
.dv{position:fixed;top:8px;right:8px;display:flex;flex-direction:column;align-items:flex-end;z-index:99;font:10px/1.2 'JetBrains Mono',ui-monospace,monospace;color:#cfc9de}
.dv>button{all:unset;cursor:pointer;padding:3px 8px;border-radius:99px;background:rgba(255,243,176,.14);color:#fff3b0;border:1px solid rgba(255,243,176,.35)}
.dv .pn[hidden]{display:none}
.dv .pn{margin-top:6px;width:220px;padding:8px;border-radius:12px;background:rgba(13,11,18,.96);border:1px solid #2a2633;display:flex;flex-direction:column;gap:6px;backdrop-filter:blur(10px)}
.dv .g{display:flex;flex-wrap:wrap;gap:3px}
.dv .t{color:#7e7891;text-transform:uppercase;letter-spacing:.12em;font-size:9px}
.dv .g button{all:unset;cursor:pointer;padding:3px 6px;border-radius:6px;border:1px solid #2a2633;color:#cfc9de}
.dv .g button:hover{border-color:#7e7891}
.dv .g button.on{background:#fff3b0;color:#000;border-color:#fff3b0}
`;

const root = document.createElement('div');
root.className = 'dv';
root.innerHTML = `<style>${css}</style><button type="button" data-dv="toggle" aria-expanded="false">dev</button>
<div class="pn" hidden>
  <div class="t">Resultado</div>
  <div class="g">${SCENARIOS.map(([id, l]) => `<button type="button" data-sc="${id}">${l}</button>`).join('')}</div>
  <div class="t">Estados</div>
  <div class="g">${STATES.map(([id, l]) => `<button type="button" data-st="${id}">${l}</button>`).join('')}</div>
  <div class="t">Simular en la consulta real</div>
  <div class="g"><button type="button" data-flag="offline">Sin red</button><button type="button" data-flag="denyLocation">Sin GPS</button><button type="button" data-installed>Instalada</button></div>
  <div class="g"><button type="button" data-dv="real">▶ Consulta real</button></div>
</div>`;
document.body.append(root);

const panel = root.querySelector('.pn');
root.querySelector('[data-installed]').classList.toggle('on', localStorage.getItem('hg.installed') === 'true');
let active = null;
const mark = (btn) => {
  root.querySelectorAll('[data-sc],[data-st]').forEach((b) => b.classList.toggle('on', b === btn));
  active = btn;
};

root.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.dv === 'toggle') {
    panel.hidden = !panel.hidden;
    b.setAttribute('aria-expanded', String(!panel.hidden));
  } else if (b.dataset.sc) {
    mark(b);
    showView('loading');
    const engine = await import('/engine.js');
    if (active === b) showResult(engine.devScenario(b.dataset.sc));
  } else if (b.dataset.st) {
    mark(b);
    STATES.find(([id]) => id === b.dataset.st)[2]();
  } else if (b.dataset.flag) {
    devFlags[b.dataset.flag] = !devFlags[b.dataset.flag];
    b.classList.toggle('on', devFlags[b.dataset.flag]);
  } else if (b.hasAttribute('data-installed')) {
    const on = localStorage.getItem('hg.installed') !== 'true';
    localStorage.setItem('hg.installed', String(on));
    b.classList.toggle('on', on);
    render();
  } else if (b.dataset.dv === 'real') {
    mark(null);
    consult();
  }
});
