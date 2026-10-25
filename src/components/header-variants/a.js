import { esc } from '../../esc.js';
import { candidateField } from '../candidate-field.js';
import './a.css';

// Quiet bar: who and how long on one line, everything else behind one More menu. The menu is a popover that More
// opens with commandfor, so Escape and a click outside close it.

// "−4:12" counts down to the start; "12:40" or "1:02:05" counts up from it.
const seconds = (clock) => clock.replace('−', '').split(':').reduce((total, n) => total * 60 + Number(n), 0);

// The words beside the clock, and whether it has run past the round's length.
function clockWords(clock, minutes) {
  if (!clock) return { words: `${minutes} min`, over: false };
  if (clock.startsWith('−')) return { words: 'to start', over: false };
  return { words: `of ${minutes} min`, over: seconds(clock) > minutes * 60 };
}

const clockMarkup = (clock, minutes) => {
  const { words, over } = clockWords(clock, minutes);
  return `<span class="header-a-clock${over ? ' is-over' : ''}" role="timer"><span class="header-a-time" data-clock>${esc(clock)}</span>
    <span class="header-a-limit">${words}</span></span>`;
};

const render = ({ spot, round, candidate, clock, schemeToggle, links, buttons }) => {
  const id = `header-a-menu-${spot}`;
  // The dot carries the What's new class, so opening that page clears it here too.
  const news = links.includes('whats-new-dot')
    ? '<span class="whats-new-dot header-a-dot"><span aria-hidden="true">●</span><span class="header-a-sr"> (new)</span></span>' : '';
  const bar = `<div class="header-a header-a-${spot}">
    ${candidateField(candidate)}
    <span class="header-a-round">${esc(round.name)}</span>
    ${clockMarkup(clock(), round.minutes)}
    <button type="button" class="header-a-more" commandfor="${id}" command="toggle-popover" aria-expanded="false">More${news}
      <span class="header-a-caret" aria-hidden="true">▾</span></button>
    <div id="${id}" class="header-a-menu" popover="auto">
      <div class="header-a-scheme"><span class="header-a-scheme-label" aria-hidden="true">Colors</span>${schemeToggle}</div>
      ${links}
      ${buttons.map(({ label }) => `<button type="button" class="header-button header-a-item">${esc(label)}</button>`).join('')}
      <hr class="header-a-rule">
      <button type="button" class="header-a-item header-a-reset" aria-describedby="${id}-reset ${id}-undo">New interview</button>
      <p id="${id}-reset" class="header-a-note">Back to setup with this round picked. Clears the name, ticks and notes.</p>
      <p id="${id}-undo" class="header-a-note header-a-undo">You can undo it for 10 seconds.</p>
    </div>
  </div>`;
  return spot === 'header' ? `<header class="app-header">${bar}</header>` : `<div class="sidebar-round">${bar}</div>`;
};

function bind(el, ctx) {
  const more = el.querySelector('.header-a-more');
  const menu = el.querySelector('.header-a-menu');
  const close = () => menu.hidePopover();
  // Chromium doesn't expose a commandfor invoker's state, so More says it outright.
  menu.addEventListener('toggle', (e) => more.setAttribute('aria-expanded', String(e.newState === 'open')));
  // In the phone drawer and Pop out, Chromium leaves focus in the closed menu when Escape closes it; More takes it back.
  menu.addEventListener('beforetoggle', ({ newState }) => {
    if (newState === 'closed' && menu.contains(el.ownerDocument.activeElement)) more.focus();
  });
  for (const link of menu.querySelectorAll('a')) link.addEventListener('click', close);
  menu.querySelectorAll('.header-button').forEach((button, i) => { button.onclick = () => { close(); ctx.buttons[i].onClick(); }; });
  menu.querySelector('.header-a-reset').onclick = () => { close(); ctx.newInterview(); };
  // The slot rewrites [data-clock] every second; the words and the warning follow it.
  const clock = el.querySelector('.header-a-clock');
  const time = clock.querySelector('[data-clock]');
  const limit = clock.querySelector('.header-a-limit');
  new MutationObserver(() => {
    const { words, over } = clockWords(time.textContent, ctx.round.minutes);
    if (limit.textContent !== words) limit.textContent = words;
    clock.classList.toggle('is-over', over);
  }).observe(time, { childList: true, characterData: true, subtree: true });
}

export default { label: 'Quiet bar', render, bind };
