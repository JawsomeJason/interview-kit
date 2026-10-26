// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import a from '../src/components/setup-page.js';

const rounds = [
  { id: 'first', name: 'First round', minutes: 45, deepDiveMinutes: 15 },
  { id: 'second', name: 'Second round', minutes: 60, deepDiveMinutes: 20 },
];
const parts = { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } };
const T = new Date(2026, 9, 23, 14, 15).getTime();
const startOptions = [{ label: 'Now', value: null }, { label: '2:15 PM (in 8 min)', value: T }, { label: '2:30 PM (in 23 min)', value: T + 900_000 }];

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(T - 8 * 60_000);

function mount(candidate = '') {
  const start = vi.fn();
  const ctx = { rounds, parts, candidate, startOptions, start };
  document.body.innerHTML = a.render(ctx);
  const el = document.body.firstElementChild;
  const refresh = a.bind(el, ctx);
  return { el, start, refresh };
}
const type = (el, name) => {
  const field = el.querySelector('.candidate-field');
  field.value = name;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

test('renders the name field first, then the start chips and a card for each round', () => {
  const { el } = mount('Ada');
  expect([el.querySelector('h1').textContent, el.querySelector('.candidate-field').value,
    [...el.querySelectorAll('.setup-chip')].map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
    [...el.querySelectorAll('.setup-card')].map((c) => c.textContent.trim().replace(/\s+/g, ' '))]).toEqual([
    'Start an interview', 'Ada', ['Now', '2:15 PM in 8 min', '2:30 PM in 23 min', 'Other time…'],
    ['First round 45 min round, 15 min deep dive', 'Second round 60 min round, 20 min deep dive']]);
});

test('Start with Now and the first round starts that round with no start time', () => {
  const { el, start } = mount('Ada');
  el.querySelector('.setup-start').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'first', candidate: 'Ada', startedAt: undefined });
});

test('a chosen slot and round start at that slot', () => {
  const { el, start } = mount('Ada');
  el.querySelectorAll('.setup-chip input')[2].click();
  el.querySelectorAll('.setup-card input')[1].click();
  el.querySelector('.setup-start').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'second', candidate: 'Ada', startedAt: T + 900_000 });
});

test('Other time reveals the date field and starts at the typed time', () => {
  const { el, start } = mount('Ada');
  const other = el.querySelector('.setup-other');
  const hiddenBefore = other.hidden;
  el.querySelectorAll('.setup-chip input')[3].click();
  el.querySelector('.setup-other input').value = '2026-10-23T16:00';
  el.querySelector('.setup-start').click();
  expect([hiddenBefore, other.hidden, start.mock.calls[0][0].startedAt]).toEqual([true, false, new Date('2026-10-23T16:00').getTime()]);
});

test('Start is blocked without a name, and turns on once one is typed', () => {
  const { el, start } = mount('');
  const button = el.querySelector('.setup-start');
  const before = button.disabled;
  button.click();
  type(el, '   ');
  const blank = button.disabled;
  type(el, 'Grace');
  button.click();
  expect([before, blank, button.disabled, start.mock.calls]).toEqual([true, true, false, [[{ roundId: 'first', candidate: 'Grace', startedAt: undefined }]]]);
});

