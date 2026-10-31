import { STREAM_OF } from './events.js';

// Hand-written so the browser never ships Ajv; event.schema.json stays the spec and test/evidence/check.test.js
// proves the two agree. Lengths count code points, as the schema's maxLength does.
const str = (v, max, min = 0) => typeof v === 'string' && v.length >= min && (v.length <= max || [...v].length <= max);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const re = (r) => (v) => typeof v === 'string' && r.test(v);
const bool = (v) => typeof v === 'boolean';
const any = () => true;
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const REF = (v) => str(v, 200, 1);
const ID = re(/^[a-z0-9][a-z0-9-]{0,63}$/);
const SEG = re(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/);
const shape = (v, req, opt = {}) => obj(v) && Object.keys(v).every((k) => k in req || k in opt)
  && Object.entries(req).every(([k, ok]) => k in v && ok(v[k])) && Object.entries(opt).every(([k, ok]) => !(k in v) || ok(v[k]));

export const MAX_PLANNED_MINUTES = 1440;
const base = { n: (v) => int(v, 0, Number.MAX_SAFE_INTEGER), h: re(/^[0-9a-f]{12}\.[0-9a-f]{4}$/), t: any };
const PUT = {
  'session.candidate': { v: (x) => str(x, 120) },
  'session.startedAt': { v: re(/^[0-9a-f]{12}$/) },
  'session.length': { v: (x) => int(x, 0, MAX_PLANNED_MINUTES) },
  'segment.minutes': { seg: SEG, v: (x) => int(x, 0, 180) },
  'segment.fallback': { seg: SEG, v: bool },
};
const MEMBER = {
  'session.passions': { id: ID, v: (x) => x === null || str(x, 60, 1) },
  'segment.pools': { seg: SEG, id: ID, v: (x) => x === true || x === null },
  'segment.asked': { seg: SEG, id: ID, v: (x) => x === true || x === null },
};
const keyed = (table) => (e) => Object.hasOwn(table, e.k) && shape(e, { ...base, k: any, ...table[e.k] });
const RULES = {
  open: (e) => shape(e, { ...base, v: (x) => x === 2, sid: REF, author: REF, role: ID, round: ID, pack: (p) => shape(p, { id: REF, version: (x) => str(x, 40), sha: (x) => str(x, 64) }) }),
  name: (e) => shape(e, { ...base, name: (x) => str(x, 80, 1) }),
  put: keyed(PUT),
  member: keyed(MEMBER),
  decided: (e) => shape(e, base),
  mark: (e) => shape(e, { ...base, o: REF, d: re(/^[0-9a-f]{8}$/), s: (x) => x === 'seen' || x === 'unseen' || x === 'clear' }),
  prompt: (e) => shape(e, { ...base, p: REF }, { given: bool }),
  note: (e) => shape(e, { ...base, scope: REF, text: (x) => str(x, 8000) }),
  close: (e) => shape(e, { ...base, item: REF, closed: bool }),
  focus: (e) => shape(e, { ...base, level: ID }),
  decide: (e) => shape(e, { ...base, choice: ID, why: (x) => str(x, 4000) }, { level: ID }),
  peek: (e) => shape(e, { ...base, from: REF }),
};
const on = (stream) => (e) => obj(e) && STREAM_OF[e.t] === stream && RULES[e.t](e);

export const checkPub = on('pub');
export const checkPrv = on('prv');
export const checkEvent = (e) => checkPub(e) || checkPrv(e);
