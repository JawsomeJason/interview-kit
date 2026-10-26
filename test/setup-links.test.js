// @vitest-environment happy-dom
import { expect, test } from 'vitest';

// The real app on the setup page, before any round is picked, with What's new not yet seen.
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
const go = async (hash) => { location.hash = hash; await new Promise((resolve) => setTimeout(resolve, 10)); };
const corner = () => [...root.querySelectorAll('.setup-links a')].map((a) => [a.getAttribute('href'), Boolean(a.querySelector('.whats-new-dot'))]);

test("the setup page has What's new, with its New dot, and Help", () => {
  expect(corner()).toEqual([['#/whats-new', true], ['#/help', false]]);
});

test("What's new opens from the setup page, and Back to setup returns to the setup page with the dot cleared", async () => {
  await go('#/whats-new');
  const page = [root.querySelector('h1').textContent, Boolean(root.querySelector('.kit-back'))];
  await go('#/help');
  const help = root.querySelector('h1').textContent;
  root.querySelector('.kit-back').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect([...page, help, root.querySelector('h1').textContent, corner()]).toEqual(["What's new", true, 'Help', 'Start an interview', [['#/whats-new', false], ['#/help', false]]]);
});
