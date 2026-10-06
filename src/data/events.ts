// Lista de eventos para el test histórico (data/events.json).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type AlertStatus = 'yellow' | 'orange' | 'red' | 'none' | 'unknown';

export interface HailEvent {
  id: string;
  type: 'hail' | 'control';
  date: string; // fecha local
  localTime: string | null; // "HH:MM"
  place: string;
  department: string;
  lat: number;
  lon: number;
  hailSizeCm: number | null;
  damaging: boolean | null;
  damage: { vehicles: boolean | null; roofs: boolean | null; crops: boolean | null };
  inumetAlert: { status: AlertStatus; mentionsHail: boolean | null };
  evidence: string;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
  /** Solo en controles emparejados: id del evento de granizo de la misma época del año. */
  matchedTo?: string;
}

/** Estación cálida (oct–mar) o fría (abr–sep): el ciclo anual cambia mucho los valores típicos. */
export const seasonOf = (e: HailEvent): 'warm' | 'cold' =>
  [10, 11, 12, 1, 2, 3].includes(Number(e.date.slice(5, 7))) ? 'warm' : 'cold';

export const EVENTS_FILE = join(import.meta.dirname, '../../data/events.json');

export async function loadEvents(file = EVENTS_FILE): Promise<HailEvent[]> {
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Ventana de 24 h para evaluar cada caso, igual para todos:
 * con hora conocida, las 18 h previas y 5 h después; sin hora, el día local completo.
 */
export function windowFor(e: HailEvent): { from: string; to: string } {
  if (!e.localTime) return { from: `${e.date}T00:00`, to: `${e.date}T23:00` };
  const t = new Date(`${e.date}T${e.localTime}:00Z`);
  t.setUTCMinutes(0);
  const fmt = (d: Date) => d.toISOString().slice(0, 16);
  return {
    from: fmt(new Date(t.getTime() - 18 * 3600_000)),
    to: fmt(new Date(t.getTime() + 5 * 3600_000)),
  };
}
