import { esc } from '../esc.js';
import { questionLink } from './question-parts.js';
import { helpHint } from './help.js';
import { doneText } from './question-notes.js';
import { isFlagged, reviewDot } from './review-mark.js';
import './nav.css';

const link = (q, isDone = false) => doneText(questionLink(q, `${esc(q.title)}${reviewDot(q)} (${q.minutes} min)`), isDone);

// Every flagged card in one list at the foot of the sidebar, so they can be walked in turn.
export const needsCheck = (questions) => {
  const flagged = questions.filter(isFlagged);
  return flagged.length ? `<details class="needs-check"><summary class="all-questions-summary">Being reviewed (${flagged.length})</summary>
    <div class="all-questions-links">${flagged.map((q) => link(q)).join('')}</div></details>` : '';
};

// Rendered once per round around the header's two spots. The sidebar fills .sidebar-body on every nav update.
// The skip control focuses the main column instead of changing the hash, which the router owns.
export const shell = (header, drawer) => `<button type="button" class="skip-link">Skip to content</button>${header}
  <div class="topbar"><button type="button" class="topbar-menu" commandfor="timeline-panel" command="toggle-popover" aria-label="Timeline">☰</button></div>
  <div class="app-cols"><nav id="timeline-panel" class="sidebar" popover="auto">
    ${drawer}
    <div class="sidebar-body"></div>
  </nav><main class="main" tabindex="-1"></main></div>`;

export const pickedLinks = (picked, done = []) => [...Map.groupBy(picked, (q) => q.pool).values()]
  .map((qs) => `<h2 class="timeline-pool">${esc(qs[0].poolName)}</h2>${qs.map((q) => link(q, done.includes(q.id))).join('')}`).join('');

const item = (href, name, minutes) => `<a href="${href}" class="timeline-item">${esc(name)} <small class="timeline-mins">${minutes} min</small></a>`;

// The round part's length is fixed by the round file; only the deep dive follows the slider.
const roundPart = (round, { intro, outro }) => round.minutes - intro.minutes - outro.minutes - round.deepDiveMinutes;

// The run of show as the sidebar lays it out: each part with its start minute and length, in order.
export function runOfShow(round, parts, dd) {
  const { intro, outro } = parts;
  let start = 0;
  return [['intro', intro.name, intro.minutes], ['round', round.name, roundPart(round, parts)], ['deep-dive', 'Deep dive', dd.minutes], ['outro', outro.name, outro.minutes]]
    .map(([id, name, minutes]) => { const step = { id, name, start, minutes }; start += minutes; return step; });
}

// Going over the hour is allowed; the total only warns.
export function timelineTotal(round, parts, dd) {
  const total = parts.intro.minutes + roundPart(round, parts) + dd.minutes + parts.outro.minutes;
  const over = total - round.minutes;
  return { text: `${total} of ${round.minutes} min${over > 0 ? ` · ${over} over` : ''}`, over: over > 0, minutes: total, limit: round.minutes };
}

// The total as a gauge: fine up to the hour, marked bad by the browser once past it.
export const totalMeter = ({ minutes, limit }) => `<meter class="time-meter" aria-label="Planned minutes" min="0" max="${Math.max(minutes, limit)}" low="${limit}" high="${limit}" optimum="0" value="${minutes}"></meter>`;

export const timeline = (round, parts, dd, picked, done) => {
  const { intro, outro } = parts;
  const total = timelineTotal(round, parts, dd);
  return `${item('#/intro', intro.name, intro.minutes)}
    ${item('#/round', round.name, roundPart(round, parts))}
    ${item('#/deep-dive', 'Deep dive', dd.minutes)}<div class="timeline-picked">${pickedLinks(picked, done)}</div>
    ${item('#/outro', outro.name, outro.minutes)}
    <p class="timeline-total${total.over ? ' is-over' : ''}">${total.text}${helpHint('time-meter')}${totalMeter(total)}</p>`;
};
