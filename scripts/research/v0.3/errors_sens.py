"""Análisis de errores de v0.2 (combinado oficial) y sensibilidad de diseño (radio, ventana, disparo, AND/OR/promedio,
regla de HR en la estación cálida). Salida: errors_sens.txt"""
import numpy as np
import pandas as pd
from common import D, load_ph, events, v02_level, combine, tss, tss_ci, auc

ph = load_ph()
ev = events()
G = pd.read_csv(f'{D}/cases_gfs.csv', index_col=0)
E = pd.read_csv(f'{D}/cases_ecmwf.csv', index_col=0)
lines = []
P = lambda *a: lines.append(' '.join(str(x) for x in a))


def fmt(y, pred):
    t, pod, pofd = tss(y, pred)
    return f'POD={pod:.2f} POFD={pofd:.2f} TSS={t:+.2f}'


def fmt_ci(y, pred):
    t, lo, hi = tss_ci(y, pred)
    _, pod, pofd = tss(y, pred)
    return f'POD={pod:.2f} POFD={pofd:.2f} TSS={t:+.2f} [{lo:+.2f},{hi:+.2f}]'


ev['hour'] = ev.localTime.str[:2].astype(float)
ev['night'] = (ev.hour >= 20) | (ev.hour < 8)
ev['north'] = ev.lat > -32.5
S = ev[ev.y >= 0].copy()

# ---------- Diagnóstico por caso y modelo ----------
def diag(model):
    out = {}
    for cid, sub in ph[(ph.model == model) & (ph.in_window == 1)].groupby('id'):
        out[cid] = dict(
            strong_env=(sub.env_v02 == 2).any(),
            trig=(sub.showers.max() >= 0.5) or (sub.precip.max() >= 2.0),
            lapse_ok=(sub.lapse75 >= 6.5).any(),
            wmax_ok=(sub.wmax >= 1200).any(),
            both_any=((sub.lapse75 >= 6.5) & (sub.wmax >= 1200)).any(),
            lapse_max=sub.lapse75.max(), wmax_max=sub.wmax.max(),
        )
    return pd.DataFrame.from_dict(out, orient='index')


dg, de = diag('gfs_seamless'), diag('ecmwf_ifs025')
S = S.join(dg.add_prefix('g_')).join(de.add_prefix('e_'))
S['rh'] = G.p90_rh85_50

P('# 1. Errores de v0.2 combinado ("protegelo" oficial), 124 casos (52 granizo dañino/sin dato, 72 controles)')
P('Total:', fmt(S.y, S.v02 >= 2))
for col, lab in [('season', 'estación'), ('test', 'prueba 2025–26'), ('has_ecmwf', 'con ECMWF'), ('north', 'norte (lat > −32,5)')]:
    for v, sub in S.groupby(col):
        P(f'  {lab}={v}: n={int(sub.y.sum())}/{int((sub.y==0).sum())}', fmt(sub.y, sub.v02 >= 2))
t = S[S.localTime.notna()]
for v, sub in t.groupby('night'):
    P(f'  con hora, nocturno={v}: n={int(sub.y.sum())}/{int((sub.y==0).sum())}', fmt(sub.y, sub.v02 >= 2))
P('  sin hora: n=%d/%d' % (S[S.localTime.isna()].y.sum(), (S[S.localTime.isna()].y == 0).sum()), fmt(S[S.localTime.isna()].y, S[S.localTime.isna()].v02 >= 2))
C = S[S.y == 0]
for k, sub in C.groupby('ctl_kind'):
    P(f'  falsas alarmas en controles {k}: {int((sub.v02>=2).sum())}/{len(sub)} protegelo; {int((sub.v02>=1).sum())}/{len(sub)} atento+')
P(f'  granizo chico (excluido): {int((ev[ev.group=="small"].v02>=2).sum())}/{int((ev.group=="small").sum())} protegelo')

H = S[S.y == 1]
miss = H[H.v02 < 2]
P(f'\n## Granizadas perdidas (no "protegelo"): {len(miss)}/{len(H)}')
reasons = []
for cid, r in miss.iterrows():
    why = []
    for m, pre in [('GFS', 'g_'), ('ECMWF', 'e_')]:
        if pd.isna(r.get(pre + 'strong_env')):
            continue
        if not r[pre + 'lapse_ok']:
            why.append(f'{m}:gradiente<6,5 (máx {r[pre+"lapse_max"]:.2f})')
        elif not r[pre + 'wmax_ok']:
            why.append(f'{m}:WMAX<1200 (máx {r[pre+"wmax_max"]:.0f})')
        elif not r[pre + 'both_any']:
            why.append(f'{m}:gradiente y WMAX no coinciden en el mismo punto-hora')
        elif not r[pre + 'trig']:
            why.append(f'{m}:sin disparo')
        else:
            why.append(f'{m}:protegelo')
    reasons.append(why)
    P(f'  {cid:45s} {r.season:4s} {r.group:8s} hora={r.localTime} GFS={int(r.v02_gfs)} ECMWF={r.v02_ecmwf} HR={r.rh:.2f} → ' + '; '.join(why))
