export const DRIFT_MS = 60_000;
export const wallOf = (h) => parseInt(h.slice(0, 12), 16);
const stamp = (wall, c) => `${wall.toString(16).padStart(12, '0')}.${c.toString(16).padStart(4, '0')}`;

// A hybrid logical clock: every stamp this laptop writes sorts after everything it has seen, and a colleague's clock
// that runs far ahead moves ours by at most DRIFT_MS, so one wrong clock cannot drag everyone's stamps with it.
export function createClock(physical = Date.now) {
  let wall = 0;
  let c = 0;
  return {
    now() {
      const p = physical();
      if (p > wall) { wall = p; c = 0; } else c++;
      return stamp(wall, c);
    },
    receive(h) {
      const w = Math.min(wallOf(h), physical() + DRIFT_MS);
      const k = parseInt(h.slice(13), 16);
      if (w > wall) { wall = w; c = k; } else if (w === wall) c = Math.max(c, k);
    },
  };
}
