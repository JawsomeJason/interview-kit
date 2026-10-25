// @vitest-environment happy-dom
import { expect, test } from 'vitest';

// The real app on the setup page, before any round is picked, with What's new not yet seen.
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
const go = async (hash) => { location.hash = hash; await new Promise((resolve) => setTimeout(resolve, 10)); };
const corner = () => [...root.querySelectorAll('.trials-corner a')].map((a) => [a.getAttribute('href'), Boolean(a.querySelector('.whats-new-dot'))]);

test("the setup page has What's new, with its New dot, and Help beside Try layouts", () => {
  expect(corner()).toEqual([['#/whats-new', true], ['#/help', false]]);
});

test("What's new opens from the setup page, clears the dot, and Back to setup returns to the setup page", async () => {
  await go('#/whats-new');
  const page = [root.querySelector('h1').textContent, corner()[0][1], Boolean(root.querySelector('.kit-back'))];
  await go('#/help');
  const help = root.querySelector('h1').textContent;
  root.querySelector('.kit-back').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect([...page, help, root.querySelector('h1').textContent]).toEqual(["What's new", false, true, 'Help', 'Plan the interview']);
});
