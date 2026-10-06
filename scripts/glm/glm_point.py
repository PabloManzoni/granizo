"""Rayos del GOES (GLM) alrededor de un punto: tasa de flashes y "lightning jump".

Fuente: buckets públicos de NOAA en AWS (sin cuenta): noaa-goes16 (hasta 2025-04-06) y noaa-goes19 (desde 2025-04-07),
producto GLM-L2-LCFA, un archivo NetCDF cada 20 s con todos los flashes del disco completo.

Lightning jump (Schultz et al. 2009, algoritmo "2σ"): con la tasa de flashes en bins de 2 min, DFRDT = cambio de la tasa;
hay salto cuando DFRDT supera 2 desvíos estándar de los 5 DFRDT previos y la tasa es ≥ 10 flashes/min.
Acá se aplica a un círculo alrededor del punto (sin seguimiento de celdas): es una simplificación.

Uso: python3 glm_point.py <lat> <lon> <AAAA-MM-DDTHH:MM local UY | now> [min_antes=90] [min_despues=30]
     Con "now" mira la última hora hasta hace 1 minuto (latencia medida: los archivos se publican ~7 s después).
Imprime un JSON con los conteos y el salto máximo.
"""
import io
import json
import math
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import h5py
import numpy as np

UY_OFFSET = timedelta(hours=3)  # UTC = local + 3 h
G19_START = datetime(2025, 4, 7)
RADII_KM = (30, 50)
BIN_MIN = 2


def bucket_for(t_utc):
    return "noaa-goes19" if t_utc >= G19_START else "noaa-goes16"


def list_keys(bucket, t_utc):
    prefix = f"GLM-L2-LCFA/{t_utc:%Y}/{t_utc.timetuple().tm_yday:03d}/{t_utc:%H}/"
    url = f"https://{bucket}.s3.amazonaws.com/?list-type=2&prefix={prefix}"
    with urllib.request.urlopen(url, timeout=60) as r:
        return re.findall(r"<Key>([^<]+)</Key>", r.read().decode())


def file_start(key):
    m = re.search(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)_", key)
    y, doy, hh, mm, ss, _ = (int(x) for x in m.groups())
    return datetime(y, 1, 1) + timedelta(days=doy - 1, hours=hh, minutes=mm, seconds=ss)


def flashes_near(bucket, key, lat0, lon0):
    url = f"https://{bucket}.s3.amazonaws.com/{key}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
            break
        except Exception:
            if attempt == 2:
                return None
    with h5py.File(io.BytesIO(data), "r") as f:
        if "flash_lat" not in f:
            return {r: 0 for r in RADII_KM}
        lat = f["flash_lat"][:].astype(float)
        lon = f["flash_lon"][:].astype(float)
    # distancia aproximada (equirectangular, suficiente a < 100 km)
    dy = (lat - lat0) * 111.32
    dx = (lon - lon0) * 111.32 * math.cos(math.radians(lat0))
    d = np.hypot(dx, dy)
    return {r: int((d <= r).sum()) for r in RADII_KM}


def lightning_jump(rates):
    """rates: tasas (flashes/min) por bin. Devuelve el máximo de DFRDT/σ con tasa ≥ 10 y si hubo salto (≥ 2σ)."""
    dfrdt = np.diff(rates) / BIN_MIN
    best = 0.0
    for t in range(5, len(dfrdt)):
        prev = dfrdt[t - 5:t]
        sigma = prev.std()
        if rates[t + 1] < 10 or sigma <= 0:
            continue
        best = max(best, dfrdt[t] / sigma)
    return best, best >= 2


def main():
    lat0, lon0 = float(sys.argv[1]), float(sys.argv[2])
    if sys.argv[3] == "now":
        t0 = datetime.utcnow() - timedelta(minutes=1)
        before, after = 60, 0
    else:
        t0 = datetime.fromisoformat(sys.argv[3]) + UY_OFFSET
        before = int(sys.argv[4]) if len(sys.argv) > 4 else 90
        after = int(sys.argv[5]) if len(sys.argv) > 5 else 30
    start, end = t0 - timedelta(minutes=before), t0 + timedelta(minutes=after)

    keys = []
    hour = start.replace(minute=0, second=0)
    while hour <= end:
        bucket = bucket_for(hour)
        keys += [(bucket, k) for k in list_keys(bucket, hour) if start <= file_start(k) < end]
        hour += timedelta(hours=1)

    with ThreadPoolExecutor(max_workers=16) as pool:
        counts = list(pool.map(lambda bk: (file_start(bk[1]), flashes_near(bk[0], bk[1], lat0, lon0)), keys))

    n_bins = int((end - start).total_seconds() // (BIN_MIN * 60))
    out = {
        "from_utc": start.isoformat(timespec="minutes"),
        "to_utc": end.isoformat(timespec="minutes"),
        "files": len(keys),
        "missing": sum(c is None for _, c in counts),
        "satellite": bucket_for(start),
    }
    for r in RADII_KM:
        bins = np.zeros(n_bins)
        for ts, c in counts:
            if c is None:
                continue
            i = int((ts - start).total_seconds() // (BIN_MIN * 60))
            if 0 <= i < n_bins:
                bins[i] += c[r]
        rates = bins / BIN_MIN
        jump_sigma, jump = lightning_jump(rates)
        out[f"r{r}"] = {
            "total": int(bins.sum()),
            "maxRatePerMin": round(float(rates.max()), 1),
            "jumpSigma": round(float(jump_sigma), 2),
            "jump": bool(jump),
        }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
