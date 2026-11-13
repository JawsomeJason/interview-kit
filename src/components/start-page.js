import { esc } from '../esc.js';
import { clockTime, fromLocalInput, otherRange, startOptions, toLocalInput } from '../start-time.js';
import { fitPlan, stepOf } from '../model/fit.js';
import { composeRound, coverage, lengthOf } from '../model/plan.js';
import { itemsOf } from '../model/observables.js';
import { runOfShow } from '../model/timeline.js';
import { MAX_MINUTES } from './segment-minutes.js';
import { pageLinks } from './help.js';
import './undo-toast.css';

const radios = (name, options, picked) => options.map((o) => `<label class="start-option"><input type="radio" name="${name}" value="${esc(o.id)}"${o.id === picked ? ' checked' : ''}>
  <b>${esc(o.name)}</b>${o.about ? `<small class="start-about">${esc(o.about)}</small>` : ''}</label>`).join('');
const pills = (name, options, picked) => options.map((o) => `<label class="start-chip"><input class="start-radio" type="radio" name="${name}" value="${esc(o.id)}"${
  String(o.id) === String(picked) ? ' checked' : ''}><span>${esc(o.name)}</span></label>`).join('');
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
const planOf = (minutes) => ({ segments: Object.fromEntries(Object.entries(minutes).map(([seg, m]) => [seg, { minutes: m }])) });
const defaults = (round) => Object.fromEntries(runOfShow(round, { segments: {} }).all.filter((s) => s.optional).map((s) => [s.seg, s.minutes]));
const COVERS = { yes: 'yes', topics: 'from the deep dive', little: 'little', none: 'none' };

const frameNames = (show) => show.all.filter((s) => s.frame && s.minutes > 0).map((s) => s.title.toLowerCase()).join(' and ');
// A warning, never a block: an interview can run with no activity at all.
const nothingText = (show) => {
  if (show.all.some((s) => s.optional && s.minutes > 0)) return '';
  return `Nothing is on, so this interview has ${frameNames(show) ? `only the ${frameNames(show)}` : 'no activities'}.`;
};

// Which competencies the activities that are on can give evidence for.
function evidence(pack, role, show) {
  const name = (id) => pack.competencies.find((c) => c.id === id)?.name ?? id;
  return `<p class="start-coverage-lead">Evidence this plan can give:</p><ul class="start-coverage-list">${
    Object.entries(coverage(pack, role, show.steps, role.hiring)).map(([id, c]) => `<li class="start-coverage-item">${esc(name(id))} ${COVERS[c]}</li>`).join('')}</ul>`;
}

const rounds = (pack, role) => `<legend class="start-legend visually-hidden">Which round?</legend><div class="start-chips">${pills('round', roundsOf(pack, role), role.rounds[0])}</div>`;
const longer = (role) => `<summary class="start-longer-ask">Need longer than ${lengthOf(role)} min?</summary>
  <div class="start-chips">${pills('length', lengths(role).map((m) => ({ id: m, name: `${m} min` })), lengthOf(role))}</div>`;

const MINUTE = 60_000;
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
// The interview lengths on offer: the role's own, then a quarter and a half hour more.
const lengths = (role) => [0, 15, 30].map((more) => lengthOf(role) + more).filter((m) => m <= MAX_MINUTES);
// The plan as fit sees it: every segment with its minutes and the least its item can run.
const fitted = (pack, show, budget) => fitPlan(show.all.map((s) => ({ seg: s.seg, minutes: s.minutes, frame: s.frame, floor: itemsOf(pack).get(s.ref)?.floor })), budget);

// Each pair of activities that run back to back shares a cut: a slider whose value is the minutes of the one before
// it. It moves minutes from one to the other, so the length holds, and stops at the least either can run.
const cutsOf = (pack, show) => show.steps.filter((s) => s.minutes > 0).flatMap((left, i, on) => {
  const right = on[i + 1];
  if (left.frame || !right || right.frame) return [];
  // An activity on the bar keeps at least one step of time, so a drag never turns it off by accident.
  const least = (s) => Math.min(Math.max(itemsOf(pack).get(s.ref)?.floor ?? 0, stepOf([s.minutes])), s.minutes);
  return [{ left, right, min: least(left), max: left.minutes + right.minutes - least(right) }];
});
const cutAttrs = ({ left, right }, total) => ({ max: left.minutes + right.minutes, value: left.minutes,
  'aria-valuetext': `${left.title} ${left.minutes} min, ${right.title} ${right.minutes} min`, style: `--at: ${left.start}; --span: ${left.minutes + right.minutes}; --total: ${total}` });

