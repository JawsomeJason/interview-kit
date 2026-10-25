// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { questionsPage } from '../src/dev/review/questions.js';

const questions = [
  { id: 'q1', question: 'Merge the resets?', details: 'Two resets confuse.', options: ['Keep both', 'Merge'], recommendation: 'Merge' },
  { id: 'q2', question: 'Build the kit now?', details: 'Scripts are scattered.', options: ['Go', 'Later'], recommendation: 'Go' },
];

test('each question shows its details, its options as radios with the recommendation marked, and a free-text answer', () => {
  document.body.innerHTML = questionsPage(questions, new Map());
  const first = document.querySelector('.dev-question');
  expect([
    first.querySelector('.dev-question-title').textContent,
    first.querySelector('.dev-question-details').textContent,
    [...first.querySelectorAll('.option-row')].map((row) => row.textContent),
    first.querySelector('.review-feedback-label').textContent.trim(),
    document.querySelectorAll('.dev-question').length,
  ]).toEqual(['Merge the resets?', 'Two resets confuse.', ['Keep both', 'Merge Recommended'], 'Your answer', 2]);
});

test('an answered question says so and keeps its answer', () => {
  document.body.innerHTML = questionsPage(questions, new Map([['question:q2', { kind: 'question', id: 'q2', choice: 'Later', notes: '' }]]));
  const texts = (selector) => [...document.querySelectorAll(selector)].map((el) => el.textContent);
  expect([texts('.dev-questions-count'), texts('.dev-question-answered'), document.querySelector('#dev-question-q2 [name=choice]:checked').value])
    .toEqual([['1 of 2 answered'], ['Answered'], 'Later']);
});
