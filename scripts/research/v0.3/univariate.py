"""Ranking univariado de predictores: AUC por estación con IC bootstrap por bloques de fecha, pares emparejados,
estabilidad entrenamiento/prueba. Salida: univariate_<modelo>.csv"""
import sys
import numpy as np
import pandas as pd
from common import D, auc, auc_ci_cluster, events

META = set(events().columns) | {'n_ph'}


def run(name, nboot=1000):
    c = pd.read_csv(f'{D}/cases_{name}.csv', index_col=0)
    preds = [k for k in c.columns if k not in META and c[k].dtype != object]
    H = c[c.y == 1]; C = c[c.y == 0]
    out = []
    pairs = [(m, cid) for cid, m in C.matchedTo.dropna().items() if m in c.index]
    for f in preds:
        r = {'pred': f}
        for lab, h, k in [('all', H, C), ('cold', H[H.season == 'cold'], C[C.season == 'cold']),
                          ('warm', H[H.season == 'warm'], C[C.season == 'warm'])]:
            a, lo, hi = auc_ci_cluster(h[f], k[f], h.date, k.date, n=nboot)
            r[f'auc_{lab}'], r[f'lo_{lab}'], r[f'hi_{lab}'] = a, lo, hi
            r[f'n_{lab}'] = f'{h[f].notna().sum()}/{k[f].notna().sum()}'
        r['auc_dmg'] = auc(H[H.group == 'damaging'][f], C[f])
        r['auc_small'] = auc(c[c.group == 'small'][f], C[f])  # granizo chico vs control
        r['auc_train'] = auc(H[~H.test][f], C[~C.test][f])
        r['auc_test'] = auc(H[H.test][f], C[C.test][f])
        r['auc_warm_metar'] = auc(H[H.season == 'warm'][f], C[(C.season == 'warm') & (C.ctl_kind == 'metar')][f])
        r['auc_warm_prensa'] = auc(H[H.season == 'warm'][f], C[(C.season == 'warm') & (C.ctl_kind == 'prensa')][f])
        w = [(c.at[h, f], c.at[k, f]) for h, k in pairs if pd.notna(c.at[h, f]) and pd.notna(c.at[k, f])]
        r['pairs_win'] = sum(a > b for a, b in w) + 0.5 * sum(a == b for a, b in w)
        r['pairs_n'] = len(w)
        out.append(r)
    df = pd.DataFrame(out).set_index('pred')
    df.to_csv(f'{D}/univariate_{name}.csv')
    return df


if __name__ == '__main__':
    for name in sys.argv[1:] or ['gfs', 'ecmwf', 'mean']:
        df = run(name)
        print(name, df.shape)
