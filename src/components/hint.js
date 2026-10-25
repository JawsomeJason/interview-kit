import { esc } from '../esc.js';
import './hint.css';

// Interest invokers open on hover and focus (Chromium only). A tap shows no interest, so a show command opens the same
// popover and keeps it open; show rather than toggle, so a click after hovering doesn't close it. Elsewhere a click toggles it.
export const invoker = (id) => (globalThis.HTMLButtonElement && Object.hasOwn(HTMLButtonElement.prototype, 'interestForElement')
  ? `interestfor="${esc(id)}" commandfor="${esc(id)}" command="show-popover"` : `commandfor="${esc(id)}" command="toggle-popover"`);

export function hint(id, label, text) {
  return `<button type="button" class="hint" aria-describedby="${esc(id)}" ${invoker(id)}>${esc(label)}</button><span id="${esc(id)}" class="hint-popover" popover="hint">${esc(text)}</span>`;
}
