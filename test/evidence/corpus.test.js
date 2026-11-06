import { readdirSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { expect, test } from 'vitest';
import { importBundle } from '../../src/evidence/bundle.js';
import { loadPack } from '../../src/pack/load.js';
import { timelineHtml } from '../../src/views/debrief.js';
import { CORPUS, summaryOf } from './corpus.js';

// Evidence files saved by released kits, made by scripts/evidence-corpus.mjs (ADR 027).
const { model: pack } = await loadPack(`${CORPUS}/pack`);
const ajv = new Ajv2020({ strict: true }).compile(JSON.parse(readFileSync('src/evidence/event.schema.json', 'utf8')));
const files = readdirSync(CORPUS).filter((f) => f.endsWith('.json'));
const read = (f) => readFileSync(`${CORPUS}/${f}`, 'utf8');

test('the corpus holds a file saved by v1.0.2 and one by v1.1.0', () => {
  expect(files).toEqual(['v1.0.2.json', 'v1.1.0.json']);
});

test.each(files)('%s opens in this build, each event passes the schema, and its summary reads as committed', (f) => {
  const { pub, prv } = importBundle(read(f));
  expect([...pub, ...prv].filter((e) => !ajv(e))).toEqual([]);
  expect(summaryOf(pack, read(f))).toBe(read(f.replace(/json$/, 'txt')));
});

// The v1.1.0 file with the course events added since: the deep dive started, its question done, the outro skipped,
// and an amendment begun. None of them is a mark, so the summary must read as before.
const SEG = 'practical/deep-dive';
const ADDED = { pub: [{ t: 'segment.start', seg: SEG, cards: ['css-01'] }, { t: 'segment.done', seg: SEG, id: 'css-01' }, { t: 'skip', seg: 'practical/outro', reason: 'no-time' }],
  prv: [{ t: 'amend', seg: SEG, id: 'css-01' }] };
function withAdded(retype = (t) => t) {
  const b = JSON.parse(read('v1.1.0.json'));
  let ms = parseInt([...b.pub, ...b.prv].map((e) => e.h).sort().at(-1), 16);
  for (const ch of ['pub', 'prv']) for (const e of ADDED[ch]) b[ch].push({ n: b[ch].length, h: `${(++ms).toString(16).padStart(12, '0')}.0000`, ...e, t: retype(e.t) });
  return b;
}

test('a file holding the new course events opens, and its summary reads as before', () => {
  const b = withAdded();
  expect([...b.pub, ...b.prv].filter((e) => !ajv(e))).toEqual([]);
  expect(summaryOf(pack, JSON.stringify(b))).toBe(read('v1.1.0.txt'));
});

// A kit that knows only the v1.1.0 types sees each new one as unknown, which renaming them out of this build's
// table reproduces.
test('a reader that knows only the v1.1.0 types keeps the new events, summarizes as before, and lists them as from a newer kit', () => {
  const b = withAdded((t) => `later.${t}`);
  const held = importBundle(JSON.stringify(b));
  expect([held.pub.length, held.prv.length]).toEqual([b.pub.length, b.prv.length]);
  expect([...b.pub, ...b.prv].filter((e) => !ajv(e))).toEqual([]);
  expect(summaryOf(pack, JSON.stringify(b))).toBe(read('v1.1.0.txt'));
  const html = timelineHtml([{ name: 'Pat Example', e: b.pub.at(-1) }], 0, {});
  expect(html).toContain('<b>Pat Example</b> did something from a newer kit');
});
