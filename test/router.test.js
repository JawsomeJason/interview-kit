import { expect, test } from 'vitest';
import { onRoute } from '../src/router.js';

const fakeWindow = (withNavigation) => {
  const listeners = {};
  const target = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  return { listeners, win: { ...target, location: { hash: '#/intro' }, navigation: withNavigation ? target : undefined } };
};

const navigateEvent = (fields, intercepts) => ({ canIntercept: true, hashChange: true, destination: { url: 'http://x/#/q/a' }, ...fields, intercept: (options) => intercepts.push(options) });

test('with the Navigation API, a hash change is intercepted and renders the new hash; other navigations pass through', async () => {
  const { listeners, win } = fakeWindow(true);
  const renders = [];
  onRoute((hash) => renders.push(hash), win);
  const intercepts = [];
  listeners.navigate(navigateEvent({}, intercepts));
  listeners.navigate(navigateEvent({ hashChange: false }, intercepts));
  listeners.navigate(navigateEvent({ canIntercept: false }, intercepts));
  await intercepts[0].handler();
  expect([intercepts.length, intercepts[0].focusReset, intercepts[0].scroll, renders]).toEqual([1, 'manual', 'manual', ['#/q/a']]);
});

test('with the Navigation API, a hashchange it never saw renders, and one it already intercepted does not', async () => {
  const { listeners, win } = fakeWindow(true);
  const renders = [];
  onRoute((hash) => renders.push(hash), win);
  listeners.hashchange();
  const intercepts = [];
  listeners.navigate(navigateEvent({}, intercepts));
  await intercepts[0].handler();
  win.location.hash = '#/q/a';
  listeners.hashchange();
  expect(renders).toEqual(['#/intro', '#/q/a']);
});

test('without the Navigation API, hashchange renders the new hash', () => {
  const { listeners, win } = fakeWindow(false);
  const renders = [];
  onRoute((hash) => renders.push(hash), win);
  listeners.hashchange();
  expect([Object.keys(listeners), renders]).toEqual([['hashchange'], ['#/intro']]);
});
