// @vitest-environment happy-dom
import { expect, test } from 'vitest';

localStorage.setItem('interview-kit', JSON.stringify({ round: 'sample', candidate: 'Ada', deepDive: { minutes: 60, pools: ['css'] } }));
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
const go = (hash) => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); };

test('a pager link that had focus hands it to the new page heading', () => {
  go('#/deep-dive');
  const link = root.querySelector('.picked-list .question-link');
  go(new URL(link.href).hash);
  const next = root.querySelector('.pager > :last-child[href]');
  next.focus();
  go(new URL(next.href).hash);
  expect([document.activeElement.tagName, document.activeElement.textContent]).toEqual(['H1', root.querySelector('main h1').textContent]);
});
