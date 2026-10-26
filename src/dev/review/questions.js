// Dev tool: the lead's open questions (.review/questions.json, served at /__questions) on the #/dev/questions route,
// in a dialog over whatever page is open, so it works on the setup page too. A link in the bottom corner opens it.
// Answers post to /__review like the card and Help forms.
import { esc } from '../../esc.js';
import { answers, bindReviewForm, reviewForm } from './review.js';

const ROUTE = '#/dev/questions';
const answeredIn = (questions, answered) => questions.filter((q) => answered.has(`question:${q.id}`)).length;

export const questionsPage = (questions, answered) => `<h1 id="dev-questions-title" class="dev-questions-title">Questions for you</h1>
  <p class="dev-questions-count">${answeredIn(questions, answered)} of ${questions.length} answered</p>${questions.map((q) => {
  const sent = answered.get(`question:${q.id}`);
  return `<section class="dev-question" id="dev-question-${esc(q.id)}" aria-labelledby="dev-question-${esc(q.id)}-title">`
    + `<h2 class="dev-question-title" id="dev-question-${esc(q.id)}-title">${esc(q.question)}</h2>${sent ? '<p class="dev-question-answered">Answered</p>' : ''}`
    + `<p class="dev-question-details">${esc(q.details)}</p>${q.options.includes(q.recommendation) ? '' : `<p class="dev-question-details">Recommended: ${esc(q.recommendation)}</p>`}`
    + `${reviewForm({ id: q.id, choices: q.options, prompt: 'Your answer', recommended: q.recommendation, sent })}</section>`;
}).join('')}`;

export function mountQuestions(body) {
  body.insertAdjacentHTML('beforeend', `<a class="dev-questions-link" href="${ROUTE}">Questions for you</a>`
    + '<dialog id="dev-questions" class="dev-questions" aria-labelledby="dev-questions-title"></dialog>');
  const link = body.querySelector('.dev-questions-link');
  const dialog = body.querySelector('.dev-questions');
  let questions = [];
  let answered = new Map();
  const count = () => {
    const open = questions.length - answeredIn(questions, answered);
    link.textContent = open ? `Questions for you (${open} open)` : 'Questions for you';
  };
  const load = async () => {
    [questions, answered] = await Promise.all([fetch('/__questions').then((res) => res.json()), answers()]);
    count();
  };
  const show = async () => {
    await load();
    dialog.innerHTML = `<button type="button" class="dev-questions-close" commandfor="dev-questions" command="close">Close</button>${questionsPage(questions, answered)}`;
    for (const form of dialog.querySelectorAll('.review-feedback')) {
      const { id } = form.dataset;
      bindReviewForm(form, (choice, notes) => ({ kind: 'question', id, choice, notes }), (line) => {
        answered.set(`question:${id}`, line);
        count();
        dialog.querySelector('.dev-questions-count').textContent = `${answeredIn(questions, answered)} of ${questions.length} answered`;
        const title = form.closest('.dev-question').querySelector('.dev-question-title');
        if (!title.nextElementSibling.matches('.dev-question-answered')) title.insertAdjacentHTML('afterend', '<p class="dev-question-answered">Answered</p>');
      });
    }
    if (!dialog.open) dialog.showModal();
  };
  // Closing goes back to the page the dialog opened over. Chrome fires no hashchange for a hash change the app's
  // router intercepts, so navigatesuccess covers those, and `last` keeps the two from acting twice.
  let back = '';
  let last = location.hash;
  dialog.addEventListener('close', () => { if (location.hash === ROUTE) location.hash = back; });
  const follow = () => {
    if (location.hash === last) return;
    if (location.hash === ROUTE) {
      back = last;
      show();
    } else if (dialog.open) dialog.close();
    last = location.hash;
  };
  addEventListener('hashchange', follow);
  globalThis.navigation?.addEventListener('navigatesuccess', follow);
  if (location.hash === ROUTE) show();
  else load();
}
