import './copy-summary.css';

export const score = (ticked, total) => (!ticked ? null : ticked === total ? 'Strong' : ticked / total >= 0.5 ? 'Solid' : 'Weak');

export function summaryText(round, dd, picked, ticks = {}, notes = {}, done = [], candidate = '') {
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
  return lines.join('\n');
}

export function bindCopySummary(button, getText) {
  const flash = (text) => {
    button.textContent = text;
    setTimeout(() => { button.textContent = 'Copy summary'; }, 1500);
  };
  // The clipboard of the window the button is in: a write from an unfocused window (the tab, while popped out) is refused.
  button.onclick = () => button.ownerDocument.defaultView.navigator.clipboard.writeText(getText()).then(() => flash('Copied'), () => flash('Copy failed'));
}
