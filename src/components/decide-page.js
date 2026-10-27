import { esc } from '../esc.js';
import { wallOf } from '../evidence/clock.js';
import { hasDecided, nameOf } from '../evidence/reduce.js';
import { clockTime } from '../start-time.js';
import { summarize, summaryHtml, summaryText } from '../views/summary.js';
import { bindFileButtons, fileButtons } from './evidence-file.js';

const form = (role, ladder) => `<form class="decide-form">
  <fieldset class="decide-options"><legend class="decide-legend">Your decision</legend>${role.decisions.map((d) => `<label class="decide-option">
    <input type="radio" name="choice" value="${esc(d.id)}" required> <b>${esc(d.label)}</b><span class="decide-means">${esc(d.means)}</span></label>`).join('')}</fieldset>
  <label class="decide-field">Level you would place them at <select class="decide-input" name="level"><option value="">Not sure</option>${
  ladder.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label>
  <label class="decide-field">Reason <textarea class="decide-input" name="why" required maxlength="4000" rows="4"></textarea></label>
  <button type="submit" class="decide-record">Record</button></form>`;

// Who else has decided, never what.
const others = (held, me) => Object.entries(held).filter(([a]) => a !== me)
  .map(([, log]) => `${esc(nameOf(log.pub) ?? 'A colleague')} ${hasDecided(log.pub) ? 'has decided.' : "hasn't yet."}`).join(' ');

// My own summary, read-only, then the role's decisions with their meanings, none picked, the level and a reason.
// Nothing here shows a colleague's evidence; the debrief opens once both sides have decided.
export function decidePage(main, c) {
  const s = summarize(c);
  const d = c.evidence.decision;
  const latest = c.evidence.amendments.at(-1) ?? d;
  const ready = Object.entries(c.held).some(([a, log]) => a !== c.me && hasDecided(log.pub));
  const label = (x) => c.role.decisions.find((o) => o.id === x.choice)?.label ?? x.choice;
  const who = others(c.held, c.me);
  main.innerHTML = `<h1 class="decide-title">Decide</h1>
  ${d ? `<p class="decide-recorded" role="status">Recorded at ${clockTime(wallOf(latest.h))}. Colleagues' evidence opens once they have decided too.</p>
    <p class="decide-mine"><b>${esc(label(latest))}</b>, at ${esc(c.pack.ladder.find((l) => l.id === latest.level)?.name ?? 'Not sure')}. ${esc(latest.why)}</p>
    ${ready ? '<p class="decide-open"><a href="#/debrief">Open the debrief</a></p>' : ''}
    <details class="decide-change"><summary>Change my decision</summary>${form(c.role, c.pack.ladder)}</details>`
    : `<p class="decide-lead">Record yours before you see anyone else's.</p>${form(c.role, c.pack.ladder)}`}
  ${who ? `<p class="decide-others">${who}</p>` : ''}
  ${d ? c.slot('decide.recorded') : ''}
  <div class="decide-tools"><button type="button" class="decide-copy">Copy summary</button>${fileButtons(c.notice)}</div>
  <h2 class="decide-subtitle">Your summary</h2>${summaryHtml(s)}`;
  main.querySelector('.decide-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    c.record({ choice: data.get('choice'), level: data.get('level'), why: data.get('why').trim() });
  });
  const copy = main.querySelector('.decide-copy');
  copy.onclick = () => main.ownerDocument.defaultView.navigator.clipboard.writeText(summaryText(s))
    .then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
  bindFileButtons(main, { share: c.share, add: c.addEvidence });
}
