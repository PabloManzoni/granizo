// Etiquetas de día para las ventanas Hoy / Esta noche / Mañana, siempre en hora de Uruguay.
// Los límites de la noche (20 h y 8 h) son los mismos que usa el motor en src/windows.ts.
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const NIGHT_FROM = 20;
const NIGHT_UNTIL = 8;

// Fecha y hora de pared en Montevideo, como un Date en UTC (misma convención que el motor).
function wallClock(now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Montevideo', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' })
      .formatToParts(now)
      .map((x) => [x.type, Number(x.value)]),
  );
  return { day: new Date(Date.UTC(p.year, p.month - 1, p.day)), hour: p.hour };
}

const shift = (d, days) => new Date(d.getTime() + days * 86400000);
const abbr = (d) => DAYS[d.getUTCDay()];
const dated = (d) => `${abbr(d)} ${d.getUTCDate()}`;

// → { today, tonight, tomorrow }: texto corto para cada pestaña ("mar 6", "mar→mié").
// De madrugada (< 8 h) "esta noche" es la que está terminando: arrancó ayer.
export function dayLabels(now = new Date()) {
  const { day, hour } = wallClock(now);
  let tonight = dated(day);
  if (hour < NIGHT_UNTIL) tonight = `${abbr(shift(day, -1))}→${abbr(day)}`;
  else if (hour >= NIGHT_FROM) tonight = `${abbr(day)}→${abbr(shift(day, 1))}`;
  return { today: dated(day), tonight, tomorrow: dated(shift(day, 1)) };
}
