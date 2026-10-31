import { esc } from '../esc.js';
import { clockTime, fromLocalInput, otherRange, startOptions, toLocalInput } from '../start-time.js';
import { composeRound, coverage } from '../model/plan.js';
import { itemsOf } from '../model/observables.js';
import { inScope } from '../model/scope.js';
import { runOfShow } from '../model/timeline.js';
import { floorText, floorWarning } from './floor-warning.js';
import { optionRow } from './option-row.js';
import { pageLinks } from './help.js';
import './undo-toast.css';

const radios = (name, options, picked) => options.map((o) => `<label class="start-option"><input type="radio" name="${name}" value="${esc(o.id)}"${o.id === picked ? ' checked' : ''}>
  <b>${esc(o.name)}</b>${o.about ? `<small class="start-about">${esc(o.about)}</small>` : ''}</label>`).join('');
const roundsOf = (pack, role) => role.rounds.map((id) => pack.rounds.find((r) => r.id === id)).filter(Boolean);
const roundOf = (pack, role, id) => composeRound(pack, role, pack.rounds.find((r) => r.id === id));

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

// The plan the start page is editing: { [seg]: minutes } for each activity of the composed round, 0 when off.
const MAX_MINUTES = 180;
const planOf = (minutes) => ({ segments: Object.fromEntries(Object.entries(minutes).map(([seg, m]) => [seg, { minutes: m }])) });
const defaults = (round) => Object.fromEntries(runOfShow(round, { segments: {} }).all.filter((s) => s.optional).map((s) => [s.seg, s.minutes]));
const COVERS = { yes: 'yes', topics: 'from the deep dive', none: 'none' };

const frameNames = (show) => show.all.filter((s) => s.frame && s.minutes > 0).map((s) => s.title.toLowerCase()).join(' and ');
// A warning, never a block: an interview can run with no activity at all.
const nothingText = (show) => {
  if (show.all.some((s) => s.optional && s.minutes > 0)) return '';
  return `Nothing is ticked, so this interview has ${frameNames(show) ? `only the ${frameNames(show)}` : 'no activities'}.`;
};

// The total with the frames named, and which competencies the activities that are on can give evidence for.
function sum(pack, role, show) {
  const name = (id) => pack.competencies.find((c) => c.id === id)?.name ?? id;
  return `<p class="start-activity-total">${show.minutes} min${frameNames(show) ? ` with ${frameNames(show)}` : ''}</p>
    <p class="start-coverage">Evidence this plan can give: ${Object.entries(coverage(pack, role, show.steps, role.hiring, inScope)).map(([id, c]) => `${esc(name(id))} ${COVERS[c]}`).join(' / ')}</p>`;
}

// Which activities run and for how long. A tick brings an activity back at its full minutes; an untick sets 0.
function activities(pack, role, round, minutes) {
  const show = runOfShow(round, planOf(minutes));
  const items = itemsOf(pack);
  return `<legend class="start-legend">Which activities, and how long?</legend>
    ${show.all.filter((s) => s.optional).map((s) => `<div class="start-activity" data-seg="${esc(s.seg)}">
      ${optionRow({ type: 'checkbox', value: s.seg, checked: s.minutes > 0 }, esc(s.title), 'start-activity-on')}
      <label class="start-activity-minutes"><span class="visually-hidden">Minutes for ${esc(s.title)}</span><input class="start-input start-activity-min" type="number" min="0" max="${MAX_MINUTES}" step="1" value="${s.minutes}"> min</label>
      ${floorWarning(items.get(s.ref), s.minutes)}</div>`).join('')}
    <p class="start-nothing" role="status">${nothingText(show)}</p>
    <div class="start-activity-sum">${sum(pack, role, show)}</div>`;
}

const MINUTE = 60_000;
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// Your hour: the run of show as planned above, in clock times from `from`, with the day named when it isn't today.
// A questions segment is the deep dive the hour builds around. A 0-minute part, such as Before the call or an
// activity that is off, takes no time in the hour, so it shows only in the run of show.
function plan(round, from, now, minutes) {
  if (from === undefined) return '<p class="start-plan-wait">Set a start time to see the hour.</p>';
  const { steps: all, minutes: total } = runOfShow(round, planOf(minutes));
  const steps = all.filter((s) => s.minutes > 0);
  const deep = (s) => (s.kind === 'questions' ? ' is-deep' : '');
  return `${new Date(from).toDateString() === new Date(now).toDateString() ? '' : `<p class="start-plan-day">${day.format(from)}</p>`}
    <div class="start-plan-bar" aria-hidden="true">${steps.map((s) => `<span class="start-plan-seg${deep(s)}" style="--m: ${s.minutes}"></span>`).join('')}</div>
    <ol class="start-plan-steps">${steps.map((s) => `<li class="start-plan-step${deep(s)}"><time class="start-plan-at">${clockTime(from + s.start * MINUTE)}</time><span class="start-plan-name">${
      esc(s.title)}</span><span class="start-plan-mins">${s.minutes} min</span></li>`).join('')}</ol>
    <p class="start-plan-end">Ends at <b>${clockTime(from + total * MINUTE)}</b></p>`;
}

