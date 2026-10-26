// @vitest-environment happy-dom
import { expect, test } from 'vitest';

// The real app on a picked round.
localStorage.setItem('interview-kit', JSON.stringify({ round: 'sample', candidate: 'Ada' }));
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
// happy-dom has no popovers; the menu would close here in a browser.
HTMLElement.prototype.hidePopover ??= () => {};
const maxMinutes = () => [...root.querySelectorAll('.cockpit-bar')].map((bar) => bar.getAttribute('aria-valuemax'));

test('the header shows the name and the round, in the header bar and in the phone drawer', () => {
  expect([...root.querySelectorAll('.app-header, .sidebar-round')].map((spot) => [spot.querySelector('.candidate-field').value, spot.querySelector('.cockpit-round').textContent]))
    .toEqual([['Ada', 'Sample round · 45 min'], ['Ada', 'Sample round · 45 min']]);
});

test('the header follows the deep dive minutes as they change on the Deep dive page', async () => {
  location.hash = '#/deep-dive';
  await new Promise((resolve) => setTimeout(resolve, 10));
  const before = maxMinutes();
  const minutes = root.querySelector('.minutes-control-number');
  minutes.value = '40';
  minutes.dispatchEvent(new Event('input', { bubbles: true }));
  expect([before, maxMinutes()]).toEqual([['45', '45'], ['65', '65']]);
});

test('New interview in the header lands on the setup page with the name cleared and the last round picked, and Undo brings the interview back', () => {
  root.querySelector('.app-header .header-menu-reset').click();
  const setup = [root.querySelector('h1').textContent, root.querySelector('.candidate-field').value,
    root.querySelector('input[name="setup-round"]:checked').value, JSON.parse(localStorage.getItem('interview-kit'))];
  root.querySelector('.undo-toast-button').click();
  expect([...setup, root.querySelector('.app-header .candidate-field').value]).toEqual(['Start an interview', '', 'sample', { lastRound: 'sample' }, 'Ada']);
});
