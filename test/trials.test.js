// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { getPrefs } from '../src/components/layout-switcher.js';
import { setupLine } from '../src/components/copy-summary.js';
import { trials } from '../src/components/trials.js';

// The real app, booted on a picked round of the sample pack, given a pack theme.
vi.mock('../src/content.js', async (original) => ({ ...(await original()), packTheme: { id: 'brand', name: 'Fixture' } }));
localStorage.setItem('interview-kit', JSON.stringify({ round: 'sample', candidate: 'Ada' }));
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
const groups = (el) => [...el.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'));

test('the header and the phone drawer hold no layout, sidebar or theme switcher', () => {
  expect([groups(root.querySelector('.app-header')), groups(root.querySelector('.sidebar-round'))])
    .toEqual([['Color scheme'], ['Color scheme']]);
});

test('the Trials panel holds Question layout, Header, Sidebar, Setup page (each with more than one variant) and, with a pack theme, Theme', () => {
  expect(groups(root.querySelector('.trials-panel'))).toEqual(['Question layout', 'Header', 'Sidebar', 'Setup page', 'Theme']);
});

test('without a pack theme the Trials panel has no Theme group, and a registry with one variant gets no group', () => {
  const two = { a: { label: 'Timeline' }, b: { label: 'Run of show' } };
  const panel = (setups) => {
    const el = document.createElement('div');
    el.innerHTML = trials([{ name: 'sidebar', label: 'Sidebar', variants: two }, { name: 'setup', label: 'Setup page', variants: setups }], null);
    return groups(el);
  };
  expect([panel({ a: { label: 'Form' } }), panel(two)]).toEqual([['Question layout', 'Sidebar'], ['Question layout', 'Sidebar', 'Setup page']]);
});

test('picking a layout and a sidebar in the panel saves them and the Setup line reports them', () => {
  const panel = root.querySelector('.trials-panel');
  panel.querySelector('[data-layout="b"]').click();
  panel.querySelector('[data-sidebar="c"]').click();
  expect([JSON.parse(localStorage.getItem('interview-kit-layout')).layout, document.body.className,
    setupLine(getPrefs(), null, 'light')]).toEqual(['b', 'layout-b', 'Setup: Question layout B · Header A · Sidebar C · Setup page C · Theme Default · Scheme Light (auto)']);
});

// Chromium drops focus to the page when Escape closes the panel from a note box (QA's t8 script); the panel now closes
// itself and hands focus back to Try layouts. happy-dom has no popover API, so hidePopover is counted here.
test('Escape in a note box closes Try layouts and puts focus back on its button', () => {
  const panel = root.querySelector('.trials-panel');
  let hides = 0;
  panel.hidePopover = () => { hides += 1; };
  const box = panel.querySelector('.trial-note-text');
  box.focus();
  const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  box.dispatchEvent(esc);
  expect([hides, document.activeElement.className, esc.defaultPrevented]).toEqual([1, 'trials-button', true]);
});

// Layout needs a real browser (QA's t6 script measures it at 844x390 and 320 wide); this keeps the fix. The height cap
// left out the padding and border, which pushed the top edge off a short screen. On a narrow one nothing capped the
// width, and the grid track grew to the notes' 32ch and spilled past the panel.
test('the Try layouts panel counts its padding and border in its caps and never runs wider than the screen', () => {
  const css = readFileSync('src/components/trials.css', 'utf8');
  const [rule, open] = [/\.trials-panel \{[^}]*\}/, /\.trials-panel:popover-open \{[^}]*\}/].map((re) => css.match(re)[0]);
  expect([rule.includes('box-sizing: border-box;'), rule.includes('max-inline-size: calc(100% - 2 * var(--space-m));'),
    open.includes('grid-template-columns: minmax(0, 1fr);')]).toEqual([true, true, true]);
});
