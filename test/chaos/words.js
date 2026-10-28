// The status line's exact words from design.md section 6 (Connection states) and the U12c decisions, as patterns
// over the names in the room. A line the harness sees that matches none of these is a failure. `names` lists what a
// status line may call a colleague; several read "Alex and Kim" or "Alex, Kim and Sam".
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TIME = '\\d{1,2}:\\d{2} [AP]M';

export function words(names) {
  // A colleague whose name has not arrived yet is "a colleague", and several are "2 colleagues".
  const one = `(?:${names.map(esc).join('|')}|[Aa] colleague|\\d+ colleagues)`;
  const many = `(?:${one}(?:, ${one})* and ${one})`;
  const N = `(?:${one}|${many})`;
  const line = (state, text) => ({ state, re: new RegExp(`^${text}$`) });
  return [
    line('connecting', 'Connecting…'),
    line('no-relay', esc("Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview.")),
    line('relay-lost', esc('Reconnecting to the meeting point… Everything you record is saved and will catch up.')),
    line('offline', esc("You're offline. Everything you record is saved and will catch up.")),
    line('back-online', esc('Back online. Catching up…')),
    line('waiting-for-colleagues', esc('Waiting for colleagues. Send them the invite link.')),
    line('looking', `Looking for ${N}…`),
    line('not-here', `(?:${one} isn't here yet\\. You'll connect as soon as ${one} opens the interview\\.|${many} aren't here yet\\. You'll connect as soon as they open the interview\\.)`),
    line('catching-up', `Catching up with ${N}…`),
    line('connected', `Connected to ${N}`),
    line('reconnected', `Reconnected to ${N}\\. Caught up\\.`),
    line('lost', `Lost ${N}, reconnecting… What you record is saved and will catch up\\.`),
    line('unreachable', `Can't reach ${N} from this network\\. ${N} may have closed the kit, or one of you lost the connection\\. Keep going: everything you record is saved and will catch up\\.`),
    line('not-answering', `(?:${one} is here but their kit isn't answering\\. Ask ${one} to reload the page\\.|${many} are here but their kits aren't answering\\. Ask them to reload the page\\.)`),
    line('left', `(?:${one} left at ${TIME}\\. ?)+`),
    line('joined', `${one} joined\\.`),
    line('newer-kit', `(?:${one} is using a newer or older kit\\. Both of you reload the page to get the same version\\.|${many} are using a newer or older kit\\. All of you reload the page to get the same version\\.)`),
    line('trying-again', 'Trying again…'),
  ];
}

// The small word beside a name: nothing, away, reconnecting, or offline since a time.
export const NAME_STATE = new RegExp(`^(?:|away|reconnecting|offline since ${TIME})$`);

export function classify(text, patterns) {
  return patterns.find((p) => p.re.test(text))?.state ?? null;
}
