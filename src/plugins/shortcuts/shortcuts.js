// Keyboard shortcuts plugin: j and k step through the run of show, and ? lists every key, the Assess panel's
// included. Leave it out with --without shortcuts.
import './shortcuts.css';
import { ASSESS_KEYS } from '../../ui/assess.js';

const KEYS = [['j', 'Next'], ['k', 'Previous'], ...ASSESS_KEYS, ['?', 'Show these keys']];

// Text fields keep their keys; checkboxes and buttons don't, so marking with the mouse never traps focus.
const typing = (t) => t?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t?.tagName)
  || (t?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range'].includes(t.type));

export function handleKey(e, api, showKeys = () => {}) {
  // A widget that already handled the key (arrow walking in a list, a dialog) keeps it.
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || !api.session().round) return;
  const action = { j: api.next, k: api.prev, '?': showKeys }[e.key];
  if (!action) return;
  e.preventDefault();
  action();
}

export default function shortcuts(api) {
  const help = api.doc().createElement('div');
  help.className = 'shortcuts-help';
  help.popover = 'auto';
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-label', 'Keyboard shortcuts');
  help.innerHTML = `<h2 class="shortcuts-title">Keyboard shortcuts</h2><dl class="shortcuts-list">${KEYS.map(([key, what]) =>
    `<dt class="shortcuts-key">${key}</dt><dd class="shortcuts-what">${what}</dd>`).join('')}</dl>`;
  api.doc().body.append(help);
  // The app can move to another document (Pop out); the help goes along when shown, and each document the app
  // lands in gets the listener (adding the same listener twice to one document is a no-op).
  const onKey = (e) => handleKey(e, api, () => { api.doc().body.append(help); help.togglePopover(); });
  const listen = () => api.doc().addEventListener('keydown', onKey);
  listen();
  api.onUpdate(listen);
}
