import { expect, test } from 'vitest';
import { fit, fitPlan } from '../../src/model/fit.js';

const frames = [{ seg: 'intro', minutes: 5, frame: true }, { seg: 'outro', minutes: 10, frame: true }];
const hour = (...activities) => [frames[0], ...activities, frames[1]];

test('a plan that already fills the length comes back as it was', () => {
  expect(fit(hour({ seg: 'resume', minutes: 25 }, { seg: 'deep', minutes: 20 }), 60))
    .toEqual({ minutes: { intro: 5, resume: 25, deep: 20, outro: 10 }, spare: 0, short: 0 });
});

test('the other activities absorb a change in proportion, and frames never move', () => {
  expect(fit(hour({ seg: 'resume', minutes: 35 }, { seg: 'deep', minutes: 20 }), 60, { changed: 'resume' }).minutes)
    .toEqual({ intro: 5, resume: 35, deep: 10, outro: 10 });
  expect(fit(hour({ seg: 'a', minutes: 15 }, { seg: 'b', minutes: 20 }, { seg: 'c', minutes: 10 }), 60, { changed: 'a' }).minutes)
    .toEqual({ intro: 5, a: 15, b: 20, c: 10, outro: 10 });
  expect(fit(hour({ seg: 'a', minutes: 30 }, { seg: 'b', minutes: 20 }, { seg: 'c', minutes: 10 }), 60, { changed: 'a' }).minutes)
    .toEqual({ intro: 5, a: 30, b: 10, c: 5, outro: 10 });
});

test('an activity that is off stays off, and removing one grows the rest', () => {
  expect(fit(hour({ seg: 'resume', minutes: 25 }, { seg: 'deep', minutes: 0 }, { seg: 'pr', minutes: 0 }), 60, { changed: 'deep' }).minutes)
    .toEqual({ intro: 5, resume: 45, deep: 0, pr: 0, outro: 10 });
});

test('no activity shrinks below its floor, so the changed one gives way', () => {
  expect(fit(hour({ seg: 'pr', minutes: 45, floor: 20 }, { seg: 'roomba', minutes: 35, floor: 25 }), 60, { changed: 'roomba' }))
    .toEqual({ minutes: { intro: 5, pr: 20, roomba: 25, outro: 10 }, spare: 0, short: 0 });
});

test('floors that cannot fit report how many minutes short the length is', () => {
  expect(fit(hour({ seg: 'pr', minutes: 45, floor: 20 }, { seg: 'roomba', minutes: 35, floor: 25 }, { seg: 'x', minutes: 10, floor: 10 }), 60, { changed: 'x' }))
    .toEqual({ minutes: { intro: 5, pr: 20, roomba: 25, x: 10, outro: 10 }, spare: 0, short: 10 });
});

test('a pinned activity keeps its minutes', () => {
  expect(fit(hour({ seg: 'a', minutes: 10 }, { seg: 'b', minutes: 20 }, { seg: 'c', minutes: 20 }), 60, { changed: 'a', pinned: ['b'] }).minutes)
    .toEqual({ intro: 5, a: 10, b: 20, c: 15, outro: 10 });
});

test('with nothing else to absorb it, a short activity leaves spare time and a long one is cut to fit', () => {
  expect(fit(hour({ seg: 'roomba', minutes: 35, floor: 25 }), 60, { changed: 'roomba' })).toEqual({ minutes: { intro: 5, roomba: 35, outro: 10 }, spare: 10, short: 0 });
  expect(fit(hour({ seg: 'roomba', minutes: 70, floor: 25 }), 60, { changed: 'roomba' })).toEqual({ minutes: { intro: 5, roomba: 45, outro: 10 }, spare: 0, short: 0 });
});

test('any feasible plan adds up to the length in whole minutes, twice over', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 500; i += 1) {
    const activities = Array.from({ length: 1 + rand(4) }, (_, k) => ({ seg: `s${k}`, minutes: rand(60), floor: rand(3) ? undefined : 5 + rand(20) }));
    const plan = hour(...activities);
    const changed = `s${rand(activities.length)}`;
    const out = fit(plan, 60, { changed });
    const total = Object.values(out.minutes).reduce((a, b) => a + b, 0);
    expect(Object.values(out.minutes).every((m) => Number.isInteger(m) && m >= 0)).toBe(true);
    expect(total + out.spare - out.short).toBe(60);
    expect(fit(plan.map((s) => ({ ...s, minutes: out.minutes[s.seg] })), 60, { changed }).minutes).toEqual(out.minutes);
  }
});

test('fitPlan shares in steps of 5 when every length is a multiple of 5, and in single minutes when one is not', () => {
  const plan = (resume, deep) => [{ seg: 'intro', minutes: 5, frame: true }, { seg: 'resume', minutes: resume }, { seg: 'deep', minutes: deep, floor: 8 }, { seg: 'roomba', minutes: 45, floor: 25 }];
  expect(fitPlan(plan(25, 20), 60)).toEqual({ minutes: { intro: 5, resume: 15, deep: 10, roomba: 30 }, spare: 0, short: 0 });
  expect(fitPlan(plan(25, 21), 60)).toEqual({ minutes: { intro: 5, resume: 15, deep: 13, roomba: 27 }, spare: 0, short: 0 });
});
