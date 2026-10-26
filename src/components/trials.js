// The A/B trials (layout, the variant registries, theme) in one corner control that sits outside the header and the
// phone drawer, so a header redesign never touches it. It lives inside the app root, so it moves into the Pop out window
// with it. The setup page mounts it too. A registry gets its group only once it has more than one variant to try.
// Each group has a feedback note for the variant picked, always in view.
import { bindChoices, getPref, layoutSwitcher, setLayout, setPref, trialId, trialSwitcher } from './layout-switcher.js';
import { getTheme, setTheme, themeToggle } from './theme-toggle.js';
import { bindNotes, noteField, showNote } from './trial-notes.js';
import './trials.css';

const themeName = (packTheme) => (getTheme(packTheme) === packTheme.id ? packTheme.name : 'Default');

// `groups` is [{ name, label, variants }], in panel order; `name` is the pref key and data attribute.
// The corner holds the button, and on the setup page the What's new and Help links that the header carries elsewhere.
export const trials = (groups, packTheme) => `<div class="trials-corner"><button type="button" class="trials-button" commandfor="trials-panel" command="toggle-popover">Try layouts</button></div>
  <div id="trials-panel" class="trials-panel" popover="auto" role="dialog" aria-label="Try layouts">${layoutSwitcher()}${
    noteField('layout', `Question layout ${getPref('layout', 'a').toUpperCase()}`)}${
    groups.filter(({ variants }) => Object.keys(variants).length > 1).map(({ name, label, variants }) =>
      trialSwitcher(name, label, variants) + noteField(name, `${label} ${trialId(name, variants).toUpperCase()}`)).join('')}${
    packTheme ? `<span>Theme ${themeToggle(packTheme)}</span>${noteField('theme', `Theme ${themeName(packTheme)}`)}` : ''}</div>`;

// Called once per app shell and once per setup page; each group's `onPick` re-renders after a pick.
export function mountTrials(root, groups, packTheme) {
  root.insertAdjacentHTML('beforeend', trials(groups, packTheme));
  const panel = root.querySelector('.trials-panel');
  const group = (name) => panel.querySelector(`[data-${name}]`)?.closest('.layout-switcher');
  bindChoices(group('layout'), 'layout', (id) => {
    setLayout(id);
    showNote(panel, 'layout', `Question layout ${id.toUpperCase()}`);
  });
  for (const { name, label, onPick } of groups) {
    const el = group(name);
    if (el) bindChoices(el, name, (id) => {
      setPref(name, id);
      showNote(panel, name, `${label} ${id.toUpperCase()}`);
      onPick();
    });
  }
  // Escape closes the panel itself and returns focus to the button: closing from a note box drops focus to the page in Chromium.
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    panel.hidePopover();
    root.querySelector('.trials-button').focus();
  });
  if (packTheme) bindChoices(panel, 'theme-choice', (id) => {
    setTheme(id, packTheme);
    showNote(panel, 'theme', `Theme ${themeName(packTheme)}`);
  });
  bindNotes(panel);
}
