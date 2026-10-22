"""Qué está pasando ahora cerca de Uruguay: rayos, lluvia estimada por satélite y radar, en un JSON para la app.

Lo corre .github/workflows/nowcast.yml cada 10 minutos y lo publica en la rama `nowcast` (latest.json).
Fuentes:
- Rayos: GOES-19 GLM (NOAA, bucket público noaa-goes19, archivos de 20 s, ~10–30 s de latencia).
- Lluvia: NOAA Enterprise Rain Rate (RRQPE, estimación por satélite infrarrojo, 0,02°, cada 10 min, ~5–15 min de
  latencia; bucket público noaa-enterprise-rainrate-pds). No es radar: ve bien los núcleos fríos, mal la lluvia débil.
- Radar: REDEMET (DECEA, Brasil), radares de Santiago/RS y Canguçu/RS, que ven el norte y el noreste de Uruguay.
  Necesita REDEMET_API_KEY; las imágenes (PNG) son públicas y la app las carga directo. Sin clave, el radar queda afuera.

Uso: REDEMET_API_KEY=... python3 scripts/nowcast/build.py [salida=nowcast/latest.json]
Sale con error solo si no se pudo armar nada (así la rama conserva el último JSON bueno).
"""
import io
import json
import math
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import h5py
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "glm"))
from glm_point import BIN_MIN, file_start, lightning_jump, list_keys  # noqa: E402

VERSION = 1
# Uruguay y ~80 km alrededor: por ahí llegan las tormentas que importan en la próxima hora.
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -35.8, -29.0, -59.5, -52.0
CELL_DEG = 0.1
WINDOW_MIN = 30
SLOT_MIN = 10
RADII_KM = (30, 50)
RAIN_MIN_MMH = 1.0
# Mismas ciudades que src/cli/log-runs.ts.
CITIES = [
    ("Montevideo", -34.9, -56.16), ("El Pinar", -34.8, -55.91), ("Canelones", -34.52, -56.28),
    ("Maldonado", -34.9, -54.95), ("Colonia", -34.47, -57.84), ("Mercedes", -33.25, -58.03),
    ("Paysandú", -32.32, -58.08), ("Salto", -31.39, -57.96), ("Artigas", -30.4, -56.47),
    ("Rivera", -30.9, -55.55), ("Tacuarembó", -31.71, -55.98), ("Melo", -32.37, -54.17),
    ("Treinta y Tres", -33.23, -54.38), ("Durazno", -33.38, -56.52), ("Florida", -34.1, -56.21),
    ("Rocha", -34.48, -54.33),
]
GLM_BUCKET = "noaa-goes19"
RAIN_URL = "https://noaa-enterprise-rainrate-pds.s3.amazonaws.com"
RAIN_PREFIX = "BLEND/RainRate-Blend-INST"
RAIN_DEG = 0.02
REDEMET_URL = "https://api-redemet.decea.mil.br/produtos/radar/maxcappi"
RADARS = [("sg", "Santiago/RS"), ("cn", "Canguçu/RS")]
RADAR_FRESH_MIN = 60


def get(url, headers=None, timeout=60, attempts=3):
    """GET con reintentos: S3 y REDEMET a veces cortan la conexión a mitad de la respuesta."""
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=timeout) as r:
                return r.read()
        except Exception:
            if attempt == attempts - 1:
                raise


def km(lat0, lon0, lat, lon):
    """Distancia aproximada (equirectangular, suficiente a < 100 km)."""
    dy = (np.asarray(lat) - lat0) * 111.32
    dx = (np.asarray(lon) - lon0) * 111.32 * math.cos(math.radians(lat0))
    return np.hypot(dx, dy)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def cell_of(lat, lon):
    return np.floor((lat - LAT_MIN) / CELL_DEG).astype(int), np.floor((lon - LON_MIN) / CELL_DEG).astype(int)


def cell_center(i, j):
    return round(LAT_MIN + (i + 0.5) * CELL_DEG, 2), round(LON_MIN + (j + 0.5) * CELL_DEG, 2)


# ---- Rayos ----

