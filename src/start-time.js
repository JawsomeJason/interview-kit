// When the interview starts: Now, a quarter-hour slot near it, or any other date and time.
const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;
// How far an Other time may sit from now: a day back (the interview already began) to a week ahead, in calendar days so
// a daylight saving change keeps the same wall-clock time.
const shift = (now, days) => { const d = new Date(now); d.setDate(d.getDate() + days); return d.getTime(); };
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export const clockTime = (t) => clock.format(t);

const span = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);
const away = (min) => (min > 0 ? ` (in ${span(min)})` : min < 0 ? ` (${span(-min)} ago)` : '');

const slot = (t, now) => ({ label: clock.format(t) + away(Math.round((t - now) / MINUTE)), value: t });

// Now's value is null: the clock starts the moment the round is picked. Every time zone's offset is a whole number of
// quarter hours, so quarter hours since the epoch fall on local quarter hours too. A slot already picked (epoch ms)
// stays in the list once the window has moved past it, so a page refreshing its choices never drops the pick.
export function startOptions(now, picked) {
  const slots = [];
  for (let t = Math.ceil((now - 30 * MINUTE) / QUARTER) * QUARTER; t <= now + 120 * MINUTE; t += QUARTER) slots.push(slot(t, now));
  if (picked !== undefined && !slots.some(({ value }) => value === picked)) slots.push(slot(picked, now));
  return [{ label: 'Now', value: null }, ...slots.sort((x, y) => x.value - y.value)];
}

// A datetime-local value ("2026-10-23T14:15") is local time; an empty or broken one, or one outside the window, is no
// time at all.
export function fromLocalInput(value, now = Date.now()) {
  const t = new Date(value).getTime();
  return t >= shift(now, -1) && t <= shift(now, 7) ? t : undefined;
}

// A datetime-local value for an epoch time.
export const toLocalInput = (t) => new Date(t - new Date(t).getTimezoneOffset() * MINUTE).toISOString().slice(0, 16);

// The min and max for an Other time field.
export const otherRange = (now) => ({ min: toLocalInput(shift(now, -1)), max: toLocalInput(shift(now, 7)) });
