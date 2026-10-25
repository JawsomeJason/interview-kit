import { expect, test } from 'vitest';
import { evalQuestions, grade, rankings } from '../scripts/suggest-eval.mjs';

const pools = [
  { id: 'css', name: 'CSS', titles: ['Grid or flex'] },
  { id: 'teamwork', name: 'Teamwork', titles: ['Feedback you acted on'], unranked: true },
  { id: 'react', name: 'React', titles: ['Lifting state up'] },
];

test('the eval asks a Score and a Noul per technical pool plus one Choice for the main focus, in one request', () => {
  const qs = evalQuestions(pools);
  expect(Object.keys(qs)).toEqual(['score:css', 'score:react', 'noul:css', 'noul:react', 'main']);
  expect(qs['noul:react'].type).toBe('noul');
  expect(Object.keys(qs.main.criteria)).toEqual(['css', 'react']);
});

test('rankings orders each shape: Scores through the cuts, Nouls of 0.5 or more, the Choice by probability', () => {
  const s = (score, confidence) => ({ type: 'score', score, confidence });
  const answers = {
    'score:css': s(1.2, 0.9), 'score:react': s(2.6, 0.8), 'score:node': s(2.0, 0.4),
    'noul:css': { type: 'noul', noul: 0.4 }, 'noul:react': { type: 'noul', noul: 0.95 }, 'noul:node': { type: 'noul', noul: 0.7 },
    main: { type: 'choice', choice: 'react', confidence: 0.6, probabilities: { css: 0.1, react: 0.7, node: 0.2 } },
  };
  expect(rankings(answers, { scoreCut: 1.5, confCut: 0.5 })).toEqual({
    score: ['react', 'node'],
    noul: ['react', 'node'],
    choice: ['react', 'node', 'css'],
  });
});

test('grade counts the first-pick match and the top-3 overlap against the maintainer\'s picks', () => {
  expect(grade(['react', 'css', 'html'], ['react', 'html', 'node'])).toEqual({ first: true, overlap: 2 });
  expect(grade(['css'], ['react', 'html', 'node'])).toEqual({ first: false, overlap: 0 });
});
