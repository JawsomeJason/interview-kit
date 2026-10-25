import { esc } from '../esc.js';

export const questionLink = (q, text = esc(q.title), title = '') => `<a href="#/q/${esc(q.id)}" class="question-link"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
export const questionMeta = (q) => `${esc(q.poolName)} · ${q.minutes} min`;
