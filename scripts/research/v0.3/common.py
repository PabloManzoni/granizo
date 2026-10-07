"""Utilidades compartidas: carga de punto-horas, agregados por caso, AUC con bootstrap, TSS."""
import json
import numpy as np
import pandas as pd
from scipy.stats import rankdata

import os
# Datos intermedios (pointhours.csv, cases_*.csv) en .cache/research-v0.3; los generan extract.ts y build_cases.py.
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '.cache', 'research-v0.3')
RNG = np.random.default_rng(42)

PH = None
V = json.load(open(f'{D}/verdicts.json'))


def load_ph():
    global PH
    if PH is None:
        PH = pd.read_csv(f'{D}/pointhours.csv')
        PH['hour'] = PH['time'].str[11:13].astype(int)
    return PH


def events():
    rows = []
    for k, v in V.items():
        e = v['event']
        g = 'control' if e['type'] == 'control' else ('damaging' if e['damaging'] is True else ('small' if e['damaging'] is False else 'unknown'))
        lvl = {'calm': 0, 'watch': 1, 'protect': 2}
        rows.append(dict(
            id=k, type=e['type'], group=g, date=e['date'], season=e['season'], localTime=e['localTime'],
            matchedTo=e['matchedTo'], place=e['place'], lat=e['lat'], lon=e['lon'], inumet=e['inumet'],
            ctl_kind=('metar' if k.startswith('ctl-') else 'prensa') if e['type'] == 'control' else None,
            test=e['date'] >= '2025-01-01', frm=e['from'], to=e['to'],
            v02=lvl[v['combined']], v02_gfs=lvl[v['models']['gfs_seamless']['level']],
            v02_ecmwf=lvl[v['models']['ecmwf_ifs025']['level']] if 'ecmwf_ifs025' in v['models'] else np.nan,
            has_ecmwf='ecmwf_ifs025' in v['models'],
        ))
    ev = pd.DataFrame(rows).set_index('id')
    ev['y'] = np.where(ev.group.isin(['damaging', 'unknown']), 1, np.where(ev.group == 'control', 0, -1))
    return ev


def auc(pos, neg):
    pos = np.asarray(pos, float); neg = np.asarray(neg, float)
    pos = pos[~np.isnan(pos)]; neg = neg[~np.isnan(neg)]
    if len(pos) == 0 or len(neg) == 0:
        return np.nan
    # Mann-Whitney con empates
    allv = np.concatenate([pos, neg])
    ranks = rankdata(allv)
    r = ranks[:len(pos)].sum()
    return (r - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def auc_ci(pos, neg, n=2000, alpha=0.10):
    pos = np.asarray(pos, float); neg = np.asarray(neg, float)
    pos = pos[~np.isnan(pos)]; neg = neg[~np.isnan(neg)]
    a = auc(pos, neg)
    if len(pos) < 3 or len(neg) < 3:
        return a, np.nan, np.nan
    bs = [auc(RNG.choice(pos, len(pos)), RNG.choice(neg, len(neg))) for _ in range(n)]
    return a, np.quantile(bs, alpha / 2), np.quantile(bs, 1 - alpha / 2)


def tss(y, pred):
    y = np.asarray(y); pred = np.asarray(pred).astype(bool)
    pod = pred[y == 1].mean() if (y == 1).any() else np.nan
    pofd = pred[y == 0].mean() if (y == 0).any() else np.nan
    return pod - pofd, pod, pofd


def tss_ci(y, pred, n=2000, alpha=0.10):
    y = np.asarray(y); pred = np.asarray(pred).astype(bool)
    p = pred[y == 1]; q = pred[y == 0]
    t = p.mean() - q.mean()
    bs = [RNG.choice(p, len(p)).mean() - RNG.choice(q, len(q)).mean() for _ in range(n)]
    return t, np.quantile(bs, alpha / 2), np.quantile(bs, 1 - alpha / 2)


def v02_level(sub):
    """Nivel v0.2 de un modelo a partir de sus punto-horas (replica assessWindow)."""
    if len(sub) == 0:
        return np.nan
    env = sub.env_v02.max()
    trig = (sub.showers.max() >= 0.5) or (sub.precip.max() >= 2.0)
    return 2 if (env == 2 and trig) else (1 if env >= 1 else 0)


def combine(a, b):
    if np.isnan(b):
        return a
    if a == 2 and b == 2:
        return 2
    if a == 2 or b == 2 or (a >= 1 and b >= 1):
        return 1
    return 0


def auc_ci_cluster(pos, neg, gpos, gneg, n=2000, alpha=0.10):
    """AUC con bootstrap por bloques de fecha (remuestrea fechas, no casos)."""
    pos = np.asarray(pos, float); neg = np.asarray(neg, float); gpos = np.asarray(gpos); gneg = np.asarray(gneg)
    mp = ~np.isnan(pos); mn = ~np.isnan(neg)
    pos, gpos, neg, gneg = pos[mp], gpos[mp], neg[mn], gneg[mn]
    a = auc(pos, neg)
    if len(pos) < 3 or len(neg) < 3:
        return a, np.nan, np.nan
    up = np.unique(gpos); un = np.unique(gneg)
    ip = {g: np.where(gpos == g)[0] for g in up}; iN = {g: np.where(gneg == g)[0] for g in un}
    bs = []
    for _ in range(n):
        sp = np.concatenate([ip[g] for g in RNG.choice(up, len(up))])
        sn = np.concatenate([iN[g] for g in RNG.choice(un, len(un))])
        bs.append(auc(pos[sp], neg[sn]))
    return a, np.quantile(bs, alpha / 2), np.quantile(bs, 1 - alpha / 2)
