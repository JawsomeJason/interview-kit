import { expect, test, vi } from 'vitest';
import { deepDivePage } from '../src/components/deep-dive-page.js';
import { poolStatus } from '../src/pick.js';

const q = (id, minutes) => ({ id, pool: id[0], poolName: id[0].toUpperCase(), title: id, minutes, tier: 'core' });
const pools = Map.groupBy([q('a1', 6), q('b1', 2), q('c1', 3)], (p) => p.pool);
const box = (html, id) => html.match(new RegExp(`<input type="checkbox" value="${id}"[^>]*>`))[0];

test('unchecked pools with no room render disabled, checked pools never do', () => {
  const twoChecked = deepDivePage({ minutes: 10, pools: ['a', 'b'] }, pools, [], []);
  expect(box(twoChecked, 'c')).toBe('<input type="checkbox" value="c" disabled class="option-row-control">');
  const allChecked = deepDivePage({ minutes: 10, pools: ['a', 'b', 'c'] }, pools, [], []);
  expect(box(allChecked, 'c')).toBe('<input type="checkbox" value="c" checked class="option-row-control">');
});

const roomy = Map.groupBy([q('a1', 12), q('b1', 4), q('c1', 6), q('c2', 5), q('d1', 4), q('e1', 70)], (p) => p.pool);
vi.stubGlobal('HTMLButtonElement', class { get interestForElement() { return null; } });
const page = deepDivePage({ minutes: 20, pools: ['a', 'b'] }, roomy, [], []);
const row = (id) => page.match(new RegExp(`<div class="pool-picker-row"><label class="option-row"><span class="option-row-box"><input type="checkbox" value="${id}"[\\s\\S]*?</div>`))[0];

test('a disabled pool renders a "no room" hint button tied to its popover', () => {
  expect(row('c')).toContain('<button type="button" class="hint" aria-describedby="room-c" interestfor="room-c" commandfor="room-c" command="show-popover">no room</button>'
    + '<span id="room-c" class="hint-popover" popover="hint">21 minutes required to include</span>');
});

test('enabled and checked pools render no hint', () => {
  expect(['a', 'd'].map((id) => /interestfor|popover/.test(row(id)))).toEqual([false, false]);
});

test('a pool that cannot fit even at 60 minutes says so', () => {
  expect(poolStatus({ minutes: 20, pools: ['a', 'b'] }, roomy, 'e')).toEqual({ noRoom: true, minutesNeeded: null });
  expect(row('e')).toContain('<span id="room-e" class="hint-popover" popover="hint">Doesn\'t fit even at 60 minutes</span>');
});

test('the deep dive page has no New candidate; New interview in the header replaces it', () => {
  expect(page.includes('new-candidate')).toBe(false);
});
