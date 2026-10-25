// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import c from '../src/components/setup-variants/c.js';
import { SETUPS } from '../src/components/setup-variants/index.js';

afterEach(() => vi.useRealTimers());

const rounds = [
  { id: 'design', name: 'Design review', minutes: 45, deepDiveMinutes: 15 },
  { id: 'pair', name: 'Pair programming', minutes: 50, deepDiveMinutes: 20 },
];
const startOptions = [{ label: 'Now', value: null }];

function mount(candidate = '', round = null) {
  const start = vi.fn();
  const ctx = { rounds, round, candidate, startOptions, start };
  document.body.innerHTML = c.render(ctx);
  const el = document.body.firstElementChild;
  const refresh = c.bind(el, ctx);
  return { el, start, refresh };
}
const type = (el, selector, value, event = 'input') => {
  const field = el.querySelector(selector);
  field.value = value;
  field.dispatchEvent(new Event(event, { bubbles: true }));
};
const text = (el) => [...el.querySelectorAll('.plan-step')].map((s) => [...s.children].map((n) => n.textContent).join(' '));

test('is registered as c, labelled Plan preview, with a name field and a radio per round', () => {
  const { el } = mount();
  expect([SETUPS.c.label, el.querySelectorAll('.candidate-field').length, [...el.querySelectorAll('[name="plan-round"]')].map((r) => r.value),
    el.querySelector('h1').textContent]).toEqual(['Plan preview', 1, ['design', 'pair'], 'Plan the interview']);
});

test('picking a start and a round starts that round with the name and the chosen time', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el, start } = mount('Ada');
  el.querySelector('[value="pair"]').click();
  el.querySelector('.setup-start-select').value = 'other';
  el.querySelector('.setup-start-select').dispatchEvent(new Event('change', { bubbles: true }));
  type(el, '.setup-start-other', '2026-10-23T14:15');
  el.querySelector('.plan-go').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'pair', candidate: 'Ada', startedAt: new Date(2026, 9, 23, 14, 15).getTime() });
});

test('Now starts with no start time', () => {
  const { el, start } = mount('Ada');
  el.querySelector('.plan-go').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'design', candidate: 'Ada', startedAt: undefined });
});

test('Start is disabled without a name', () => {
  const { el } = mount('  ');
  expect([el.querySelector('.plan-go').disabled, el.querySelector('.plan-go').dataset.round]).toEqual([true, 'design']);
});

test('the plan shows clock times from the chosen start and the round, deep dive and outro lengths', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el } = mount('Ada');
  el.querySelector('.setup-start-select').value = 'other';
  el.querySelector('.setup-start-select').dispatchEvent(new Event('change', { bubbles: true }));
  type(el, '.setup-start-other', '2026-10-23T14:15');
  const resume = text(el);
  el.querySelector('[value="pair"]').checked = true;
  el.querySelector('[value="pair"]').dispatchEvent(new Event('change', { bubbles: true }));
  expect([resume.map((s) => s.replace(/ ?[AP]M/i, '')), text(el).map((s) => s.replace(/ ?[AP]M/i, '')),
    el.querySelector('.plan-end').textContent.replace(/ ?[AP]M/i, '')]).toEqual([
    ['2:15 Intro 5 min', '2:20 Design review 20 min', '2:40 Deep dive 15 min', '2:55 Outro 5 min'],
    ['2:15 Intro 5 min', '2:20 Pair programming 20 min', '2:40 Deep dive 20 min', '3:00 Outro 5 min'],
    'Ends at 3:05',
  ]);
});

test('the round from last time is picked, and Start carries it', () => {
  const { el } = mount('Ada', 'pair');
  expect([el.querySelector('[name="plan-round"]:checked').value, el.querySelector('.plan-go').dataset.round]).toEqual(['pair', 'pair']);
});

test('an unknown last round falls back to the first', () => {
  const { el } = mount('Ada', 'gone');
  expect([el.querySelector('[name="plan-round"]:checked').value, el.querySelector('.plan-go').dataset.round]).toEqual(['design', 'design']);
});

test('Start does nothing while the name is blank, even if the button is clicked', () => {
  const { el, start } = mount('  ');
  el.querySelector('.plan-go').disabled = false;
  el.querySelector('.plan-go').click();
  expect(start).not.toHaveBeenCalled();
});

const pickOther = (el, value) => {
  el.querySelector('.setup-start-select').value = 'other';
  el.querySelector('.setup-start-select').dispatchEvent(new Event('change', { bubbles: true }));
  type(el, '.setup-start-other', value);
};

test('Other time with no date or one out of range turns Start off and says why', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el, start } = mount('Ada');
  const go = el.querySelector('.plan-go');
  const note = el.querySelector('.plan-note');
  pickOther(el, '');
  const empty = [go.disabled, note.hidden, note.textContent];
  go.disabled = false;
  go.click();
  pickOther(el, '2026-10-01T09:00');
  const past = go.disabled;
  pickOther(el, '2026-10-23T15:00');
  const other = el.querySelector('.setup-start-other');
  expect([empty, past, go.disabled, note.hidden, start.mock.calls.length, other.min, other.max]).toEqual([
    [true, false, 'Pick a start time from a day ago to a week ahead.'], true, false, true, 0, '2026-10-22T14:07', '2026-10-30T14:07']);
});

test('the plan names the day when the start is not today', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el } = mount('Ada');
  const today = el.querySelector('.plan-day');
  pickOther(el, '2026-10-24T09:00');
  const day = el.querySelector('.plan-day')?.textContent;
  expect([today, day]).toEqual([null, new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(2026, 9, 24))]);
});

test('the half-minute refresh moves a Now plan on with the clock', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el, refresh } = mount('Ada');
  const before = el.querySelector('.plan-at').textContent;
  vi.setSystemTime(new Date(2026, 9, 23, 14, 37));
  refresh(Date.now());
  const after = el.querySelector('.plan-at').textContent;
  expect([before, after].map((t) => t.replace(/ ?[AP]M/i, ''))).toEqual(['2:07', '2:37']);
});

test('Enter in the name field starts, once Start is on', () => {
  const blank = mount('');
  blank.el.querySelector('.candidate-field').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const { el, start } = mount('');
  type(el, '.candidate-field', 'Ada');
  el.querySelector('.candidate-field').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect([blank.start.mock.calls.length, start.mock.calls]).toEqual([0, [[{ roundId: 'design', candidate: 'Ada', startedAt: undefined }]]]);
});
