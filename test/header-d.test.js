// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import d from '../src/components/header-variants/d.js';

const ctx = (over = {}) => ({
  spot: 'header',
  round: { id: 'pair', name: 'Pair programming', minutes: 60, deepDiveMinutes: 30 },
  candidate: 'Ada',
  startedAt: 0,
  clock: () => '12:40',
  links: '<a class="whats-new-link" href="#/whats-new">What\'s new</a><a class="help-link" href="#/help">Help</a>',
  schemeToggle: '<span class="scheme-toggle" role="group" aria-label="Color scheme"></span>',
  buttons: [{ label: 'Pop out', onClick: () => {} }],
  newInterview: () => {},
  ...over,
});

// The slot's route subscriptions for the mounted header. go() routes the way main.js does: it calls each one,
// with no hashchange, since Chromium fires none for a route the Navigation API intercepts.
let routes = [];
const go = (hash) => { for (const fn of routes) fn(hash); };

// Renders the variant the way the slot does, then binds it to a document it is attached to.
function mount(over = {}, hash = '#/q/r1') {
  routes = [];
  const c = ctx({ route: hash, onRoute: (fn) => routes.push(fn), ...over });
  const host = document.createElement('div');
  host.innerHTML = d.render(c);
  const el = host.firstElementChild;
  document.body.replaceChildren(el);
  d.bind(el, c);
  return el;
}

test('the label is Contextual', () => {
  expect(d.label).toBe('Contextual');
});

test('the header spot renders a header, and the drawer spot a sidebar-round element', () => {
  expect(mount({ spot: 'header' }).tagName).toBe('HEADER');
  expect(mount({ spot: 'header' }).className).toBe('app-header');
  expect(mount({ spot: 'drawer' }).className).toBe('sidebar-round');
});

for (const spot of ['header', 'drawer']) {
  for (const hash of ['#/q/r1', '#/deep-dive']) {
    test(`${spot} on ${hash} includes the candidate field, round name, page links and plugin buttons`, () => {
      const el = mount({ spot }, hash);
      expect(el.querySelector('.candidate-field').value).toBe('Ada');
      expect(el.textContent).toContain('Pair programming');
      expect(el.querySelector('.whats-new-link').textContent).toBe("What's new");
      expect(el.querySelector('.help-link').textContent).toBe('Help');
      expect(el.querySelector('.header-button').textContent).toBe('Pop out');
    });
  }
}

test('New interview is reachable on a question page and calls ctx.newInterview', () => {
  let changed = 0;
  const el = mount({ newInterview: () => { changed += 1; } }, '#/q/r1');
  el.querySelector('.ctx-new').click();
  expect(changed).toBe(1);
});

test('on Deep dive New interview sits in the bar, not in More', () => {
  const el = mount({}, '#/deep-dive');
  expect(el.querySelector('.ctx-new').closest('.ctx-more-panel')).toBeNull();
});

test('on a question the bar shows the candidate, the clock and Pop out, and the round is only in More', () => {
  const el = mount({}, '#/q/r1');
  expect(el.querySelector(':scope > .ctx > .ctx-candidate .candidate-field')).not.toBeNull();
  expect(el.querySelector(':scope > .ctx > .ctx-clock').textContent).toBe('12:40');
  expect(el.querySelector(':scope > .ctx > .header-button').textContent).toBe('Pop out');
  expect(el.querySelector(':scope > .ctx > .ctx-round')).toBeNull();
  expect(el.querySelector('.ctx-more-panel .ctx-more-round').textContent).toBe('Pair programming · 60 min');
});

test('the clock is a live data-clock element; before a start it is empty', () => {
  expect(mount({}, '#/q/r1').querySelector('[data-clock]').textContent).toBe('12:40');
  expect(mount({ clock: () => '' }, '#/q/r1').querySelector('[data-clock]').textContent).toBe('');
});

