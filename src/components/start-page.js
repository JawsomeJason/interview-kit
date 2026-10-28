import { esc } from '../esc.js';
import { clockTime, fromLocalInput, otherRange, startOptions, toLocalInput } from '../start-time.js';
import { runOfShow } from '../model/timeline.js';
import { pageLinks } from './help.js';
import './undo-toast.css';

const radios = (name, options, picked) => options.map((o) => `<label class="start-option"><input type="radio" name="${name}" value="${esc(o.id)}"${o.id === picked ? ' checked' : ''}>
  <b>${esc(o.name)}</b>${o.about ? `<small class="start-about">${esc(o.about)}</small>` : ''}</label>`).join('');
const roundsOf = (pack, role) => role.rounds.map((id) => pack.rounds.find((r) => r.id === id)).filter(Boolean);

const SLOTS = 4;
const OUTSIDE = 'Pick a start time from a day ago to a week ahead.';
// "2:15 PM (in 8 min)" shows as the time with its distance underneath.
const chip = ({ label, value }, picked) => {
  const [time, away] = label.split(/ \((.*)\)$/);
  return `<label class="start-chip"><input class="start-radio" type="radio" name="start" value="${value ?? ''}"${String(value ?? '') === picked ? ' checked' : ''}>
    <span>${esc(time)}</span>${away ? `<small class="start-about">${esc(away)}</small>` : ''}</label>`;
};
// Now, the next few slots ahead and, once its time has passed, the slot already picked; then Other time.
const chips = (now, picked) => {
  const options = startOptions(now, picked && picked !== 'other' ? Number(picked) : undefined);
  const ahead = options.filter(({ value }) => value > now).slice(0, SLOTS);
  return `${options.filter((o) => o.value === null || ahead.includes(o) || String(o.value) === picked).map((o) => chip(o, picked)).join('')}
    <label class="start-chip"><input class="start-radio" type="radio" name="start" value="other"${picked === 'other' ? ' checked' : ''}><span>Other time…</span></label>`;
};

const MINUTE = 60_000;
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// Your hour: the round's run of show as its author planned it, in clock times from `from`, with the day named when it
// isn't today. A questions segment is the deep dive the hour builds around.
function plan(round, from, now) {
  if (from === undefined) return '<p class="start-plan-wait">Set a start time to see the hour.</p>';
  const { steps, minutes } = runOfShow(round, { segments: {} });
  const deep = (s) => (s.kind === 'questions' ? ' is-deep' : '');
  return `${new Date(from).toDateString() === new Date(now).toDateString() ? '' : `<p class="start-plan-day">${day.format(from)}</p>`}
    <div class="start-plan-bar" aria-hidden="true">${steps.map((s) => `<span class="start-plan-seg${deep(s)}" style="--m: ${s.minutes}"></span>`).join('')}</div>
    <ol class="start-plan-steps">${steps.map((s) => `<li class="start-plan-step${deep(s)}"><time class="start-plan-at">${clockTime(from + s.start * MINUTE)}</time><span class="start-plan-name">${
      esc(s.title)}</span><span class="start-plan-mins">${s.minutes} min</span></li>`).join('')}</ol>
    <p class="start-plan-end">Ends at <b>${clockTime(from + minutes * MINUTE)}</b></p>`;
}

