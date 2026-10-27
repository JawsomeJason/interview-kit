import { expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import { itemsOf, observables, planned, prompts } from '../../src/model/observables.js';
import { runOfShow } from '../../src/model/timeline.js';

const { model: pack } = await loadPack('test/fixtures/packs/sample-pack');
const items = itemsOf(pack);

test('an unpinned bullet is ref-ed by level and position, carries its digest, and inherits its pool competencies', () => {
  expect(observables(items.get('html-01')).map(({ ref, level, competencies, digest }) => ({ ref, level, competencies, digest }))).toEqual([
    { ref: 'html-01#mid.1', level: 'mid', competencies: ['craft'], digest: '474c6ef1' },
    { ref: 'html-01#mid.2', level: 'mid', competencies: ['craft'], digest: '0d52fd02' },
    { ref: 'html-01#mid.3', level: 'mid', competencies: ['craft'], digest: '1ee2b2d0' },
  ]);
});

test('a pinned finding is ref-ed by its pin, and a tag replaces the file default', () => {
  expect(observables(items.get('review-a-pr')).map((o) => [o.ref, o.competencies.join(), o.nudges.length])).toEqual([
    ['review-a-pr#divs', 'craft', 2],
    ['review-a-pr#typing', 'craft', 2],
    ['review-a-pr#error-link', 'craft', 2],
    ['review-a-pr#mid.2', 'judgment', 0],
    ['review-a-pr#senior.1', 'judgment', 0],
    ['review-a-pr#senior.2', 'judgment', 0],
  ]);
});

test('stretch prompts are ref-ed by level and position', () => {
  expect(prompts(items.get('css-04')).map((p) => p.ref)).toEqual(['css-04#stretch.mid.1', 'css-04#stretch.senior.1']);
});

test('the plan puts the scripts, the exercise and the picked questions in play, asked cards first', () => {
  const round = pack.rounds[0];
  const plan = { passions: [], segments: { 'practical/deep-dive': { minutes: 20, pools: ['css', 'html'], asked: ['html-01'] } } };
  expect(planned(pack, runOfShow(round, plan).steps, plan)).toEqual(['before-the-call', 'intro', 'review-a-pr', 'html-01', 'css-04', 'outro']);
});
