import { esc } from '../../esc.js';
import { fromLocalInput, otherRange, startOptions as optionsAt, toLocalInput } from '../../start-time.js';
import { candidateField } from '../candidate-field.js';
import { otherLimits, pickedSlot, showProblem, startProblem } from './start-field.js';
import './a.css';

const SLOTS = 4;
// "2:15 PM (in 8 min)" shows as the time with its distance underneath.
const chip = ({ label, value }, picked) => {
  const [time, away] = label.split(/ \((.*)\)$/);
  return `<label class="setup-a-chip"><input class="setup-a-radio" type="radio" name="setup-a-start" value="${value ?? ''}"${String(value ?? '') === picked ? ' checked' : ''}>
    <span>${esc(time)}</span>
    ${away ? `<small class="setup-a-sub">${esc(away)}</small>` : ''}</label>`;
};

// Now, the next few slots ahead and, once its time has passed, the slot already picked; then Other time.
const chips = (options, picked, now) => {
  const ahead = options.filter(({ value }) => value > now).slice(0, SLOTS);
  return `${options.filter((o) => o.value === null || ahead.includes(o) || String(o.value) === picked).map((o) => chip(o, picked)).join('')}
      <label class="setup-a-chip"><input class="setup-a-radio" type="radio" name="setup-a-start" value="other"${picked === 'other' ? ' checked' : ''}><span>Other time…</span></label>`;
};

// A calm setup page: the name, when the interview starts, the round, then one Start button.
export default {
  label: 'Calm form',
  render({ rounds, round, candidate, startOptions }) {
    const picked = rounds.some((r) => r.id === round) ? round : rounds[0]?.id;
    const next = startOptions.find(({ value }) => value > Date.now())?.value ?? Date.now();
    return `<main class="main setup-a"><h1 class="setup-a-title">Start an interview</h1>
  <label class="setup-a-name"><span class="setup-a-legend">Who are you meeting?</span>${candidateField(candidate)}</label>
  <fieldset class="setup-a-group"><legend class="setup-a-legend">When does it start?</legend>
    <div class="setup-a-chips">${chips(startOptions, '', Date.now())}</div>
    <label class="setup-a-other" hidden>Start date and time <input type="datetime-local" value="${toLocalInput(next)}"${otherLimits()}></label>
  </fieldset>
  <fieldset class="setup-a-group"><legend class="setup-a-legend">Which round?</legend>
    ${rounds.map((r) => `<label class="setup-a-card"><input class="setup-a-radio" type="radio" name="setup-a-round" value="${esc(r.id)}"${r.id === picked ? ' checked' : ''}>
      <b class="setup-a-card-name">${esc(r.name)}</b>
      <small class="setup-a-sub">${r.minutes} min round, ${r.deepDiveMinutes} min deep dive</small></label>`).join('')}
  </fieldset>
  <div class="setup-a-go"><button class="setup-a-start" data-round="${esc(picked ?? '')}" aria-describedby="setup-a-note"${candidate.trim() ? '' : ' disabled'}>Start interview</button>
    <p class="setup-a-note" id="setup-a-note"${candidate.trim() ? ' hidden' : ''}>Add a name to start.</p></div></main>`;
  },
  bind(el, { start }) {
    const name = el.querySelector('.candidate-field');
    const button = el.querySelector('.setup-a-start');
    const note = el.querySelector('.setup-a-note');
    const other = el.querySelector('.setup-a-other');
    // Not querySelector(':checked'): happy-dom caches that answer across clicks.
    const checked = (group) => [...el.querySelectorAll(`input[name="${group}"]`)].find((input) => input.checked).value;
    const problem = () => startProblem(name.value, checked('setup-a-start') === 'other' ? other.querySelector('input').value : undefined);
    const sync = () => showProblem(note, button, problem());
    el.addEventListener('input', sync);
    el.addEventListener('change', ({ target }) => {
      if (target.name === 'setup-a-start') other.hidden = target.value !== 'other';
      if (target.name === 'setup-a-round') button.dataset.round = target.value;
      sync();
    });
    name.onkeydown = (e) => { if (e.key === 'Enter') button.click(); };
    button.onclick = () => {
      if (problem()) return;
      const when = checked('setup-a-start');
      const startedAt = when === 'other' ? fromLocalInput(other.querySelector('input').value) : when ? Number(when) : undefined;
      start({ roundId: checked('setup-a-round'), candidate: name.value.trim(), startedAt });
    };
    return (now) => {
      const picked = checked('setup-a-start');
      const box = el.querySelector('.setup-a-chips');
      const focused = box.contains(el.ownerDocument.activeElement);
      box.innerHTML = chips(optionsAt(now, pickedSlot(picked)), picked, now);
      if (focused) [...box.querySelectorAll('input')].find((input) => input.checked).focus();
      Object.assign(other.querySelector('input'), otherRange(now));
      sync();
    };
  },
};
