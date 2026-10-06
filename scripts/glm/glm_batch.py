"""Corre glm_point.py sobre todos los casos con hora conocida de data/events.json (reanudable).
Uso: python3 glm_batch.py <salida.json> [máximo de casos por corrida]"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
out_path = Path(sys.argv[1])
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10**9
processed = 0
done = json.loads(out_path.read_text()) if out_path.exists() else {}
events = json.loads((ROOT / "data/events.json").read_text())
cases = [e for e in events if e["localTime"] and not (e["type"] == "hail" and e["damaging"] is False)]
for e in cases:
    if e["id"] in done:
        continue
    if processed >= limit:
        break
    processed += 1
    t = f"{e['date']}T{e['localTime']}"
    try:
        r = subprocess.run(["python3", str(ROOT / "scripts/glm/glm_point.py"), str(e["lat"]), str(e["lon"]), t],
                           capture_output=True, text=True, timeout=900)
        res = json.loads(r.stdout)
    except Exception as err:  # noqa: BLE001
        res = {"error": str(err)[:200]}
    res.update({"type": e["type"], "date": e["date"], "time": e["localTime"], "damaging": e["damaging"]})
    done[e["id"]] = res
    out_path.write_text(json.dumps(done))
    print(e["id"], res.get("files"), res.get("r30"), flush=True)
print("LISTO", len(done))