flat = [w.split(':')[1].split(' (')[0] for ws in reasons for w in ws]
P('  Resumen de causas (por modelo):', pd.Series(flat).value_counts().to_dict())

fa = C[C.v02 >= 2]
P(f'\n## Falsas alarmas "protegelo": {len(fa)}/{len(C)}')
for cid, r in fa.iterrows():
    P(f'  {cid:45s} {r.season:4s} {r.ctl_kind:6s} hora={r.localTime} lapse_g={r.g_lapse_max:.2f} wmax_g={r.g_wmax_max:.0f} HR={r.rh:.2f}')
fa_g = C[C.v02_gfs >= 2]
P(f'  (solo GFS: {len(fa_g)} falsas alarmas; AND las baja a {len(fa)})')

# ---------- 2. ¿El disparo ayuda? ----------
P('\n# 2. Disparo (lluvia convectiva del modelo): "protegelo" con y sin exigirlo (GFS, todos los casos; y prueba)')
for lab, sub in [('todos', S), ('entrenamiento', S[~S.test]), ('prueba', S[S.test]), ('fría', S[S.season == 'cold']), ('cálida', S[S.season == 'warm'])]:
    P(f'  {lab:13s} con disparo: {fmt(sub.y, sub.g_strong_env & sub.g_trig)} | sin disparo: {fmt(sub.y, sub.g_strong_env)}')
P(f'  granizadas con ambiente fuerte en GFS pero sin disparo: {int((H.g_strong_env & ~H.g_trig).sum())}; controles: {int((C.g_strong_env & ~C.g_trig).sum())}')
P('  AUC de la lluvia convectiva máx. (GFS) por estación: fría %.2f, cálida %.2f' % (
    auc(G[(G.y == 1) & (G.season == 'cold')].max_showers, G[(G.y == 0) & (G.season == 'cold')].max_showers),
    auc(G[(G.y == 1) & (G.season == 'warm')].max_showers, G[(G.y == 0) & (G.season == 'warm')].max_showers)))

# ---------- 3. Radio: solo punto central vs 9 puntos ----------
P('\n# 3. Radio: v0.2 con solo el punto de grilla más cercano vs los 9 puntos (~40 km)')
lv = {}
for (cid, model), sub in ph[ph.in_window == 1].groupby(['id', 'model']):
    lv.setdefault(cid, {})[model] = (v02_level(sub), v02_level(sub[sub.center == 1]))
S['g9'] = [lv[c]['gfs_seamless'][0] for c in S.index]
S['g1'] = [lv[c]['gfs_seamless'][1] for c in S.index]
S['c1'] = [combine(lv[c]['gfs_seamless'][1], lv[c].get('ecmwf_ifs025', (np.nan, np.nan))[1]) for c in S.index]
for lab, sub in [('todos', S), ('prueba', S[S.test])]:
    P(f'  {lab}: GFS 9 pts protegelo {fmt(sub.y, sub.g9 >= 2)} | GFS centro {fmt(sub.y, sub.g1 >= 2)} | combinado 9 {fmt(sub.y, sub.v02 >= 2)} | combinado centro {fmt(sub.y, sub.c1 >= 2)}')
    P(f'  {lab}: atento+  GFS 9 {fmt(sub.y, sub.g9 >= 1)} | GFS centro {fmt(sub.y, sub.g1 >= 1)}')
P('  AUC centro vs 9 puntos (GFS): ver univariate_gfs.csv (ctr_* vs max_*)')

# ---------- 4. Ventana temporal (solo casos con hora) ----------
P('\n# 4. Ventana temporal (solo casos con hora conocida). GFS, nivel protegelo / atento+')
def lvl_window(cid, model, lo_h, hi_h, center=False):
    e = ev.loc[cid]
    t0 = pd.Timestamp(f'{e.date}T{e.localTime}').floor('h')
    sub = ph[(ph.id == cid) & (ph.model == model)]
    tt = pd.to_datetime(sub.time)
    sub = sub[(tt >= t0 + pd.Timedelta(hours=lo_h)) & (tt <= t0 + pd.Timedelta(hours=hi_h))]
    if center:
        sub = sub[sub.center == 1]
    return v02_level(sub)