// The plan as one bar, in clock times from `from` when there is one: each part that takes time, as wide as its
// minutes. An activity carries its Remove, and one that is off waits under Add. Time the plan leaves is spare.
function timeline(pack, role, round, minutes, budget, from, now) {
  const show = runOfShow(round, planOf(minutes));
  const total = Math.max(show.minutes, budget);
  const on = show.steps.filter((s) => s.minutes > 0);
  const off = show.all.filter((s) => s.optional && s.minutes === 0);
  const spare = budget - show.minutes;
  const at = (s) => (from === undefined ? '' : ` · ${clockTime(from + s.start * MINUTE)}`);
  const step = stepOf([budget, ...show.all.map((s) => s.minutes)]);
  return `${from === undefined || new Date(from).toDateString() === new Date(now).toDateString() ? '' : `<p class="start-plan-day">${day.format(from)}</p>`}
    <div class="start-track"><ol class="start-segs">${on.map((s) => `<li class="start-seg${s.frame ? ' is-frame' : ''}" style="--m: ${s.minutes}">
      <b class="start-seg-name">${esc(s.title)}</b><span class="start-seg-time">${s.minutes} min${at(s)}</span>${
  s.optional ? `<button type="button" class="start-seg-remove" data-seg="${esc(s.seg)}" aria-label="Remove ${esc(s.title)}">×</button>` : ''}</li>`).join('')}${
  spare > 0 ? `<li class="start-seg is-spare" style="--m: ${spare}"><span class="start-seg-time">${spare} min spare</span></li>` : ''}</ol>${
  cutsOf(pack, show).map((cut) => `<input class="start-cut" type="range" min="0" step="${step}" data-seg="${esc(cut.left.seg)}" aria-label="${esc(cut.left.title)} and ${esc(cut.right.title)}"${
    Object.entries(cutAttrs(cut, total)).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')}>`).join('')}</div>
    <p class="start-plan-end">${from === undefined ? 'Set a start time to see clock times.' : `Ends at <b>${clockTime(from + show.minutes * MINUTE)}</b>`} · ${show.minutes} of ${budget} min</p>
    ${off.length ? `<p class="start-adds">Add ${off.map((s) => `<button type="button" class="start-add" data-seg="${esc(s.seg)}">${esc(s.title)}</button>`).join(' ')}</p>` : ''}
    <p class="start-nothing" role="status">${nothingText(show)}</p>
    <div class="start-coverage">${evidence(pack, role, show)}</div>`;
}

// The setup page in two parts: who, when and Start, then the plan as one timeline that is also where it is edited.
// Below them the Saving check and Recent interviews.
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
    <div class="start-who">
    ${wantsName ? '<label class="start-field">Your name, as your colleagues will see it <input class="start-input start-name" name="name" required maxlength="80" autocomplete="name"></label>' : ''}
    <label class="start-field">Who are you meeting? <input class="start-input start-candidate" name="candidate" required maxlength="120" autocomplete="off" spellcheck="false" placeholder="Candidate name"></label>
    <fieldset class="start-group"><legend class="start-legend">When does it start?</legend>
      <div class="start-chips">${chips(now, '')}</div>
      <label class="start-field start-other" hidden>Start date and time <input class="start-input start-other-input" type="datetime-local" name="other" required disabled
        value="${toLocalInput(startOptions(now).find(({ value }) => value > now).value)}" min="${otherRange(now).min}" max="${otherRange(now).max}"></label></fieldset>
    ${pack.roles.length > 1 ? `<fieldset class="start-group"><legend class="start-legend">Which role?</legend>${radios('role', pack.roles, role?.id)}</fieldset>`
    : `<input type="hidden" name="role" value="${esc(role?.id ?? '')}">`}
    <button type="submit" class="start-go">Start interview</button>
    ${slot('setup.join')}
    </div>
    <section class="start-plan" aria-labelledby="start-plan-title"><h2 id="start-plan-title" class="start-legend start-plan-title">Your plan</h2>
      <fieldset class="start-group start-rounds">${role ? rounds(pack, role) : ''}</fieldset>
      <div class="start-timeline">${round ? timeline(pack, role, round, defaults(round), lengthOf(role), now, now) : ''}</div>
      <p class="start-room" role="status"></p>
      <details class="start-longer">${role ? longer(role) : ''}</details></section>
  </form>
  <section class="start-check" aria-labelledby="start-check-title"><h2 id="start-check-title" class="start-subtitle">Before the interview</h2>
    <p class="start-saving" role="status">Checking that notes save…</p>${slot('setup.test')}</section>
  <div class="start-sessions"></div></main>`;
  },

  // Returns refresh(now), which brings the start choices up to the clock without touching what is typed or picked.
  bind(el, { pack, now, start, undo }) {
    const form = el.querySelector('.start-form');
    const other = el.querySelector('.start-other-input');
    const box = el.querySelector('.start-timeline');
    const room = el.querySelector('.start-room');
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
    let budget = lengthOf(role);
    const show = () => runOfShow(round, planOf(minutes));
    const titleOf = (seg) => show().all.find((s) => s.seg === seg).title;
    // Redrawn whole, so focus goes back to the control that was used, or to the one that took its place.
    const draw = (at = now(), focus) => {
      box.innerHTML = timeline(pack, role, round, minutes, budget, from(at), at);
      if (focus) (box.querySelector(focus) ?? box.querySelector('.start-add, .start-seg-remove'))?.focus();
    };
    // A new preset is shown as it was written; any edit after that makes the plan fit the length.
    const reset = () => {
      round = roundOf(pack, role, new FormData(form).get('round'));
      minutes = defaults(round);
      room.textContent = '';
      draw();
    };
    // Takes the plan only when it fits: an activity cannot go under the least it needs, so the plan says no instead.
    const tryFit = (next, length, why) => {
      const out = fitted(pack, runOfShow(round, planOf(next)), length);
      if (out.short) { room.textContent = `${why} ${out.short} min more than ${length} would be needed with everything else at its least. Remove an activity, or make the interview longer below.`; return false; }
      minutes = Object.fromEntries(Object.keys(minutes).map((seg) => [seg, out.minutes[seg]]));
      budget = length;
      room.textContent = '';
      return true;
    };
    other.addEventListener('input', () => check(now()));
    box.addEventListener('click', ({ target }) => {
      const { seg } = target.dataset;
      if (target.matches('.start-add') && tryFit({ ...minutes, [seg]: round.segments.find((s) => `${round.id}/${s.id}` === seg).full }, budget, `No room for ${titleOf(seg)}:`)) {
        draw(now(), `.start-seg-remove[data-seg="${CSS.escape(seg)}"]`);
      }
      if (target.matches('.start-seg-remove')) { tryFit({ ...minutes, [seg]: 0 }, budget, ''); draw(now(), `.start-add[data-seg="${CSS.escape(seg)}"]`); }
    });
    // A cut being dragged must stay the same element, or the pointer lets go: everything else on the bar is redrawn,
    // and each cut only takes its new place and values.
    box.addEventListener('input', ({ target }) => {
      if (!target.matches('.start-cut')) return;
      const cut = cutsOf(pack, show()).find((c) => c.left.seg === target.dataset.seg);
      const v = Math.min(Math.max(Number(target.value), cut.min), cut.max);
      minutes = { ...minutes, [cut.left.seg]: v, [cut.right.seg]: cut.left.minutes + cut.right.minutes - v };
      const fresh = el.ownerDocument.createElement('div');
      fresh.innerHTML = timeline(pack, role, round, minutes, budget, from(now()), now());
      box.querySelector('.start-segs').replaceWith(fresh.querySelector('.start-segs'));
      const cuts = [...fresh.querySelectorAll('.start-cut')];
      box.querySelectorAll('.start-cut').forEach((c, i) => {
        for (const k of ['max', 'aria-valuetext', 'style']) c.setAttribute(k, cuts[i].getAttribute(k));
        c.value = cuts[i].getAttribute('value');
      });
      for (const part of [...box.children].filter((c) => !c.matches('.start-track'))) part.remove();
      box.append(...[...fresh.children].filter((c) => !c.matches('.start-track')));
    });
    form.addEventListener('change', ({ target }) => {
      if (target.name === 'start') {
        other.parentElement.hidden = target.value !== 'other';
        other.disabled = target.value !== 'other';
      }
      if (target.name === 'length' && !tryFit(minutes, Number(target.value), 'This plan does not fit:')) form.elements.length.value = String(budget);
      if (target.name === 'round') reset();
      if (target.name === 'role') {
        role = pack.roles.find((r) => r.id === target.value);
        budget = lengthOf(role);
        el.querySelector('.start-rounds').innerHTML = rounds(pack, role);
        el.querySelector('.start-longer').innerHTML = longer(role);
        reset();
      }
      if (['start', 'other', 'length'].includes(target.name)) draw();
    });
    form.addEventListener('input', ({ target }) => { if (target === other) draw(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      start({ roleId: data.get('role'), roundId: data.get('round'), candidate: data.get('candidate').trim(), name: data.get('name')?.trim(),
        startedAt: from(now()), minutes: { ...minutes }, length: budget });
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
      if (!box.contains(el.ownerDocument.activeElement)) draw(at);
    };
  },
};
