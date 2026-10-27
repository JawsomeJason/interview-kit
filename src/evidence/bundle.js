import { checkPrv, checkPub } from './check.js';
import { hasDecided } from './reduce.js';

const KIT = 'interview-kit-evidence';

// My own log as a file. Private events go in only once I have decided; the reader's gate hides them until they have.
export const exportBundle = (log, author) => JSON.stringify({ kit: KIT, v: 2, author, pub: log.pub, prv: hasDecided(log.pub) ? log.prv : [] });

const intact = (events, ok) => Array.isArray(events) && events.every((e, i) => ok(e) && e.n === i);

export function importBundle(text) {
  let b;
  try { b = JSON.parse(text); } catch { b = null; }
  if (!b || b.kit !== KIT || b.v !== 2 || typeof b.author !== 'string') throw new Error('This is not an interview kit evidence file.');
  if (!intact(b.pub, checkPub) || !intact(b.prv, checkPrv)) throw new Error('This evidence file is damaged.');
  return { author: b.author, pub: b.pub, prv: b.prv };
}
