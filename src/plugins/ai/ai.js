// Second opinion: once I have decided, a packet of the evidence the gate opened, for a person to copy into an AI
// assistant. The kit sends it nowhere. Leave it out with --without ai.
import './ai.css';
import { packetText } from './packet.js';

export default function ai(api) {
  // Kept across redraws, so a colleague's events arriving on the Decide page neither fold the panel nor untick the box.
  let open = false;
  let notes = false;
  api.slot('decide.recorded', (el, ctx) => {
    const others = ctx.unlocked.participants.length - 1;
    el.innerHTML = `<details class="ai-panel"${open ? ' open' : ''}><summary class="ai-title">Second opinion</summary>
      <p class="ai-lead">Paste this into an AI assistant you trust for a cold read of the evidence. It says "the candidate" and leaves out every interviewer's name, decision and level. The kit sends it nowhere.</p>
      <p class="ai-covers">${others ? `Built from your evidence and ${others} colleague${others > 1 ? "s'" : "'s"}.` : 'Built from your evidence.'}</p>
      <label class="ai-notes"><input type="checkbox" class="ai-notes-box"${notes ? ' checked' : ''}> Include my notes (they may show my lean)</label>
      <textarea class="ai-packet" readonly rows="12" aria-label="Second opinion packet"></textarea>
      <button type="button" class="ai-copy">Copy the packet</button></details>`;
    const text = el.querySelector('.ai-packet');
    const fill = () => { text.value = packetText({ ...ctx, notes }); };
    fill();
    el.querySelector('.ai-panel').ontoggle = (e) => { open = e.target.open; };
    el.querySelector('.ai-notes-box').onchange = (e) => { notes = e.target.checked; fill(); };
    const copy = el.querySelector('.ai-copy');
    copy.onclick = () => el.ownerDocument.defaultView.navigator.clipboard.writeText(text.value)
      .then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
  });
}
