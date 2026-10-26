// Runs axe-core over the main screens in light and dark, desktop and phone, and exits non-zero on
// any violation. `npm run a11y` builds first; this serves dist/ on a free port (or scans A11Y_URL).
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { desktop, HEADER_MENU, openQuestion, openScreen, pack, phone, serve, theme } from './screens.mjs';

const { server, url } = await serve(process.env.A11Y_URL, 4173);

const screens = [
  ['round picker', desktop, async () => {}, true],
  ['round picker, other start time', desktop, async (p) => { await p.locator('.setup-chip', { hasText: 'Other time' }).click(); }, true],
  ['setup page, Help', desktop, async (p) => { await p.goto(`${url}#/help`); }, true],
  ['phone, setup page, What\'s new', phone, async (p) => { await p.goto(`${url}#/whats-new`); }, true],
  ['phone, round picker', phone, async () => {}, true],
  ['intro', desktop, async () => {}],
  ['deep dive, 2 pools, no room', desktop, async (p) => {
    await p.goto(`${url}#/deep-dive`);
    await p.locator('.pool-picker input:not(:disabled)').nth(0).check();
    await p.locator('.pool-picker input:not(:disabled)').nth(1).check();
    await p.locator('.minutes-control-number').fill('20');
    await p.locator('.hint').first().focus();
    await p.keyboard.press('Enter');
  }],
  ['question', desktop, openQuestion],
  ['question, header menu open', desktop, async (p) => { await openQuestion(p); await p.locator(`.app-header ${HEADER_MENU}`).click(); }],
  ['phone, question tab', phone, openQuestion],
  ['phone, assess tab', phone, async (p) => { await openQuestion(p); await p.locator('[data-tab=assess]').click(); }],
  ['phone, drawer open', phone, async (p) => { await openQuestion(p); await p.locator('.topbar-menu').click(); }],
  ["what's new", desktop, async (p) => { await p.goto(`${url}#/whats-new`); }],
  ["phone, what's new", phone, async (p) => { await p.goto(`${url}#/whats-new`); }],
  ['help', desktop, async (p) => { await p.goto(`${url}#/help`); }],
  ['phone, help', phone, async (p) => { await p.goto(`${url}#/help`); }],
  ['help, opened at an entry', desktop, async (p) => { await p.goto(`${url}#/help/overlaps`); }],
  ['question, All questions open', desktop, async (p) => { await openQuestion(p); await p.locator('.now-next-browse').click(); }],
  ['question, All questions searched', desktop, async (p) => { await openQuestion(p); await p.locator('.now-next-browse').click(); await p.keyboard.type('a'); await p.keyboard.press('ArrowDown'); }],
  ['phone, drawer open, All questions open', phone, async (p) => { await openQuestion(p); await p.locator('.topbar-menu').click(); await p.locator('.now-next-browse').click(); }],
  ['question, Look for help open', desktop, async (p) => { await openQuestion(p); await p.locator('.look-for .help-hint').focus(); await p.keyboard.press('Enter'); }],
];

