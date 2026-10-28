import { getPref, setPref } from '../prefs.js';
import { monitor, moon, sun } from './icons.js';
import './scheme-toggle.css';

const SCHEMES = [['light', 'Light', sun], ['dark', 'Dark', moon], ['auto', 'Auto', monitor]];

// Saved with the UI prefs, so New interview never touches it. Auto follows the OS.
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

export const schemeToggle = () => `<span class="scheme-toggle" role="group" aria-label="Color scheme">${SCHEMES.map(([id, label, icon]) =>
  `<button type="button" class="scheme-toggle-option" data-scheme="${id}" title="${label}" aria-label="${label}" aria-pressed="${id === getScheme()}">${icon}</button>`).join('')}</span>`;

// A click on one of the toggle's buttons picks it and presses it alone.
export function bindSchemeToggle(root) {
  root.addEventListener('click', ({ target }) => {
    const scheme = target.closest('[data-scheme]')?.dataset.scheme;
    if (!scheme) return;
    setScheme(scheme);
    for (const b of root.querySelectorAll('[data-scheme]')) b.setAttribute('aria-pressed', String(b.dataset.scheme === scheme));
  });
}
