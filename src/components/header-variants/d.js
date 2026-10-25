import { esc } from '../../esc.js';
import { candidateField } from '../candidate-field.js';
import './d.css';

// Contextual: the bar shows only what the page needs now. A question (or a round part) shows the candidate,
// the clock and the plugin buttons such as Pop out. Deep dive shows the candidate, the round and New interview.
// What's new and Help show a Back link. Everything else sits in a More menu.
// The header is not redrawn on a route change, so bind follows ctx.onRoute and swaps the bar's contents in place.

const pageOf = (route) => {
  if (route === '#/deep-dive') return 'deep-dive';
  if (/^#\/(whats-new|help)(\/|$)/.test(route)) return 'reading';
  return 'live';
};

// Where Back goes from Help or What's new: the last page of the round before them, or Deep dive when the tab opened
// on one. A link, not history.back(), so a tab opened straight on Help can't step back out of the kit.
const backTo = (route, last = '#/deep-dive') => (pageOf(route) === 'reading' ? last : route || '#/');

// What the bar shows in place on each page. Anything not listed here goes in More.
const BAR = {
  live: ['candidate', 'clock', 'buttons'],
  'deep-dive': ['candidate', 'round', 'new'],
  reading: ['back'],
};

// Each item is built the same way wherever it sits, the bar or More.
const item = {
  candidate: (ctx, name) => `<span class="ctx-candidate">${candidateField(name)}</span>`,
  round: (ctx) => `<span class="ctx-round">${esc(ctx.round.name)} · ${ctx.round.minutes} min</span>`,
  // data-clock: the slot fills it every second, so an empty clock (before a start) just shows nothing.
  clock: (ctx) => `<span class="ctx-clock" role="timer" aria-label="Interview clock" data-clock>${esc(ctx.clock())}</span>`,
  buttons: (ctx) => ctx.buttons.map(({ label }, i) => `<button type="button" class="header-button ctx-action" data-button="${i}">${esc(label)}</button>`).join(''),
  new: () => '<button type="button" class="ctx-new ctx-action">New interview</button>',
  back: (ctx, name, back) => `<a class="ctx-back" href="${esc(back)}">Back</a>`,
};

// The same items, one per row, for the More menu. Items already in the bar are left out.
const menuRow = (label, body) => `<span class="ctx-more-row"><span class="ctx-more-label">${label}</span>${body}</span>`;

function moreMenu(ctx, name, shown) {
  const rows = [];
  if (!shown.has('candidate')) rows.push(menuRow('Candidate', candidateField(name)));
  if (!shown.has('round')) rows.push(`<span class="ctx-more-round">${esc(ctx.round.name)} · ${ctx.round.minutes} min</span>`);
  if (!shown.has('clock')) rows.push(menuRow('Clock', item.clock(ctx)));
  if (!shown.has('buttons') && ctx.buttons.length) rows.push(menuRow('Tools', item.buttons(ctx)));
  rows.push(menuRow('Color', ctx.schemeToggle));
  rows.push(menuRow('Pages', ctx.links));
  if (!shown.has('new')) rows.push(menuRow('Interview', item.new()));
  return rows.join('');
}

// The bar and its More menu for one page. `name` is the candidate so far, read from the page, not the stale ctx.
function body(ctx, name, page, back) {
  const shown = new Set(BAR[page]);
  const id = `ctx-more-${ctx.spot}`;
  // The dot carries the What's new class, so opening that page clears it here too.
  const unseen = ctx.links.includes('whats-new-dot') ? ' <span class="ctx-dot whats-new-dot" role="img" aria-label="New">●</span>' : '';
  return `<span class="ctx ctx-${page} ctx-more-${ctx.spot}" data-page="${page}">${BAR[page].map((part) => item[part](ctx, name, back)).join('')}<span class="ctx-more">
      <button type="button" class="ctx-more-button" commandfor="${id}" command="toggle-popover" aria-expanded="false" aria-controls="${id}">More${unseen}</button>
      <span id="${id}" class="ctx-more-panel" popover="auto">${moreMenu(ctx, name, shown)}</span>
    </span></span>`;
}

// The element the slot expects: the header on wide screens, the phone drawer's round region on phones.
const wrap = (ctx, inner) => (ctx.spot === 'header' ? `<header class="app-header">${inner}</header>` : `<div class="sidebar-round">${inner}</div>`);

export default {
  label: 'Contextual',
  render(ctx) {
    return wrap(ctx, body(ctx, ctx.candidate, pageOf(ctx.route), backTo(ctx.route)));
  },
  bind(el, ctx) {
    let back = backTo(ctx.route);
    let { links } = ctx;
    // Swaps the contents when the route moves to another kind of page; a move within one kind leaves the DOM alone.
    ctx.onRoute((route) => {
      back = backTo(route, back);
      const page = pageOf(route);
      if (el.querySelector('.ctx')?.dataset.page === page) return;
      const field = el.querySelector('.candidate-field');
      // Opening What's new removes every dot on the page; ctx.links still has its own, so drop it there too.
      if (!el.querySelector('.whats-new-dot')) links = links.replace(/ ?<span class="whats-new-dot"[^>]*>●<\/span>/, '');
      el.innerHTML = body({ ...ctx, links }, field?.value ?? ctx.candidate, page, back);
      wire(el, ctx);
    });
    wire(el, ctx);
  },
};

// Listeners for the bar's current children. Called again whenever the contents are rebuilt.
function wire(el, ctx) {
  const panel = el.querySelector('.ctx-more-panel');
  const trigger = el.querySelector('.ctx-more-button');
  // Plugin buttons, page links and New interview close the menu as they act; a click elsewhere closes it by itself.
  const close = () => panel?.hidePopover?.();
  for (const button of el.querySelectorAll('[data-button]')) {
    button.onclick = () => { close(); ctx.buttons[button.dataset.button].onClick(); };
  }
  el.querySelector('.ctx-new')?.addEventListener('click', () => { close(); ctx.newInterview(); });
  panel?.addEventListener('click', ({ target }) => {
    if (target.closest('a')) close();
  });
  // Focus goes back to More when Escape or a click outside closes the menu while focus was inside it.
  panel?.addEventListener('beforetoggle', ({ newState }) => {
    if (newState === 'closed' && panel.contains(el.ownerDocument.activeElement)) trigger.focus();
  });
  panel?.addEventListener('toggle', ({ newState }) => trigger.setAttribute('aria-expanded', String(newState === 'open')));
}
