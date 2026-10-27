import { expect, test } from 'vitest';
import { foldEvidence } from '../../src/evidence/reduce.js';
import { focusOf, isRequired, layerOf } from '../../src/model/layers.js';

const ladder = ['sde1', 'sde2', 'sde3', 'sde4', 'principal'].map((id) => ({ id, name: id, summary: '' }));
const layout = (focus) => Object.fromEntries(ladder.map((l) => [l.id, layerOf(ladder, focus, l.id)]));

test('a Principal hire reads Principal as the checklist, SDE 4 for placement, SDE 1 to 3 as basics and nothing above', () => {
  expect(layout('principal')).toEqual({ sde1: 'basics', sde2: 'basics', sde3: 'basics', sde4: 'placement', principal: 'main' });
});

test('an SDE 2 hire reads SDE 1 for placement, no basics, and SDE 3 up as headroom', () => {
  expect(layout('sde2')).toEqual({ sde1: 'placement', sde2: 'main', sde3: 'above', sde4: 'above', principal: 'above' });
});

test('a focus event moves only the layers of the interviewer who logged it', () => {
  const role = { id: 'ui-engineer', hiring: 'sde2' };
  const logs = {
    jason: [{ n: 0, h: '0194c0de1000.0000', t: 'mark', o: 'css-04#sde2.1', d: '4f9c1a02', s: 'seen' }],
    alex: [{ n: 0, h: '0194c0de1000.0000', t: 'focus', level: 'sde3' }, { n: 1, h: '0194c0de2000.0000', t: 'focus', level: 'sde4' }],
  };
  expect({ jason: layout(focusOf(role, foldEvidence(logs.jason))), alex: layout(focusOf(role, foldEvidence(logs.alex))) }).toEqual({
    jason: { sde1: 'placement', sde2: 'main', sde3: 'above', sde4: 'above', principal: 'above' },
    alex: { sde1: 'basics', sde2: 'basics', sde3: 'placement', sde4: 'main', principal: 'above' },
  });
});

test('a stretch prompt is required only when it sits at the focus level', () => {
  const prompts = [{ level: 'mid', text: 'The menu now covers the page header.' }, { level: 'senior', text: 'This is the third bug like it.' }];
  expect(['junior', 'mid', 'senior'].map((focus) => prompts.map((p) => isRequired(focus, p)))).toEqual([
    [false, false],
    [true, false],
    [false, true],
  ]);
});
