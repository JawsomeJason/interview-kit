import { md } from '../markdown.js';
import { esc } from '../esc.js';
import { helpHint } from './help.js';
import { optionRow } from './option-row.js';
import './look-for.css';

// No score word here: seeing it while ticking could bias the interviewer. The Deep dive list shows it afterwards.
export const lookFor = (q, ticked = []) => `<section class="look-for" data-q="${esc(q.id)}"><h2 class="panel-title">Look for${helpHint('no-score')}</h2>
  ${q.lookFor.map((text, i) => optionRow({ type: 'checkbox', value: i, checked: ticked.includes(i) },
    md.parseInline(text), 'look-for-item')).join('')}</section>`;

// A tiny pop and buzz when an item is ticked. Every item gets the same one, so it says nothing about the score.
export function tickFeedback(box, nav = globalThis.navigator) {
  if (!box.checked) return;
  const row = box.closest('.look-for-item');
  row.classList.remove('look-for-pop');
  void row.offsetWidth;
  row.classList.add('look-for-pop');
  nav?.vibrate?.(10);
}

export function bindLookFor(el, onChange) {
  el.addEventListener('animationend', ({ target }) => target.closest('.look-for-item')?.classList.remove('look-for-pop'));
  el.addEventListener('input', ({ target }) => {
    tickFeedback(target);
    onChange([...el.querySelectorAll('input:checked')].map((box) => Number(box.value)));
  });
}
