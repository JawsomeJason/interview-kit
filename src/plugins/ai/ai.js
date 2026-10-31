// Second opinion: once I have decided, a packet of the evidence the gate opened, for a person to copy into an AI
// assistant. Offered, never required. The kit sends it nowhere. Leave it out with --without ai.
import './ai.css';
import { getPref, setPref } from '../../prefs.js';
import { packetText } from './packet.js';

const copiedKey = (sid) => `ai-copied-${sid}`;

export default function ai(api) {
  // Per interview, so one's transcript never reaches another's packet, and kept across redraws, so a colleague's events
  // arriving on the Decide page neither fold the panel nor untick the box. The transcript lives only here, never logged
  // or stored.
  const panels = new Map();
  api.host.onRemove((sid) => { panels.delete(sid); setPref(copiedKey(sid), undefined); });
  api.leaveNote(({ sid, decided }) => (decided && !getPref(copiedKey(sid)) ? "You haven't got a second opinion on that interview yet." : null));
  api.slot('decide.recorded', (el, ctx) => {
    const { sid } = api.host.me();
    const panel = panels.get(sid) ?? panels.set(sid, { open: false, notes: false, transcript: '' }).get(sid);
    const others = ctx.unlocked.participants.length - 1;
    el.innerHTML = `<section class="ai-offer" aria-label="Second opinion">
      <p class="ai-why">A cold read after you decide can catch what your marks missed.</p>
      <button type="button" class="ai-open" aria-expanded="${panel.open}">Get a second opinion</button>
      <div class="ai-panel"${panel.open ? '' : ' hidden'}>
      <p class="ai-lead">Paste this into an AI assistant you trust. It leaves out every interviewer's decision and level, and replaces your names and the candidate's where they are spelled as entered. Notes and a transcript can still name other people. The kit sends it nowhere.</p>
      <p class="ai-covers">${others ? `Built from your evidence and ${others} colleague${others > 1 ? "s'" : "'s"}.` : 'Built from your evidence.'}</p>
      <label class="ai-notes"><input type="checkbox" class="ai-notes-box"${panel.notes ? ' checked' : ''}> Include my notes (they may show my lean; the candidate's name is replaced, pronouns are not)</label>
      <label class="ai-field">Transcript, if you have one <textarea class="ai-transcript" data-keep-focus rows="4"></textarea></label>
      <p class="ai-hint">It lets the AI check each row against what was said, and is gone when you reload or close this tab. Pronouns, other people's names and other spellings stay as they are, so read it before you paste.</p>
      <textarea class="ai-packet" readonly rows="12" aria-label="Second opinion packet"></textarea>
      <button type="button" class="ai-copy">Copy the packet</button>
      <p class="ai-amend">If this changes your read, <a href="#/decide" class="ai-amend-link">change your decision and reason</a>.</p></div></section>`;
    const text = el.querySelector('.ai-packet');
    const transcript = el.querySelector('.ai-transcript');
    const fill = () => { text.value = packetText({ ...ctx, notes: panel.notes, transcript: panel.transcript }); };
    transcript.value = panel.transcript;
    fill();
    // An open packet shows colleagues' evidence, which counts as seeing it.
    if (panel.open) ctx.peek();
    const openButton = el.querySelector('.ai-open');
    openButton.onclick = () => {
      panel.open = !panel.open;
      openButton.setAttribute('aria-expanded', panel.open);
      el.querySelector('.ai-panel').hidden = !panel.open;
      if (panel.open) ctx.peek();
    };
    el.querySelector('.ai-notes-box').onchange = (e) => { panel.notes = e.target.checked; fill(); };
    transcript.oninput = () => { panel.transcript = transcript.value; fill(); };
    const copy = el.querySelector('.ai-copy');
    copy.onclick = () => el.ownerDocument.defaultView.navigator.clipboard.writeText(text.value)
      .then(() => { copy.textContent = 'Copied'; setPref(copiedKey(sid), true); }, () => { copy.textContent = 'Copy failed'; });
    el.querySelector('.ai-amend-link').onclick = (e) => {
      e.preventDefault();
      const change = el.ownerDocument.querySelector('.decide-change');
      change.open = true;
      change.querySelector('summary').focus();
    };
  });
}
