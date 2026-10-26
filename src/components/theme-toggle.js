import { esc } from '../esc.js';
import { getPref, setPref } from '../prefs.js';
import './scheme-toggle.css';

// Default or the pack's own theme (pack.json "theme": { id, name }). Saved with the layout prefs and
// defaulting to the pack theme; index.html applies it before first paint from <html data-default-theme>.
export const getTheme = (packTheme) => getPref('theme', packTheme?.id ?? 'default');

export function applyTheme(packTheme) {
  const root = document.documentElement;
  if (packTheme && getTheme(packTheme) === packTheme.id) root.dataset.theme = packTheme.id;
  else delete root.dataset.theme;
}

export function setTheme(id, packTheme) {
  setPref('theme', id);
  applyTheme(packTheme);
}

export const themeToggle = (packTheme) => (packTheme ? `<span class="theme-toggle" role="group" aria-label="Theme">${
  [['default', 'Default'], [packTheme.id, packTheme.name]].map(([id, label]) =>
    `<button type="button" class="theme-toggle-option" data-theme-choice="${esc(id)}" aria-pressed="${id === getTheme(packTheme)}">${esc(label)}</button>`).join('')}</span>` : '');
