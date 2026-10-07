"""Modelos simples vs v0.2: entrenamiento 2021–24 / prueba 2025–26 y CV repetida estratificada por bloques de fecha.
Salida: models_results.txt / models_cv.csv"""
import warnings
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.tree import DecisionTreeClassifier, export_text


class StratifiedGroupKFold:
    """Mínimo: reparte FECHAS en pliegues, round-robin dentro de cada etiqueta mayoritaria de la fecha."""
    def __init__(self, n_splits=5, shuffle=True, random_state=0):
        self.k = n_splits; self.rs = np.random.default_rng(random_state)

    def split(self, X, y, groups):
        y = np.asarray(y); groups = np.asarray(groups)
        ud = np.unique(groups)
        lab = {d: round(y[groups == d].mean()) for d in ud}
        fold = {}
        for L in (0, 1):
            ds = [d for d in ud if lab[d] == L]
            self.rs.shuffle(ds)
            off = self.rs.integers(self.k)
            for i, d in enumerate(ds):
                fold[d] = (i + off) % self.k
        f = np.array([fold[g] for g in groups])
        for i in range(self.k):
            yield np.where(f != i)[0], np.where(f == i)[0]
from common import D, auc, RNG

warnings.filterwarnings('ignore')
G = pd.read_csv(f'{D}/cases_gfs.csv', index_col=0)
E = pd.read_csv(f'{D}/cases_ecmwf.csv', index_col=0)
M = pd.read_csv(f'{D}/cases_mean.csv', index_col=0)


def prep(c):
    c = c[c.y >= 0].copy()
    c['warm'] = (c.season == 'warm').astype(float)
    c['s_lxw'] = np.sqrt(c.p90_lapse_x_wmax)
    c['s_wmax'] = c.p90_wmax / 1000
    c['lapse'] = c.p90_lapse75
    c['rh'] = c.p90_rh85_50
    c['rh_warm'] = c.rh * c.warm
    c['lapse_warm'] = c.lapse * c.warm
    c['lxw_warm'] = c.s_lxw * c.warm
    c['wmax_warm'] = c.s_wmax * c.warm
    c['lcl'] = c.pk_lcl_agl / 1000
    c['ws850'] = c.max_wspd850
    c['conv'] = c.p90_showers
    c['v02gfs'] = c.v02_gfs
    c['lapse_cold'] = c.lapse * (1 - c.warm)
    c['wmax_cold'] = c.s_wmax * (1 - c.warm)
    c['lxw_cold'] = c.s_lxw * (1 - c.warm)
    return c


G, E, M = prep(G), prep(E), prep(M)

SETS = {
    'L1 √(lapse×WMAX)': ['s_lxw'],
    'L2 lapse + WMAX': ['lapse', 's_wmax'],
    'L3 lapse + WMAX + HR850–500': ['lapse', 's_wmax', 'rh'],
    'L4 √(lapse×WMAX) + HR': ['s_lxw', 'rh'],
    'L5 L4 + estación + interacciones': ['s_lxw', 'rh', 'warm', 'lxw_warm', 'rh_warm'],
    'L6 L2 + estación×(lapse,WMAX)': ['lapse', 's_wmax', 'warm', 'lapse_warm', 'wmax_warm'],
    'L7 HR + LCL + viento850 (cálida)': ['rh', 'lcl', 'ws850'],
    'L8 por estación: fría lapse+WMAX, cálida HR': ['warm', 'lapse_cold', 'wmax_cold', 'rh_warm'],
    'L9 por estación: fría √(l×W), cálida HR': ['warm', 'lxw_cold', 'rh_warm'],
}
TREE_FEATS = ['lapse', 's_wmax', 's_lxw', 'rh', 'lcl', 'ws850', 'conv', 'warm']


def fit_lr(tr, feats):
    m = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000))
    X = tr[feats].fillna(tr[feats].median())
    m.fit(X, tr.y)
    return m


def predict(m, te, feats, ref):
    return m.predict_proba(te[feats].fillna(ref[feats].median()))[:, 1]


def best_thr(y, p):
    best = (-9, 0.5)
    for t in np.unique(p):
        pr = p >= t
        s = pr[y == 1].mean() - pr[y == 0].mean()
        if s > best[0]:
            best = (s, t)
    return best[1]


def metrics(y, p, thr):
    y = np.asarray(y); p = np.asarray(p)
    pr = p >= thr
    pod, pofd = pr[y == 1].mean(), pr[y == 0].mean()
    return dict(auc=auc(p[y == 1], p[y == 0]), brier=np.mean((p - y) ** 2), pod=pod, pofd=pofd, tss=pod - pofd)


