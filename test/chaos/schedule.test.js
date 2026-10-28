import { expect, test } from 'vitest';
import { OPS, schedules } from './schedule.js';

test('the same seed gives the same 1,000 schedules, each with 3 to 5 members and a few to a dozen actions', () => {
  const a = schedules({ seed: 7, runs: 1000 });
  const b = schedules({ seed: 7, runs: 1000 });
  expect(a).toEqual(b);
  expect(a.length).toBe(1000);
  expect(a.map((s) => s.index)).toEqual([...Array(1000).keys()]);
  const members = new Set(a.map((s) => s.members));
  expect([...members].sort()).toEqual([3, 4, 5]);
  expect(a.every((s) => s.actions.length >= 4 && s.actions.length <= 12)).toBe(true);
  expect(a.every((s) => s.actions.every((act) => OPS.includes(act.op)))).toBe(true);
  expect(schedules({ seed: 8, runs: 1000 })).not.toEqual(a);
});

test('members change rarely, so a room serves many schedules, and every fault is healed and timed within the schedule', () => {
  const all = schedules({ seed: 7, runs: 1000 });
  const changes = all.filter((s, i) => i && s.members !== all[i - 1].members).length;
  expect(changes).toBeGreaterThan(20);
  expect(changes).toBeLessThan(150);
  for (const s of all) {
    for (const act of s.actions) {
      if ('who' in act) expect(act.who).toBeLessThan(s.members);
      if (act.op === 'partition') expect(act.mask > 0 && act.mask < (1 << s.members) - 1).toBe(true);
      if (act.op === 'jump') expect([3_000, 10_000, 12_000, 60_000]).toContain(act.ms);
    }
    expect(s.actions.at(-1)).toEqual({ op: 'heal' });
  }
  const ops = Object.fromEntries(OPS.map((op) => [op, all.flatMap((s) => s.actions).filter((a) => a.op === op).length]));
  expect(Object.values(ops).every((n) => n > 50)).toBe(true);
});
