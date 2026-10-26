import { esc } from '../esc.js';
import { clockTime, fromLocalInput, otherRange, startOptions as optionsAt, toLocalInput } from '../start-time.js';
import { candidateField } from './candidate-field.js';
import { runOfShow } from './nav.js';
import { otherLimits, pickedSlot, showProblem, startProblem } from './start-field.js';
import './setup-page.css';

const SLOTS = 4;
// "2:15 PM (in 8 min)" shows as the time with its distance underneath.
const chip = ({ label, value }, picked) => {
  const [time, away] = label.split(/ \((.*)\)$/);
  return `<label class="setup-chip"><input class="setup-radio" type="radio" name="setup-start" value="${value ?? ''}"${String(value ?? '') === picked ? ' checked' : ''}>
    <span>${esc(time)}</span>
    ${away ? `<small class="setup-sub">${esc(away)}</small>` : ''}</label>`;
};

// Now, the next few slots ahead and, once its time has passed, the slot already picked; then Other time.
const chips = (options, picked, now) => {
  const ahead = options.filter(({ value }) => value > now).slice(0, SLOTS);
  return `${options.filter((o) => o.value === null || ahead.includes(o) || String(o.value) === picked).map((o) => chip(o, picked)).join('')}
      <label class="setup-chip"><input class="setup-radio" type="radio" name="setup-start" value="other"${picked === 'other' ? ' checked' : ''}><span>Other time…</span></label>`;
};

const MINUTE = 60_000;
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// Your hour: the round's run of show in clock times from `from`, with the day named when it isn't today.
function plan(round, parts, from) {
  const steps = runOfShow(round, parts, { minutes: round.deepDiveMinutes });
  const end = from + (steps.at(-1).start + steps.at(-1).minutes) * MINUTE;
  const today = new Date(from).toDateString() === new Date().toDateString();
  return `${today ? '' : `<p class="setup-plan-day">${day.format(from)}</p>`}<div class="setup-plan-bar" aria-hidden="true">${steps.map((s) =>
    `<span class="setup-plan-seg${s.id === 'deep-dive' ? ' is-deep' : ''}" style="--m: ${s.minutes}"></span>`).join('')}</div>
    <ol class="setup-plan-steps">${steps.map((s) => `<li class="setup-plan-step${s.id === 'deep-dive' ? ' is-deep' : ''}"><time class="setup-plan-at">${
      clockTime(from + s.start * MINUTE)}</time><span class="setup-plan-name">${esc(s.name)}</span><span class="setup-plan-mins">${s.minutes} min</span></li>`).join('')}</ol>
    <p class="setup-plan-end">Ends at <b>${clockTime(end)}</b></p>`;
}

// The interview clock runs from startedAt, which defaults to the moment the round is picked.
export const pickRound = (id, candidate, startedAt = Date.now()) => ({ state: { round: id, candidate, startedAt }, route: '#/intro' });

