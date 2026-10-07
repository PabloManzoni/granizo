// <car-shield level="calm|storm|watch|protect"> — logo animado de Cubierto (diseño de Pablo, Claude Design):
// muscle car bajo un domo de panal; lluvia, rayos y piedras según el estado. SVG vectorial, sin dependencias.
// Es la variante "hex" + "muscle" del diseño original, sin las demás (domo, aura, otros autos).
(function () {
  const PAL = {
    calm: { c: '#8EC5FF', hi: '#DDF0FF', deep: '#14306B', soft: 'rgba(142,197,255,.30)' },
    storm: { c: '#5FD8E6', hi: '#D2F6FB', deep: '#0D4652', soft: 'rgba(95,216,230,.32)' },
    watch: { c: '#C9A2FF', hi: '#EEDFFF', deep: '#3E1F72', soft: 'rgba(201,162,255,.34)' },
    protect: { c: '#FF5C93', hi: '#FFD3E3', deep: '#6E1544', soft: 'rgba(255,92,147,.50)' }
  };
  const LV = {
    calm: { hail: 0, rain: 0, breath: 6, scan: 6 },
    // Sutil: tormenta sin granizo es el estado de "muy pocas chances". Poca lluvia y lenta, salpicaduras chicas,
    // un rayo de vez en cuando sin destello de pantalla; el auto y el domo quietos.
    storm: { hail: 0, rain: 26, rmin: 0.8, rmax: 1.15, splash: 'soft', ro: '.38', bolt: 'soft', breath: 3.2, scan: 3.6 },
    watch: { hail: 4, rain: 9, rmin: 1.7, rmax: 2.6, dmin: 2.6, dmax: 3.8, smin: 2.6, smax: 4.2, breath: 3, scan: 3.2 },
    protect: { hail: 26, dmin: 0.7, dmax: 1.15, smin: 3.2, smax: 7.5, breath: 0.9, scan: 0.9, rain: 30, rmin: 0.42, rmax: 0.66, violent: true, bolt: true }
  };
  const LABEL = { calm: 'Auto tranquilo', storm: 'Auto bajo tormenta', watch: 'Auto atento al granizo', protect: 'Auto bajo granizo' };
  const DIR = [-0.42, 0.91];
  let uid = 0;
  const rng = s => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hash = str => [...str].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
  const n = x => x.toFixed(2);

  const CSS = `
:host{display:block;width:100%;height:100%}
svg{width:100%;height:100%;display:block;overflow:hidden}
.st{animation:fall linear infinite;opacity:0}
.fl{transform-box:fill-box;transform-origin:center;animation:flash linear infinite;opacity:0}
.sh{animation:shard linear infinite;opacity:0}
.breathe{animation:breathe var(--b) ease-in-out infinite}
.shake{transform-box:view-box;transform-origin:100px 130px;animation:shake .42s linear infinite}
.shake2{transform-box:view-box;transform-origin:100px 130px;animation:shake2 .6s linear infinite}
.bolt{animation:bolt 3.7s linear infinite}
.bolt2{animation:bolt 5.3s linear 1.9s infinite}
.bolt-soft{animation:bolt 11s linear 2.5s infinite}
.flicker{animation:flicker 1.1s steps(1) infinite}
.hl{animation:hl var(--b) ease-in-out infinite}
.hz{animation:hz .55s steps(1) infinite}
.scan{animation:scan var(--sc) linear infinite}
@keyframes fall{0%{transform:translate(var(--sx),var(--sy));opacity:0}6%{opacity:1}70%{transform:translate(var(--ex),var(--ey));opacity:1}70.5%,100%{transform:translate(var(--ex),var(--ey));opacity:0}}
@keyframes flash{0%,69.5%{opacity:0;transform:scale(.3)}71%{opacity:1;transform:scale(.9)}92%,100%{opacity:0;transform:scale(2.8)}}
@keyframes shard{0%,70%{opacity:0;transform:translate(0,0)}72%{opacity:1}96%,100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
@keyframes breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes shake{0%{transform:translate(0,0)}10%{transform:translate(-2.6px,1.3px) rotate(-.7deg)}20%{transform:translate(2.2px,-1.5px) rotate(.6deg)}30%{transform:translate(-1.7px,-.9px)}40%{transform:translate(2.8px,1.1px) rotate(.8deg)}50%{transform:translate(-1.1px,2px)}60%{transform:translate(2px,-1.3px) rotate(-.5deg)}70%{transform:translate(-2.4px,.7px)}80%{transform:translate(1.3px,1.5px)}90%{transform:translate(-.7px,-1.8px)}100%{transform:translate(0,0)}}
@keyframes shake2{0%,100%{transform:translate(0,0)}20%{transform:translate(-.9px,.5px)}40%{transform:translate(.8px,-.6px) rotate(.2deg)}60%{transform:translate(-.6px,-.3px)}80%{transform:translate(1px,.5px) rotate(-.2deg)}}
@keyframes bolt{0%{opacity:0}1.5%{opacity:1}3%{opacity:.08}4.5%{opacity:.7}7%,100%{opacity:0}}
@keyframes flicker{0%{opacity:1}13%{opacity:.4}17%{opacity:1}52%{opacity:.55}56%{opacity:1}78%{opacity:.25}81%,100%{opacity:1}}
@keyframes hl{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes hz{0%{opacity:1}50%{opacity:.2}}
@keyframes scan{0%{transform:translateY(10px)}100%{transform:translateY(-92px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.st,.fl,.sh{opacity:0}}
`;

  const shadow = (P, id, rx) => `<ellipse cx="100" cy="150" rx="${rx || 62}" ry="5" fill="${P.c}" opacity=".6" filter="url(#${id}bl)"/>`;
  const lights = (P, id, v, d, extra) => `<g class="${v ? 'hz' : 'hl'}" filter="url(#${id}gl)"><path d="${d}" fill="${P.hi}"/>${extra || ''}</g>`;
  const body = (P, id, d) => `<path d="${d}" fill="url(#${id}bd)" stroke="${P.c}" stroke-opacity=".6" stroke-width=".8"/>`;
  const muscle = (P, id, v) => shadow(P, id, 70) + `
<g fill="#040308" stroke="${P.c}" stroke-opacity=".45" stroke-width=".6">
<rect x="54" y="128" width="17" height="22" rx="3"/><rect x="129" y="128" width="17" height="22" rx="3"/>
</g>
<path d="M54.5 139 L58 139 M54.5 142 L58 142 M54.5 145 L58 145 M54.5 148 L58 148 M145.5 139 L142 139 M145.5 142 L142 142 M145.5 145 L142 145 M145.5 148 L142 148" stroke="${P.hi}" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>
<path d="M73.5 112.5 L69.5 109.8 M126.5 112.5 L130.5 109.8" stroke="${P.c}" stroke-opacity=".6" stroke-width=".8"/>
<rect x="62.5" y="105.5" width="8" height="5" rx="1.6" fill="#0D0B14" stroke="${P.hi}" stroke-opacity=".8" stroke-width=".7"/>
<rect x="129.5" y="105.5" width="8" height="5" rx="1.6" fill="#0D0B14" stroke="${P.hi}" stroke-opacity=".8" stroke-width=".7"/>` +
      body(P, id, 'M52 128 Q52 121.5 59 120 L71.5 117.2 L79 102.2 Q80 100 83 100 L117 100 Q120 100 121 102.2 L128.5 117.2 L141 120 Q148 121.5 148 128 L148 134 L52 134 Z') + `
<path d="M82 102.8 L118 102.8 L125.5 116.5 L74.5 116.5 Z" fill="url(#${id}ws)"/>
<path d="M86 103.5 L92 103.5 L84 116 L78.5 116 Z" fill="#fff" opacity=".09"/>
<path d="M79 102.2 Q80 100 83 100 L117 100 Q120 100 121 102.2" fill="none" stroke="${P.hi}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M71.5 117.2 Q100 115.2 128.5 117.2" fill="none" stroke="${P.hi}" stroke-opacity=".75" stroke-width=".9"/>
<path d="M89 116.6 L95.5 121.6 L104.5 121.6 L111 116.6 M100 116 L100 121.6" fill="none" stroke="${P.hi}" stroke-opacity=".8" stroke-width=".9" stroke-linejoin="round"/>
<path d="M59 120 Q63 121.5 66 122.2 M141 120 Q137 121.5 134 122.2" fill="none" stroke="${P.c}" stroke-opacity=".5" stroke-width=".7"/>
<rect x="64" y="122.2" width="72" height="11" rx="2.5" fill="#040308" stroke="${P.hi}" stroke-opacity=".85" stroke-width=".9"/>
<path d="M80 125.6 L120 125.6 M80 129.6 L120 129.6 M100 122.6 L100 132.8" stroke="${P.c}" stroke-opacity=".5" stroke-width=".6"/>
<rect x="79" y="123.6" width="42" height="8" rx="1.2" fill="none" stroke="${P.c}" stroke-opacity=".4" stroke-width=".5"/>` +
      lights(P, id, v, 'M71.5 123.2 A4.6 4.6 0 1 0 71.5 132.4 A4.6 4.6 0 1 0 71.5 123.2 Z M128.5 123.2 A4.6 4.6 0 1 0 128.5 132.4 A4.6 4.6 0 1 0 128.5 123.2 Z', `<circle cx="71.5" cy="127.8" r="1.8" fill="#fff"/><circle cx="128.5" cy="127.8" r="1.8" fill="#fff"/>`) + `
<path d="M49 133.2 Q50 132.6 52 133.2 L148 133.2 Q150 132.6 151 133.2 L150 137.4 Q149.5 138.4 148 138.4 L52 138.4 Q50.5 138.4 50 137.4 Z" fill="${P.hi}" fill-opacity=".9"/>
<path d="M52 134.6 L148 134.6" stroke="#fff" stroke-width=".6" opacity=".9"/>
<path d="M60 138.4 L140 138.4 L135 142.6 L65 142.6 Z" fill="#040308" stroke="${P.c}" stroke-opacity=".4" stroke-width=".5"/>
<rect x="91" y="139.2" width="18" height="5.2" rx="1" fill="${P.hi}" fill-opacity=".85"/>
<circle cx="68.5" cy="140.4" r="1.4" fill="${P.hi}"/><circle cx="131.5" cy="140.4" r="1.4" fill="${P.hi}"/>`;
  function hexAt(x, y, r) {
    return Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k - Math.PI / 2; return n(x + r * Math.cos(a)) + ',' + n(y + r * Math.sin(a)); }).join(' ');
  }

  class CarShield extends HTMLElement {
    static get observedAttributes() { return ['level']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      const l = this.getAttribute('level') || 'calm';
      const P = PAL[l] || PAL.calm, L = LV[l] || LV.calm;
      const id = 'cs' + (++uid);
      const r = rng(hash('hex' + l));
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });

      const surf = th => [100 + 72 * Math.cos(th), 150 + 72 * Math.sin(th)];
      let rain = '', hail = '', fx = '';
      for (let i = 0; i < L.rain; i++) {
        const [ex, ey] = surf((192 + r() * 156) * Math.PI / 180), D = 190, len = L.splash ? 12 + r() * 12 : 8 + r() * 10;
        const dur = L.rmin + r() * (L.rmax - L.rmin), del = -r() * dur * 3;
        if (L.splash === true && i % 3 === 0) fx += `<polygon class="fl" style="animation-duration:${n(dur)}s;animation-delay:${n(del)}s" points="${hexAt(ex, ey, 6.9)}" fill="${P.c}" fill-opacity=".4" stroke="${P.hi}" stroke-width=".7"/>`;
        else if (L.splash && i % 2 === 0) fx += `<ellipse class="fl" style="animation-duration:${n(dur)}s;animation-delay:${n(del)}s" cx="${n(ex)}" cy="${n(ey)}" rx="2.4" ry="1" fill="none" stroke="${P.hi}" stroke-opacity=".8" stroke-width=".6"/>`;
        rain += `<line class="st" style="--sx:${n(ex - DIR[0] * D)}px;--sy:${n(ey - DIR[1] * D)}px;--ex:${n(ex)}px;--ey:${n(ey)}px;animation-duration:${n(dur)}s;animation-delay:${n(del)}s" x1="0" y1="0" x2="${n(-DIR[0] * len)}" y2="${n(-DIR[1] * len)}" stroke="${P.hi}" stroke-opacity="${L.ro || (L.splash ? '.55' : '.35')}" stroke-width="${L.splash ? '.7' : '.6'}" stroke-linecap="round"/>`;
      }
      for (let i = 0; i < L.hail; i++) {
        const [ex, ey] = surf((195 + r() * 150) * Math.PI / 180), D = 200;
        const dur = L.dmin + r() * (L.dmax - L.dmin), del = -r() * dur * 2;
        const s = L.smin + r() * (L.smax - L.smin), tl = s * (4 + r() * 3);
        const pts = Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k + r() * 0.5, rr = s * (0.8 + r() * 0.3); return [rr * Math.cos(a), rr * Math.sin(a)]; });
        const anim = `animation-duration:${n(dur)}s;animation-delay:${n(del)}s`;
        hail += `<g class="st" style="--sx:${n(ex - DIR[0] * D)}px;--sy:${n(ey - DIR[1] * D)}px;--ex:${n(ex)}px;--ey:${n(ey)}px;${anim}">
<line x1="0" y1="0" x2="${n(-DIR[0] * tl)}" y2="${n(-DIR[1] * tl)}" stroke="url(#${id}tr)" stroke-width="${n(s * 0.5)}" stroke-linecap="round"/>
<polygon points="${pts.map(p => n(p[0]) + ',' + n(p[1])).join(' ')}" fill="${P.hi}" stroke="${P.c}" stroke-width=".5"/>
<polygon points="0,0 ${n(pts[4][0])},${n(pts[4][1])} ${n(pts[5][0])},${n(pts[5][1])}" fill="#fff" opacity=".85"/>
<polygon points="0,0 ${n(pts[1][0])},${n(pts[1][1])} ${n(pts[2][0])},${n(pts[2][1])}" fill="${P.c}" opacity=".55"/>
</g>`;
        fx += `<polygon class="fl" style="${anim}" points="${hexAt(ex, ey, 6.9)}" fill="${P.c}" fill-opacity=".55" stroke="${P.hi}" stroke-width=".8"/>`;
        if (L.violent) for (let k = 0; k < 3; k++) {
          const a = (-165 + r() * 150) * Math.PI / 180, dist = 7 + r() * 12;
          fx += `<line class="sh" style="--dx:${n(Math.cos(a) * dist)}px;--dy:${n(Math.sin(a) * dist)}px;${anim}" x1="${n(ex)}" y1="${n(ey)}" x2="${n(ex + Math.cos(a) * 2.2)}" y2="${n(ey + Math.sin(a) * 2.2)}" stroke="${P.hi}" stroke-width="1" stroke-linecap="round"/>`;
        }
      }

      const D = 'M28 150 A72 72 0 0 1 172 150 Z';
      const back = `<path d="${D}" fill="url(#${id}dm)" opacity=".55"/><path class="breathe" d="${D}" fill="url(#${id}hx)" opacity=".7"/>
<g mask="url(#${id}mk)"><path d="${D}" fill="url(#${id}hxb)"/></g>`;
      const front = `<path class="${L.violent || L.flicker ? 'flicker' : ''}" d="M28 150 A72 72 0 0 1 172 150" fill="none" stroke="${P.c}" stroke-width="1.2"/>`;

      const bolt = L.bolt === 'soft'
        ? `<path class="bolt-soft" d="M44 6 L34 34 L43 34 L30 66 L54 28 L44 28 L53 6 Z" fill="${P.hi}" opacity="0" style="fill-opacity:.6"/>`
        : L.bolt ? `<path class="bolt" d="M44 6 L34 34 L43 34 L30 66 L54 28 L44 28 L53 6 Z" fill="${P.hi}" opacity="0" filter="url(#${id}gl)"/>
<path class="bolt2" d="M164 4 L156 26 L163 26 L152 50 L171 21 L163 21 L170 4 Z" fill="${P.hi}" opacity="0" filter="url(#${id}gl)"/>` : '';
      const overlay = L.bolt === true ? `<circle class="bolt" cx="100" cy="100" r="100" fill="url(#${id}fl)" opacity="0"/><circle class="bolt2" cx="100" cy="100" r="100" fill="url(#${id}fl)" opacity="0" style="fill-opacity:.65"/>` : '';

      this.shadowRoot.innerHTML = `<style>${CSS}</style>
<svg viewBox="0 0 200 200" role="img" aria-label="${LABEL[l] || LABEL.calm}" style="--b:${L.breath}s;--sc:${L.scan}s">
<defs>
<radialGradient id="${id}bg" cx="100" cy="128" r="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.c}" stop-opacity="${L.violent ? '.42' : L.bolt === true ? '.38' : '.26'}"/><stop offset=".55" stop-color="${P.deep}" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}dm" cx="100" cy="150" r="72" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.c}" stop-opacity=".06"/><stop offset=".72" stop-color="${P.c}" stop-opacity=".14"/><stop offset=".95" stop-color="${P.c}" stop-opacity=".42"/><stop offset="1" stop-color="${P.hi}" stop-opacity=".7"/></radialGradient>
<radialGradient id="${id}fl" cx="100" cy="80" r="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.hi}" stop-opacity=".32"/><stop offset=".6" stop-color="${P.hi}" stop-opacity=".1"/><stop offset="1" stop-color="${P.hi}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262335"/><stop offset="1" stop-color="#07060B"/></linearGradient>
<linearGradient id="${id}ws" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.c}" stop-opacity=".45"/><stop offset="1" stop-color="#08070E"/></linearGradient>
<linearGradient id="${id}tr" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${P.hi}" stop-opacity=".9"/><stop offset="1" stop-color="${P.hi}" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}ground" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.c}" stop-opacity="0"/><stop offset=".5" stop-color="${P.c}" stop-opacity=".7"/><stop offset="1" stop-color="${P.c}" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<pattern id="${id}hx" width="12" height="20.78" patternUnits="userSpaceOnUse"><path d="M6 0 L12 3.46 L12 10.39 L6 13.86 L0 10.39 L0 3.46 Z M6 13.86 L6 20.78" fill="none" stroke="${P.c}" stroke-opacity=".5" stroke-width=".45"/></pattern>
<pattern id="${id}hxb" width="12" height="20.78" patternUnits="userSpaceOnUse"><path d="M6 0 L12 3.46 L12 10.39 L6 13.86 L0 10.39 L0 3.46 Z M6 13.86 L6 20.78" fill="${P.c}" fill-opacity=".12" stroke="${P.hi}" stroke-width=".7"/></pattern>
<mask id="${id}mk"><rect class="scan" x="20" y="146" width="160" height="22" fill="url(#${id}sg)"/></mask>
<filter id="${id}gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="${id}bl" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="${id}bl2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>
</defs>
<circle class="${L.violent ? 'breathe' : ''}" cx="100" cy="128" r="100" fill="url(#${id}bg)"/>
${bolt}
<line x1="14" y1="150.5" x2="186" y2="150.5" stroke="url(#${id}ground)" stroke-width=".8"/>
<g class="${L.violent ? 'shake' : L.soft ? 'shake2' : ''}">${back}${muscle(P, id, L.violent)}${front}</g>
${rain}${hail}${fx}${overlay}
</svg>`;
    }
  }
  if (!customElements.get('car-shield')) customElements.define('car-shield', CarShield);
})();
