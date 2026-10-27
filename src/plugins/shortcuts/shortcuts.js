// Keyboard shortcuts plugin. Leave it out with --without shortcuts.
import './shortcuts.css';

const KEYS = [['j  →', 'Next question'], ['k  ←', 'Previous question'], ['1  2  3', 'Tick a Look for item'],
  ['n', 'Go to Notes'], ['d', 'Mark done'], ['Esc', 'Leave Notes'], ['?', 'Show these keys']];

// Text fields keep their keys; checkboxes and buttons don't, so ticking with the mouse never traps focus.
const typing = (t) => t?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t?.tagName)
  || (t?.tagName === 'INPUT' && !['checkbox', 'button'].includes(t.type));

export function handleKey(e, api, showKeys = () => {}) {
  // A widget that already handled the key (arrow walking in a list, a dialog) keeps it.
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing(e.target)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (!api.route().startsWith('#/q/')) return;
  const action = {
    j: api.next, ArrowRight: api.next, k: api.prev, ArrowLeft: api.prev,
    1: () => api.toggleTick(0), 2: () => api.toggleTick(1), 3: () => api.toggleTick(2),
    n: api.focusNotes, d: api.toggleDone, '?': showKeys,
  }[e.key];
  if (!action) return;
  e.preventDefault();
  action();
}

export default function shortcuts(api) {
  document.body.insertAdjacentHTML('beforeend', `<div id="shortcuts-help" class="shortcuts-help" popover="auto">
    <h2 class="shortcuts-title">Keyboard shortcuts</h2><dl class="shortcuts-list">${KEYS.map(([key, what]) =>
      `<dt class="shortcuts-key">${key}</dt><dd class="shortcuts-what">${what}</dd>`).join('')}</dl></div>`);
  const help = document.getElementById('shortcuts-help');
  // The app can move to another document (Pop out); the help goes along when shown, and each document the app
  // lands in gets the listener (adding the same listener twice to one document is a no-op).
  const onKey = (e) => handleKey(e, api, () => { api.doc().body.append(help); help.togglePopover(); });
  const listen = () => api.doc().addEventListener('keydown', onKey);
  listen();
  api.onUpdate(listen);
}
