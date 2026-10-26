import { esc } from '../esc.js';
import { candidateField } from './candidate-field.js';
import './header.css';

// Interview cockpit: time is the hero. A big clock, a bar that fills across the round with the deep dive
// marked on it, and a cue for what comes next. Candidate and round sit beside it. The tools fold into one
// menu in the header bar and list flat in the phone drawer.

// "12:40" → 760, "1:02:05" → 3725, "−4:12" → -252; anything else, including '' before a start, is null.
export function clockSeconds(text) {
  const m = /^([−-])?(\d+):(\d{2})(?::(\d{2}))?$/.exec(text ?? '');
  if (!m) return null;
  const [, sign, a, b, c] = m;
  const s = c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c);
  return sign ? -s : s;
}

const minutesLeft = (s) => Math.ceil(s / 60);
const SOON = 2 * 60;

// Where the round stands at a given second, read from the run of show (ctx.plan()) that the sidebar shows: the
// round part first, then the deep dive, then the outro, then over. A deep dive of 0 minutes is no deep dive.
const span = (plan) => ({ deep: plan.find((p) => p.id === 'deep-dive' && p.minutes > 0), minutes: plan.at(-1).start + plan.at(-1).minutes });

export function phase(plan, seconds) {
  const { deep, minutes } = span(plan);
  const outro = plan.find((p) => p.id === 'outro');
  const total = minutes * 60;
  const deepAt = deep ? deep.start * 60 : null;
  const outroAt = outro.start * 60;
  if (seconds === null) return { mode: 'idle', label: 'Elapsed', cue: 'Not started', used: 0 };
  if (seconds < 0) return { mode: 'before', label: 'Starts in', cue: `${minutes} min round${deep ? ` · deep dive at ${deep.start} min` : ''}`, used: 0 };
  const used = Math.min(1, seconds / total);
  if (deep && seconds < deepAt) {
    const left = deepAt - seconds;
    return { mode: 'round', label: 'Elapsed', cue: `Deep dive at ${deep.start} min · in ${minutesLeft(left)} min`, used, soon: left <= SOON };
  }
  if (!deep && seconds < outroAt) {
    const left = total - seconds;
    return { mode: 'round', label: 'Elapsed', cue: `${minutesLeft(left)} min left`, used, soon: left <= SOON };
  }
  if (deep && seconds < outroAt) {
    const left = outroAt - seconds;
    return { mode: 'deep', label: 'Elapsed', cue: `Deep dive · ${minutesLeft(left)} min left`, used, soon: left <= SOON };
  }
  if (seconds < total) {
    const left = total - seconds;
    return { mode: 'outro', label: 'Elapsed', cue: `${outro.name} · ${minutesLeft(left)} min left`, used, soon: left <= SOON };
  }
  const over = seconds - total;
  return { mode: 'over', label: 'Elapsed', cue: over < 60 ? 'Time is up' : `Over by ${Math.floor(over / 60)} min`, used: 1 };
}

// What a phase change says to a screen reader; the clock itself stays quiet.
const announcements = { round: 'Started', deep: 'Deep dive now', outro: 'Outro now', over: 'Time is up' };

const pct = (n) => `${Math.round(n * 100)}%`;

function reading({ clock, plan }) {
  const text = clock();
  const seconds = clockSeconds(text);
  const steps = plan();
  const p = phase(steps, seconds);
  const { deep, minutes } = span(steps);
  const usedMin = seconds === null || seconds < 0 ? 0 : Math.min(minutes, Math.floor(seconds / 60));
  return { ...p, minutes, value: seconds === null ? '0:00' : text.replace(/^[−-]/, ''), usedMin, usedPct: pct(p.used),
    deepPct: pct(deep ? deep.start / minutes : 1) };
}

const barAttrs = (r) => `aria-valuemin="0" aria-valuemax="${r.minutes}" aria-valuenow="${r.usedMin}" aria-valuetext="${r.usedMin} of ${r.minutes} min" style="--cockpit-used: ${r.usedPct}; --cockpit-deep: ${r.deepPct}"`;