test("What's new and Help show a Back link in the bar, with the candidate in More", () => {
  for (const hash of ['#/whats-new', '#/help', '#/help/why-trials']) {
    const el = mount({}, hash);
    expect(el.querySelector(':scope > .ctx > .ctx-back').textContent).toBe('Back');
    expect(el.querySelector(':scope > .ctx > .ctx-candidate')).toBeNull();
    expect(el.querySelector('.ctx-more-panel .candidate-field').value).toBe('Ada');
  }
});

test('the More button reports whether its menu is open', () => {
  const el = mount();
  const button = el.querySelector('.ctx-more-button');
  const panel = el.querySelector('.ctx-more-panel');
  expect(button.getAttribute('aria-expanded')).toBe('false');
  panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
  expect(button.getAttribute('aria-expanded')).toBe('true');
  panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
  expect(button.getAttribute('aria-expanded')).toBe('false');
});

test('a plugin button in More runs its handler', () => {
  let popped = 0;
  const el = mount({ buttons: [{ label: 'Pop out', onClick: () => { popped += 1; } }] }, '#/deep-dive');
  el.querySelector('.ctx-more-panel [data-button="0"]').click();
  expect(popped).toBe(1);
});

test('a route change to another kind of page updates the bar in place, keeping a typed name', () => {
  const el = mount({}, '#/q/r1');
  el.querySelector('.candidate-field').value = 'Grace';
  go('#/help');
  expect(el.querySelector(':scope > .ctx > .ctx-back').textContent).toBe('Back');
  expect(el.querySelector('.ctx-more-panel .candidate-field').value).toBe('Grace');
});

test('a route change within the same kind of page leaves the bar as it is', () => {
  const el = mount({}, '#/q/r1');
  const bar = el.querySelector('.ctx');
  go('#/q/r2');
  expect(el.querySelector('.ctx')).toBe(bar);
});

test('the bar follows the app through Help, Deep dive and back to a question with no hashchange at all', () => {
  const el = mount({}, '#/q/r1');
  const pages = [];
  for (const hash of ['#/help', '#/deep-dive', '#/q/r2']) {
    go(hash);
    pages.push(el.querySelector('.ctx').dataset.page);
  }
  expect(pages).toEqual(['reading', 'deep-dive', 'live']);
});

test('Back links to the last page of the round before Help, kept across a move from Help to What\'s new', () => {
  const el = mount({}, '#/q/r1');
  go('#/q/r2');
  go('#/help');
  const first = el.querySelector('.ctx-back').getAttribute('href');
  go('#/whats-new');
  expect([first, el.querySelector('.ctx-back').getAttribute('href')]).toEqual(['#/q/r2', '#/q/r2']);
});

test('opened straight on Help in a tab with history behind it, Back goes to Deep dive and never steps back out of the kit', () => {
  history.pushState(null, '', location.href);
  const el = mount({}, '#/help');
  const back = vi.spyOn(history, 'back');
  const link = el.querySelector('.ctx-back');
  const followed = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect([link.getAttribute('href'), followed, back.mock.calls.length]).toEqual(['#/deep-dive', true, 0]);
});

test("an unseen What's new puts its dot on More, and a seen one leaves More plain", () => {
  const unseen = '<a class="whats-new-link" href="#/whats-new">What\'s new <span class="whats-new-dot" role="img" aria-label="New">●</span></a>';
  const dot = (links) => mount({ links }).querySelector('.ctx-more-button .whats-new-dot')?.getAttribute('aria-label') ?? null;
  expect([dot(unseen), dot(ctx().links)]).toEqual(['New', null]);
});

test("once What's new has been opened and its dots cleared, a later page change doesn't bring the dot back", () => {
  const links = '<a class="whats-new-link" href="#/whats-new">What\'s new <span class="whats-new-dot" role="img" aria-label="New">●</span></a>';
  const el = mount({ links }, '#/q/r1');
  go('#/whats-new');
  for (const dot of document.querySelectorAll('.whats-new-dot')) dot.remove();
  go('#/q/r1');
  expect(el.querySelectorAll('.whats-new-dot').length).toBe(0);
});
