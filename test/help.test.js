// @vitest-environment happy-dom
import { globSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { helpEntry, helpHint, helpPage, pageLinks, showHelpEntry } from '../src/components/help.js';

test('the Help page renders the walkthrough and the FAQ, one heading per question', () => {
  document.body.innerHTML = helpPage();
  const texts = (selector) => [...document.querySelectorAll(selector)].map((h) => h.textContent);
  expect([texts('.help h2'), texts('.help-entry h3')]).toEqual([
    ['How a round works', 'Why the kit works this way'],
    [
      'Why is there no score for me to give?',
      'Why does the score only show up after the interview?',
      'Why exactly three Look for items?',
      "Why don't the buttons ever move?",
      'How does the kit choose questions?',
      "Why won't it pick two questions that overlap?",
      'Why is there a time meter?',
      "Why does the kit ask for the candidate's name first?",
      'What are Notes and Mark done for?',
      'What does Copy summary copy?',
      'Why is there a Pop out button?',
      'Why do some questions say Being reviewed?',
      'Where do my notes go?',
      'How does the kit look out for the candidate?',
      'How does the kit lighten my load?',
      'Why does the kit barely move?',
      'What does the kit do for keyboard and screen reader users?',
    ],
  ]);
});

test("the Help link renders right after the What's new link", () => {
  expect(pageLinks().replace(/<a href="#\/whats-new"[^]*?<\/a>/, "WHATS-NEW")).toBe('WHATS-NEW<a href="#/help" class="help-link">Help</a>');
});

// Every helpHint('<id>') call in src/, so a hint added later is checked too.
const used = [...new Set(globSync('src/**/*.js').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/helpHint\('([\w-]+)'\)/g)].map((m) => m[1])))].sort();

test("each help icon's More in Help link targets an entry that exists on the Help page", () => {
  const page = helpPage();
  const links = used.map((id) => helpHint(id).match(/href="#\/help\/([\w-]+)"/)[1]);
  expect([used.length, links.filter((id) => !page.includes(`id="faq-${id}"`))]).toEqual([7, []]);
});

test('a help icon is a ? button named by its question, with the short answer in its popover', () => {
  expect(helpHint('overlaps')).toMatch(/^<button type="button" class="hint help-hint" aria-label="Why won't it pick two questions that overlap\?" aria-describedby="hint-overlaps" [^>]+>\?<\/button><span id="hint-overlaps" class="hint-popover help-hint-popover" popover="hint">Two questions that cover the same ground .* <a class="help-hint-more" href="#\/help\/overlaps">More in Help<\/a><\/span>$/);
});

test('a help icon for a question the page lacks throws instead of linking nowhere', () => {
  expect(() => helpHint('no-such-entry')).toThrow('no-such-entry');
});

test('the route names the FAQ entry to show', () => {
  expect(['#/help/overlaps', '#/help', '#/whats-new'].map(helpEntry)).toEqual(['overlaps', null, null]);
});

test('an FAQ entry in the URL is focused and marked on the rendered page', () => {
  document.body.innerHTML = `<main>${helpPage()}</main>`;
  showHelpEntry(document.body, '#/help/time-meter');
  expect([document.activeElement.id, [...document.querySelectorAll('[data-target]')].map((el) => el.id)]).toEqual(['faq-time-meter', ['faq-time-meter']]);
});

test("an FAQ entry's media renders from the shared folder, lazily, the Pop out clip included", () => {
  document.body.innerHTML = helpPage();
  const media = (id) => document.querySelector(`#faq-${id} .media`);
  expect([media('pop-out')?.outerHTML.match(/^<video class="media media-clip" src="\/src\/media\/pop-out\.mp4" poster="\/src\/media\/pop-out\.webp"/) !== null,
    media('time-meter')?.getAttribute('loading')]).toEqual([true, 'lazy']);
});

// Lazy media above an entry loaded after the jump and pushed the entry 365 to 430 px down (QA's h2 script). Each file's
// CSS size, half its pixels since captures are 2x, holds its room before it loads. The sizes come from capture/manifest.json.
test('every screenshot and clip on Help carries its size, so a deep link lands on its entry', () => {
  document.body.innerHTML = helpPage();
  expect([...document.querySelectorAll('.media')].map((m) => [m.tagName, m.getAttribute('width'), m.getAttribute('height'), m.style.getPropertyValue('--media-ratio')]))
    .toEqual([['VIDEO', '480', '264', String(960 / 528)], ['IMG', '367', '198', String(734 / 396)], ['VIDEO', '480', '264', String(960 / 528)],
      ['IMG', '367', '357', String(734 / 714)], ['IMG', '664', '115', String(1328 / 230)], ['IMG', '299', '388', String(598 / 776)],
      ['IMG', '671', '752', String(1342 / 1504)], ['IMG', '535', '238', String(1070 / 476)], ['VIDEO', '480', '270', String(960 / 540)],
      ['IMG', '664', '114', String(1328 / 228)]]);
});

// With the pack's theme, its web font swaps in after the jump and pushed a phone-width entry about 25 px down (QA's h2).
test('a deep link jumps to its entry again once a loading web font is in', async () => {
  document.body.innerHTML = `<main>${helpPage()}</main>`;
  let fontsIn;
  Object.defineProperty(document, 'fonts', { configurable: true, value: { status: 'loading', ready: new Promise((r) => { fontsIn = r; }) } });
  const scrollIntoView = Element.prototype.scrollIntoView;
  const jumps = [];
  Element.prototype.scrollIntoView = function () { jumps.push(this.id); };
  showHelpEntry(document.body, '#/help/pick');
  const before = [...jumps];
  fontsIn();
  await document.fonts.ready;
  Element.prototype.scrollIntoView = scrollIntoView;
  delete document.fonts;
  expect([before, jumps]).toEqual([['faq-pick'], ['faq-pick', 'faq-pick']]);
});

// The same hash fires no hashchange, so the router never ran and the link did nothing once the reader had scrolled away.
test('a Help link to the entry already in the URL scrolls to it and focuses it again', () => {
  document.body.innerHTML = `<main>${helpPage()}</main>`;
  location.hash = '#/help/pick';
  showHelpEntry(document.body, location.hash);
  document.activeElement.blur();
  const scrollIntoView = Element.prototype.scrollIntoView;
  const jumps = [];
  Element.prototype.scrollIntoView = function () { jumps.push(this.id); };
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.querySelector('.help-toc a[href="#/help/pick"]').dispatchEvent(click);
  Element.prototype.scrollIntoView = scrollIntoView;
  expect([jumps, document.activeElement.id, click.defaultPrevented]).toEqual([['faq-pick'], 'faq-pick', true]);
});
