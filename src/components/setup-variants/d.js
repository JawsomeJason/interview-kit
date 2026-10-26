import { esc } from '../../esc.js';
import { candidateField } from '../candidate-field.js';
import { otherLimits, otherValue, refreshStart, showProblem, startedAtOf, startProblem, startSelectOptions } from './start-field.js';
import './d.css';

const blurb = (r) => `${r.minutes} min round, ${r.deepDiveMinutes} min deep dive.`;

// Quick start: the whole setup is one sentence. Round starts on the last one used, the start on Now, so a name and
// Enter is all it takes.
export default {
  label: 'Quick start',
  render: ({ rounds, round, candidate, startOptions }) => {
    const chosen = rounds.find((r) => r.id === round) ?? rounds[0];
    return `<main class="main setup-d"><h1>Start an interview</h1>
  <div class="setup-d-sentence">Interviewing ${candidateField(candidate)} for
    <select class="setup-d-round" aria-label="Round">${rounds.map((r) =>
      `<option value="${esc(r.id)}"${r === chosen ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    <span class="setup-d-when">starting <select class="setup-start-select" aria-label="Start time">${startSelectOptions(startOptions)}</select></span>
    <input type="datetime-local" class="setup-start-other" aria-label="Start date and time"${otherLimits()} hidden>
    <button class="setup-d-start" data-round="${esc(chosen.id)}" aria-describedby="setup-d-note"${candidate.trim() ? '' : ' disabled'}>Start</button></div>
  <p class="setup-d-note" id="setup-d-note"${candidate.trim() ? ' hidden' : ''}>Add a name to start.</p>
  <p class="setup-d-blurb">${blurb(chosen)}</p>
  <p class="setup-d-keys"><kbd class="setup-d-key">Enter</kbd> in the name starts the interview. <kbd class="setup-d-key">Tab</kbd> moves to the round, the start time and Start.</p></main>`;
  },
  bind(el, { rounds, start }) {
    const name = el.querySelector('.candidate-field');
    const round = el.querySelector('.setup-d-round');
    const select = el.querySelector('.setup-start-select');
    const other = el.querySelector('.setup-start-other');
    const button = el.querySelector('.setup-d-start');
    const note = el.querySelector('.setup-d-note');
    const problem = () => startProblem(name.value, otherValue(select, other));
    const sync = () => showProblem(note, button, problem());
    const go = () => {
      if (problem()) return;
      start({ roundId: round.value, candidate: name.value, startedAt: startedAtOf(select, other) });
    };
    round.onchange = () => {
      button.dataset.round = round.value;
      el.querySelector('.setup-d-blurb').textContent = blurb(rounds.find((r) => r.id === round.value));
    };
    select.onchange = () => { other.hidden = select.value !== 'other'; sync(); if (!other.hidden) other.focus(); };
    el.addEventListener('input', sync);
    name.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    button.onclick = go;
    // Ready to type, unless the interviewer is mid-click elsewhere (the Try layouts panel).
    if (el.ownerDocument.activeElement === el.ownerDocument.body) name.focus();
    return (now) => {
      refreshStart(select, other, now);
      sync();
    };
  },
};
