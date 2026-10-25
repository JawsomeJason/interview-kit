import { esc } from '../../esc.js';
import { candidateField } from '../candidate-field.js';
import './c.css';

// Two clusters: who and when on the left, a row of icon-and-label tools on the right, New interview last and set apart.
// Icons from Lucide (https://lucide.dev), ISC license; see icons.js.
const svg = (body) => `<svg class="hc-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  "What's new": svg('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>'),
  Help: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  'Pop out': svg('<path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4"/><rect width="10" height="7" x="12" y="13" rx="2"/>'),
  'New interview': svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};
const FALLBACK = svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>');
const icon = (label) => ICONS[label] ?? FALLBACK;

const content = (label) => `${icon(label)}<span class="hc-label">${esc(label)}</span>`;

// The slot's links are ready-made markup; each gets an icon, the shared button look, and its words in .hc-label.
const pageLinks = (links) => links
  .replace(/<a ([^>]*)class="whats-new-link"([^>]*)>([^<]*)/, (_, a, b, words) => `<a ${a}class="whats-new-link hc-btn"${b}>${icon("What's new")}<span class="hc-label">${words}</span>`)
  .replace(/<a ([^>]*)class="help-link"([^>]*)>([^<]*)/, (_, a, b, words) => `<a ${a}class="help-link hc-btn"${b}>${icon('Help')}<span class="hc-label">${words}</span>`);

// The slot wants the whole element. The inner box keeps the layout CSS in charge of showing and hiding each spot.
const render = ({ spot, round, candidate, startedAt, clock, schemeToggle, links, buttons }) => {
  const inner = `<div class="hc hc-${spot}">
  <div class="hc-who">
    ${candidateField(candidate)}
    <span class="hc-round">${esc(round.name)} · ${round.minutes} min</span>
    ${startedAt ? `<span class="hc-clock" data-clock title="Time in the interview">${esc(clock())}</span>` : ''}
  </div>
  <div class="hc-tools">
    <span class="hc-scheme"><span class="hc-scheme-label">Scheme</span>${schemeToggle}</span>
    ${pageLinks(links)}
    ${buttons.map(({ label }) => `<button type="button" class="header-button hc-btn hc-plugin">${content(label)}</button>`).join('')}
    <span class="hc-new"><button type="button" class="hc-btn hc-new-button">${content('New interview')}</button></span>
  </div>
</div>`;
  return spot === 'header' ? `<header class="app-header">${inner}</header>` : `<div class="sidebar-round">${inner}</div>`;
};

function bind(el, { buttons, newInterview }) {
  el.querySelectorAll('.hc-plugin').forEach((b, i) => { b.onclick = buttons[i].onClick; });
  el.querySelector('.hc-new-button').onclick = () => newInterview();
}

export default { label: 'Two clusters', render, bind };
