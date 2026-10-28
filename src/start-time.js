const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export const clockTime = (t) => clock.format(t);
