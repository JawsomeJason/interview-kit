import { TRIAL_DEFAULTS } from './layout-switcher.js';
import { score } from './score-label.js';
import './copy-summary.css';

const cap = (word) => word[0].toUpperCase() + word.slice(1);

// The setup an interviewer tried, from the layout prefs; a missing pref shows its default.
// resolvedScheme is what Auto currently shows ('light' or 'dark').
export function setupLine(prefs = {}, packTheme = null, resolvedScheme = 'light') {
  const themeId = prefs.theme ?? packTheme?.id ?? 'default';
  const theme = packTheme && themeId === packTheme.id ? packTheme.name : 'Default';
  const scheme = prefs.scheme ?? 'auto';
  return `Setup: Question layout ${(prefs.layout ?? 'a').toUpperCase()} · Header ${(prefs.header ?? 'a').toUpperCase()} · Sidebar ${(prefs.sidebar ?? 'a').toUpperCase()} · Setup page ${(prefs.setup ?? TRIAL_DEFAULTS.setup).toUpperCase()} · Theme ${theme}`
    + ` · Scheme ${scheme === 'auto' ? `${cap(resolvedScheme)} (auto)` : cap(scheme)}`;
}

export function summaryText(round, dd, picked, ticks = {}, notes = {}, done = [], candidate = '', setup = '') {
  const lines = [`${candidate ? `${candidate} · ` : ''}${round.name} · deep dive ${dd.minutes} min`];
  for (const qs of Map.groupBy(picked, (q) => q.pool).values()) {
    lines.push(`${qs[0].poolName}${qs[0].pool === dd.pools[0] ? ' (main focus)' : ''}`);
    for (const q of qs) {
      const ticked = ticks[q.id] ?? [];
      const word = score(ticked.length, q.lookFor.length);
      lines.push(`  ${q.title}${word ? `: ${word}` : ''}${done.includes(q.id) ? ' ✓' : ''}`,
        ...q.lookFor.map((text, i) => `    [${ticked.includes(i) ? 'x' : ' '}] ${text}`));
      const note = notes[q.id]?.trim();
      if (note) lines.push(...`Notes: ${note}`.split('\n').map((line) => `    ${line}`));
    }
  }
  if (setup) lines.push(setup);
  return lines.join('\n');
}

export const copySummary = () => '<button type="button" class="copy-summary">Copy summary</button>';

export function bindCopySummary(button, getText) {
  const flash = (text) => {
    button.textContent = text;
    setTimeout(() => { button.textContent = 'Copy summary'; }, 1500);
  };
  // The clipboard of the window the button is in: a write from an unfocused window (the tab, while popped out) is refused.
  button.onclick = () => button.ownerDocument.defaultView.navigator.clipboard.writeText(getText()).then(() => flash('Copied'), () => flash('Copy failed'));
}
