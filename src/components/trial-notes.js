// A feedback note per trial variant ("Question layout B", "Sidebar C", "Theme Default"), keyed by that name and saved with the
// layout prefs, so New interview keeps them. Copy summary lists the ones with text.
import { esc } from '../esc.js';
import { getPref, setPref } from './layout-switcher.js';

const ORDER = ['Question layout', 'Header', 'Sidebar', 'Setup page', 'Theme'];
const notes = () => getPref('notes', {});

// One always-visible box per Try layouts group; `group` is the pref it follows and `variant` the name picked now.
export const noteField = (group, variant) => `<label class="trial-note"><span>Notes on <span class="trial-note-variant">${esc(variant)}</span></span>
  <textarea class="trial-note-text" rows="2" data-group="${esc(group)}" data-variant="${esc(variant)}">${esc(notes()[variant] ?? '')}</textarea></label>`;

// Moves a group's box to the variant now picked, with that variant's note.
export function showNote(panel, group, variant) {
  const field = panel.querySelector(`.trial-note-text[data-group="${group}"]`);
  if (!field) return;
  field.dataset.variant = variant;
  field.value = notes()[variant] ?? '';
  field.closest('.trial-note').querySelector('.trial-note-variant').textContent = variant;
}

export function bindNotes(panel) {
  panel.addEventListener('input', ({ target }) => {
    if (target.classList.contains('trial-note-text')) setPref('notes', { ...notes(), [target.dataset.variant]: target.value });
  });
}

const rank = (variant) => ORDER.findIndex((group) => variant.startsWith(`${group} `));
// A note's later lines are indented under its first, so they read as part of it; scripts/tally-trials.mjs reads them that way.
export const noteLines = (saved = {}) => Object.entries(saved).filter(([, text]) => text.trim())
  .sort(([a], [b]) => rank(a) - rank(b)).flatMap(([variant, text]) => text.trim().split('\n').map((line, i) => (i ? `  ${line}` : `${variant}: ${line}`)));
