import { esc } from '../esc.js';

// Version 0.10 kept one interview in localStorage under this key: { candidate, notes: { [card id]: text }, ticks, ... }.
// This version reads none of it, so the setup page offers its notes as text and deletes it when asked.
const KEY = 'interview-kit';

export function oldInterview(section) {
  const win = section.ownerDocument.defaultView;
  let old = null;
  try { old = JSON.parse(win.localStorage.getItem(KEY)); } catch {}
  const forget = () => { try { win.localStorage.removeItem(KEY); } catch {} };
  if (!old || typeof old !== 'object') { if (old !== null) forget(); return; }
  const notes = Object.entries(old.notes ?? {}).filter(([, text]) => typeof text === 'string' && text.trim());
  const who = typeof old.candidate === 'string' && old.candidate.trim();
  if (!who && !notes.length) { forget(); return; }
  const box = section.ownerDocument.createElement('div');
  box.innerHTML = `<p class="old-interview">This browser still holds an interview${who ? ` with ${esc(who)}` : ''} from version 0.10 of the kit, which this version can't open. ${
    notes.length ? 'Copy its notes if you need them, then delete it.' : 'It has no notes.'}</p>
    <p>${notes.length ? '<button type="button" class="old-interview-copy">Copy its notes</button> ' : ''}<button type="button" class="old-interview-delete">Delete it</button></p>`;
  section.append(box);
  const copy = box.querySelector('.old-interview-copy');
  if (copy) {
    copy.onclick = () => win.navigator.clipboard.writeText([`Interview${who ? ` with ${who}` : ''}, from version 0.10 of the kit`, ...notes.map(([id, text]) => `${id}: ${text}`)].join('\n'))
      .then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
  }
  box.querySelector('.old-interview-delete').onclick = () => { forget(); box.remove(); };
}