def flashes_in_zone(key):
    with h5py.File(io.BytesIO(get(f"https://{GLM_BUCKET}.s3.amazonaws.com/{key}")), "r") as f:
        if "flash_lat" not in f:
            return np.empty(0), np.empty(0)
        lat = f["flash_lat"][:].astype(float)
        lon = f["flash_lon"][:].astype(float)
    inside = (lat >= LAT_MIN) & (lat <= LAT_MAX) & (lon >= LON_MIN) & (lon <= LON_MAX)
    return lat[inside], lon[inside]


def lightning(now):
    end = now - timedelta(minutes=1)  # los archivos se publican ~10–30 s después de cerrar
    start = end - timedelta(minutes=WINDOW_MIN)
    keys = []
    hour = start.replace(minute=0, second=0, microsecond=0)
    while hour <= end:
        keys += [k for k in list_keys(GLM_BUCKET, hour) if start <= file_start(k) < end]
        hour += timedelta(hours=1)

    def load(key):
        try:
            return file_start(key), *flashes_in_zone(key)
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=16) as pool:
        files = [f for f in pool.map(load, keys) if f is not None]
    if not files:
        raise RuntimeError("sin archivos GLM en la ventana")

    times = np.concatenate([np.full(len(lat), (end - ts).total_seconds() / 60) for ts, lat, _ in files])
    lat = np.concatenate([f[1] for f in files])
    lon = np.concatenate([f[2] for f in files])
    slot = np.minimum((times // SLOT_MIN).astype(int), WINDOW_MIN // SLOT_MIN - 1)  # 0 = últimos 10 min

    grid = {}
    for i, j, s in zip(*cell_of(lat, lon), slot):
        grid.setdefault((i, j), [0] * (WINDOW_MIN // SLOT_MIN))[s] += 1
    cells = [[*cell_center(i, j), *counts] for (i, j), counts in sorted(grid.items())]

    n_bins = WINDOW_MIN // BIN_MIN
    cities = {}
    for name, clat, clon in CITIES:
        d = km(clat, clon, lat, lon)
        out = {"nearestKm": round(float(d.min()), 1) if len(d) else None}
        for r in RADII_KM:
            near = d <= r
            # Tasa en bins de 2 min, del más viejo al más nuevo, para el "lightning jump" (como scripts/glm/).
            bins = np.bincount(np.minimum((times[near] // BIN_MIN).astype(int), n_bins - 1), minlength=n_bins)[::-1]
            rates = bins / BIN_MIN
            jump_sigma, jump = lightning_jump(rates)
            out[f"r{r}"] = {
                "last10": int((near & (slot == 0)).sum()),
                "last30": int(near.sum()),
                "maxRatePerMin": round(float(rates.max()), 1),
                "jump": bool(jump),
                "jumpSigma": round(float(jump_sigma), 2),
            }
        cities[name] = out
    return {
        "source": "GOES-19 GLM (NOAA)",
        "fromUtc": iso(start),
        "toUtc": iso(end),
        "files": len(files),
        "missingFiles": len(keys) - len(files),
        "flashes": int(len(lat)),
        # [lat, lon, rayos últimos 10 min, 10–20 min antes, 20–30 min antes] por celda de 0,1° con algún rayo.
        "grid": {"cellDeg": CELL_DEG, "slotMin": SLOT_MIN, "cells": cells},
    }, cities


# ---- Lluvia estimada por satélite ----

def latest_rain_key(now):
    for back in range(3):
        h = now - timedelta(hours=back)
        xml = get(f"{RAIN_URL}/?list-type=2&prefix={RAIN_PREFIX}/{h:%Y/%m/%d/%H}/").decode()
        keys = re.findall(r"<Key>([^<]*RRQPE-INST-GLB-(\d)[^<]*_s(\d{14})[^<]*)</Key>", xml)
        if keys:
            # La más reciente; para un mismo barrido, la mezcla más completa (GLB-5 > GLB-2).
            return max(keys, key=lambda k: (k[2], k[1]))[0]
    raise RuntimeError("sin archivos RRQPE en las últimas 3 horas")


def rain():
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    key = latest_rain_key(now)
    r0, r1 = int((70 - LAT_MAX) / RAIN_DEG), int((70 - LAT_MIN) / RAIN_DEG) + 1
    c0, c1 = int((LON_MIN + 180) / RAIN_DEG), int((LON_MAX + 180) / RAIN_DEG) + 1
    with h5py.File(io.BytesIO(get(f"{RAIN_URL}/{key}")), "r") as f:
        v = f["RRQPE"]
        raw = v[r0:r1, c0:c1].astype(float)
        fill = v.attrs["_FillValue"][0]
        mmh = np.where(raw == fill, np.nan, raw * v.attrs["scale_factor"][0] + v.attrs["add_offset"][0])
        valid = f.attrs["time_coverage_start"].decode() if "time_coverage_start" in f.attrs else None
    lat = 70 - np.arange(r0, r1) * RAIN_DEG
    lon = -180 + np.arange(c0, c1) * RAIN_DEG
    LA, LO = np.meshgrid(lat, lon, indexing="ij")

    wet = np.nan_to_num(mmh) >= RAIN_MIN_MMH
    grid = {}
    for i, j, x in zip(*cell_of(LA[wet], LO[wet]), mmh[wet]):
        grid[(i, j)] = max(grid.get((i, j), 0), x)
    cells = [[*cell_center(i, j), round(float(x), 1)] for (i, j), x in sorted(grid.items())]

    cities = {}
    for name, clat, clon in CITIES:
        d = km(clat, clon, LA, LO)
        cities[name] = {f"maxMmH{r}": round(float(np.nanmax(np.where(d <= r, mmh, 0))), 1) for r in RADII_KM}
    return {
        "source": "NOAA Enterprise Rain Rate (RRQPE), estimación por satélite",
        "validUtc": valid,
        "file": key.rsplit("/", 1)[-1],
        # [lat, lon, máximo mm/h] por celda de 0,1° con al menos RAIN_MIN_MMH.
        "grid": {"cellDeg": CELL_DEG, "minMmH": RAIN_MIN_MMH, "cells": cells},
    }, cities


# ---- Radar (REDEMET) ----

def radar(now):
    api_key = os.environ.get("REDEMET_API_KEY", "")
    out = []
    for area, name in RADARS:
        entry = {"id": area, "name": name, "source": "REDEMET (DECEA)", "frames": []}
        if not api_key:
            out.append({**entry, "status": "sin clave"})
            continue
        try:
            body = json.loads(get(f"{REDEMET_URL}?area={area}&anima=3", headers={"X-Api-Key": api_key}))
            frames = [f for group in body["data"]["radar"] for f in group if f.get("path")]
            if frames:
                f = frames[-1]
                entry.update(center=[float(f["lat_center"]), float(f["lon_center"])], radiusKm=f["raio"])
            entry["frames"] = [
                {
                    "utc": f["data"].replace(" ", "T") + "Z",
                    "png": f["path"],
                    "bounds": [float(f["lat_min"]), float(f["lat_max"]), float(f["lon_min"]), float(f["lon_max"])],
                }
                for f in frames
            ]
            last = datetime.fromisoformat(frames[-1]["data"]) if frames else None
            fresh = last is not None and now - last <= timedelta(minutes=RADAR_FRESH_MIN)
            entry["status"] = "ok" if fresh else "sin datos"
        except Exception as err:
            entry["status"] = "error"
            entry["error"] = str(err)[:200]
        out.append(entry)
    return out


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "nowcast/latest.json")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    doc = {"version": VERSION, "generatedUtc": iso(now),
           "zone": {"latMin": LAT_MIN, "latMax": LAT_MAX, "lonMin": LON_MIN, "lonMax": LON_MAX}}
    per_city = {name: {"name": name, "lat": lat, "lon": lon} for name, lat, lon in CITIES}
    failed = 0
    for section, build in (("lightning", lambda: lightning(now)), ("rain", rain)):
        try:
            doc[section], cities = build()
            for name, values in cities.items():
                per_city[name][section] = values
        except Exception as err:
            doc[section] = {"error": str(err)[:200]}
            failed += 1
    doc["radar"] = radar(now)
    doc["cities"] = list(per_city.values())

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(f"{target}: {target.stat().st_size / 1000:.0f} kB · rayos {doc['lightning'].get('flashes', '—')} · "
          f"radar {', '.join(r['id'] + ' ' + r['status'] for r in doc['radar'])}")
    radar_ok = any(r["status"] == "ok" for r in doc["radar"])
    sys.exit(1 if failed == 2 and not radar_ok else 0)


if __name__ == "__main__":
    main()