def v02_prob(tr, te, col):
    """v0.2 como probabilidad: frecuencia de granizo por nivel en entrenamiento."""
    f = tr.groupby(col).y.mean()
    return te[col].map(f).fillna(tr.y.mean()).values


def boot_delta(y, p1, p2, dates, n=2000):
    """IC 90% de ΔAUC (p1 − p2) con bootstrap por bloques de fecha."""
    y = np.asarray(y); ud = np.unique(dates); idx = {d: np.where(dates == d)[0] for d in ud}
    out = []
    for _ in range(n):
        s = np.concatenate([idx[d] for d in RNG.choice(ud, len(ud))])
        if y[s].min() == y[s].max():
            continue
        out.append(auc(p1[s][y[s] == 1], p1[s][y[s] == 0]) - auc(p2[s][y[s] == 1], p2[s][y[s] == 0]))
    return np.quantile(out, [0.05, 0.95])


lines = []
P = lambda *a: lines.append(' '.join(str(x) for x in a))

# ---------- 1. Entrenamiento 2021–24 / prueba 2025–26 (GFS) ----------
tr, te = G[~G.test], G[G.test]
P(f'# Split temporal (GFS). train {int(tr.y.sum())}/{int((tr.y==0).sum())}  test {int(te.y.sum())}/{int((te.y==0).sum())}')
P('modelo | AUC | Brier | POD | POFD | TSS (umbral elegido en train) | AUC cálida | AUC fría | ΔAUC vs v0.2-GFS IC90')
base_p = v02_prob(tr, te, 'v02gfs')
mb = metrics(te.y, base_p, 1.0 - 1e-9 + 0) if False else None
for lvl, name in [(2, 'v0.2 GFS "protegelo"'), (1, 'v0.2 GFS "atento+"')]:
    pr = te.v02gfs >= lvl
    P(f'{name} | AUC(ordinal)={auc(te.v02gfs[te.y==1], te.v02gfs[te.y==0]):.2f} | Brier={np.mean((base_p-te.y)**2):.3f} | POD={pr[te.y==1].mean():.2f} | POFD={pr[te.y==0].mean():.2f} | TSS={pr[te.y==1].mean()-pr[te.y==0].mean():.2f}')
pr = te.v02 >= 2
P(f'v0.2 combinado (GFS∧ECMWF) "protegelo" | AUC(ordinal)={auc(te.v02[te.y==1], te.v02[te.y==0]):.2f} | POD={pr[te.y==1].mean():.2f} | POFD={pr[te.y==0].mean():.2f} | TSS={pr[te.y==1].mean()-pr[te.y==0].mean():.2f}')
fitted = {}
for name, feats in SETS.items():
    m = fit_lr(tr, feats)
    fitted[name] = m
    ptr = predict(m, tr, feats, tr)
    thr = best_thr(tr.y.values, ptr)
    p = predict(m, te, feats, tr)
    r = metrics(te.y.values, p, thr)
    w = te.warm == 1
    aw = auc(p[w & (te.y == 1)], p[w & (te.y == 0)]); ac = auc(p[~w & (te.y == 1)], p[~w & (te.y == 0)])
    lo, hi = boot_delta(te.y.values, p, te.v02gfs.values.astype(float), te.date.values)
    P(f'{name} | {r["auc"]:.2f} | {r["brier"]:.3f} | {r["pod"]:.2f} | {r["pofd"]:.2f} | {r["tss"]:.2f} | {aw:.2f} | {ac:.2f} | [{lo:+.2f}, {hi:+.2f}]')
    coef = m[-1].coef_[0]
    P('   coef (estandarizados):', ', '.join(f'{f}={c:+.2f}' for f, c in zip(feats, coef)))
# árbol
t = DecisionTreeClassifier(max_depth=2, min_samples_leaf=6, random_state=0).fit(tr[TREE_FEATS].fillna(tr[TREE_FEATS].median()), tr.y)
p = t.predict_proba(te[TREE_FEATS].fillna(tr[TREE_FEATS].median()))[:, 1]
thr = best_thr(tr.y.values, t.predict_proba(tr[TREE_FEATS].fillna(tr[TREE_FEATS].median()))[:, 1])
r = metrics(te.y.values, p, thr)
P(f'Árbol prof. 2 | {r["auc"]:.2f} | {r["brier"]:.3f} | {r["pod"]:.2f} | {r["pofd"]:.2f} | {r["tss"]:.2f}')
P(export_text(t, feature_names=TREE_FEATS))

