// Ventanas de tiempo en hora de Uruguay (UTC−3 fijo, sin horario de verano desde 2015).
import { addHours, atHour, fmtLocal, nowLocal } from './cli/args.ts';

export type WindowName = 'tonight' | 'today' | 'tomorrow' | 'next12h';

export const WINDOW_NAMES: WindowName[] = ['tonight', 'today', 'tomorrow', 'next12h'];

export const WINDOW_LABELS: Record<WindowName, string> = {
  tonight: 'Esta noche (20 a 8 h)',
  today: 'Hoy (hasta las 20 h)',
  tomorrow: 'Mañana (8 a 20 h)',
  next12h: 'Próximas 12 horas',
};

/** Devuelve la ventana en hora local "YYYY-MM-DDTHH:MM", truncada a la hora para coincidir con datos horarios. */
export function resolveWindow(name: WindowName, now: Date = nowLocal()): { from: string; to: string } {
  const hour = now.getUTCHours();
  let from: Date;
  let to: Date;
  switch (name) {
    case 'today':
      from = now;
      to = hour >= 20 ? addHours(now, 1) : atHour(now, 20);
      break;
    case 'tomorrow': {
      const t = addHours(now, 24);
      from = atHour(t, 8);
      to = atHour(t, 20);
      break;
    }
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
