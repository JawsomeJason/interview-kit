// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { helpPage } from '../src/components/help.js';
import { helpGuesses } from '../src/dev/review/guesses.js';
import { guessBox, reviewedBadge } from '../src/dev/review/help.js';

const text = readFileSync('HELP.md', 'utf8');

test('ten Help entries carry guessed reasons, each quoted word for word from its entry', () => {
  const guesses = helpGuesses(text);
  const entryText = (id) => text.split(/^(?=### )/m).find((chunk) => chunk.includes(`{#${id}}`)).replace(/<!-- guess: .* -->/g, '');
  const misquoted = [...guesses].flatMap(([id, quotes]) => quotes.filter((q) => !entryText(id).includes(q)));
  expect([[...guesses.keys()], misquoted]).toEqual([
    ['no-score', 'overlaps', 'time-meter', 'name-first', 'notes-done', 'pop-out', 'needs-check', 'candidate', 'your-load', 'motion'], [],
  ]);
});

test('the guess markers render nothing on the Help page', () => {
  document.body.innerHTML = helpPage();
  expect(document.body.textContent.includes('guess:')).toBe(false);
});

test('a guess box quotes the guesses, then offers the four calls and asks for the real reason', () => {
  document.body.innerHTML = guessBox('overlaps', ['First guess.', 'Second guess.']);
  const texts = (selector) => [...document.querySelectorAll(selector)].map((el) => el.textContent.trim());
  expect([texts('.review-guess-quote'), [...document.querySelectorAll('[name=choice]')].map((r) => r.value), texts('.review-feedback-label')]).toEqual([
    ['First guess.', 'Second guess.'],
    ['Right as written', 'Right idea, reword', 'Wrong reason', 'Cut it'],
    ["What's the real reason?"],
  ]);
});

test('a guess box already answered shows Sent with the answer', () => {
  document.body.innerHTML = guessBox('overlaps', ['A guess.'], { kind: 'help', id: 'overlaps', choice: 'Wrong reason', notes: 'It keeps the hour short.' });
  expect([document.querySelector('[name=choice]:checked').value, document.querySelector('textarea').value, document.querySelector('.review-feedback-status').textContent])
    .toEqual(['Wrong reason', 'It keeps the hour short.', 'Sent: Wrong reason']);
});

test('the badge counts reviewed entries and links to the next one left', () => {
  const ids = ['no-score', 'overlaps', 'time-meter'];
  expect([reviewedBadge(ids, new Set(['no-score'])), reviewedBadge(ids, new Set(ids))]).toEqual([
    '<p class="review-guess-badge"><a href="#/help/overlaps">1 of 3 reviewed</a></p>',
    '<p class="review-guess-badge">3 of 3 reviewed</p>',
  ]);
});
