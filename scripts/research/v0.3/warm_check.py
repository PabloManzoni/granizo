"""Estación cálida: estabilidad entrenamiento/prueba de los candidatos y umbral de "máximo por azar" (permutación)."""
import numpy as np, pandas as pd
from common import D, auc, events, RNG
META = set(events().columns) | {'n_ph'}
for name in ['gfs', 'mean']:
    c = pd.read_csv(f'{D}/cases_{name}.csv', index_col=0)
    preds = [k for k in c.columns if k not in META and c[k].dtype != object]
    for season in ['warm', 'cold']:
        s = c[(c.season == season) & (c.y >= 0)]
        y = s.y.values
        X = s[preds]
        obs = {f: auc(X[f][y == 1], X[f][y == 0]) for f in preds}
        # permutación por bloques de fecha: se baraja la etiqueta de cada fecha
        dates = s.date.values; ud = np.unique(dates)
        lab_by_date = {d: y[dates == d] for d in ud}
        mx = []
        for _ in range(300):
            perm = RNG.permutation(len(y))
            yp = y[perm]
            mx.append(max(abs(auc(X[f].values[yp == 1], X[f].values[yp == 0]) - .5) for f in preds))
        thr = np.quantile(mx, 0.95)
        print(f'\n== {name} {season}: n={int((y==1).sum())}/{int((y==0).sum())}  max|AUC-0.5| por azar (p95 sobre {len(preds)} predictores) = {thr:.3f} -> AUC fuera de [{.5-thr:.2f}, {.5+thr:.2f}]')
        top = sorted(obs.items(), key=lambda kv: -abs(kv[1] - .5))[:15]
        for f, a in top:
            tr = s[~s.test]; te = s[s.test]
            print(f'{f:22s} AUC={a:.2f}  train={auc(tr[f][tr.y==1], tr[f][tr.y==0]):.2f} ({(tr.y==1).sum()}/{(tr.y==0).sum()})  test={auc(te[f][te.y==1], te[f][te.y==0]):.2f} ({(te.y==1).sum()}/{(te.y==0).sum()})')
