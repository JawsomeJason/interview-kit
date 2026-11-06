import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { expect, test } from 'vitest';
import { STREAM_OF } from '../../src/evidence/events.js';

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

// ADR 027: within one version a format only grows. True when every value `old` accepts, `cur` accepts too, judged by
// shape: `cur` may add properties, $defs, oneOf branches and enum values, drop required names and reword descriptions.
// A new branch that overlaps an old one would break oneOf; the evidence corpus catches that by validating real files.
const WORDING = new Set(['description', 'title', '$comment']);
function widens(old, cur, key) {
  if (Array.isArray(old)) {
    if (!Array.isArray(cur)) return false;
    if (key === 'required') return cur.every((x) => old.includes(x));
    if (['oneOf', 'anyOf', 'enum'].includes(key)) return old.every((o) => cur.some((c) => widens(o, c)));
    return old.length === cur.length && old.every((o, i) => widens(o, cur[i]));
  }
  if (!old || typeof old !== 'object') return old === cur;
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return false;
  const grows = key === 'properties' || key === '$defs';
  return Object.keys(old).every((k) => WORDING.has(k) || (k in cur && widens(old[k], cur[k], k)))
    && Object.keys(cur).every((k) => WORDING.has(k) || k in old || grows);
}

// Events are stricter: a kit checks each type it knows exactly, so an older kit refuses a new field, key or value on
// a known type, and only a new type reaches its catch-all. Every frozen branch stays word for word, a new branch is a
// strict shape for a new type, and `newer` lists exactly the types the branches name. Nothing else changes.
const plain = (s) => JSON.stringify(s, (k, v) => (WORDING.has(k) ? undefined : v));
const typeOf = (b) => { const t = b.properties?.t ?? {}; return Object.keys(t).every((k) => k === 'const' || WORDING.has(k)) ? t.const : undefined; };
const typesOf = (s) => new Set(['pub', 'prv'].flatMap((ch) => s.$defs[ch].oneOf.map(typeOf)));
const rest = (s) => { const r = structuredClone(s); delete r.$defs.pub.oneOf; delete r.$defs.prv.oneOf; delete r.$defs.newer.properties.t.not.enum; return r; };
function addsOnlyTypes(old, cur) {
  const known = typesOf(old);
  const strictNew = (b) => typeof typeOf(b) === 'string' && !known.has(typeOf(b)) && b.type === 'object' && b.additionalProperties === false && b.required?.includes('t');
  const kept = (ch) => {
    const before = new Set(old.$defs[ch].oneOf.map(plain));
    const after = new Set(cur.$defs[ch].oneOf.map(plain));
    return [...before].every((b) => after.has(b)) && cur.$defs[ch].oneOf.every((b) => before.has(plain(b)) || strictNew(b));
  };
  const listed = cur.$defs.newer.properties.t.not.enum;
  const named = typesOf(cur);
  const restOld = rest(old);
  const restCur = rest(cur);
  return kept('pub') && kept('prv') && listed.length === named.size && listed.every((t) => named.has(t))
    && Object.keys(restOld.$defs).every((k) => plain(restOld.$defs[k]) === plain(restCur.$defs[k]))
    && plain({ ...restOld, $defs: null }) === plain({ ...restCur, $defs: null });
}

// Each published format, its version, its frozen copy's name and its growth rule. The frozen copy is the schema as
// that version was first held to ADR 027; a breaking change bumps the version and freezes the new schema beside it.
// A CLI --json schema joins this list with `widens`.
const FORMATS = [
  ['src/evidence/event.schema.json', (s) => s.$defs.pub.oneOf.find((b) => b.properties.t.const === 'open').properties.v.const, 'event', addsOnlyTypes],
  ['bin/commands/simulate.schema.json', (s) => s.properties.v.const, 'simulate', widens],
];

test.each(FORMATS)('%s only grows within its version, or bumps it', (file, versionOf, name, grows) => {
  const cur = JSON.parse(readFileSync(file, 'utf8'));
  const frozen = `test/fixtures/schemas/${name}.v${versionOf(cur)}.json`;
  expect(existsSync(frozen), `${file} is at version ${versionOf(cur)}, which has no frozen copy. After a breaking change, copy the schema to ${frozen}.`).toBe(true);
  expect(grows(JSON.parse(readFileSync(frozen, 'utf8')), cur), `${file} changed what ${frozen} defines. Add instead, or bump the version (ADR 027).`).toBe(true);
});

const v2 = JSON.parse(readFileSync('test/fixtures/schemas/event.v2.json', 'utf8'));
const editNote = (rule, fn) => { const s = structuredClone(v2); fn(s.$defs.prv.oneOf.find((b) => b.properties.t.const === 'note'), s); return rule(v2, s); };
const RETYPE = (b) => { b.properties.text.type = 'integer'; };
const RENAME = (b) => { b.properties.body = b.properties.text; delete b.properties.text; b.required = ['n', 'h', 't', 'scope', 'body']; };
const NARROW = (b) => { b.properties.text.maxLength = 100; };
const REQUIRE = (b) => { b.properties.lang = { type: 'string' }; b.required.push('lang'); };
const OPTIONAL = (b) => { b.properties.lang = { type: 'string' }; };
const REWORD = (b) => { b.description = 'Reworded.'; };
const UNLISTED = (b, s) => { s.$defs.prv.oneOf.push({ ...structuredClone(b), properties: { ...b.properties, t: { const: 'memo' } } }); };
const NEW_TYPE = (b, s) => { UNLISTED(b, s); s.$defs.newer.properties.t.not.enum.push('memo'); };
const NEW_KEY = (_, s) => { s.$defs.pub.oneOf.push({ ...structuredClone(s.$defs.pub.oneOf[2]), properties: { ...s.$defs.pub.oneOf[2].properties, k: { const: 'session.extra' } } }); };
const REDEFINE = (b, s) => { s.$defs.prv.oneOf.push({ ...structuredClone(b), properties: { ...b.properties, t: { enum: ['note'] }, verdict: { type: 'string' } } }); };
const CATCH_ALL = (_, s) => { s.oneOf.push({ type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'] }); };

test('the growth checks refuse a retyped, renamed, narrowed or newly required field; only widens allows a new optional one', () => {
  const edits = [RETYPE, RENAME, NARROW, REQUIRE, OPTIONAL, REWORD, NEW_TYPE, NEW_KEY];
  expect(edits.map((fn) => editNote(widens, fn))).toEqual([false, false, false, false, true, true, true, true]);
  expect(edits.map((fn) => editNote(addsOnlyTypes, fn))).toEqual([false, false, false, false, false, true, true, false]);
});

test('the event growth check refuses a new type left off newer\'s list, a second shape for a known type and a new top-level branch', () => {
  expect([UNLISTED, REDEFINE, CATCH_ALL].map((fn) => editNote(addsOnlyTypes, fn))).toEqual([false, false, false]);
});

test('the writer, the schema\'s branches and newer\'s list name the same types on the same streams', () => {
  const branches = Object.fromEntries(['pub', 'prv'].flatMap((ch) => schema.$defs[ch].oneOf.map((b) => [b.properties.t.const, ch])));
  expect([branches, [...schema.$defs.newer.properties.t.not.enum].sort()]).toEqual([{ ...STREAM_OF }, Object.keys(STREAM_OF).sort()]);
});
