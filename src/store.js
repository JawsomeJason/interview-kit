const KEY = 'interview-kit';

export function load() {
  try {
    const { round, deepDive, ticks, notes, done, candidate, startedAt, lastRound } = JSON.parse(localStorage.getItem(KEY)) || {};
    return { round, deepDive, ticks, notes, done, candidate, startedAt, lastRound };
  } catch {
    return {};
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
