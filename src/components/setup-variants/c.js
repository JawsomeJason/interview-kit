import { esc } from '../../esc.js';
import { parts } from '../../content.js';
import { candidateField } from '../candidate-field.js';
import { runOfShow } from '../nav.js';
import { otherLimits, otherValue, refreshStart, showProblem, startedAtOf, startProblem, startSelectOptions } from './start-field.js';
import './c.css';

const MINUTE = 60_000;
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// The hour in order at its default deep dive, as the timeline lays it out, each part at its clock time.
function preview(round, from) {
  const rows = runOfShow(round, parts, { minutes: round.deepDiveMinutes })
    .map((s) => ({ ...s, at: from + s.start * MINUTE, deep: s.id === 'deep-dive' }));
  const at = rows.at(-1).at + rows.at(-1).minutes * MINUTE;
  const bar = rows.map((r) => `<span class="plan-seg${r.deep ? ' is-deep' : ''}" style="flex-grow: ${r.minutes}"></span>`).join('');
  const list = rows.map((r) => `<li class="plan-step${r.deep ? ' is-deep' : ''}"><time class="plan-at">${clock.format(r.at)}</time>
    <span class="plan-name">${esc(r.name)}</span><span class="plan-mins">${r.minutes} min</span></li>`).join('');
  const other = new Date(from).toDateString() !== new Date().toDateString();
  return `${other ? `<p class="plan-day">${day.format(from)}</p>` : ''}<div class="plan-bar" aria-hidden="true">${bar}</div><ol class="plan-steps">${list}</ol>
    <p class="plan-end">Ends at <b>${clock.format(at)}</b></p>`;
}

// Setup with a live plan: name, start and round on one side, the hour with real clock times on the other.
export default {
  label: 'Plan preview',
  render: ({ rounds, round, candidate, startOptions }) => {
    const picked = rounds.some((r) => r.id === round) ? round : rounds[0].id;
    return `<main class="main plan-page"><h1>Plan the interview</h1>
  <div class="plan-cols">
    <div class="plan-inputs">
      <label class="plan-field candidate-label">Candidate name ${candidateField(candidate)}</label>
      <div class="plan-field"><label for="plan-start">Starts</label>
        <select id="plan-start" class="setup-start-select plan-control">${startSelectOptions(startOptions)}</select>
        <input type="datetime-local" class="setup-start-other plan-control" aria-label="Start date and time"${otherLimits()} hidden></div>
      <fieldset class="plan-rounds"><legend class="plan-legend">Round</legend>
        ${rounds.map((r) => `<label class="plan-round"><input type="radio" class="plan-radio" name="plan-round" value="${esc(r.id)}"${r.id === picked ? ' checked' : ''}>
          <span class="plan-round-name">${esc(r.name)}</span>
          <span class="plan-round-mins">${r.minutes} min, with a ${r.deepDiveMinutes} min deep dive</span></label>`).join('')}
      </fieldset>
    </div>
    <section class="plan-card" aria-labelledby="plan-title"><h2 id="plan-title" class="plan-title">Your hour</h2>
      <div class="plan-live" aria-live="polite"></div>
      <button type="button" class="plan-go" data-round="${esc(picked)}" aria-describedby="plan-note"${candidate.trim() ? '' : ' disabled'}>Start interview</button>
      <p class="plan-note" id="plan-note">Add a name to start.</p>
    </section>
  </div></main>`;
  },
  bind(el, { rounds, start }) {
    const select = el.querySelector('.setup-start-select');
    const other = el.querySelector('.setup-start-other');
    const name = el.querySelector('.candidate-field');
    const go = el.querySelector('.plan-go');
    const live = el.querySelector('.plan-live');
    const note = el.querySelector('.plan-note');
    const round = () => rounds.find((r) => r.id === [...el.querySelectorAll('[name="plan-round"]')].find((radio) => radio.checked).value);
    const startedAt = () => startedAtOf(select, other);
    const problem = () => startProblem(name.value, otherValue(select, other));
    const refresh = () => {
      other.hidden = select.value !== 'other';
      go.dataset.round = round().id;
      live.innerHTML = preview(round(), startedAt() ?? Date.now());
      showProblem(note, go, problem());
    };
    el.addEventListener('input', refresh);
    el.addEventListener('change', refresh);
    name.onkeydown = (e) => { if (e.key === 'Enter') go.click(); };
    go.onclick = () => {
      if (problem()) return;
      start({ roundId: round().id, candidate: name.value.trim(), startedAt: startedAt() });
    };
    refresh();
    return (now) => {
      refreshStart(select, other, now);
      refresh();
    };
  },
};
