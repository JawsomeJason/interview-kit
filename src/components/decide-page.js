import { esc } from '../esc.js';
import { wallOf } from '../evidence/clock.js';
import { hasDecided, nameOf } from '../evidence/reduce.js';
import { clockTime } from '../start-time.js';
import { unlock } from '../evidence/gate.js';
import { summarize, summaryHtml, summaryText } from '../views/summary.js';
import { bindFileButtons, fileButtons } from './evidence-file.js';
import { lock, lockOpen } from './icons.js';
import { answer, proposals, proposalsHtml } from './proposals.js';

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

// What a redraw for a colleague's event keeps from the form on screen: the choice, level and reason being written,
// whether Change my decision is open, and focus with its caret. A redraw after Record starts the form afresh.
function keep(main, recorded) {
  const f = main.querySelector('.decide-form');
  if (!f || main.dataset.recorded !== recorded) return () => {};
  const { choice, level, why } = f.elements;
  const was = { choice: choice.value, level: level.value, why: why.value, open: main.querySelector('.decide-change')?.open };
  const a = main.ownerDocument.activeElement;
  const focus = f.contains(a) && a.name ? { name: a.name, value: a.type === 'radio' ? a.value : null, at: [a.selectionStart, a.selectionEnd] } : null;
  return () => {
    const g = main.querySelector('.decide-form').elements;
    for (const radio of g.choice) radio.checked = radio.value === was.choice;
    g.level.value = was.level;
    g.why.value = was.why;
    if (was.open) main.querySelector('.decide-change').open = true;
    const el = focus && [...main.querySelector('.decide-form').elements].find((x) => x.name === focus.name && (focus.value === null || x.value === focus.value));
    el?.focus();
    if (el && focus.at[0] !== null) el.setSelectionRange(...focus.at);
  };
}

// Your read first, recorded blind; then a second opinion in three steps: copy the run info (the ai plugin's slot), run
// /second-opinion outside the kit, and add the file it writes. Its marks show only once the gate has opened, as
// proposals I accept, change or reject (ADR 028). Then my own summary, read-only.
export function decidePage(main, c) {
  const s = summarize(c);
  const d = c.evidence.decision;
  const latest = c.evidence.amendments.at(-1) ?? d;
  const restore = keep(main, latest?.h ?? '');
  const ready = Object.entries(c.held).some(([a, log]) => a !== c.me && hasDecided(log.pub));
  const label = (x) => c.role.decisions.find((o) => o.id === x.choice)?.label ?? x.choice;
  const level = (x) => c.pack.ladder.find((l) => l.id === x.level)?.name ?? 'Not sure';
  const who = others(c.held, c.me);
  const u = unlock(c.held, c.me);
  const list = u ? proposals(u, c.held[c.me], c.say) : [];
  // Showing the proposals is seeing that colleague's evidence, so a revision after it says so.
  if (list.length) c.peek(list.map((p) => p.author));
  main.innerHTML = `<h1 class="decide-title">Decide</h1>
  <p class="decide-lead">Your read first. The AI's proposals open only after you record it.</p>
  <section class="decide-step" aria-labelledby="decide-read"><h2 id="decide-read" class="decide-subtitle">1. Your read</h2>
  ${d ? `<p class="decide-recorded" role="status">Recorded at ${clockTime(wallOf(latest.h))}. Colleagues' evidence opens once they have decided too.</p>
    <p class="decide-mine"><b>${esc(label(latest))}</b>, at ${esc(level(latest))}. ${esc(latest.why)}</p>
    ${latest !== d ? `<p class="decide-first">Your first read stays in the log: <b>${esc(label(d))}</b>, at ${esc(level(d))}.</p>` : ''}
    ${ready ? '<p class="decide-open"><a href="#/debrief">Open the debrief</a></p>' : ''}
    <details class="decide-change"><summary>Change my decision</summary><p class="decide-change-note">Revising writes a second decision and keeps your first.</p>${form(c.role, c.pack.ladder)}</details>`
    : form(c.role, c.pack.ladder)}
  ${who ? `<p class="decide-others">${who}</p>` : ''}</section>
  <section class="decide-step" aria-labelledby="decide-second"><h2 id="decide-second" class="decide-subtitle"><span class="decide-lock" aria-hidden="true">${d ? lockOpen : lock}</span>2. Second opinion</h2>
  ${d ? `<ol class="decide-second-steps"><li class="decide-second-step">${c.slot('decide.recorded')}</li>
      <li class="decide-second-step">Run /second-opinion outside the kit, with the run info and the call's transcript. The kit never sends anything to an AI.</li>
      <li class="decide-second-step">Add the evidence file it writes, with Add a colleague's evidence.${fileButtons(c.notice)}</li></ol>${proposalsHtml(list, (h) => clockTime(wallOf(h)))}`
    : '<p class="decide-locked">Locked until you record your read. Nothing from the AI shows here until your read is in the log.</p>'}</section>
  <div class="decide-tools"><button type="button" class="decide-copy">Copy summary</button>${d ? '' : fileButtons(c.notice)}</div>
  <h2 class="decide-subtitle">Your summary</h2>${summaryHtml(s)}`;
  main.querySelector('.proposals')?.addEventListener('click', ({ target }) => {
    const b = target.closest('.proposal-button');
    if (b) c.answer(answer(list[Number(b.dataset.i)], b.dataset.act));
  });
  main.dataset.recorded = latest?.h ?? '';
  restore();
  main.querySelector('.decide-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    c.record({ choice: data.get('choice'), level: data.get('level'), why: data.get('why').trim() });
  });
  const copy = main.querySelector('.decide-copy');
  copy.onclick = () => main.ownerDocument.defaultView.navigator.clipboard.writeText(summaryText(s))
    .then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
  bindFileButtons(main, c);
}
