import { esc } from '../esc.js';
import './session-list.css';

const NOTE = {
  warn: ({ left }) => `Deleted from this laptop in ${left} day${left === 1 ? '' : 's'}`,
  undecided: () => 'No decision recorded. Kept until you delete it.',
};
const ACTIONS = { open: 'Open', keep: 'Keep', share: 'Share my evidence', remove: 'Delete from this laptop', confirm: 'Delete', cancel: 'Cancel' };
const button = (act) => `<button type="button" class="session-list-button" data-act="${act}">${ACTIONS[act]}</button>`;
const when = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const actions = (fate) => (fate.k === 'warn' ? ['open', 'keep', 'share', 'remove'] : ['open', 'remove']).map(button).join(' ');

const row = ({ sid, candidate, touched, fate }) => `<li class="session-list-item" data-sid="${esc(sid)}" data-fate="${fate.k}">
  <span class="session-list-name">${esc(candidate || 'No name yet')}</span>
  <time class="session-list-date" datetime="${new Date(touched).toISOString()}">${when.format(touched)}</time>
  ${NOTE[fate.k] ? `<span class="session-list-note">${NOTE[fate.k](fate)}</span>` : ''}
  <span class="session-list-actions">${actions(fate)}</span></li>`;

// Recent interviews for this pack, newest first, from store.sessions(), each dated by its last change. Empty when
// there are none.
export const sessionList = (rows) => (rows.length ? `<section class="session-list"><h2 class="session-list-title">Recent interviews</h2>
  <ul class="session-list-items">${rows.map(row).join('')}</ul></section>` : '');

// actions = { open(sid), keep(sid), share(sid), remove(sid) }. Delete asks once more in the row before it removes.
export function bindSessionList(root, on) {
  root.addEventListener('click', ({ target }) => {
    const act = target.closest('.session-list-button')?.dataset.act;
    if (!act) return;
    const item = target.closest('.session-list-item');
    const box = item.querySelector('.session-list-actions');
    if (act === 'remove') {
      const name = item.querySelector('.session-list-name').textContent;
      box.innerHTML = `<span class="session-list-confirm" role="alert">Delete ${esc(name)} from this laptop? Colleagues keep what they received.</span> ${button('confirm')} ${button('cancel')}`;
      box.querySelector('[data-act="cancel"]').focus();
    } else if (act === 'cancel') {
      box.innerHTML = actions({ k: item.dataset.fate });
      box.querySelector('[data-act="remove"]').focus();
    } else on[act === 'confirm' ? 'remove' : act](item.dataset.sid);
  });
}
