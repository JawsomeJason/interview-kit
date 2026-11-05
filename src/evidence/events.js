// pub syncs live to every admitted member; prv stays on this laptop until both sides have decided.
export const STREAM_OF = Object.freeze({
  open: 'pub', name: 'pub', put: 'pub', member: 'pub', decided: 'pub', 'segment.start': 'pub', 'segment.done': 'pub', skip: 'pub',
  mark: 'prv', prompt: 'prv', note: 'prv', close: 'prv', focus: 'prv', decide: 'prv', peek: 'prv', amend: 'prv', bookmark: 'prv', marking: 'prv',
});
// A type from a newer kit (ADR 027): kept in its stream, never folded, shown only as from a newer kit.
export const isNewer = (e) => !Object.hasOwn(STREAM_OF, e.t);
