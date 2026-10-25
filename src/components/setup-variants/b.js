import { esc } from '../../esc.js';
import { fromLocalInput } from '../../start-time.js';
import { candidateField } from '../candidate-field.js';
import { otherLimits, refreshStart, startProblem, startSelectOptions } from './start-field.js';
import './b.css';

const STEPS = 3;
// The page re-renders now and then (a layout switch, New candidate), so the step and the start choice outlive the markup.
const memo = { step: 0, start: '', other: '' };

// The recap's start: the picked slot as the select shows it (Now when it's gone), or the Other date.
const startText = (options, { start, other }) => (start === 'other' ? (other ? new Date(other).toLocaleString() : 'Other time')
  : (options.find(({ value }) => String(value ?? '') === start) ?? options[0]).label);

const recapItems = (step, name, startText) => [name.trim(), startText].slice(0, step)
  .map((text, i) => `<li><button type="button" class="setup-b-edit" data-step="${i}">${esc(text)}<span class="setup-b-edit-hint"> Change</span></button></li>`).join('');

// One question per screen: the name, the start time, then the round, whose buttons start the interview.
export default {
  label: 'One step at a time',
  render: ({ rounds, round, candidate, startOptions }) => {
    if (!candidate.trim()) memo.step = 0;
    return `<main class="main setup-b"><h1 class="setup-b-flush">New interview</h1>
  <p class="setup-b-flush setup-b-progress"><span class="setup-b-count" aria-live="polite">Step ${memo.step + 1} of ${STEPS}</span>
    <progress class="setup-b-bar" max="${STEPS}" value="${memo.step + 1}" aria-hidden="true"></progress></p>
  <ul class="setup-b-flush setup-b-recap" aria-label="Your answers">${recapItems(memo.step, candidate, startText(startOptions, memo))}</ul>
  <section class="setup-b-step" data-step="0"${memo.step === 0 ? '' : ' hidden'}><h2 class="setup-b-flush">Who are you interviewing?</h2>
    <label class="candidate-label">Candidate name ${candidateField(candidate)}</label></section>
  <section class="setup-b-step" data-step="1"${memo.step === 1 ? '' : ' hidden'}><h2 class="setup-b-flush">When does it start?</h2>
    <p class="setup-b-flush"><label class="setup-b-label">Start time <select class="setup-start-select">${startSelectOptions(startOptions, memo.start)}</select></label></p>
    <p class="setup-b-flush"><input type="datetime-local" class="setup-start-other" aria-label="Start date and time" value="${esc(memo.other)}"${otherLimits()}${memo.start === 'other' ? '' : ' hidden'}></p></section>
  <section class="setup-b-step" data-step="2"${memo.step === 2 ? '' : ' hidden'}><h2 class="setup-b-flush">Which round?</h2>
    ${rounds.map((r) => `<p class="setup-b-flush"><button data-round="${esc(r.id)}" class="setup-b-round${r.id === round ? ' is-last' : ''}"${candidate.trim() ? '' : ' disabled'}><b>${esc(r.name)}</b>${r.id === round ? '<span class="setup-b-last">Last time</span>' : ''}
      <span class="setup-b-round-note">${r.minutes} min round, ${r.deepDiveMinutes} min deep dive. Starts the interview.</span></button></p>`).join('')}</section>
  <p class="setup-b-flush setup-b-nav"><button type="button" class="setup-b-btn setup-b-back"${memo.step ? '' : ' hidden'}>Back</button>
    <button type="button" class="setup-b-btn setup-b-next" aria-describedby="setup-b-hint"${memo.step < STEPS - 1 ? '' : ' hidden'}>Next</button></p>
  <p class="setup-b-flush setup-b-hint" id="setup-b-hint"></p></main>`;
  },
  bind(el, ctx) {
    let options = ctx.startOptions;
    const $ = (sel) => el.querySelector(sel);
    const field = $('.candidate-field');
    const select = $('.setup-start-select');
    const other = $('.setup-start-other');
    const rounds = [...el.querySelectorAll('[data-round]')];
    const startedAt = () => (select.value === 'other' ? fromLocalInput(other.value) : select.value ? Number(select.value) : undefined);
    // Each step checks what it and the steps before it asked for: the name, then the start.
    const problem = () => startProblem(field.value, memo.step && select.value === 'other' ? other.value : undefined);
    const ready = () => memo.step < STEPS - 1 && !problem();

    const show = (step, focus) => {
      memo.step = step;
      for (const s of el.querySelectorAll('.setup-b-step')) s.hidden = Number(s.dataset.step) !== step;
      $('.setup-b-count').textContent = `Step ${step + 1} of ${STEPS}`;
      $('.setup-b-bar').value = step + 1;
      $('.setup-b-recap').innerHTML = recapItems(step, field.value, startText(options, memo));
      $('.setup-b-back').hidden = step === 0;
      $('.setup-b-next').hidden = step === STEPS - 1;
      sync();
      if (focus) [field, select, rounds.find((b) => b.classList.contains('is-last')) ?? rounds[0]][step]?.focus();
    };
    const next = () => { if (ready()) show(memo.step + 1, true); };

    function sync() {
      const hint = $('.setup-b-hint');
      hint.textContent = problem() || (memo.step < STEPS - 1 ? 'Press Enter to go on.' : '');
      hint.hidden = !hint.textContent;
      for (const b of rounds) b.disabled = !!problem();
      $('.setup-b-next').disabled = !ready();
    }
    field.addEventListener('input', sync);
    select.onchange = () => { memo.start = select.value; other.hidden = select.value !== 'other'; sync(); if (!other.hidden) other.focus(); };
    other.oninput = () => { memo.other = other.value; sync(); };
    $('.setup-b-next').onclick = next;
    $('.setup-b-back').onclick = () => show(memo.step - 1, true);
    $('.setup-b-recap').onclick = ({ target }) => { const b = target.closest('[data-step]'); if (b) show(Number(b.dataset.step), true); };
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.closest('button') || e.target.matches('textarea')) return;
      e.preventDefault();
      next();
    });
    for (const b of rounds) {
      b.onclick = () => {
        const candidate = field.value.trim();
        if (problem()) return;
        const at = startedAt();
        Object.assign(memo, { step: 0, start: '', other: '' });
        ctx.start({ roundId: b.dataset.round, candidate, startedAt: at });
      };
    }
    sync();
    return (now) => {
      options = refreshStart(select, other, now);
      show(memo.step);
    };
  },
};
