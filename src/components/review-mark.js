import { md } from '../markdown.js';
import { esc } from '../esc.js';
import { helpHint } from './help.js';
import { triangleAlert } from './icons.js';
import './review-mark.css';

// Cards the content owner still has to check: an alert on the card, a dot in the sidebar lists.
// Clearing the flag means deleting the review line and the ## Review section from the card.
export const isFlagged = (q) => q.review === 'needs-check';

// The ## Review section's fixed shape: Changed blocks with Before and After, a Check line, and Options.
export function parseReview(md = '') {
  const changes = [];
  const options = [];
  let check = '';
  let inOptions = false;
  for (const line of md.split('\n')) {
    const changed = line.match(/^\*\*Changed:\*\*\s*(.*)$/);
    const pair = line.match(/^- \*\*(Before|After):\*\*\s*(.*)$/);
    const checkLine = line.match(/^\*\*Check:\*\*\s*(.*)$/);
    if (changed) { changes.push({ what: changed[1] }); inOptions = false; }
    else if (pair && changes.length) changes.at(-1)[pair[1].toLowerCase()] = pair[2];
    else if (checkLine) { check = checkLine[1]; inOptions = false; }
    else if (line.startsWith('**Options:**')) inOptions = true;
    else if (inOptions && line.startsWith('- ')) options.push(line.slice(2).trim());
  }
  return { changes, check, options };
}

const inline = (text = '') => md.parseInline(text);
const pair = (label, text, cls) => (text ? `<span class="review-label">${label}</span><span class="${cls}">${inline(text)}</span>` : '');

// The built file has no review notes (the build strips them), so a flagged card gets only a quiet badge there.
export function reviewAlert(q) {
  if (!isFlagged(q)) return '';
  if (!q.reviewMd) return `<p class="review-badge">Being reviewed${helpHint('needs-check')}</p>`;
  const { changes, check, options } = parseReview(q.reviewMd);
  return `<div class="review-alert" role="note"><span class="review-alert-icon">${triangleAlert}</span><div class="review-alert-body">`
    + `<p class="review-alert-title">Being reviewed${helpHint('needs-check')}</p>`
    + changes.map((c) => `<div class="review-change"><p class="review-change-what">${inline(c.what)}</p>`
      + `<div class="review-pair">${pair('Before', c.before, 'review-before')}${pair('After', c.after, 'review-after')}</div></div>`).join('')
    + (check ? `<p class="review-check"><strong>Check:</strong> ${inline(check)}</p>` : '')
    + (options.length ? `<p class="review-options-title">Options</p><ul class="review-options">${options.map((o) => `<li class="review-option">${inline(o)}</li>`).join('')}</ul>` : '')
    + '</div></div>';
}

export const reviewDot = (q) => (isFlagged(q) ? ' <span class="review-dot" role="img" aria-label="Being reviewed" title="Being reviewed">●</span>' : '');
