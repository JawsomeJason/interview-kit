// Dev tool: on the Help page, each entry HELP.md marks as a guess gets a box quoting the guessed sentences and a
// review form, and a badge counts how many are reviewed. It watches the app root for the Help page itself, so main.js
// needs no hook.
import text from '../../../HELP.md?raw';
import { esc } from '../../esc.js';
import { helpGuesses } from './guesses.js';
import { answerKey, answers, bindReviewForm, reviewForm } from './review.js';

const CHOICES = ['Right as written', 'Right idea, reword', 'Wrong reason', 'Cut it'];

export const guessBox = (id, quotes, sent) => `<div class="review-guess" role="group" aria-label="Review the guessed reason">`
  + `<p class="review-guess-title">Guessed, not on record</p>${quotes.map((q) => `<blockquote class="review-guess-quote">${esc(q)}</blockquote>`).join('')}`
  + `${reviewForm({ id, choices: CHOICES, prompt: "What's the real reason?", sent })}</div>`;

// Links to the first entry, in page order, that has no answer yet.
export function reviewedBadge(ids, reviewed) {
  const label = `${ids.filter((id) => reviewed.has(id)).length} of ${ids.length} reviewed`;
  const next = ids.find((id) => !reviewed.has(id));
  return `<p class="review-guess-badge">${next ? `<a href="#/help/${next}">${label}</a>` : label}</p>`;
}

async function decorate(article) {
  article.dataset.devReview = '';
  const guesses = helpGuesses(text);
  const ids = [...guesses.keys()];
  const sent = await answers();
  if (!article.isConnected) return;
  const badge = () => reviewedBadge(ids, new Set(ids.filter((id) => sent.has(`help:${id}`))));
  article.querySelector('.help-title').insertAdjacentHTML('afterend', badge());
  for (const [id, quotes] of guesses) {
    const entry = article.querySelector(`#faq-${id}`);
    entry.insertAdjacentHTML('beforeend', guessBox(id, quotes, sent.get(`help:${id}`)));
    bindReviewForm(entry.querySelector('.review-feedback'), (choice, notes) => ({ kind: 'help', id, choice, notes }), (line) => {
      sent.set(answerKey(line), line);
      article.querySelector('.review-guess-badge').outerHTML = badge();
    });
  }
  // The boxes push the entry a #/help/<id> route scrolled to further down, so scroll to it again.
  article.querySelector('[data-target]')?.scrollIntoView({ block: 'start' });
}

export function mountHelpReview(root) {
  const check = () => {
    const article = root.querySelector('.help:not([data-dev-review])');
    if (article) decorate(article);
  };
  new MutationObserver(check).observe(root, { childList: true, subtree: true });
  check();
}