# Transferencia a ECMWF y promedio en la prueba (modelo entrenado con GFS)
P('\n# Prueba 2025–26 aplicando los modelos entrenados con GFS a features de ECMWF y del promedio GFS/ECMWF')
for lab, C in [('ECMWF', E), ('promedio', M)]:
    tc = C[C.test]
    for name in ['L1 √(lapse×WMAX)', 'L2 lapse + WMAX', 'L3 lapse + WMAX + HR850–500', 'L5 L4 + estación + interacciones', 'L8 por estación: fría lapse+WMAX, cálida HR', 'L9 por estación: fría √(l×W), cálida HR']:
        feats = SETS[name]
        p = predict(fitted[name], tc, feats, tr)
        thr = best_thr(tr.y.values, predict(fitted[name], tr, feats, tr))
        r = metrics(tc.y.values, p, thr)
        P(f'{lab:8s} {name} | AUC={r["auc"]:.2f} Brier={r["brier"]:.3f} POD={r["pod"]:.2f} POFD={r["pofd"]:.2f} TSS={r["tss"]:.2f}')
    pr = tc.v02_ecmwf >= 2 if lab == 'ECMWF' else tc.v02 >= 2
    P(f'{lab:8s} v0.2 protegelo ({"ECMWF" if lab=="ECMWF" else "AND"}) | POD={pr[tc.y==1].mean():.2f} POFD={pr[tc.y==0].mean():.2f} TSS={pr[tc.y==1].mean()-pr[tc.y==0].mean():.2f}')

# ---------- 2. CV repetida, estratificada y agrupada por fecha (todo GFS, 124 casos) ----------
P('\n# CV 5-fold × 40 repeticiones, StratifiedGroupKFold por fecha (GFS, 124 casos). Media [p5–p95] entre repeticiones')
res = {k: [] for k in list(SETS) + ['v0.2 GFS (ordinal)', 'Árbol prof. 2']}
for rep in range(40):
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=rep)
    oof = {k: np.zeros(len(G)) for k in res}
    thr_pred = {k: np.zeros(len(G), bool) for k in res}
    for tri, tei in cv.split(G, G.y, G.date):
        a, b = G.iloc[tri], G.iloc[tei]
        for name, feats in SETS.items():
            m = fit_lr(a, feats)
            oof[name][tei] = predict(m, b, feats, a)
            thr_pred[name][tei] = oof[name][tei] >= best_thr(a.y.values, predict(m, a, feats, a))
        oof['v0.2 GFS (ordinal)'][tei] = v02_prob(a, b, 'v02gfs')
        thr_pred['v0.2 GFS (ordinal)'][tei] = b.v02gfs.values >= 2
        tt = DecisionTreeClassifier(max_depth=2, min_samples_leaf=6, random_state=0).fit(a[TREE_FEATS].fillna(a[TREE_FEATS].median()), a.y)
        oof['Árbol prof. 2'][tei] = tt.predict_proba(b[TREE_FEATS].fillna(a[TREE_FEATS].median()))[:, 1]
        thr_pred['Árbol prof. 2'][tei] = oof['Árbol prof. 2'][tei] >= best_thr(a.y.values, tt.predict_proba(a[TREE_FEATS].fillna(a[TREE_FEATS].median()))[:, 1])
    y = G.y.values; w = G.warm.values == 1
    for k in res:
        p = oof[k]; pr = thr_pred[k]
        res[k].append(dict(auc=auc(p[y == 1], p[y == 0]), brier=np.mean((p - y) ** 2),
                           tss=pr[y == 1].mean() - pr[y == 0].mean(),
                           auc_warm=auc(p[w & (y == 1)], p[w & (y == 0)]), auc_cold=auc(p[~w & (y == 1)], p[~w & (y == 0)]),
                           tss_warm=pr[w & (y == 1)].mean() - pr[w & (y == 0)].mean(),
                           tss_cold=pr[~w & (y == 1)].mean() - pr[~w & (y == 0)].mean()))
rows = []
for k, v in res.items():
    d = pd.DataFrame(v)
    row = {'modelo': k}
    for col in d.columns:
        row[col] = f'{d[col].mean():.2f} [{d[col].quantile(.05):.2f}–{d[col].quantile(.95):.2f}]'
    rows.append(row)
cvdf = pd.DataFrame(rows)
cvdf.to_csv(f'{D}/models_cv.csv', index=False)
P(cvdf.to_string(index=False))
P('Nota: v0.2 GFS se evalúa con sus umbrales fijos (ajustados con 2021–24), así que en la CV no es "fuera de muestra" para los pliegues 2021–24.')
open(f'{D}/models_results.txt', 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
