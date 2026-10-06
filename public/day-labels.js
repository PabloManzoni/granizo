// Etiquetas de día para las pestañas Hoy / Mañana, siempre en hora de Uruguay.
// Son días del calendario: de madrugada "hoy" ya es el día nuevo (igual que la ventana del motor en src/windows.ts).
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Fecha de pared en Montevideo, como un Date en UTC (misma convención que el motor).
function wallDay(now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Montevideo', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(now)
      .map((x) => [x.type, Number(x.value)]),
  );
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

const dated = (d) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;

// → { today, tomorrow }: texto corto para cada pestaña ("mar 6").
export function dayLabels(now = new Date()) {
  const day = wallDay(now);
  return { today: dated(day), tomorrow: dated(new Date(day.getTime() + 86400000)) };
}
