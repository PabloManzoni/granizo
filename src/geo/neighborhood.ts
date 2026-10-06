export interface Point {
  lat: number;
  lon: number;
}

const KM_PER_DEG_LAT = 111.32;

/** Grilla de puntos alrededor de un centro, separados `spacingKm`, dentro de `radiusKm`. */
export function neighborhood(center: Point, radiusKm: number, spacingKm: number): Point[] {
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const steps = Math.floor(radiusKm / spacingKm);
  const points: Point[] = [];
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const dy = i * spacingKm;
      const dx = j * spacingKm;
      if (Math.hypot(dx, dy) > radiusKm) continue;
      points.push({
        lat: round(center.lat + dy / KM_PER_DEG_LAT),
        lon: round(center.lon + dx / kmPerDegLon),
      });
    }
  }
  return points;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