const browser = await chromium.launch({ args: ['--mute-audio'] });
let total = 0;
for (const scheme of ['light', 'dark']) {
  for (const [name, viewport, setup, atPicker] of screens) {
    const { ctx, p } = await openScreen(browser, { url, viewport, scheme, atPicker, setup });
    // axe ignores the top layer, so it counts the page's fixed bars as sitting over the open phone drawer. They are covered
    // by its backdrop, so hide them for the scan.
    await p.evaluate(() => { const drawer = document.querySelector('.sidebar:popover-open'); if (drawer) for (const el of document.querySelectorAll('*')) {
      if (getComputedStyle(el).position === 'fixed' && !drawer.contains(el) && !el.contains(drawer)) el.style.visibility = 'hidden';
    } });
    const axe = () => new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);
    // A pack can accept low contrast on some elements of its own theme: pack.json "a11yExclude" lists their selectors,
    // and they skip color-contrast.
    const contrastScan = axe().withRules(['color-contrast']);
    const exclude = pack.a11yExclude ?? [];
    const contrast = await exclude.reduce((scan, selector) => scan.exclude(selector), contrastScan).analyze();
    const violations = [...(await axe().disableRules(['color-contrast']).analyze()).violations, ...contrast.violations];
    total += violations.length;
    console.log(`${theme} / ${scheme} / ${name}: ${violations.length}`);
    for (const v of violations) console.log(`  ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
    await ctx.close();
  }
}

const failed = [];
const check = (name, ok) => { console.log(`${ok ? 'pass' : 'FAIL'}: ${name}`); if (!ok) failed.push(name); };
{
  const { ctx, p } = await openScreen(browser, { url, viewport: desktop, setup: openQuestion });
  const cdp = await ctx.newCDPSession(p);
  const hrefs = await p.locator('.sidebar-body a[href^="#/q/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);

  // All questions, by keyboard: focus starts in the search, Tab never leaves the dialog, Escape clears then closes,
  // and focus goes back to the button that opened it.
  const focus = () => p.evaluate(() => document.activeElement.className);
  await p.locator('.now-next-browse').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  check('opening All questions puts focus in its search box', (await focus()) === 'question-search-box');
  const tabs = [];
  for (let i = 0; i < 4; i += 1) { await p.keyboard.press('Tab'); tabs.push(await focus()); }
  check(`Tab stays in the dialog: ${tabs.join(', ')}`, tabs.every((c) => c.startsWith('question-search-')));
  await p.locator('.question-search-box').focus();
  // The second question's full title matches only itself, so its pool stays up with the rest filtered out.
  const title = await p.locator('.question-search-name').nth(1).textContent();
  await p.keyboard.type(title);
  const onScreen = await p.locator('.question-search-option').evaluateAll((os) => os.filter((o) => o.checkVisibility()).length);
  check(`a search for one title leaves only that option on screen (${onScreen})`, onScreen === 1);
  await p.keyboard.press('Escape');
  const cleared = await p.evaluate(() => [document.querySelector('.question-search').open, document.querySelector('.question-search-box').value]);
  check('the first Escape clears the search and keeps the dialog open', cleared[0] && cleared[1] === '');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  check(`the second Escape closes it and focus goes back to Browse all questions (${await focus()})`,
    !(await p.evaluate(() => document.querySelector('.question-search').open)) && (await focus()) === 'now-next-browse');
  await p.locator('.now-next-browse').click();
  const { result: boxRef } = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector(".question-search-box")' });
  const [boxNode] = (await cdp.send('Accessibility.getPartialAXTree', { objectId: boxRef.objectId, fetchRelatives: false })).nodes;
  check(`the search box reads as a combobox: ${boxNode.role?.value} "${boxNode.name?.value}"`, boxNode.role?.value === 'combobox' && boxNode.name?.value === 'Search questions by title or pool');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  check(`Enter on an option opens that question (${await p.evaluate(() => location.hash)})`, (await p.evaluate(() => location.hash)).startsWith('#/q/'));
  // Listeners on document and window after 1 nav update and after 50.
  const listeners = async () => {
    let n = 0;
    for (const expression of ['document', 'window']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      n += (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
    }
    return n;
  };
  const nav = (i) => p.evaluate((h) => { location.hash = h; }, i % 2 ? '#/deep-dive' : hrefs[0]);
  await nav(1);
  const after1 = await listeners();
  for (let i = 2; i <= 50; i += 1) await nav(i);
  const after50 = await listeners();
  check(`no listener leak: ${after1} document and window listeners after 1 nav update, ${after50} after 50`, after1 === after50);
  await ctx.close();
}

await browser.close();
await server?.close();
console.log(total ? `${total} violation(s)` : 'No violations.');
console.log(failed.length ? `${failed.length} keyboard check(s) failed` : 'Keyboard checks pass.');
process.exit(total || failed.length ? 1 : 0);
