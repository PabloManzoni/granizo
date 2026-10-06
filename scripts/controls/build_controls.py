# Controles emparejados por época: días de tormenta (METAR TS) en un aeropuerto sin granizo en ningún registro.
import json, math, datetime as dt
# Entradas: SP = carpeta con ts_days.json, hail_dates_bulletins.json, inumet/alerts.json y metar/*.csv
# (descargas crudas, no versionadas). Uso: HG_RAW=/ruta/a/descargas python3 build_controls.py
import os
from pathlib import Path
SP = os.environ.get("HG_RAW", ".")
EV = str(Path(__file__).resolve().parents[2] / "data" / "events.json")
events = json.load(open(EV))
ts = json.load(open(f"{SP}/ts_days.json"))
bul = json.load(open(f"{SP}/hail_dates_bulletins.json"))
alerts = json.load(open(f"{SP}/inumet/alerts.json"))

DEPT = {"SUMU": ("Aeropuerto de Carrasco", "Canelones"), "SUAA": ("Aeropuerto Ángel Adami (Melilla)", "Montevideo"),
        "SULS": ("Aeropuerto de Laguna del Sauce", "Maldonado"), "SUCA": ("Aeropuerto de Colonia", "Colonia"),
        "SUDU": ("Aeropuerto de Durazno", "Durazno"), "SUSO": ("Aeropuerto de Salto", "Salto"),
        "SURV": ("Aeropuerto de Rivera", "Rivera"), "SUPU": ("Aeropuerto de Paysandú", "Paysandú"),
        "SUMO": ("Aeropuerto de Melo", "Cerro Largo"), "SUAG": ("Aeropuerto de Artigas", "Artigas")}

# Fechas con granizo en CUALQUIER fuente (estricto, en todo el país).
hail_dates = set(bul["dates"]) | {e["date"] for e in events if e["type"] == "hail"}
hail_dates |= {o["date"] for o in ts if o["hail"]}
import csv, glob, re, os
for path in glob.glob(f"{SP}/metar/SU*.csv"):
    for row in csv.DictReader(open(path)):
        body = (row.get("metar") or "").split(" RMK")[0]
        if re.search(r"(^| )(\+|-|RE|VC)?[A-Z]*(GR|GS)[A-Z]*( |$)", body.split(" ", 2)[-1] if body else ""):
            hail_dates.add(row["valid"][:10])
bad_months = set(bul["monthsWithoutDays"])
def near_hail(d):  # también excluir el día anterior/siguiente (eventos nocturnos con fecha ambigua)
    day = dt.date.fromisoformat(d)
    return any(str(day + dt.timedelta(days=k)) in hail_dates for k in (-1, 0, 1))

# Días con advertencia por tormentas emitida ese día o el anterior.
storm_adv = {a["fecha_actualizacion"][:10] for a in alerts if a["tipo"] == "Advertencia" and a["nombre"] == "Tormenta"}
def advisory(d):
    day = dt.date.fromisoformat(d)
    return str(day) in storm_adv or str(day - dt.timedelta(days=1)) in storm_adv

cands = [o for o in ts if not o["hail"] and o["date"][:7] not in bad_months and not near_hail(o["date"])
         and advisory(o["date"]) and (o["ts_obs"] >= 2 or o["heavy"] >= 1) and o["date"] >= "2021-07-01"]
print("candidatos:", len(cands))

def km(a_lat, a_lon, b_lat, b_lon):
    return 6371 * 2 * math.asin(math.sqrt(math.sin(math.radians(b_lat - a_lat) / 2) ** 2 +
           math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(math.radians(b_lon - a_lon) / 2) ** 2))
def doy_gap(a, b):
    x = abs(dt.date.fromisoformat(a).timetuple().tm_yday - dt.date.fromisoformat(b).timetuple().tm_yday)
    return min(x, 365 - x)

targets = [e for e in events if e["type"] == "hail" and e["damaging"] is True] + \
          [e for e in events if e["type"] == "hail" and e["damaging"] is None]
used_keys, used_dates, new = set(), {}, []
for e in targets:
    best = None
    for c in cands:
        key = (c["station"], c["date"])
        if key in used_keys or used_dates.get(c["date"], 0) >= 2: continue
        gap = doy_gap(e["date"], c["date"])
        if gap > 45: continue
        d = km(e["lat"], e["lon"], c["lat"], c["lon"])
        strength = c["ts_obs"] + 2 * c["heavy"] + c["max_gust_kt"] / 10
        score = -d / 100 - gap / 30 + min(strength, 12) / 4
        if best is None or score > best[0]: best = (score, c, d, gap)
    if not best: continue
    _, c, d, gap = best
    used_keys.add((c["station"], c["date"])); used_dates[c["date"]] = used_dates.get(c["date"], 0) + 1
    name, dept = DEPT[c["station"]]
    y, m, dd = c["date"].split("-")
    nxt = dt.date.fromisoformat(c["date"]) + dt.timedelta(days=1)
    new.append({
        "id": f"ctl-{c['date']}-{c['station'].lower()}", "type": "control", "date": c["date"], "localTime": c["first"],
        "place": name, "department": dept, "lat": round(c["lat"], 2), "lon": round(c["lon"], 2),
        "hailSizeCm": None, "damaging": False, "damage": {"vehicles": None, "roofs": None, "crops": None},
        "inumetAlert": {"status": "unknown", "mentionsHail": None},
        "evidence": (f"METAR {c['station']}: tormenta (TS) en {c['ts_obs']} reportes entre {c['first']} y {c['last']}"
                     f"{', con lluvia fuerte' if c['heavy'] else ''}{', ráfaga máx ' + str(c['max_gust_kt']) + ' kt' if c['max_gust_kt'] else ''}. "
                     f"Sin GR/GS en ningún aeropuerto, sin granizo en el boletín mensual de INUMET ni en la lista de eventos (día anterior, mismo día y siguiente). "
                     f"Hubo advertencia de INUMET por tormentas en el país ese día o el anterior (cobertura local no verificada). "
                     f"Control automático emparejado con {e['id']} ({gap} días de diferencia en el año, {round(d)} km)."),
        "sources": [f"https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station={c['station']}&data=metar&year1={y}&month1={int(m)}&day1={int(dd)}&year2={nxt.year}&month2={nxt.month}&day2={nxt.day}&tz=America%2FMontevideo&format=onlycomma&latlon=no&missing=empty&trace=T&direct=no&report_type=3&report_type=4",
                    "https://www.inumet.gub.uy/tiempo/historico-alertas-meteorologicas"],
        "confidence": "medium", "matchedTo": e["id"],
    })
events = [e for e in events if not e["id"].startswith("ctl-")] + new
events.sort(key=lambda e: (e["date"], e["id"]))
json.dump(events, open(EV, "w"), ensure_ascii=False, indent=2)
season = lambda d: "cálida" if int(d[5:7]) in (10, 11, 12, 1, 2, 3) else "fría"
from collections import Counter
print("controles nuevos:", len(new), Counter(season(n["date"]) for n in new), "| emparejados con dañinos:", sum(1 for n in new if any(t["id"] == n["matchedTo"] and t["damaging"] for t in targets)), "de", sum(1 for t in targets if t["damaging"]))
print("estaciones:", Counter(n["place"] for n in new))
print("sin pareja:", [t["id"] for t in targets if t["id"] not in {n["matchedTo"] for n in new}])
