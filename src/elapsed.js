const two = (n) => String(n).padStart(2, '0');

// "12:40", or "1:02:05" past the hour. Before the start it counts down instead, "−4:12" with a minus sign,
// rounding up so it reads "0:00" exactly at the start.
export function elapsed(startedAt, now) {
  const ms = now - startedAt;
  const s = ms < 0 ? Math.ceil(-ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return (ms < 0 ? '−' : '') + (h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`);
}
