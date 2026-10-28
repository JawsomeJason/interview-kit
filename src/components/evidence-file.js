import { esc } from '../esc.js';
import { importBundle } from '../evidence/bundle.js';
import { foldShared, nameOf } from '../evidence/reduce.js';

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';

// The two buttons of the file path, for any page that offers them. A status that holds a file asks whether to add it
// anyway, in the page, since the kit shows no confirm() dialog.
export const fileButtons = (status = '') => `<div class="evidence-file">
  <button type="button" class="evidence-share">Share my evidence</button>
  <label class="evidence-add">Add a colleague's evidence <input type="file" class="evidence-add-input" accept=".json,application/json"></label>
  <p class="evidence-status" role="status">${esc(status.text ?? status)}</p>${status.file
  ? '<button type="button" class="evidence-anyway">Add it</button> <button type="button" class="evidence-cancel">Cancel</button>' : ''}</div>`;

export function bindFileButtons(el, { share, addEvidence, notice }) {
  el.querySelector('.evidence-share').onclick = share;
  const input = el.querySelector('.evidence-add-input');
  input.onchange = async () => {
    const [file] = input.files;
    if (!file) return;
    input.value = '';
    await addEvidence(file);
  };
  const anyway = el.querySelector('.evidence-anyway');
  if (!anyway) return;
  const cancel = el.querySelector('.evidence-cancel');
  anyway.onclick = () => addEvidence(notice.file, true);
  cancel.onclick = () => {
    el.querySelector('.evidence-status').textContent = '';
    anyway.remove();
    cancel.remove();
    input.focus();
  };
  anyway.focus();
}

export const evidenceFile = {
  // The Share my evidence dialog. Asks for my name once when I have none, says what the file holds, and saves it.
  share(doc, { candidate, name, decided, setName, bundle }) {
    const who = esc(candidate || 'the candidate');
    const dialog = doc.createElement('dialog');
    dialog.className = 'evidence-dialog';
    dialog.setAttribute('aria-labelledby', 'evidence-dialog-title');
    dialog.innerHTML = `<form method="dialog" class="evidence-dialog-form"><h2 id="evidence-dialog-title">Share my evidence</h2>
      ${name ? '' : '<label class="evidence-dialog-name">Your name, so colleagues know whose evidence this is <input name="name" required maxlength="80" autocomplete="name"></label>'}
      <p class="evidence-dialog-what">${decided
    ? `This file holds your marks, notes and decision for ${who}. Send it straight to your colleague, not to a channel.`
    : `You haven't decided yet, so this file holds the plan for ${who} but not your marks or notes. Record your decision to include them.`}</p>
      <div class="evidence-dialog-buttons"><button type="submit" value="save" class="evidence-dialog-save">Save the file</button>
        <button type="button" class="evidence-dialog-close">Close</button></div></form>`;
    doc.body.append(dialog);
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector('.evidence-dialog-close').onclick = close;
    dialog.addEventListener('cancel', () => dialog.remove());
    dialog.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const typed = dialog.querySelector('[name="name"]')?.value.trim();
      if (typed) setName(typed);
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(new Blob([bundle()], { type: 'application/json' }));
      a.download = `${slug(candidate)}-${slug(typed || name)}-evidence.json`;
      doc.body.append(a);
      a.click();
      a.remove();
      close();
    });
    dialog.showModal();
  },

  // Add a colleague's evidence: the file goes through the same receive as sync, and the gate hides it until I decide.
  // Without sync each laptop opened its own session, so a file matches by role, round and candidate, not by session id.
  async add(file, { open, me, candidate, receive, after, anyway = false }) {
    let b;
    try { b = importBundle(await file.text()); } catch (e) { return e.message; }
    const theirs = b.pub[0];
    if (theirs?.t !== 'open' || theirs.role !== open.role || theirs.round !== open.round) return 'This file is from another round or role.';
    const who = foldShared({ [b.author]: b.pub }).candidate;
    // Each laptop typed the name itself, so accents, case and spacing don't count, and one may shorten the other.
    const fold = (x) => String(x ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
    const [them, us] = [fold(who), fold(candidate)];
    if (!anyway && theirs.sid !== open.sid && them && us && !them.startsWith(us) && !us.startsWith(them)) {
      return { text: `This file is for ${who}; this interview is with ${candidate}. Add it anyway?`, file };
    }
    if (b.author === me) return 'This file is your own evidence.';
    const clash = receive(b.author, 'pub', b.pub) ?? receive(b.author, 'prv', b.prv);
    if (clash?.mismatch !== undefined) return `This file disagrees with what is already here from ${nameOf(b.pub) ?? 'this colleague'}. The first copy is kept.`;
    return after(b.author);
  },
};
