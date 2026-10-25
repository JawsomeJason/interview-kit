import { expect, test } from 'vitest';
import { fromLocalInput, otherRange, startOptions } from '../src/start-time.js';

const at = (h, m) => Date.UTC(2026, 9, 23, h, m);

test('the start choices are Now, then every quarter hour from 30 minutes before now to 2 hours after', () => {
  expect(startOptions(at(14, 7)).map((o) => o.value)).toEqual([
    null, at(13, 45), at(14, 0), at(14, 15), at(14, 30), at(14, 45), at(15, 0), at(15, 15), at(15, 30), at(15, 45), at(16, 0),
  ]);
});

test('each slot says how far it is from now', () => {
  const labels = startOptions(at(14, 7)).map((o) => o.label);
  expect([labels[0], labels[1].endsWith('(22 min ago)'), labels[3].endsWith('(in 8 min)'), labels.at(-1).endsWith('(in 1 h 53 min)')])
    .toEqual(['Now', true, true, true]);
});

const local = (d, h, m) => new Date(2026, 9, d, h, m).getTime();

test('an Other time value is read as local time, and an empty one as no time', () => {
  expect([fromLocalInput('2026-10-23T14:15', local(23, 14, 7)), fromLocalInput('', local(23, 14, 7))]).toEqual([local(23, 14, 15), undefined]);
});

test('an Other time counts only from a day before now to a week after', () => {
  const now = local(23, 14, 0);
  expect(['2026-10-22T14:00', '2026-10-22T13:59', '2026-10-30T14:00', '2026-10-30T14:01', '0001-01-01T00:00'].map((v) => fromLocalInput(v, now)))
    .toEqual([local(22, 14, 0), undefined, local(30, 14, 0), undefined, undefined]);
});

test('the Other time field is limited to that same window', () => {
  expect(otherRange(local(23, 14, 7))).toEqual({ min: '2026-10-22T14:07', max: '2026-10-30T14:07' });
});

test('a picked slot that has slipped out of the window stays in the list, in time order', () => {
  expect(startOptions(at(14, 50), at(14, 0)).map((o) => o.value).slice(0, 4)).toEqual([null, at(14, 0), at(14, 30), at(14, 45)]);
});
