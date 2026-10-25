import { md } from '../markdown.js';
import { esc } from '../esc.js';
import { helpHint } from './help.js';
import { lookFor } from './look-for.js';
import { questionNotes } from './question-notes.js';
import { questionLink, questionMeta } from './question-parts.js';
import { reviewAlert } from './review-mark.js';
import './question-page.css';

// Fixed labels and a placeholder at the list ends, so the pager never changes width.
const step = (q, label) => (q ? questionLink(q, label, q.title) : `<span class="pager-off">${label}</span>`);

const followUpList = (q) => `<section class="follow-ups"><h2 class="panel-title">Follow-ups</h2>
  <ul class="follow-ups-list">${q.followUps.map((text) => `<li>${md.parseInline(text)}</li>`).join('')}</ul></section>`;

const TABS = { question: 'Question', assess: 'Assess' };
// Desktop shows both panels; the phone CSS hides the one marked inactive.
const inactive = (panel, tab) => (panel === tab ? '' : ' data-inactive');

export function questionPage(q, list, ticked = [], notes = '', isDone = false, tab = 'question', marks = []) {
  const i = list.indexOf(q);
  return `<div class="pager">${step(list[i - 1], '← <span class="pager-word">Previous</span>')}<span class="pager-meta">${questionMeta(q)}</span>${step(list[i + 1], '<span class="pager-word">Next</span> →')}</div>
    <article class="question-body"${inactive('question', tab)}><div class="question-text">${reviewAlert(q)}<h1>${esc(q.title)}</h1><div class="question-ask">${md.parse(q.body)}</div></div></article>
    <aside class="question-side"${inactive('assess', tab)}>${questionNotes(notes, isDone)}${lookFor(q, ticked, marks)}${followUpList(q)}</aside>
    <div class="phone-tabs">${Object.entries(TABS).map(([id, label]) =>
      `<button type="button" class="phone-tabs-tab" data-tab="${id}" aria-pressed="${id === tab}">${label}</button>`).join('')}</div>`;
}

// Switches panels in place, so the tab keeps focus.
export function bindPhoneTabs(el, onChange) {
  el.querySelector('.phone-tabs').addEventListener('click', ({ target }) => {
    const tab = target.dataset.tab;
    if (!tab) return;
    el.querySelector('.question-body').toggleAttribute('data-inactive', tab !== 'question');
    el.querySelector('.question-side').toggleAttribute('data-inactive', tab !== 'assess');
    for (const b of el.querySelectorAll('.phone-tabs-tab')) b.setAttribute('aria-pressed', String(b === target));
    onChange(tab);
  });
}

// Shown when an opened card covers the same ground as one already in the picked list.
export const overlapNote = (clashes) => (clashes.length
  ? `<p class="overlap-note">Overlaps with ${clashes.map((p) => questionLink(p)).join(', ')}${helpHint('overlaps')}</p>` : '');

// Which way a navigation to `hash` steps through the pager, given its Previous and Next hrefs (null at a list end).
export const pagerStep = (prev, next, hash) => (hash === next ? 'forward' : hash === prev ? 'back' : null);