// The setup page: who, when, which role and round, which activities for how long, the hour that makes in clock times,
// then Start. Below it the Saving check and Recent interviews.
// .start-bar and .start-sessions are placeholders session.js swaps for the store's bar and the session list.
export const startPage = {
  render: ({ pack, wantsName, previous, leaving, slot, now }) => {
    const role = pack.roles[0];
    const round = role && roundOf(pack, role, role.rounds[0]);
    return `<main class="main start" tabindex="-1"><h1 class="start-title">Start an interview</h1>
  <nav class="start-links" aria-label="About the kit">${pageLinks()}</nav>
  <div class="start-bar"></div>
  ${previous ? `<p class="undo-toast" role="status">Started a new interview. ${leaving ? `${esc(leaving)} ` : ''}<button type="button" class="undo-toast-button start-undo">Undo</button></p>` : ''}
  <form class="start-form">
    ${wantsName ? '<label class="start-field">Your name, as your colleagues will see it <input class="start-input start-name" name="name" required maxlength="80" autocomplete="name"></label>' : ''}
    <label class="start-field">Who are you meeting? <input class="start-input start-candidate" name="candidate" required maxlength="120" autocomplete="off" spellcheck="false" placeholder="Candidate name"></label>
    <fieldset class="start-group"><legend class="start-legend">When does it start?</legend>
      <div class="start-chips">${chips(now, '')}</div>
      <label class="start-field start-other" hidden>Start date and time <input class="start-input start-other-input" type="datetime-local" name="other" required disabled
        value="${toLocalInput(startOptions(now).find(({ value }) => value > now).value)}" min="${otherRange(now).min}" max="${otherRange(now).max}"></label></fieldset>
    <fieldset class="start-group"><legend class="start-legend">Which role?</legend>${radios('role', pack.roles, role?.id)}</fieldset>
    <fieldset class="start-group start-rounds"><legend class="start-legend">Which round?</legend>${radios('round', roundsOf(pack, role), role?.rounds[0])}</fieldset>
    <fieldset class="start-group start-activities">${round ? activities(pack, role, round, defaults(round)) : ''}</fieldset>
    <section class="start-plan" aria-labelledby="start-plan-title"><h2 id="start-plan-title" class="start-legend start-plan-title">Your hour</h2>
      <div class="start-plan-card">${round ? plan(round, now, now, defaults(round)) : ''}</div></section>
    <button type="submit" class="start-go">Start interview</button>
    ${slot('setup.join')}
  </form>
  <section class="start-check" aria-labelledby="start-check-title"><h2 id="start-check-title" class="start-subtitle">Before the interview</h2>
    <p class="start-saving" role="status">Checking that notes save…</p>${slot('setup.test')}</section>
  <div class="start-sessions"></div></main>`;
  },

  // Returns refresh(now), which brings the start choices up to the clock without touching what is typed or picked.
  bind(el, { pack, now, start, undo }) {
    const form = el.querySelector('.start-form');
    const other = el.querySelector('.start-other-input');
    const box = el.querySelector('.start-activities');
    const picked = () => new FormData(form).get('start');
    const check = (at) => other.setCustomValidity(fromLocalInput(other.value, at) === undefined ? OUTSIDE : '');
    // When the picked start is, at `at`: now for Now, a slot's time, or undefined for an Other time outside the window.
    const from = (at) => {
      const when = picked();
      return when === 'other' ? fromLocalInput(other.value, at) : when ? Number(when) : at;
    };
    let role = pack.roles[0];
    let round = roundOf(pack, role, role.rounds[0]);
    let minutes = defaults(round);
    const card = el.querySelector('.start-plan-card');
    const hour = (at = now()) => { card.innerHTML = plan(round, from(at), at, minutes); };
    // A new preset resets every activity to what it plans.
    const reset = () => {
      round = roundOf(pack, role, new FormData(form).get('round'));
      minutes = defaults(round);
      box.innerHTML = activities(pack, role, round, minutes);
      hour();
    };
    other.addEventListener('input', () => check(now()));
    form.addEventListener('input', () => hour());
    // Runs before the form's own input listener, so the hour reads the edited minutes.
    box.addEventListener('input', ({ target }) => {
      const row = target.closest('.start-activity');
      if (!row) return;
      const seg = row.dataset.seg;
      const segment = round.segments.find((s) => `${round.id}/${s.id}` === seg);
      const tick = row.querySelector('.option-row-control');
      const number = row.querySelector('.start-activity-min');
      if (target === tick) {
        minutes[seg] = tick.checked ? segment.full : 0;
        number.value = minutes[seg];
      } else {
        const v = Number(number.value);
        if (!Number.isInteger(v) || v < 0 || v > MAX_MINUTES) return;
        minutes[seg] = v;
        tick.checked = v > 0;
      }
      row.querySelector('.floor-warning').textContent = floorText(itemsOf(pack).get(segment.ref), minutes[seg]);
      const show = runOfShow(round, planOf(minutes));
      box.querySelector('.start-nothing').textContent = nothingText(show);
      box.querySelector('.start-activity-sum').innerHTML = sum(pack, role, show);
    });
    form.addEventListener('change', ({ target }) => {
      if (target.name === 'start') {
        other.parentElement.hidden = target.value !== 'other';
        other.disabled = target.value !== 'other';
      }
      if (target.name === 'round') reset();
      if (target.name !== 'role') return;
      role = pack.roles.find((r) => r.id === target.value);
      el.querySelector('.start-rounds').innerHTML = `<legend class="start-legend">Which round?</legend>${radios('round', roundsOf(pack, role), role.rounds[0])}`;
      reset();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      start({ roleId: data.get('role'), roundId: data.get('round'), candidate: data.get('candidate').trim(), name: data.get('name')?.trim(),
        startedAt: from(now()), minutes: { ...minutes } });
    });
    el.querySelector('.start-undo')?.addEventListener('click', undo);
    return (at) => {
      const chipBox = el.querySelector('.start-chips');
      const was = picked();
      const focused = chipBox.contains(el.ownerDocument.activeElement);
      chipBox.innerHTML = chips(at, was);
      if (focused) chipBox.querySelector('input:checked').focus();
      Object.assign(other, otherRange(at));
      check(at);
      hour(at);
    };
  },
};
