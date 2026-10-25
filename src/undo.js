import { save } from './store.js';

// Memory only: a reload, a newer change or 10 seconds drops it.
let snapshot = null;
let timer;

// New interview clears everything but the round, which the setup page picks for you next time.
export const newInterview = (state) => ({ lastRound: state.round ?? state.lastRound });

export function commit(state) {
  snapshot = null;
  clearTimeout(timer);
  save(state);
}

export function commitUndoable(prev, next, route, onExpire) {
  commit(next);
  snapshot = { state: structuredClone(prev), route };
  timer = setTimeout(() => { snapshot = null; onExpire(); }, 10_000);
}

export const canUndo = () => snapshot !== null;

export function undo() {
  const restored = snapshot;
  commit(restored.state);
  return restored;
}
