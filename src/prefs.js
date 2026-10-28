// Small UI prefs (the color scheme, the What's new version seen), kept apart from interview
// state so New interview never touches them. index.html reads the same key before first paint, so it keeps its old name.
const KEY = 'interview-kit-layout';
// What 0.10.0 retired: the layout trials' picks and notes, and the theme choice (a pack's theme is now always on).
// A saved copy drops them on load.
const RETIRED = ['layout', 'header', 'sidebar', 'setup', 'notes', 'notesOpen', 'theme'];

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

export const getPref = (key, fallback) => ui[key] ?? fallback;
export function setPref(key, value) {
  ui[key] = value;
  save();
}
