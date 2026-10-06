// Utilidades compartidas por los comandos.

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [key, inline] = a.slice(2).split('=');
    out[key] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
  }
  return out;
}

/** Uruguay es UTC−3 fijo (sin horario de verano desde 2015). */
const UY_OFFSET_MS = -3 * 3600 * 1000;

export function nowLocal(): Date {
  return new Date(Date.now() + UY_OFFSET_MS);
}

/** Fecha "local" (creada con nowLocal o a mano) → "YYYY-MM-DDTHH:MM". */
export function fmtLocal(d: Date): string {
  return d.toISOString().slice(0, 16);
}

export function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600 * 1000);
}

export function atHour(d: Date, hour: number): Date {
  const x = new Date(d);
  x.setUTCHours(hour, 0, 0, 0);
  return x;
}