// A calm setup page: the name, when the interview starts, the round, the hour that makes in clock times, then one
// Start button. render returns the whole
// page as one <main> with its <h1>, where the undo toast lands; bind wires it up and returns refresh(now), which main.js
// calls every 30 seconds to bring the start choices up to the clock without touching what's typed or picked.
// ctx = { rounds, parts, round, candidate, startOptions, links, start({ roundId, candidate, startedAt }) }:
// - round: the id of the round the last interview used, to pick by default after New interview, or null.
// - startOptions: [{ label, value }] from start-time.js, Now first (value null) then quarter-hour slots as epoch ms.
// - links: the What's new and Help links.
// - start: picks the round and opens the interview; startedAt defaults to now, and a start ahead shows as a countdown.
export default {
  render({ rounds, parts, round, candidate, startOptions, links = '' }) {
    const picked = rounds.some((r) => r.id === round) ? round : rounds[0]?.id;
    const next = startOptions.find(({ value }) => value > Date.now())?.value ?? Date.now();
    return `<main class="main setup"><h1 class="setup-title">Start an interview</h1>
  <label class="setup-name"><span class="setup-legend">Who are you meeting?</span>${candidateField(candidate)}</label>
  <fieldset class="setup-group"><legend class="setup-legend">When does it start?</legend>
    <div class="setup-chips">${chips(startOptions, '', Date.now())}</div>
    <label class="setup-other" hidden>Start date and time <input type="datetime-local" value="${toLocalInput(next)}"${otherLimits()}></label>
  </fieldset>
  <fieldset class="setup-group"><legend class="setup-legend">Which round?</legend>
    ${rounds.map((r) => `<label class="setup-card"><input class="setup-radio" type="radio" name="setup-round" value="${esc(r.id)}"${r.id === picked ? ' checked' : ''}>
      <b class="setup-card-name">${esc(r.name)}</b>
      <small class="setup-sub">${r.minutes} min round, ${r.deepDiveMinutes} min deep dive</small></label>`).join('')}
  </fieldset>
  <section class="setup-plan" aria-labelledby="setup-plan-title"><h2 id="setup-plan-title" class="setup-legend setup-plan-title">Your hour</h2>
    <div class="setup-plan-card">${picked ? plan(rounds.find((r) => r.id === picked), parts, Date.now()) : ''}</div></section>
  <div class="setup-go"><button class="setup-start" data-round="${esc(picked ?? '')}" aria-describedby="setup-note"${candidate.trim() ? '' : ' disabled'}>Start interview</button>
    <p class="setup-note" id="setup-note"${candidate.trim() ? ' hidden' : ''}>Add a name to start.</p></div>
  <div class="setup-links" role="navigation" aria-label="About the kit">${links}</div></main>`;
  },
  bind(el, { rounds, parts, start }) {
    const name = el.querySelector('.candidate-field');
    const button = el.querySelector('.setup-start');
    const note = el.querySelector('.setup-note');
    const other = el.querySelector('.setup-other');
    // Not querySelector(':checked'): happy-dom caches that answer across clicks.
    const checked = (group) => [...el.querySelectorAll(`input[name="${group}"]`)].find((input) => input.checked).value;
    const problem = () => startProblem(name.value, checked('setup-start') === 'other' ? other.querySelector('input').value : undefined);
    const card = el.querySelector('.setup-plan-card');
    const sync = () => {
      showProblem(note, button, problem());
      const when = checked('setup-start');
      const from = when === 'other' ? fromLocalInput(other.querySelector('input').value) : when ? Number(when) : Date.now();
      card.innerHTML = from === undefined ? '<p class="setup-plan-wait">Set a start time to see the hour.</p>'
        : plan(rounds.find((r) => r.id === checked('setup-round')), parts, from);
    };
    el.addEventListener('input', sync);
    el.addEventListener('change', ({ target }) => {
      if (target.name === 'setup-start') other.hidden = target.value !== 'other';
      if (target.name === 'setup-round') button.dataset.round = target.value;
      sync();
    });
    name.onkeydown = (e) => { if (e.key === 'Enter') button.click(); };
    button.onclick = () => {
      if (problem()) return;
      const when = checked('setup-start');
      const startedAt = when === 'other' ? fromLocalInput(other.querySelector('input').value) : when ? Number(when) : undefined;
      start({ roundId: checked('setup-round'), candidate: name.value.trim(), startedAt });
    };
    return (now) => {
      const picked = checked('setup-start');
      const box = el.querySelector('.setup-chips');
      const focused = box.contains(el.ownerDocument.activeElement);
      box.innerHTML = chips(optionsAt(now, pickedSlot(picked)), picked, now);
      if (focused) [...box.querySelectorAll('input')].find((input) => input.checked).focus();
      Object.assign(other.querySelector('input'), otherRange(now));
      sync();
    };
  },
};
