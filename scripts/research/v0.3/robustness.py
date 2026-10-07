"""Robustez: (a) ventana uniforme = día calendario 00–23 para TODOS los casos (saca la asimetría hora-conocida vs día);
(b) barrido de umbral de WMAX y regla sin co-ubicación; (c) HR por modelo. Salida: robustness.txt"""
import numpy as np, pandas as pd
from common import D, load_ph, events, auc, auc_ci_cluster, tss, v02_level, combine
from build_cases import agg
ph = load_ph(); ev = events()
L = []; P = lambda *a: L.append(' '.join(str(x) for x in a))
day = ph[ph.time.str[:10] == ph.id.map(ev.date)]
rows = {}
for (cid, model), sub in day.groupby(['id', 'model']):
    a = agg(sub); a['v02'] = v02_level(sub); rows[(cid, model)] = a
R = pd.DataFrame.from_dict(rows, orient='index')
g = R.xs('gfs_seamless', level=1).join(ev[['y', 'season', 'date', 'test', 'v02_gfs', 'localTime', 'ctl_kind']])
g = g[g.y >= 0]
P('# (a) Ventana uniforme = día calendario del evento (00–23 h), GFS')
P('Coincidencia del nivel v0.2 GFS con la ventana oficial: %.0f%%' % (100 * (g.v02 == g.v02_gfs).mean()))
for f in ['p90_lapse_x_wmax', 'p90_wmax', 'p90_lapse75', 'p90_rh85_50', 'max_rh85_50', 'pk_lcl_agl', 'max_wspd850', 'p90_showers', 'pk_hgz_depth', 'max_cape_above_m10']:
    out = []
    for s in ['all', 'cold', 'warm']:
        x = g if s == 'all' else g[g.season == s]
        a, lo, hi = auc_ci_cluster(x[f][x.y == 1], x[f][x.y == 0], x.date[x.y == 1], x.date[x.y == 0], n=1000)
        out.append(f'{s} {a:.2f} [{lo:.2f}–{hi:.2f}]')
    P(f'  {f:20s} ' + ' | '.join(out))
for lv, lab in [(2, 'protegelo'), (1, 'atento+')]:
    t, pod, pofd = tss(g.y, g.v02 >= lv)
    P(f'  v0.2 GFS {lab} con ventana día: POD={pod:.2f} POFD={pofd:.2f} TSS={t:+.2f}')
# Solo controles con hora vs granizo sin hora: ¿la HR depende del tipo de ventana?
P('  HR p90 (ventana oficial) en controles METAR con hora: mediana %.2f; en granizo sin hora: %.2f; en granizo con hora: %.2f' % (
    pd.read_csv(f'{D}/cases_gfs.csv', index_col=0).query('y==0 and ctl_kind=="metar"').p90_rh85_50.median(),
    pd.read_csv(f'{D}/cases_gfs.csv', index_col=0).query('y==1 and localTime!=localTime').p90_rh85_50.median(),
    pd.read_csv(f'{D}/cases_gfs.csv', index_col=0).query('y==1 and localTime==localTime').p90_rh85_50.median()))

P('\n# (b) Barrido de WMAX y co-ubicación (GFS, ventana oficial, con disparo) — umbral elegido mirando SOLO entrenamiento')
S = ev[ev.y >= 0]
W = ph[ph.in_window == 1]
def rule(sub, thr, lapse=6.5, coloc=True):
    trig = (sub.showers.max() >= 0.5) or (sub.precip.max() >= 2.0)
    if coloc:
        ok = ((sub.lapse75 >= lapse) & (sub.wmax >= thr)).any()
    else:
        ok = (sub.lapse75.max() >= lapse) and (sub.wmax.max() >= thr)
    return ok and trig
gg = {cid: sub for cid, sub in W[W.model == 'gfs_seamless'].groupby('id')}
ee = {cid: sub for cid, sub in W[W.model == 'ecmwf_ifs025'].groupby('id')}
for coloc in [True, False]:
    for thr in [800, 900, 1000, 1100, 1200, 1300]:
        pr = np.array([rule(gg[c], thr, coloc=coloc) for c in S.index])
        tr = ~S.test.values; te = S.test.values
        a = tss(S.y.values[tr], pr[tr]); b = tss(S.y.values[te], pr[te])
        both = np.array([rule(gg[c], thr, coloc=coloc) and (c not in ee or rule(ee[c], thr, coloc=coloc)) for c in S.index])
        c_ = tss(S.y.values[te], both[te])
        P(f'  co-ubicado={coloc!s:5s} WMAX≥{thr}: train TSS={a[0]:+.2f} (POD {a[1]:.2f}/POFD {a[2]:.2f}) | prueba GFS TSS={b[0]:+.2f} (POD {b[1]:.2f}/POFD {b[2]:.2f}) | prueba AND TSS={c_[0]:+.2f} (POD {c_[1]:.2f}/POFD {c_[2]:.2f})')

P('\n# (c) HR 850–500 (p90) por modelo, estación cálida y fría, casos con ECMWF')
Gc = pd.read_csv(f'{D}/cases_gfs.csv', index_col=0); Ec = pd.read_csv(f'{D}/cases_ecmwf.csv', index_col=0)
for lab, c in [('GFS (todos)', Gc), ('GFS (con ECMWF)', Gc.loc[Ec.index]), ('ECMWF', Ec)]:
    for s in ['cold', 'warm']:
        x = c[(c.season == s) & (c.y >= 0)]
        a, lo, hi = auc_ci_cluster(x.p90_rh85_50[x.y == 1], x.p90_rh85_50[x.y == 0], x.date[x.y == 1], x.date[x.y == 0], n=1000)
        P(f'  {lab:16s} {s}: n={int((x.y==1).sum())}/{int((x.y==0).sum())} AUC={a:.2f} [{lo:.2f}–{hi:.2f}]  (1−AUC={1-a:.2f})')
P('  Correlación GFS vs ECMWF de p90 HR850–500 (mismos casos): %.2f' % Gc.loc[Ec.index].p90_rh85_50.corr(Ec.p90_rh85_50))
# AUC de la estación sola (efecto de la mezcla del diseño caso-control)
P('\n# AUC de "es estación fría" sola (artefacto del diseño): %.2f' % auc((S[S.y == 1].season == 'cold').astype(float), (S[S.y == 0].season == 'cold').astype(float)))
open(f'{D}/robustness.txt', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
