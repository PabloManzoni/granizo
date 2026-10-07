"""Agrega punto-horas → una fila por caso y modelo, con varios agregados. Salida: cases_gfs.csv, cases_ecmwf.csv, cases_mean.csv"""
import numpy as np
import pandas as pd
from common import D, load_ph, events

MAXF = ['mucape', 'sbcape', 'mlcape', 'wmax', 'wmax_ml', 'wmax_hgz', 'ship', 'lapse75', 'lapse85', 'lapse03', 'kindex', 'totals',
        'cape_hgz', 'cape_below_m10', 'cape_above_frz', 'shear06', 'shear03', 'shear0_850', 'shear850_500', 'shear700_400',
        'wspd500', 'wspd850', 'wspd_hgz', 'lapse_x_wmax', 'cape_x_lapse', 'lhp_termA', 'showers', 'precip', 'model_cape',
        'mu_mixr', 'ml_mixr', 'pw', 'td2', 'el_agl', 'rh75', 'rh87', 'env_v02',
        'cape_above_m10', 'eff_shear', 'rh85_50', 'lapse36', 'wmax_m10', 'wmax_eff']
NEG = {'li_mu': 'neg_li', 't500': 'neg_t500'}  # menos = más favorable → se toma el máximo de −x
PEAKF = ['wbz_agl', 'frz_agl', 'hgz_depth', 'lcl_agl', 'rh75', 'rh87', 'pw', 't500', 'z10_agl', 'mu_elevated', 'lapse75', 'shear06',
         'mucape', 'td2', 'wspd_hgz', 'hour', 'mlcape', 'sbcape', 'rh85_50', 'lapse36', 'cape_above_m10', 'eff_shear']


def agg(sub):
    out = {}
    sub = sub.copy()
    for k, nk in NEG.items():
        sub[nk] = -sub[k]
    for f in MAXF + list(NEG.values()):
        x = sub[f].dropna()
        out[f'max_{f}'] = x.max() if len(x) else np.nan
    # Agregados alternativos para las variables clave
    for f in ['wmax', 'lapse75', 'ship', 'mucape', 'cape_hgz', 'lapse_x_wmax', 'showers', 'kindex', 'totals', 'cape_above_m10', 'wbz_agl', 'rh85_50']:
        x = sub[f].dropna()
        c = sub[sub.center == 1][f].dropna()
        out[f'p90_{f}'] = np.quantile(x, 0.9) if len(x) else np.nan
        out[f'p50_{f}'] = np.median(x) if len(x) else np.nan
        out[f'ctr_{f}'] = c.max() if len(c) else np.nan
        # máximo por punto, luego mediana entre puntos (robustez espacial)
        out[f'medpt_{f}'] = sub.groupby(['lat', 'lon'])[f].max().median()
    # Conteos / persistencia
    strong = sub.env_v02 == 2
    supp = sub.env_v02 >= 1
    out['n_ph'] = len(sub)
    out['frac_strong'] = strong.mean()
    out['frac_supp'] = supp.mean()
    out['hours_strong'] = sub[strong].time.nunique()
    out['hours_supp'] = sub[supp].time.nunique()
    out['pts_strong'] = sub[strong].groupby(['lat', 'lon']).ngroups
    out['hours_conv'] = sub[sub.showers >= 0.5].time.nunique()
    out['ctr_env'] = sub[sub.center == 1].env_v02.max()
    # Ingredientes en el mismo punto-hora: el de mayor WMAXSHEAR y, aparte, el de mayor MUCAPE
    pk = sub.loc[sub.wmax.idxmax()]
    for f in PEAKF:
        out[f'pk_{f}'] = pk[f]
    # Gradiente en el punto-hora de mayor WMAXSHEAR entre los que tienen lluvia convectiva (co-ubicación con el disparo)
    conv = sub[sub.showers >= 0.5]
    out['conv_max_wmax'] = conv.wmax.max() if len(conv) else 0.0
    out['conv_max_lapse'] = conv.lapse75.max() if len(conv) else np.nan
    out['conv_max_ship'] = conv.ship.max() if len(conv) else 0.0
    # Variables combinadas "fuertes" co-ubicadas
    good = sub[sub.lapse75 >= 6.5]
    out['wmax_if_lapse'] = good.wmax.max() if len(good) else 0.0
    out['cape_hgz_if_lapse'] = good.cape_hgz.max() if len(good) else 0.0
    return out


def build(ph, ev, model):
    rows = {}
    for cid, sub in ph[(ph.model == model) & (ph.in_window == 1)].groupby('id'):
        rows[cid] = agg(sub)
    return pd.DataFrame.from_dict(rows, orient='index').join(ev, how='left')


if __name__ == '__main__':
    ph = load_ph()
    ev = events()
    g = build(ph, ev, 'gfs_seamless')
    g.to_csv(f'{D}/cases_gfs.csv')
    e = build(ph, ev, 'ecmwf_ifs025')
    e.to_csv(f'{D}/cases_ecmwf.csv')
    # Promedio de los dos modelos (solo columnas numéricas de predictores) en los casos con ECMWF
    num = [c for c in e.columns if c not in ev.columns]
    m = (g.loc[e.index, num] + e[num]) / 2
    m = m.join(ev, how='left')
    m.to_csv(f'{D}/cases_mean.csv')
    print(g.shape, e.shape, m.shape)
