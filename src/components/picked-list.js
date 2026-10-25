import { helpHint } from './help.js';
import { questionLink, questionMeta } from './question-parts.js';
import { scoreLabel } from './score-label.js';
import { doneText } from './question-notes.js';
import './picked-list.css';

export const pickedList = (picked, minutes, ticks = {}, done = []) => `<ol class="picked-list-items">${picked.map((q) => `<li>${
  doneText(`${questionLink(q)} · ${questionMeta(q)}${scoreLabel(q, ticks[q.id])}`, done.includes(q.id))}</li>`).join('')}</ol>
  <p class="picked-list-total">${picked.reduce((sum, q) => sum + q.minutes, 0)} min of ${minutes}</p>${
  picked.some((q) => ticks[q.id]?.length) ? `<p class="picked-list-scores">Scores come from your Look for ticks.${helpHint('score-after')}</p>` : ''}`;