const time = (r) => `<div class="cockpit-time" data-mode="${r.mode}">
  <p class="cockpit-clock"><span class="cockpit-clock-label">${r.label}</span> <span class="cockpit-clock-value">${r.value}</span></p>
  <p class="cockpit-cue${r.soon ? ' is-soon' : ''}">${r.cue}</p>
  <div class="cockpit-bar" role="progressbar" aria-label="Time used" ${barAttrs(r)}><span class="cockpit-bar-deep"></span><span class="cockpit-bar-fill"></span></div>
  <p class="cockpit-announce visually-hidden" aria-live="polite"></p>
  <span class="cockpit-tick" data-clock hidden></span>
</div>`;

const who = ({ round, candidate }) => `<div class="cockpit-who">${candidateField(candidate)}<p class="cockpit-round">${esc(round.name)} · ${round.minutes} min</p></div>`;

// Pop out's window hides .header-button, so the plugin buttons keep that class. New interview goes last,
// behind a rule, so it is found on purpose and not hit on the way to Help.
const tools = ({ links, buttons, schemeToggle, themeToggle }) => `${links}${buttons.map(({ label }) => `<button type="button" class="header-button cockpit-tool">${esc(label)}</button>`).join('')}
  <div class="cockpit-scheme">${schemeToggle}${themeToggle}</div>
  <button type="button" class="cockpit-new">New interview</button>`;

function render(ctx) {
  const r = reading(ctx);
  // The layout CSS shows and hides .sidebar-round itself, so the cockpit sits one level in.
  if (ctx.spot === 'drawer') return `<div class="sidebar-round"><div class="cockpit cockpit-drawer">${time(r)}${who(ctx)}<div class="cockpit-tools">${tools(ctx)}</div></div></div>`;
  const unseen = ctx.links.includes('whats-new-dot');
  return `<header class="app-header"><div class="cockpit">${time(r)}${who(ctx)}
  <details class="cockpit-menu"><summary class="cockpit-menu-button">Menu${unseen ? ' <span class="cockpit-dot whats-new-dot" role="img" aria-label="New">●</span>' : ''}</summary>
    <div class="cockpit-menu-panel">${tools(ctx)}</div></details></div></header>`;
}

// Patches the live numbers in place, so the name field and the menu keep their state between ticks.
function update(el, ctx) {
  const r = reading(ctx);
  const timeEl = el.querySelector('.cockpit-time');
  const was = timeEl.dataset.mode;
  timeEl.dataset.mode = r.mode;
  timeEl.querySelector('.cockpit-clock-label').textContent = r.label;
  timeEl.querySelector('.cockpit-clock-value').textContent = r.value;
  const cue = timeEl.querySelector('.cockpit-cue');
  cue.textContent = r.cue;
  cue.classList.toggle('is-soon', Boolean(r.soon));
  const bar = timeEl.querySelector('.cockpit-bar');
  bar.setAttribute('aria-valuemax', r.minutes);
  bar.setAttribute('aria-valuenow', r.usedMin);
  bar.setAttribute('aria-valuetext', `${r.usedMin} of ${r.minutes} min`);
  bar.style.setProperty('--cockpit-used', r.usedPct);
  bar.style.setProperty('--cockpit-deep', r.deepPct);
  if (was !== r.mode && announcements[r.mode]) timeEl.querySelector('.cockpit-announce').textContent = announcements[r.mode];
}


function bindMenu(el) {
  const menu = el.querySelector('.cockpit-menu');
  if (!menu) return;
  const doc = el.ownerDocument;
  const close = () => { menu.open = false; };
  const outside = ({ target }) => { if (!menu.contains(target)) close(); };
  menu.addEventListener('toggle', () => (menu.open ? doc.addEventListener('pointerdown', outside) : doc.removeEventListener('pointerdown', outside)));
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !menu.open) return;
    close();
    menu.querySelector('.cockpit-menu-button').focus();
  });
  menu.addEventListener('click', ({ target }) => { if (target.closest('a, .cockpit-tool, .cockpit-new')) close(); });
}

export default {
  render,
  bind(el, ctx) {
    // The slot rewrites [data-clock] every second on the timer of the window the app is in, Pop out's included,
    // so the clock follows that rather than a timer of the tab, which is throttled while hidden.
    new MutationObserver(() => update(el, ctx)).observe(el.querySelector('.cockpit-tick'), { childList: true, characterData: true, subtree: true });
    el.querySelector('.cockpit-new').onclick = ctx.newInterview;
    el.querySelectorAll('.cockpit-tool').forEach((button, i) => { button.onclick = ctx.buttons[i].onClick; });
    bindMenu(el);
  },
};
