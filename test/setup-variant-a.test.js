// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import a from '../src/components/setup-variants/a.js';

const rounds = [
  { id: 'first', name: 'First round', minutes: 45, deepDiveMinutes: 15 },
  { id: 'second', name: 'Second round', minutes: 60, deepDiveMinutes: 20 },
];
const T = new Date(2026, 9, 23, 14, 15).getTime();
const startOptions = [{ label: 'Now', value: null }, { label: '2:15 PM (in 8 min)', value: T }, { label: '2:30 PM (in 23 min)', value: T + 900_000 }];

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(T - 8 * 60_000);

function mount(candidate = '') {
  const start = vi.fn();
  const ctx = { rounds, candidate, startOptions, start };
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
    [...el.querySelectorAll('.setup-a-chip')].map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
    [...el.querySelectorAll('.setup-a-card')].map((c) => c.textContent.trim().replace(/\s+/g, ' '))]).toEqual([
    'Start an interview', 'Ada', ['Now', '2:15 PM in 8 min', '2:30 PM in 23 min', 'Other time…'],
    ['First round 45 min round, 15 min deep dive', 'Second round 60 min round, 20 min deep dive']]);
});

test('Start with Now and the first round starts that round with no start time', () => {
  const { el, start } = mount('Ada');
  el.querySelector('.setup-a-start').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'first', candidate: 'Ada', startedAt: undefined });
});

test('a chosen slot and round start at that slot', () => {
  const { el, start } = mount('Ada');
  el.querySelectorAll('.setup-a-chip input')[2].click();
  el.querySelectorAll('.setup-a-card input')[1].click();
  el.querySelector('.setup-a-start').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'second', candidate: 'Ada', startedAt: T + 900_000 });
});

test('Other time reveals the date field and starts at the typed time', () => {
  const { el, start } = mount('Ada');
  const other = el.querySelector('.setup-a-other');
  const hiddenBefore = other.hidden;
  el.querySelectorAll('.setup-a-chip input')[3].click();
  el.querySelector('.setup-a-other input').value = '2026-10-23T16:00';
  el.querySelector('.setup-a-start').click();
  expect([hiddenBefore, other.hidden, start.mock.calls[0][0].startedAt]).toEqual([true, false, new Date('2026-10-23T16:00').getTime()]);
});

test('Start is blocked without a name, and turns on once one is typed', () => {
  const { el, start } = mount('');
  const button = el.querySelector('.setup-a-start');
  const before = button.disabled;
  button.click();
  type(el, '   ');
  const blank = button.disabled;
  type(el, 'Grace');
  button.click();
  expect([before, blank, button.disabled, start.mock.calls]).toEqual([true, true, false, [[{ roundId: 'first', candidate: 'Grace', startedAt: undefined }]]]);
});

const pickOther = (el, value) => {
  el.querySelectorAll('.setup-a-chip input')[3].click();
  const input = el.querySelector('.setup-a-other input');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

test('Other time with no date, or one outside a day back to a week ahead, turns Start off and says why', () => {
  const { el, start } = mount('Ada');
  const button = el.querySelector('.setup-a-start');
  const note = el.querySelector('.setup-a-note');
  pickOther(el, '');
  const empty = [button.disabled, note.hidden, note.textContent];
  button.click();
  pickOther(el, '2027-01-01T09:00');
  const far = button.disabled;
  pickOther(el, '2026-10-23T16:00');
  expect([empty, far, button.disabled, note.hidden, start.mock.calls.length]).toEqual([[true, false, 'Pick a start time from a day ago to a week ahead.'], true, false, true, 0]);
});

test('the Other time field is limited to a day back and a week ahead', () => {
  const input = mount('Ada').el.querySelector('.setup-a-other input');
  expect([input.min, input.max]).toEqual(['2026-10-22T14:07', '2026-10-30T14:07']);
});

test('the half-minute refresh moves the slots on and keeps the picked one, now in the past', () => {
  const { el, refresh } = mount('Ada');
  el.querySelectorAll('.setup-a-chip input')[1].click();
  const now = T + 10 * 60_000;
  vi.setSystemTime(now);
  refresh(now);
  const chips = [...el.querySelectorAll('.setup-a-chip input')].map((input) => [Number(input.value) || input.value, input.checked]);
  const sub = el.querySelector('.setup-a-chip:has(:checked) .setup-a-sub').textContent;
  const input = el.querySelector('.setup-a-other input');
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