// The setup page: who, when, which role and round, the hour that makes in clock times, then Start. Below it the Saving check and Recent interviews.
// .start-bar and .start-sessions are placeholders session.js swaps for the store's bar and the session list.
export const startPage = {
  render: ({ pack, wantsName, previous, slot, now }) => `<main class="main start" tabindex="-1"><h1 class="start-title">Start an interview</h1>
  <nav class="start-links" aria-label="About the kit">${pageLinks()}</nav>
  <div class="start-bar"></div>
  ${previous ? '<p class="undo-toast" role="status">Started a new interview. <button type="button" class="undo-toast-button start-undo">Undo</button></p>' : ''}
  <form class="start-form">
    ${wantsName ? '<label class="start-field">Your name, as your colleagues will see it <input class="start-input start-name" name="name" required maxlength="80" autocomplete="name"></label>' : ''}
    <label class="start-field">Who are you meeting? <input class="start-input start-candidate" name="candidate" required maxlength="120" autocomplete="off" spellcheck="false" placeholder="Candidate name"></label>
    <fieldset class="start-group"><legend class="start-legend">When does it start?</legend>
      <div class="start-chips">${chips(now, '')}</div>
      <label class="start-field start-other" hidden>Start date and time <input class="start-input start-other-input" type="datetime-local" name="other" required disabled
        value="${toLocalInput(startOptions(now).find(({ value }) => value > now).value)}" min="${otherRange(now).min}" max="${otherRange(now).max}"></label></fieldset>
    <fieldset class="start-group"><legend class="start-legend">Which role?</legend>${radios('role', pack.roles, pack.roles[0]?.id)}</fieldset>
    <fieldset class="start-group start-rounds"><legend class="start-legend">Which round?</legend>${radios('round', roundsOf(pack, pack.roles[0]), pack.roles[0]?.rounds[0])}</fieldset>
    <section class="start-plan" aria-labelledby="start-plan-title"><h2 id="start-plan-title" class="start-legend start-plan-title">Your hour</h2>
      <div class="start-plan-card">${plan(pack.rounds.find((r) => r.id === pack.roles[0]?.rounds[0]), now, now)}</div></section>
    <button type="submit" class="start-go">Start interview</button>
    ${slot('setup.join')}
  </form>
  <section class="start-check" aria-labelledby="start-check-title"><h2 id="start-check-title" class="start-subtitle">Before the interview</h2>
    <p class="start-saving" role="status">Checking that notes save…</p>${slot('setup.test')}</section>
  <div class="start-sessions"></div></main>`,

  // Returns refresh(now), which brings the start choices up to the clock without touching what is typed or picked.
  bind(el, { pack, now, start, undo }) {
    const form = el.querySelector('.start-form');
    const other = el.querySelector('.start-other-input');
    const picked = () => new FormData(form).get('start');
    const check = (at) => other.setCustomValidity(fromLocalInput(other.value, at) === undefined ? OUTSIDE : '');
    // When the picked start is, at `at`: now for Now, a slot's time, or undefined for an Other time outside the window.
    const from = (at) => {
      const when = picked();
      return when === 'other' ? fromLocalInput(other.value, at) : when ? Number(when) : at;
    };
    const card = el.querySelector('.start-plan-card');
    const hour = (at = now()) => { card.innerHTML = plan(pack.rounds.find((r) => r.id === new FormData(form).get('round')), from(at), at); };
    other.addEventListener('input', () => check(now()));
    form.addEventListener('input', () => hour());
    form.addEventListener('change', ({ target }) => {
      if (target.name === 'start') {
        other.parentElement.hidden = target.value !== 'other';
        other.disabled = target.value !== 'other';
      }
      if (target.name !== 'role') return;
      const role = pack.roles.find((r) => r.id === target.value);
      el.querySelector('.start-rounds').innerHTML = `<legend class="start-legend">Which round?</legend>${radios('round', roundsOf(pack, role), role.rounds[0])}`;
      hour();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      start({ roleId: data.get('role'), roundId: data.get('round'), candidate: data.get('candidate').trim(), name: data.get('name')?.trim(),
        startedAt: from(now()) });
    });
    el.querySelector('.start-undo')?.addEventListener('click', undo);
    return (at) => {
      const box = el.querySelector('.start-chips');
      const was = picked();
      const focused = box.contains(el.ownerDocument.activeElement);
      box.innerHTML = chips(at, was);
      if (focused) box.querySelector('input:checked').focus();
      Object.assign(other, otherRange(at));
      check(at);
      hour(at);
    };
  },
};
