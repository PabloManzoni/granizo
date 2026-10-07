# Investigación v0.3: análisis exploratorio

Scripts del análisis que respalda [`docs/investigacion-motor-v0.3.md`](../../../docs/investigacion-motor-v0.3.md). **No son parte del motor.** Leen solo la caché de Open-Meteo (`.cache/open-meteo`), sin red.

Necesitan Node ≥ 24 y Python con numpy, pandas y scipy.

```bash
node scripts/research/v0.3/extract.ts          # predictores por punto-hora → .cache/research-v0.3/pointhours.csv
python3 scripts/research/v0.3/build_cases.py   # una fila por caso y modelo → cases_*.csv
python3 scripts/research/v0.3/univariate.py    # ranking de predictores (AUC por estación)
python3 scripts/research/v0.3/warm_check.py    # control por permutación en la estación cálida
python3 scripts/research/v0.3/models.py        # logísticas y árbol contra v0.2
python3 scripts/research/v0.3/errors_sens.py   # errores de "protegelo" y sensibilidad de diseño
python3 scripts/research/v0.3/robustness.py    # ventana uniforme, barrido de WMAXSHEAR, HR por modelo
```

Los resultados de la corrida del 2026-10-06 están en `resultados/`. Los CSV de punto-horas (~30 MB) quedan en `.cache/research-v0.3/`, fuera del repo.
