import { getPref, setPref } from '../prefs.js';
import { monitor, moon, sun } from './icons.js';
import './scheme-toggle.css';

const SCHEMES = [['light', 'Light', sun], ['dark', 'Dark', moon], ['auto', 'Auto', monitor]];

// Saved with the layout prefs, so New interview never touches it. Auto follows the OS.
export const getScheme = () => getPref('scheme', 'auto');

// index.html applies a saved Light or Dark before first paint; this keeps it in sync afterwards.
export function applyScheme() {
  const scheme = getScheme();
  document.documentElement.style.colorScheme = scheme === 'auto' ? 'light dark' : scheme;
}

export function setScheme(scheme) {
  setPref('scheme', scheme);
  applyScheme();
}

// A click on any [data-<attr>] button under root picks its value and presses it alone; the scheme and theme toggles use it.
export function bindChoices(root, attr, onPick) {
  root.addEventListener('click', ({ target }) => {
    const value = target.closest(`[data-${attr}]`)?.getAttribute(`data-${attr}`);
    if (!value) return;
    onPick(value);
    for (const b of root.querySelectorAll(`[data-${attr}]`)) b.setAttribute('aria-pressed', String(b.getAttribute(`data-${attr}`) === value));
  });
}

export const schemeToggle = () => `<span class="scheme-toggle" role="group" aria-label="Color scheme">${SCHEMES.map(([id, label, icon]) =>
  `<button type="button" class="scheme-toggle-option" data-scheme="${id}" title="${label}" aria-label="${label}" aria-pressed="${id === getScheme()}">${icon}</button>`).join('')}</span>`;
