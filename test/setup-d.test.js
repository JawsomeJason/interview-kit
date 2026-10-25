// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import d from '../src/components/setup-variants/d.js';

afterEach(() => vi.useRealTimers());

const rounds = [{ id: 'pair', name: 'Pair programming', minutes: 60, deepDiveMinutes: 30 }, { id: 'sys', name: 'System design', minutes: 45, deepDiveMinutes: 20 }];
const startOptions = [{ label: 'Now', value: null }, { label: '9:15 AM', value: 1000 }];
const page = (candidate = '', round = null) => {
  const start = vi.fn();
  const ctx = { rounds, round, candidate, startOptions, start };
  document.body.innerHTML = d.render(ctx);
  const el = document.body.firstElementChild;
  const refresh = d.bind(el, ctx);
  return { el, start, refresh, name: el.querySelector('.candidate-field') };
};
const type = (name, v) => { name.value = v; };

test('renders the name field and a round option for each round', () => {
  const { el, name } = page();
  expect([name.getAttribute('aria-label'), [...el.querySelectorAll('.setup-d-round option')].map((o) => o.textContent)])
    .toEqual(['Candidate name', ['Pair programming', 'System design']]);
});

test('choosing a round and a start calls start with them and the candidate', () => {
  const { el, start, name } = page('Ada');
  type(name, 'Ada');
  el.querySelector('.setup-d-round').value = 'sys';
  el.querySelector('.setup-start-select').value = '1000';
  el.querySelector('.setup-d-start').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'sys', candidate: 'Ada', startedAt: 1000 });
});

test('start is blocked without a name', () => {
  const { el, start, name } = page();
  type(name, '   ');
  el.querySelector('.setup-d-start').click();
  expect([start.mock.calls.length, el.querySelector('.setup-d-start').disabled]).toEqual([0, true]);
});

test('Enter in the name field starts with the defaults: first round, Now', () => {
  localStorage.clear();
  const { start, name } = page();
  type(name, 'Ada');
  name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(start).toHaveBeenCalledWith({ roundId: 'pair', candidate: 'Ada', startedAt: undefined });
});

test('the round from last time (New interview) is preselected, with its blurb and Start carrying it', () => {
  const { el } = page('', 'sys');
  expect([el.querySelector('.setup-d-round').value, el.querySelector('.setup-d-start').dataset.round, el.querySelector('.setup-d-blurb').textContent])
    .toEqual(['sys', 'sys', '45 min round, 20 min deep dive.']);
});

test('with no round from last time, or an unknown one, the first round is picked', () => {
  expect([page('', null).el.querySelector('.setup-d-round').value, page('', 'gone').el.querySelector('.setup-d-round').value]).toEqual(['pair', 'pair']);
});

test('the page keeps no round of its own in localStorage', () => {
  localStorage.clear();
  const { el, name } = page('Ada');
  type(name, 'Ada');
  el.querySelector('.setup-d-round').value = 'sys';
  el.querySelector('.setup-d-start').click();
  expect([localStorage.length, page().el.querySelector('.setup-d-round').value]).toEqual([0, 'pair']);
});

test('Other time with no usable date turns Start and Enter off and says why', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el, start, name } = page('Ada');
  const select = el.querySelector('.setup-start-select');
  select.value = 'other';
  select.dispatchEvent(new Event('change'));
  const button = el.querySelector('.setup-d-start');
  const note = el.querySelector('.setup-d-note');
  const empty = [button.disabled, note.hidden, note.textContent];
  name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  const other = el.querySelector('.setup-start-other');
  other.value = '2026-10-23T15:00';
  other.dispatchEvent(new Event('input', { bubbles: true }));
  expect([empty, start.mock.calls.length, button.disabled, note.hidden, other.min, other.max]).toEqual([
    [true, false, 'Pick a start time from a day ago to a week ahead.'], 0, false, true, '2026-10-22T14:07', '2026-10-30T14:07']);
});

test('without a name Start is off and the note asks for one; typing a name turns it on', () => {
  const { el, name } = page();
  const note = el.querySelector('.setup-d-note');
  const blank = [el.querySelector('.setup-d-start').disabled, note.hidden, note.textContent];
  name.value = 'Ada';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  expect([blank, el.querySelector('.setup-d-start').disabled, note.hidden]).toEqual([[true, false, 'Add a name to start.'], false, true]);
});

test('the half-minute refresh keeps the picked start and updates the Other field limits', () => {
  const { el, refresh } = page('Ada');
  const select = el.querySelector('.setup-start-select');
  select.value = '1000';
  select.dispatchEvent(new Event('change'));
  const now = new Date(2026, 9, 23, 14, 7).getTime();
  refresh(now);
  const other = el.querySelector('.setup-start-other');
  expect([select.value, new Date(other.min).getTime(), select.options[0].textContent, select.options[select.options.length - 1].value])
    .toEqual(['1000', now - 86_400_000, 'Now', 'other']);
});