Tm = S[S.localTime.notna()]
P(f'  n = {int(Tm.y.sum())} granizo / {int((Tm.y==0).sum())} controles con hora')
for lo_h, hi_h in [(-18, 5), (-6, 3), (-3, 2), (-12, 0), (-24, 12)]:
    l = np.array([lvl_window(c, 'gfs_seamless', lo_h, hi_h) for c in Tm.index])
    P(f'  ventana [{lo_h:+d} h, {hi_h:+d} h]: protegelo {fmt(Tm.y, l >= 2)} | atento+ {fmt(Tm.y, l >= 1)}')

# ---------- 5. AND / OR / promedio / un solo modelo ----------
P('\n# 5. Combinación de modelos (casos con ECMWF; y solo prueba 2025–26)')
X = S[S.has_ecmwf].copy()
X['mean_wil'] = (G.loc[X.index, 'wmax_if_lapse'] + E.loc[X.index, 'wmax_if_lapse']) / 2
X['trig_any'] = X.g_trig | X.e_trig
for lab, sub in [('con ECMWF (2024-06→)', X), ('prueba', X[X.test]), ('prueba fría', X[X.test & (X.season == 'cold')]), ('prueba cálida', X[X.test & (X.season == 'warm')])]:
    P(f'  {lab}: n={int(sub.y.sum())}/{int((sub.y==0).sum())}')
    P(f'     GFS      {fmt_ci(sub.y, sub.v02_gfs >= 2)}')
    P(f'     ECMWF    {fmt_ci(sub.y, sub.v02_ecmwf >= 2)}')
    P(f'     AND      {fmt_ci(sub.y, sub.v02 >= 2)}')
    P(f'     OR       {fmt_ci(sub.y, (sub.v02_gfs >= 2) | (sub.v02_ecmwf >= 2))}')
    P(f'     promedio {fmt_ci(sub.y, (sub.mean_wil >= 1200) & sub.trig_any)}  (WMAX co-ubicado con gradiente ≥ 6,5, promediado entre modelos)')

# ---------- 6. Regla candidata: HR media 850–500 en la estación cálida ----------
P('\n# 6. Regla candidata v0.3: en la estación cálida, "protegelo"/"atento" solo si HR 850–500 (p90 de la zona-ventana, GFS) < umbral')
tr = S[~S.test & (S.season == 'warm')]
best = None
for thr in np.arange(0.70, 0.96, 0.01):
    t_, pod, pofd = tss(tr.y, tr.rh < thr)
    if best is None or t_ > best[0]:
        best = (t_, thr)
thr = round(best[1], 2)
P(f'  umbral elegido en entrenamiento cálido 2021–24: HR < {thr:.2f} (TSS train {best[0]:+.2f})')
for lab, sub in [('cálida train', S[~S.test & (S.season == 'warm')]), ('cálida prueba', S[S.test & (S.season == 'warm')]), ('cálida todas', S[S.season == 'warm'])]:
    P(f'  {lab}: n={int(sub.y.sum())}/{int((sub.y==0).sum())} | HR sola {fmt(sub.y, sub.rh < thr)} | v0.2 atento+ {fmt(sub.y, sub.v02 >= 1)} | atento+ ∧ HR {fmt(sub.y, (sub.v02 >= 1) & (sub.rh < thr))}')
for lab, sub in [('fría todas', S[S.season == 'cold']), ('fría prueba', S[S.test & (S.season == 'cold')])]:
    P(f'  {lab}: protegelo {fmt(sub.y, sub.v02 >= 2)} | protegelo ∧ HR<{thr:.2f} {fmt(sub.y, (sub.v02 >= 2) & (sub.rh < thr))}')
P(f'  HR p90 mediana: granizo cálido {S[(S.y==1)&(S.season=="warm")].rh.median():.2f}, control cálido {S[(S.y==0)&(S.season=="warm")].rh.median():.2f}; '
  f'granizo frío {S[(S.y==1)&(S.season=="cold")].rh.median():.2f}, control frío {S[(S.y==0)&(S.season=="cold")].rh.median():.2f}')
P('  Correlación de Spearman (GFS, casos) HR vs gradiente: %.2f; HR vs WMAX: %.2f; HR vs lluvia conv.: %.2f' % (
    G.p90_rh85_50.corr(G.p90_lapse75, method='spearman'), G.p90_rh85_50.corr(G.p90_wmax, method='spearman'), G.p90_rh85_50.corr(G.p90_showers, method='spearman')))
open(f'{D}/errors_sens.txt', 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
