// Two trial layouts for the question page. After the maintainer picks one, delete the
// other letter here and its file in src/layouts/.
import { esc } from '../esc.js';
import './layout-switcher.css';

const KEY = 'interview-kit-layout';
const LAYOUTS = ['a', 'b'];

// Kept apart from interview state, so New interview never touches it.
let ui = { layout: 'a' };

// A saved layout that no longer exists (such as the dropped C) falls back to A.
export function loadPrefs() {
  try { ui = { layout: 'a', ...JSON.parse(localStorage.getItem(KEY)) }; } catch {}
  delete ui.notesOpen;
  if (!LAYOUTS.includes(ui.layout)) ui.layout = 'a';
  // Notes from when the layout trial was called Layout; a note already under the new name wins.
  for (const [variant, text] of Object.entries(ui.notes ?? {})) {
    if (!/^Layout [A-Z]$/.test(variant)) continue;
    ui.notes[`Question layout ${variant.at(-1)}`] ??= text;
    delete ui.notes[variant];
  }
}
loadPrefs();

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch {} };

// A labelled group of letter buttons, one pressed; `name` is the data attribute each button carries.
const switcher = (name, label, options, current) => `<span class="layout-switcher" role="group" aria-label="${label}">${label} ${options.map(([value, title]) =>
  `<button type="button" class="layout-switcher-option" data-${name}="${value}"${title ? ` title="${esc(title)}"` : ''} aria-pressed="${value === current}">${value.toUpperCase()}</button>`).join(' · ')}</span>`;

// It changes only the question page, hence the name.
export const layoutSwitcher = () => switcher('layout', 'Question layout', LAYOUTS.map((l) => [l]), ui.layout);

// A trial pick from a variant registry (sidebar, setup page), saved with these prefs under `name`;
// a saved letter that no longer exists falls back to A.
// The variant a trial shows before anyone picks one; A unless listed here.
export const TRIAL_DEFAULTS = { setup: 'c' };
export const trialId = (name, variants) => (ui[name] in variants ? ui[name] : TRIAL_DEFAULTS[name] ?? 'a');
export const trialSwitcher = (name, label, variants) => switcher(name, label, Object.entries(variants).map(([id, v]) => [id, v.label]), trialId(name, variants));

export function applyLayout() {
  document.body.className = `layout-${ui.layout}`;
}

export function setLayout(layout) {
  ui.layout = layout;
  save();
  applyLayout();
}

// Presses every button under root whose data-<attr> matches the clicked one, so copies of a group stay in step.
export function bindChoices(root, attr, onPick) {
  root.addEventListener('click', ({ target }) => {
    const value = target.closest(`[data-${attr}]`)?.getAttribute(`data-${attr}`);
    if (!value) return;
    onPick(value);
    for (const b of root.querySelectorAll(`[data-${attr}]`)) b.setAttribute('aria-pressed', String(b.getAttribute(`data-${attr}`) === value));
  });
}

// The phone layout's active tab, kept with the layout prefs so it survives moving between questions.
export const phoneTab = () => ui.tab ?? 'question';
export function setPhoneTab(tab) {
  ui.tab = tab;
  save();
}

// Other small UI prefs (such as the light/dark scheme) share this key.
export const getPref = (key, fallback) => ui[key] ?? fallback;
export function setPref(key, value) {
  ui[key] = value;
  save();
}

// A copy of every saved pref, for the setup line in Copy summary.
export const getPrefs = () => ({ ...ui });
