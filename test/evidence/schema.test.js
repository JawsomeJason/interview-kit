import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { expect, test } from 'vitest';

const schema = JSON.parse(readFileSync('src/evidence/event.schema.json', 'utf8'));

test('the event schema compiles under Ajv strict mode', () => {
  expect(typeof new Ajv2020({ strict: true }).compile(schema)).toBe('function');
});

const admitsNumber = (s) => s && (['integer', 'number'].some((t) => [s.type].flat().includes(t)) || typeof s.const === 'number' || (s.enum ?? []).some((x) => typeof x === 'number'));
const resolve = (s) => (s?.$ref?.startsWith('#/') ? s.$ref.slice(2).split('/').reduce((a, k) => a[k], schema) : s);
const numericAt = [];
const scoreLike = [];
const walk = (o) => {
  if (!o || typeof o !== 'object') return;
  if (o.properties) {
    const label = [o.properties.t?.const ?? o.properties.t?.enum?.join('|'), o.properties.k?.const ?? o.properties.k?.enum?.join('|')].filter(Boolean).join(' ');
    for (const [p, s] of Object.entries(o.properties)) {
      if (/score|rating|grade|points|weight|rank/i.test(p)) scoreLike.push(`${label} ${p}`);
      if (admitsNumber(resolve(s))) numericAt.push(p === 'n' ? 'n' : `${label} ${p}`);
    }
  }
  for (const v of Object.values(o)) walk(v);
};
walk(schema);

test('numbers appear only at a stream position, the open version, segment minutes and the planned length', () => {
  expect([...new Set(numericAt)].sort()).toEqual(['n', 'open v', 'put segment.minutes v', 'put session.length v']);
});

test('every shared value has a fixed key and a declared type', () => {
  const loose = schema.$defs.pub.oneOf
    .filter((s) => ['put', 'member'].includes(s.properties.t.const))
    .filter((s) => !(s.properties.k.const || s.properties.k.enum) || !(s.properties.v.type || s.properties.v.enum))
    .map((s) => s.description);
  expect(loose).toEqual([]);
});

test('no property has a score-like name', () => {
  expect(scoreLike).toEqual([]);
});
