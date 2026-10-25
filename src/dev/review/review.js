// Dev tool: the review form, posted to the dev server (scripts/vite-review-plugin.js), which appends each send to
// .review/feedback.jsonl. Resending is fine; later lines win. `npm run review:pending` lists what is left.
// Cards flagged review: needs-check get it under their Needs check alert; the Help guesses and Questions for you reuse it.
import { esc } from '../../esc.js';
import { optionRow } from '../../components/option-row.js';
import { parseReview } from '../../components/review-mark.js';
import './review.css';

// A line's kind and id; card lines predate kinds and carry none.
export const answerKey = (line) => `${line.kind ?? 'card'}:${line.id}`;

// The latest answer per kind and id, from every line sent so far.
export async function answers() {
  const lines = await fetch('/__review').then((res) => res.json());
  return new Map(lines.filter((line) => !line.done).map((line) => [answerKey(line), line]));
}

const sentText = (line) => (line.choice ? `Sent: ${line.choice}` : 'Sent');

// Nothing is chosen up front, so the form never nudges the call; an answer already sent comes back filled in.
export const reviewForm = ({ id, choices, prompt, recommended, sent }) => `<form class="review-feedback" data-id="${esc(id)}">
  <fieldset class="review-feedback-choices"><legend>Your call</legend>${choices.map((label) =>
    optionRow({ type: 'radio', name: 'choice', value: label, checked: sent?.choice === label },
      `${esc(label)}${label === recommended ? ' <span class="review-feedback-recommended">Recommended</span>' : ''}`)).join('')}</fieldset>
  <label class="review-feedback-label">${esc(prompt)} <textarea class="review-feedback-text" name="notes" rows="3">${esc(sent?.notes ?? sent?.text ?? '')}</textarea></label>
  <p class="review-feedback-actions"><button type="submit"${sent ? '' : ' disabled'}>Send</button> <span class="review-feedback-status" role="status">${sent ? esc(sentText(sent)) : ''}</span></p></form>`;

// Send waits for a choice or some text. `line(choice, notes)` shapes what gets posted; `onSent` hears each line saved.
export function bindReviewForm(el, line, onSent = () => {}) {
  const send = el.querySelector('[type=submit]');
  const status = el.querySelector('.review-feedback-status');
  const read = () => {
    const data = new FormData(el);
    return { choice: data.get('choice'), notes: String(data.get('notes') ?? '').trim() };
  };
  el.addEventListener('input', () => {
    const { choice, notes } = read();
    send.disabled = !choice && !notes;
    if (status.textContent.startsWith('Sent')) status.textContent = 'Changed, not sent yet';
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { choice, notes } = read();
    const body = { ...line(choice, notes), at: new Date().toISOString() };
    const res = await fetch('/__review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    status.textContent = res.ok ? sentText(body) : 'Not sent';
    if (res.ok) onSent(body);
  });
}

// The card's own Options first, then the two calls every card can get.
const FIXED = ['Looks good, clear the flag', 'Remove the card'];
export const cardForm = (q) => reviewForm({ id: q.id, choices: [...parseReview(q.reviewMd).options, ...FIXED], prompt: 'What should change?' });

function question(main, q) {
  const alert = main.querySelector('.review-alert');
  if (!alert) return;
  alert.insertAdjacentHTML('afterend', cardForm(q));
  bindReviewForm(alert.nextElementSibling, (choice, text) => ({ id: q.id, choice, text }));
}

export default { question };