const pickOther = (el, value) => {
  el.querySelectorAll('.setup-chip input')[3].click();
  const input = el.querySelector('.setup-other input');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

test('Other time with no date, or one outside a day back to a week ahead, turns Start off and says why', () => {
  const { el, start } = mount('Ada');
  const button = el.querySelector('.setup-start');
  const note = el.querySelector('.setup-note');
  pickOther(el, '');
  const empty = [button.disabled, note.hidden, note.textContent];
  button.click();
  pickOther(el, '2027-01-01T09:00');
  const far = button.disabled;
  pickOther(el, '2026-10-23T16:00');
  expect([empty, far, button.disabled, note.hidden, start.mock.calls.length]).toEqual([[true, false, 'Pick a start time from a day ago to a week ahead.'], true, false, true, 0]);
});

test('the Other time field is limited to a day back and a week ahead', () => {
  const input = mount('Ada').el.querySelector('.setup-other input');
  expect([input.min, input.max]).toEqual(['2026-10-22T14:07', '2026-10-30T14:07']);
});

test('the half-minute refresh moves the slots on and keeps the picked one, now in the past', () => {
  const { el, refresh } = mount('Ada');
  el.querySelectorAll('.setup-chip input')[1].click();
  const now = T + 10 * 60_000;
  vi.setSystemTime(now);
  refresh(now);
  const chips = [...el.querySelectorAll('.setup-chip input')].map((input) => [Number(input.value) || input.value, input.checked]);
  const sub = el.querySelector('.setup-chip:has(:checked) .setup-sub').textContent;
  const input = el.querySelector('.setup-other input');
  vi.setSystemTime(T - 8 * 60_000);
  expect([chips, sub, new Date(input.min).getTime()]).toEqual([
    [['', false], [T, true], [T + 900_000, false], [T + 1_800_000, false], [T + 2_700_000, false], [T + 3_600_000, false], ['other', false]],
    '10 min ago', now - 86_400_000]);
});

test('Enter in the name field starts, once Start is on', () => {
  const blank = mount('');
  blank.el.querySelector('.candidate-field').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const { el, start } = mount('');
  type(el, 'Ada');
  el.querySelector('.candidate-field').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect([blank.start.mock.calls.length, start.mock.calls]).toEqual([0, [[{ roundId: 'first', candidate: 'Ada', startedAt: undefined }]]]);
});

// Your hour, as the interviewer reads it: the day when it isn't today, each step's start time, name and length, and the end.
const hour = (el) => [el.querySelector('.setup-plan-title').textContent, el.querySelector('.setup-plan-day')?.textContent ?? null,
  [...el.querySelectorAll('.setup-plan-step')].map((row) => [...row.children].map((c) => c.textContent)),
  el.querySelector('.setup-plan-end').textContent];

test('Your hour lays out the picked round from Now in clock times, with its end', () => {
  expect(hour(mount('Ada').el)).toEqual(['Your hour', null,
    [['2:07 PM', 'Intro', '5 min'], ['2:12 PM', 'First round', '20 min'], ['2:32 PM', 'Deep dive', '15 min'], ['2:47 PM', 'Outro', '5 min']],
    'Ends at 2:52 PM']);
});

test('Your hour follows the round and the start slot picked', () => {
  const { el } = mount('Ada');
  el.querySelectorAll('.setup-chip input')[2].click();
  el.querySelectorAll('.setup-card input')[1].click();
  expect(hour(el)).toEqual(['Your hour', null,
    [['2:30 PM', 'Intro', '5 min'], ['2:35 PM', 'Second round', '30 min'], ['3:05 PM', 'Deep dive', '20 min'], ['3:25 PM', 'Outro', '5 min']],
    'Ends at 3:30 PM']);
});

test('Your hour names the day for an Other time on another day', () => {
  const { el } = mount('Ada');
  pickOther(el, '2026-10-24T09:00');
  expect(hour(el)).toEqual(['Your hour', 'Saturday, October 24',
    [['9:00 AM', 'Intro', '5 min'], ['9:05 AM', 'First round', '20 min'], ['9:25 AM', 'Deep dive', '15 min'], ['9:40 AM', 'Outro', '5 min']], 'Ends at 9:45 AM']);
});

test('while Other time is empty or out of range, Your hour asks for a start instead of showing an hour that will not happen', () => {
  const { el } = mount('Ada');
  pickOther(el, '2027-01-01T09:00');
  const far = el.querySelector('.setup-plan-card').textContent.trim();
  pickOther(el, '');
  expect([far, el.querySelector('.setup-plan-card').textContent.trim(), el.querySelectorAll('.setup-plan-step').length])
    .toEqual(['Set a start time to see the hour.', 'Set a start time to see the hour.', 0]);
});

test('with Now picked, the half-minute refresh moves Your hour on to the new time', () => {
  const { el, refresh } = mount('Ada');
  const now = T + 10 * 60_000;
  vi.setSystemTime(now);
  refresh(now);
  const steps = [...el.querySelectorAll('.setup-plan-step .setup-plan-at')].map((at) => at.textContent);
  vi.setSystemTime(T - 8 * 60_000);
  expect([steps, el.querySelector('.setup-plan-end').textContent]).toEqual([['2:25 PM', '2:30 PM', '2:50 PM', '3:05 PM'], 'Ends at 3:10 PM']);
});
