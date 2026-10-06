# Correr desde la carpeta de descargas crudas (uy_stations.json, metar/*.csv). Días de tormenta por aeropuerto (METAR TS), con intensidad, excluyendo granizo en la estación.
import csv, json, re, glob, os
from collections import defaultdict
st = {f["id"]: (f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0], f["properties"]["sname"]) for f in json.load(open("uy_stations.json"))["features"]}
days = defaultdict(lambda: {"ts_obs": 0, "heavy": 0, "max_gust_kt": 0, "hail": False, "first": None, "last": None})
for path in glob.glob("metar/SU*.csv"):
    sid = os.path.basename(path)[:4]
    for row in csv.DictReader(open(path)):
        m = row.get("metar") or ""
        date = row["valid"][:10]
        key = (sid, date)
        body = re.split(r" (RMK|TEMPO|BECMG|NOSIG)( |$)", m)[0]  # lo de TEMPO/BECMG es pronóstico, no observación
        toks = body.split()
        wx = [t for t in toks[2:] if re.fullmatch(r"(\+|-|VC|RE)?[A-Z]{2,8}", t) and not t.startswith(("CAVOK","NOSIG","TEMPO","BECMG","NSC","SKC","CLR","AUTO","COR","FEW","SCT","BKN","OVC","NCD"))]
        wxs = " ".join(wx)
        if re.search(r"GR|GS", wxs): days[key]["hail"] = True
        if "TS" in wxs and not wxs.startswith("VCTS") or re.search(r"(^| )(\+|-)?TS", wxs):
            d = days[key]; d["ts_obs"] += 1
            if re.search(r"\+TS|\+RA|\+SHRA|TSRA", wxs) and "+" in wxs: d["heavy"] += 1
            d["first"] = d["first"] or row["valid"][11:16]; d["last"] = row["valid"][11:16]
        g = re.search(r"\d{3}\d{2,3}G(\d{2,3})KT", body)
        if g: days[key]["max_gust_kt"] = max(days[key]["max_gust_kt"], int(g.group(1)))
out = []
for (sid, date), d in days.items():
    if d["ts_obs"] == 0 or sid not in st: continue
    lat, lon, name = st[sid]
    out.append({"station": sid, "name": name, "lat": round(lat, 3), "lon": round(lon, 3), "date": date, **d})
out.sort(key=lambda x: (x["date"], x["station"]))
json.dump(out, open("ts_days.json", "w"), indent=0)
print("station-days with TS:", len(out), "| with hail at station:", sum(o["hail"] for o in out))
from collections import Counter
print(Counter(o["station"] for o in out))
season = lambda d: "warm" if int(d[5:7]) in (10,11,12,1,2,3) else "cold"
print(Counter(season(o["date"]) for o in out if not o["hail"]))
print("heavy (+):", sum(1 for o in out if o["heavy"] and not o["hail"]))
