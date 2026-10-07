// Ventanas de tiempo en hora de Uruguay (UTC−3 fijo, sin horario de verano desde 2015).
import { addHours, atHour, fmtLocal, nowLocal } from './cli/args.ts';

export type WindowName = 'tonight' | 'today' | 'tomorrow' | 'next12h' | 'next24h';

export const WINDOW_NAMES: WindowName[] = ['tonight', 'today', 'tomorrow', 'next12h', 'next24h'];

export const WINDOW_LABELS: Record<WindowName, string> = {
  tonight: 'Esta noche (20 a 8 h)',
  today: 'Hoy (hasta mañana a las 8 h)',
  tomorrow: 'Mañana (8 a 8 h)',
  next12h: 'Próximas 12 horas',
  next24h: 'Próximas 24 h',
};

/**
 * Devuelve la ventana en hora local "YYYY-MM-DDTHH:MM", truncada a la hora para coincidir con datos horarios.
 * La app usa "next24h": desde la hora actual, 24 horas (`to` es la última hora incluida).
 * - today: desde ahora hasta las 8 de la mañana siguiente. De madrugada "hoy" ya es el día nuevo, así que también
 *   va hasta las 8 del día siguiente (hasta ~30 h).
 * - tomorrow: de 8 a 8, empezando mañana.
 */
export function resolveWindow(name: WindowName, now: Date = nowLocal()): { from: string; to: string } {
  const hour = now.getUTCHours();
  let from: Date;
  let to: Date;
  switch (name) {
    case 'today':
      from = now;
      to = atHour(addHours(now, 24), 8);
      break;
    case 'tomorrow': {
      const t = addHours(now, 24);
      from = atHour(t, 8);
      to = atHour(addHours(t, 24), 8);
      break;
    }
    case 'next24h':
      from = atHour(now, hour);
      to = addHours(from, 23);
      break;
    case 'next12h':
      from = now;
      to = addHours(now, 12);
      break;
    case 'tonight':
    default:
      if (hour < 8) {
        from = now;
        to = atHour(now, 8);
      } else {
        from = hour >= 20 ? now : atHour(now, 20);
        to = atHour(addHours(now, 24), 8);
      }
  }
  return { from: fmtLocal(from).slice(0, 13) + ':00', to: fmtLocal(to) };
}

