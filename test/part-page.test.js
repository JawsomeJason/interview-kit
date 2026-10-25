// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { partPage } from '../src/components/round-page.js';
import { pickRound } from '../src/components/setup-variants/index.js';
import setupA from '../src/components/setup-variants/a.js';

const parts = { intro: { name: 'Intro', body: '## Script\n\nSay hi.\n' }, outro: { name: 'Outro', body: 'Ask for questions.\n' } };

test('#/intro and #/outro render their part bodies', () => {
  expect([partPage('#/intro', parts), partPage('#/outro', parts), partPage('#/round', parts)]).toEqual([
    '<h1>Intro</h1><h2>Script</h2>\n<p>Say hi.</p>\n', '<h1>Outro</h1><p>Ask for questions.</p>\n', null,
  ]);
});

test('picking a round lands on the intro and starts the clock', () => {
  expect(pickRound('pair', 'Ada', 1000)).toEqual({ state: { round: 'pair', candidate: 'Ada', startedAt: 1000 }, route: '#/intro' });
});

test('round buttons stay disabled until the candidate name is filled in', () => {
  const rounds = [{ id: 'pair', name: 'Pair programming', minutes: 50, deepDiveMinutes: 20 }];
  const disabled = (name) => /<button[^>]*data-round="pair"[^>]*disabled/.test(setupA.render({ rounds, candidate: name, startOptions: [] }));
  expect([disabled(''), disabled('   '), disabled('Ada')]).toEqual([true, true, false]);
});
