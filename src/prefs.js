// Small UI prefs (the color scheme, the theme, the phone tab, the What's new version seen), kept apart from interview
// state so New interview never touches them. index.html reads the same key before first paint, so it keeps its old name.
const KEY = 'interview-kit-layout';
// What the layout trials saved, before they ended in 0.10.0. A saved copy drops them on load.
const RETIRED = ['layout', 'header', 'sidebar', 'setup', 'notes', 'notesOpen'];

let ui = {};

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch {} };

export function loadPrefs() {
  ui = {};
  try { ui = JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch {}
  if (RETIRED.some((key) => key in ui)) {
    for (const key of RETIRED) delete ui[key];
    save();
  }
}
loadPrefs();

// The phone layout's active tab, kept so it survives moving between questions.
export const phoneTab = () => ui.tab ?? 'question';
export function setPhoneTab(tab) {
  ui.tab = tab;
  save();
}

export const getPref = (key, fallback) => ui[key] ?? fallback;
export function setPref(key, value) {
  ui[key] = value;
  save();
}
