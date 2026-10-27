// Hand-written so the browser never ships Ajv. wire.schema.json stays the spec and test/sync/wire-check.test.js proves
// the two agree. The events inside an events body are checked by the host against their stream when it ingests them,
// since a plugin imports nothing outside its folder. Lengths count code points, as the schema's maxLength does.
const str = (v, max, min = 0) => typeof v === 'string' && v.length >= min && (v.length <= max || [...v].length <= max);
const int = (v) => Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const re = (r) => (v) => typeof v === 'string' && r.test(v);
const bool = (v) => typeof v === 'boolean';
const any = () => true;
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const shape = (v, req, opt = {}) => obj(v) && Object.keys(v).every((k) => k in req || k in opt)
  && Object.entries(req).every(([k, ok]) => k in v && ok(v[k])) && Object.entries(opt).every(([k, ok]) => !(k in v) || ok(v[k]));

const REF = (v) => str(v, 200, 1);
const ID = re(/^[a-z0-9][a-z0-9-]{0,63}$/);
const B64 = (v) => re(/^[A-Za-z0-9_-]+$/)(v) && v.length <= 400;
const CH = (v) => v === 'pub' || v === 'prv';
const PACK = (p) => shape(p, { id: REF, version: (x) => str(x, 40), sha: (x) => str(x, 64) });
const VECTOR = (v) => obj(v) && Object.values(v).every((c) => shape(c, { pub: int }, { prv: int }));
const EVENTS = (x) => Array.isArray(x) && x.length <= 500 && [...x].every(obj);
const keyed = { key: B64, wrapped: B64 };
const BODY = {
  knock: (b) => shape(b, { t: any, name: (x) => str(x, 80, 1), key: B64 }),
  admit: (b) => shape(b, { t: any, ...keyed }),
  refuse: (b) => shape(b, { t: any }),
  rekey: (b) => shape(b, { t: any, ...keyed }),
  hello: (b) => shape(b, { t: any, role: ID, round: ID, have: VECTOR }),
  pull: (b) => shape(b, { t: any, author: REF, ch: CH, since: int }),
  events: (b) => shape(b, { t: any, author: REF, ch: CH, more: bool, events: EVENTS }),
  deny: (b) => shape(b, { t: any, author: REF, ch: (x) => x === 'prv', why: (x) => x === 'not-decided' || x === 'peer-not-decided' }),
  where: (b) => shape(b, { t: any, route: (x) => str(x, 200), following: (x) => x === null || str(x, 200), visible: bool }),
  ping: (b) => shape(b, { t: any }),
  pong: (b) => shape(b, { t: any }),
  bye: (b) => shape(b, { t: any }),
  unsupported: (b) => shape(b, { t: any }),
  rtc: (b) => shape(b, { t: any, data: obj }),
};
const ADDRESSED = new Set(['admit', 'refuse', 'rekey', 'pull', 'events', 'deny', 'rtc', 'unsupported']);

export const checkWire = (m) => shape(m, { v: (x) => x === 2, id: re(/^[0-9a-f]{16}$/), from: REF, sid: REF, pack: PACK, body: (b) => obj(b) && Object.hasOwn(BODY, b.t) && BODY[b.t](b) }, { to: REF })
  && ADDRESSED.has(m.body.t) === ('to' in m);
