// pub syncs live to every admitted member; prv stays on this laptop until both sides have decided.
export const STREAM_OF = Object.freeze({
  open: 'pub', name: 'pub', put: 'pub', member: 'pub', decided: 'pub',
  mark: 'prv', prompt: 'prv', note: 'prv', close: 'prv', focus: 'prv', decide: 'prv', peek: 'prv',
});
