import { esc } from '../esc.js';
import './question-search.css';

// All questions: a modal with a search box over every pool's questions. The box is a combobox over a listbox, so focus
// stays in it while Up and Down move the active option and Enter opens it. Rendered once per session page;
// open() fills it with the questions as they stand.
const ID = 'question-search';

export const questionSearch = () => `<dialog id="${ID}" class="question-search" aria-labelledby="${ID}-title" closedby="any">
  <div class="question-search-head"><h2 id="${ID}-title" class="question-search-title">All questions</h2>
    <button type="button" class="question-search-close">Close</button></div>
  <input type="search" class="question-search-box" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="${ID}-list"
    aria-label="Search questions by title or pool" placeholder="Search by title or pool" autocomplete="off" spellcheck="false">
  <p class="question-search-count" role="status"></p>
  <div id="${ID}-list" class="question-search-list" role="listbox" aria-label="Questions"></div>
  <p class="question-search-keys" aria-hidden="true"><span class="question-search-key">↑</span> <span class="question-search-key">↓</span> to move ·
    <span class="question-search-key">Enter</span> to open · <span class="question-search-key">Esc</span> to close</p>
</dialog>`;

// `text`, escaped, with every stretch that matches one of the lowercase `terms` in a <mark>.
function marked(text, terms) {
  const lower = text.toLowerCase();
  const hit = Array(text.length).fill(false);
  for (const term of terms) for (let i = lower.indexOf(term); i !== -1; i = lower.indexOf(term, i + 1)) hit.fill(true, i, i + term.length);
  let html = '';
  for (let i = 0; i < text.length; i += 1) html += `${hit[i] && !hit[i - 1] ? '<mark class="question-search-hit">' : ''}${esc(text[i])}${hit[i] && !hit[i + 1] ? '</mark>' : ''}`;
  return html;
}

const option = (q) => `<div role="option" id="${ID}-${esc(q.id)}" class="question-search-option" data-href="${esc(q.href)}" aria-selected="false">
  <span class="question-search-name" data-text="${esc(q.title)}">${esc(q.title)}</span>
  <span class="question-search-tag">${[`${q.minutes} min`, q.inPlan && 'in plan', q.done && 'done'].filter(Boolean).join(' · ')}</span></div>`;

// groups: [{ id, name, options: [{ id, title, minutes, href, inPlan, done }] }], one per pool.
const group = ({ id, name, options }) => `<div role="group" class="question-search-group" aria-labelledby="${ID}-pool-${esc(id)}">
  <div id="${ID}-pool-${esc(id)}" class="question-search-pool" data-text="${esc(name)}">${esc(name)}</div>${options.map(option).join('')}</div>`;

export function bindQuestionSearch(dialog) {
  const doc = dialog.ownerDocument;
  const box = dialog.querySelector('.question-search-box');
  const list = dialog.querySelector('.question-search-list');
  const count = dialog.querySelector('.question-search-count');
  let route = '';
  let opener = null;
  const shown = () => [...list.querySelectorAll('.question-search-option:not([hidden])')];
  const activate = (next) => {
    for (const o of list.querySelectorAll('[aria-selected="true"]')) o.setAttribute('aria-selected', 'false');
    if (!next) return box.removeAttribute('aria-activedescendant');
    next.setAttribute('aria-selected', 'true');
    box.setAttribute('aria-activedescendant', next.id);
    next.scrollIntoView?.({ block: 'nearest' });
  };
  // Every term must match the title or the pool name.
  const filter = () => {
    const terms = box.value.toLowerCase().split(/\s+/).filter(Boolean);
    let total = 0;
    for (const g of list.querySelectorAll('.question-search-group')) {
      const pool = g.querySelector('.question-search-pool');
      let any = false;
      for (const o of g.querySelectorAll('.question-search-option')) {
        const name = o.querySelector('.question-search-name');
        const text = `${name.dataset.text} ${pool.dataset.text}`.toLowerCase();
        o.hidden = !terms.every((t) => text.includes(t));
        name.innerHTML = marked(name.dataset.text, terms);
        any ||= !o.hidden;
        total += !o.hidden;
      }
      g.hidden = !any;
      pool.innerHTML = marked(pool.dataset.text, terms);
    }
    count.textContent = total ? `${total} question${total === 1 ? '' : 's'}` : 'No questions match';
    activate(shown()[0]);
  };
  const giveBack = () => { if (opener?.isConnected) opener.focus(); };
  // The page already showing changes no hash, so picking it only closes. Any other one moves the app there, and the app
  // puts focus on the new page.
  const choose = (o) => {
    const href = o.dataset.href;
    if (href !== route) opener = null;
    dialog.close();
    giveBack();
    if (href !== route) location.hash = href;
  };

  for (const type of ['input', 'search']) box.addEventListener(type, filter);
  box.addEventListener('keydown', (e) => {
    const options = shown();
    const at = options.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!options.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activate(options[at === -1 ? (step > 0 ? 0 : options.length - 1) : (at + step + options.length) % options.length]);
    } else if (e.key === 'Enter') {
      // Spent even with no match, so it can't fall through to the button behind the dialog.
      e.preventDefault();
      if (options[at]) choose(options[at]);
    } else if (e.key === 'Escape' && box.value) {
      // The first Escape clears the search, the next closes the dialog.
      e.preventDefault();
      box.value = '';
      filter();
    }
  });
  list.addEventListener('click', ({ target }) => {
    const o = target.closest('.question-search-option');
    if (o) choose(o);
  });
  list.addEventListener('pointermove', ({ target }) => {
    const o = target.closest('.question-search-option');
    if (o && o.getAttribute('aria-selected') !== 'true') activate(o);
  });
  // Tab and Shift+Tab cycle through the dialog's own controls instead of leaving for the browser's.
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll('button, input')];
    const edge = e.shiftKey ? stops[0] : stops.at(-1);
    if (doc.activeElement !== edge) return;
    e.preventDefault();
    (e.shiftKey ? stops.at(-1) : stops[0]).focus();
  });
  dialog.querySelector('.question-search-close').addEventListener('click', () => { dialog.close(); giveBack(); });
  // Escape and a click on the backdrop close it natively.
  dialog.addEventListener('close', giveBack);

  return {
    open({ groups, route: now }, by) {
      route = now;
      opener = by;
      list.innerHTML = groups.map(group).join('');
      box.value = '';
      filter();
      if (!dialog.open) dialog.showModal();
      box.focus();
    },
  };
}
