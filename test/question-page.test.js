import { expect, test } from 'vitest';
import { questionPage, pagerStep } from '../src/components/question-page.js';

const q = (id, title) => ({ id, title, poolName: 'React', minutes: 5, body: '## Ask\n\nWhy?\n', lookFor: ['Says why'], followUps: ['And then?'] });
const list = [q('a', 'First'), q('b', 'Middle'), q('c', 'Last')];
const pager = (html) => html.match(/<div class="pager">([\s\S]*?)<\/div>/)[1];

test('renders exactly one h1, the title', () => {
  const html = questionPage(list[1], list);
  expect(html.match(/<h1[ >]/g)).toEqual(['<h1>']);
  expect(html).toContain('<h1>Middle</h1>');
});

test('pager sits at the top with fixed labels and placeholders at the list ends', () => {
  expect(list.map((item) => questionPage(item, list).startsWith('<div class="pager">'))).toEqual([true, true, true]);
  expect(list.map((item) => pager(questionPage(item, list)))).toEqual([
    '<span class="pager-off">← <span class="pager-word">Previous</span></span><span class="pager-meta">React · 5 min</span><a href="#/q/b" class="question-link" title="Middle"><span class="pager-word">Next</span> →</a>',
    '<a href="#/q/a" class="question-link" title="First">← <span class="pager-word">Previous</span></a><span class="pager-meta">React · 5 min</span><a href="#/q/c" class="question-link" title="Last"><span class="pager-word">Next</span> →</a>',
    '<a href="#/q/b" class="question-link" title="Middle">← <span class="pager-word">Previous</span></a><span class="pager-meta">React · 5 min</span><span class="pager-off"><span class="pager-word">Next</span> →</span>',
  ]);
});

test('the question block holds only the Ask; the side column has Notes, Look for, Follow-ups in order', () => {
  const html = questionPage(list[1], list);
  const block = html.match(/<article class="question-body">[\s\S]*?<\/article>/)[0];
  const side = html.match(/<aside class="question-side"[^>]*>[\s\S]*<\/aside>/)[0];
  expect([block.includes('Why?'), /Look for|Follow-ups/.test(block)]).toEqual([true, false]);
  expect(side.match(/<h2 class="panel-title">[^<]*/g)).toEqual(['<h2 class="panel-title">Notes', '<h2 class="panel-title">Look for', '<h2 class="panel-title">Follow-ups']);
  expect(side).toContain('<li>And then?</li>');
});

test('phone: both panels and a tab bar, with the inactive panel marked', () => {
  const html = questionPage(list[1], list, [], '', false, 'assess');
  expect([/<article class="question-body" data-inactive>/.test(html), /<aside class="question-side" data-inactive>/.test(html)]).toEqual([true, false]);
  expect(html.match(/<button type="button" class="phone-tabs-tab" data-tab="[^"]*" aria-pressed="[^"]*">[^<]*<\/button>/g)).toEqual([
    '<button type="button" class="phone-tabs-tab" data-tab="question" aria-pressed="false">Question</button>',
    '<button type="button" class="phone-tabs-tab" data-tab="assess" aria-pressed="true">Assess</button>',
  ]);
});

const reviewMd = `**Changed:** Follow-up 2
- **Before:** "Old wording?"
- **After:** "New wording?"

**Check:** The new follow-up keeps the point.

**Options:**
- Keep the new follow-up
- Restore the old follow-up`;

test('a card flagged for review opens with a structured Needs check alert; others have none', () => {
  const flagged = { ...list[1], review: 'needs-check', reviewMd };
  const html = questionPage(flagged, [flagged]);
  expect([
    /<div class="question-text"><div class="review-alert" role="note">/.test(html),
    html.includes('<p class="review-alert-title">Being reviewed<button type="button" class="hint help-hint" aria-label="Why do some questions say Being reviewed?"'),
    html.includes('<span class="review-label">Before</span><span class="review-before">&quot;Old wording?&quot;</span>'),
    html.includes('<p class="review-check"><strong>Check:</strong> The new follow-up keeps the point.</p>'),
    (html.match(/<li class="review-option">/g) ?? []).length,
    questionPage(list[1], list).includes('review-alert'),
  ]).toEqual([true, true, true, true, 2, false]);
});

test('a step to the pager Next link goes forward, to Previous goes back, anywhere else is no step', () => {
  expect(['#/q/b', '#/q/a', '#/intro'].map((hash) => pagerStep('#/q/a', '#/q/b', hash))).toEqual(['forward', 'back', null]);
  expect(pagerStep(null, '#/q/b', '#/intro')).toBe(null);
});

test('in the built file a flagged card has no review notes, so it shows a quiet Being reviewed badge and no Before or After', () => {
  const flagged = { ...list[1], review: 'needs-check', reviewMd: '' };
  const html = questionPage(flagged, [flagged]);
  expect([
    html.includes('<p class="review-badge">Being reviewed<button type="button" class="hint help-hint"'),
    html.includes('Before'),
    html.includes('review-alert'),
  ]).toEqual([true, false, false]);
});
