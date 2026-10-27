import { esc } from '../esc.js';
import './session-list.css';

const NOTE = {
  warn: ({ left }) => `Deleted from this laptop in ${left} day${left === 1 ? '' : 's'}`,
  undecided: () => 'No decision recorded. Kept until you delete it.',
};
const ACTIONS = { open: 'Open', keep: 'Keep', share: 'Share my evidence', remove: 'Delete from this laptop' };
const button = (act) => `<button type="button" class="session-list-button" data-act="${act}">${ACTIONS[act]}</button>`;

const row = ({ sid, candidate, fate }) => `<li class="session-list-item" data-sid="${esc(sid)}">
  <span class="session-list-name">${esc(candidate || 'No name yet')}</span>
  ${NOTE[fate.k] ? `<span class="session-list-note">${NOTE[fate.k](fate)}</span>` : ''}
  <span class="session-list-actions">${(fate.k === 'warn' ? ['open', 'keep', 'share', 'remove'] : ['open', 'remove']).map(button).join(' ')}</span></li>`;

// Recent interviews for this pack, newest first, from store.sessions(). Empty when there are none.
export const sessionList = (rows) => (rows.length ? `<section class="session-list"><h2 class="session-list-title">Recent interviews</h2>
  <ul class="session-list-items">${rows.map(row).join('')}</ul></section>` : '');

// actions = { open(sid), keep(sid), share(sid), remove(sid) }
export function bindSessionList(root, actions) {
  root.addEventListener('click', ({ target }) => {
    const act = target.closest('.session-list-button')?.dataset.act;
    if (act) actions[act](target.closest('.session-list-item').dataset.sid);
  });
}
