import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseQuestion, parts, questions, rounds } from '../../src/content.js';

const unknownOverlaps = (qs) => {
  const ids = new Set(qs.map((q) => q.id));
  return qs.flatMap((q) => (q.overlaps ?? []).filter((id) => !ids.has(id)).map((id) => `${q.id} overlaps ${id}`));
};

// Shape checks run against whichever pack KIT_PACK points at; the parsing checks use a sample pack file.
const paths = Object.keys(import.meta.glob('@pack/pools/*/*.md')).sort();
const sample = parseQuestion(readFileSync('sample-pack/pools/html/html-01-button-or-link.md', 'utf8'));
const failing = (check) => questions.filter((q, i) => !check(q, i)).map((q) => q.id);

test('loads every question file', () => {
  expect(questions.length).toBe(paths.length);
  expect(questions.length).toBeGreaterThan(0);
});

test('every question has its fields', () => {
  expect(failing((q) => ['id', 'pool', 'poolName', 'title'].every((k) => typeof q[k] === 'string' && q[k]))).toEqual([]);
  expect(failing((q) => typeof q.minutes === 'number' && q.minutes > 0)).toEqual([]);
  expect(failing((q) => q.tier === 'core' || q.tier === 'stretch')).toEqual([]);
});

test('every question keeps just the Ask in its body and has exactly 2 follow-ups pulled out', () => {
  expect(failing((q) => q.body.includes('## Ask') && !q.body.includes('## Look for') && !q.body.includes('## Follow-ups'))).toEqual([]);
  expect(failing((q) => q.followUps?.length === 2)).toEqual([]);
});

test('Follow-ups bullets are parsed into followUps', () => {
  expect(sample.followUps).toEqual([
    'What breaks if a link opens a modal?',
    'How would you style a link to look like a button?',
  ]);
});

test('Look for bullets are parsed into lookFor', () => {
  expect(sample.lookFor).toEqual([
    'Links go somewhere, buttons do something',
    'Names keyboard and screen reader differences',
    'Avoids div with a click handler',
  ]);
});

test('ids are unique', () => {
  expect(questions.length - new Set(questions.map((q) => q.id)).size).toBe(0);
});

test('each file sits in its pool folder and its name starts with the id', () => {
  expect(failing((q, i) => paths[i].includes(`/pools/${q.pool}/${q.id}-`))).toEqual([]);
});

test('Look for has exactly 3 bullets', () => {
  expect(failing((q) => q.lookFor?.length === 3)).toEqual([]);
});

// Cards are read mid-call: short Look-for bullets, plain punctuation.
test('Look for bullets are under 12 words', () => {
  expect(failing((q) => q.lookFor.every((b) => b.split(/\s+/).length < 12))).toEqual([]);
});

test('no em dashes in question, round or part files', () => {
  const files = import.meta.glob('@pack/{pools/*/*.md,rounds/*.md,parts/*.md}', { query: '?raw', import: 'default', eager: true });
  expect(Object.keys(files).filter((f) => files[f].includes('—'))).toEqual([]);
});

test('rounds have numeric minutes and distinct orders', () => {
  expect(rounds.length).toBeGreaterThan(0);
  expect(rounds.filter((r) => [r.order, r.minutes, r.deepDiveMinutes].some((n) => typeof n !== 'number')).map((r) => r.id)).toEqual([]);
  expect(new Set(rounds.map((r) => r.order)).size).toBe(rounds.length);
});

test('intro and outro parts exist with a name and numeric minutes', () => {
  expect(Object.values(parts).map((p) => [p.id, typeof p.name, typeof p.minutes])).toEqual([
    ['intro', 'string', 'number'],
    ['outro', 'string', 'number'],
  ]);
});

test('every overlaps id names a question in the pack', () => {
  expect(unknownOverlaps([{ id: 'x1', overlaps: ['x2', 'nope'] }, { id: 'x2' }])).toEqual(['x1 overlaps nope']);
  expect(unknownOverlaps(questions)).toEqual([]);
});

test('review, when present, is needs-check', () => {
  expect(failing((q) => q.review === undefined || q.review === 'needs-check')).toEqual([]);
});

test('the Review section leaves the card body for q.reviewMd', () => {
  const q = parseQuestion('---\nid: x1\nreview: needs-check\n---\n## Ask\n\nWhy?\n\n## Look for\n\n- a\n- b\n- c\n\n## Follow-ups\n\n- f1\n- f2\n\n## Review\n\n**Check:** It holds.\n\n**Options:**\n- Keep\n- Drop\n');
  expect([q.body.includes('## Review'), q.reviewMd]).toEqual([false, '**Check:** It holds.\n\n**Options:**\n- Keep\n- Drop']);
});

test('a flagged card has a Review section with a Check and at least 2 Options; an unflagged card has none', () => {
  const options = (md) => (md.split('**Options:**')[1] ?? '').split('\n').filter((l) => l.startsWith('- ')).length;
  expect(failing((q) => (q.review === 'needs-check'
    ? q.reviewMd.includes('**Check:**') && options(q.reviewMd) >= 2
    : !q.reviewMd))).toEqual([]);
});

test('pack.json allowResumeToTypeSafe, when present, is true or false', () => {
  const pack = Object.values(import.meta.glob('@pack/pack.json', { import: 'default', eager: true }))[0];
  expect([undefined, true, false]).toContain(pack.allowResumeToTypeSafe);
});
