// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';

// The real app on a picked round, with a second trial header added to the registry and picked in the prefs.
vi.mock('../src/components/header-variants/index.js', async (original) => {
  const real = await original();
  const b = { label: 'Test', bind: (el, { spot, onRoute }) => { onRoute((hash) => { el.dataset.routes = `${el.dataset.routes ?? ''}${spot} ${hash};`; }); },
    render: ({ spot, candidate, parts, deepDiveMinutes }) => (spot === 'header'
      ? `<header class="app-header">Header B · ${candidate} · ${parts.intro.minutes}+${deepDiveMinutes}+${parts.outro.minutes}</header>`
      : '<p class="sidebar-round">Drawer B</p>') };
  return { ...real, HEADERS: { ...real.HEADERS, b } };
});
localStorage.setItem('interview-kit', JSON.stringify({ round: 'sample', candidate: 'Ada' }));
localStorage.setItem('interview-kit-layout', JSON.stringify({ header: 'b', setup: 'a' }));
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const { setPref, trialId } = await import('../src/components/layout-switcher.js');
const { HEADERS } = await import('../src/components/header-variants/index.js');
const root = document.getElementById('root');

test('the app shows the header variant picked in the prefs, in the header and in the phone drawer, with a Header group to switch it', () => {
  expect([root.querySelector('.app-header').textContent, root.querySelector('.sidebar-round').textContent,
    root.querySelector('.trials-panel [data-header="b"]').closest('[role="group"]').getAttribute('aria-label'),
    root.querySelector('.trials-panel [data-header="b"]').getAttribute('aria-pressed')]).toEqual(['Header B · Ada · 5+20+5', 'Drawer B', 'Header', 'true']);
});

test('the header hears the deep dive minutes as they change on the Deep dive page', async () => {
  location.hash = '#/deep-dive';
  await new Promise((resolve) => setTimeout(resolve, 10));
  const minutes = root.querySelector('.minutes-control-number');
  minutes.value = '40';
  minutes.dispatchEvent(new Event('input', { bubbles: true }));
  expect(root.querySelector('.app-header').textContent).toBe('Header B · Ada · 5+40+5');
});

test('the mounted header hears each route the app takes, in both spots, without a redraw', async () => {
  location.hash = '#/help';
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect([root.querySelector('.app-header').dataset.routes, root.querySelector('.sidebar-round').dataset.routes]).toEqual(['header #/help;', 'drawer #/help;']);
});

test('a saved header letter that no longer exists falls back to A', () => {
  setPref('header', 'z');
  expect(trialId('header', HEADERS)).toBe('a');
});

test('picking header A in the panel brings back the header with the name and a working New interview', () => {
  root.querySelector('.trials-panel [data-header="a"]').click();
  const header = root.querySelector('.app-header');
  const found = [header.querySelector('.candidate-field').value, root.querySelectorAll('.header-a-reset').length,
    JSON.parse(localStorage.getItem('interview-kit-layout')).header];
  // happy-dom has no popovers; the menu would close here in a browser.
  header.querySelector('.header-a-menu').hidePopover = () => {};
  header.querySelector('.header-a-reset').click();
  expect([...found, root.querySelector('h1').textContent]).toEqual(['Ada', 2, 'a', 'Start an interview']);
});

test('New interview lands on the setup page with the name cleared and the last round picked, and Undo brings the interview back', () => {
  const setup = [root.querySelector('.candidate-field').value, root.querySelector('input[name="setup-a-round"]:checked').value,
    JSON.parse(localStorage.getItem('interview-kit'))];
  root.querySelector('.undo-toast-button').click();
  expect([...setup, root.querySelector('.app-header .candidate-field').value]).toEqual(['', 'sample', { lastRound: 'sample' }, 'Ada']);
});
