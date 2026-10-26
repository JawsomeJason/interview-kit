// Runs axe-core over the main screens in light and dark, desktop and phone, and exits non-zero on
// any violation. `npm run a11y` builds first; this serves dist/ on a free port (or scans A11Y_URL).
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { desktop, HEADER_MENUS, openQuestion, openScreen, pack, phone, serve, themes } from './screens.mjs';

const { server, url } = await serve(process.env.A11Y_URL, 4173);

const screens = [
  ['round picker', desktop, async () => {}, true],
  ['round picker, other start time, Try layouts open', desktop, async (p) => {
    await trial(p, 'setup', 'a');
    await p.locator('.setup-a-chip', { hasText: 'Other time' }).click();
    await p.locator('.trials-button').click();
  }, true],
  ['setup page, Help', desktop, async (p) => { await p.goto(`${url}#/help`); }, true],
  ['phone, setup page, What\'s new', phone, async (p) => { await p.goto(`${url}#/whats-new`); }, true],
  ['phone, round picker, Try layouts open', phone, async (p) => { await p.locator('.trials-button').click(); }, true],
  ['intro', desktop, async () => {}],
  ['deep dive, 2 pools, no room', desktop, async (p) => {
    await p.goto(`${url}#/deep-dive`);
    await p.locator('.pool-picker input:not(:disabled)').nth(0).check();
    await p.locator('.pool-picker input:not(:disabled)').nth(1).check();
    await p.locator('.minutes-control-number').fill('20');
    await p.locator('.hint').first().focus();
    await p.keyboard.press('Enter');
  }],
  ['question, layout A', desktop, async (p) => { await openQuestion(p); await trial(p, 'layout', 'a'); }],
  ['question, layout B', desktop, async (p) => { await openQuestion(p); await trial(p, 'layout', 'b'); }],
  ['phone, question tab', phone, async (p) => { await openQuestion(p); }],
  ['phone, assess tab', phone, async (p) => { await openQuestion(p); await p.locator('[data-tab=assess]').click(); }],
  ['phone, drawer open', phone, async (p) => { await openQuestion(p); await p.locator('.topbar-menu').click(); }],
  ['Try layouts open', desktop, async (p) => { await openQuestion(p); await p.locator('.trials-button').click(); }],
  ['phone, Try layouts open', phone, async (p) => { await openQuestion(p); await p.locator('.trials-button').click(); }],
  ["what's new", desktop, async (p) => { await p.goto(`${url}#/whats-new`); }],
  ["phone, what's new", phone, async (p) => { await p.goto(`${url}#/whats-new`); }],
  ['help', desktop, async (p) => { await p.goto(`${url}#/help`); }],
  ['phone, help', phone, async (p) => { await p.goto(`${url}#/help`); }],
  ['help, opened at an entry', desktop, async (p) => { await p.goto(`${url}#/help/overlaps`); }],
  ['question, All questions and a pool folder open', desktop, async (p) => { await openQuestion(p); await openFolder(p); }],
  ['question, Look for help open', desktop, async (p) => { await openQuestion(p); await p.locator('.look-for .help-hint').focus(); await p.keyboard.press('Enter'); }],
  // Each trial sidebar on a question page, beside the main column and in the phone drawer.
  ...['b', 'c', 'd'].flatMap((s) => [
    [`question, sidebar ${s.toUpperCase()}`, desktop, async (p) => { await openQuestion(p); await trial(p, 'sidebar', s); }],
    [`phone, drawer open, sidebar ${s.toUpperCase()}`, phone, async (p) => { await openQuestion(p); await trial(p, 'sidebar', s); await p.locator('.topbar-menu').click(); }],
  ]),
  // Each setup page, where it differs from the default C: the picker with its start time and round controls, wide and phone.
  ...['a', 'b', 'c', 'd'].flatMap((s) => [
    ...(s === 'c' ? [] : [[`round picker, setup ${s.toUpperCase()}`, desktop, async (p) => { await trial(p, 'setup', s); }, true]]),
    [`phone, round picker, setup ${s.toUpperCase()}`, phone, async (p) => { await trial(p, 'setup', s); }, true],
  ]),
  // Each header on a question page (A is the default and covered above), wide and in the phone drawer, then with its
  // menu open (A's More, B's Menu, D's More; C has none and B's drawer has none).
  ...['b', 'c', 'd'].flatMap((h) => [
    [`question, header ${h.toUpperCase()}`, desktop, async (p) => { await openQuestion(p); await trial(p, 'header', h); }],
    [`phone, drawer open, header ${h.toUpperCase()}`, phone, async (p) => { await openQuestion(p); await trial(p, 'header', h); await p.locator('.topbar-menu').click(); }],
  ]),
  ...Object.entries(HEADER_MENUS).flatMap(([h, menu]) => [
    [`question, header ${h.toUpperCase()}, menu open`, desktop, async (p) => { await openQuestion(p); await trial(p, 'header', h); await p.locator(`.app-header ${menu}`).click(); }],
    // B's drawer lays its tools out flat, with no menu.
    ...(h === 'b' ? [] : [[`phone, drawer open, header ${h.toUpperCase()}, menu open`, phone, async (p) => {
      await openQuestion(p); await trial(p, 'header', h); await p.locator('.topbar-menu').click(); await p.locator(`.sidebar-round ${menu}`).click();
    }]]),
  ]),
  // D swaps its bar by page: deep dive shows the round and New interview, Help shows a Back link.
  ['deep dive, header D', desktop, async (p) => { await trial(p, 'header', 'd'); await p.goto(`${url}#/deep-dive`); }],
  ['help, header D', desktop, async (p) => { await trial(p, 'header', 'd'); await p.goto(`${url}#/help`); }],
];

// Picks a trial option in the Try layouts panel, then closes the panel.
async function trial(p, name, value) {
  await p.locator('.trials-button').click();
  await p.locator(`.trials-panel [data-${name}=${value}]`).click();
  await p.keyboard.press('Escape');
}

// All questions keeps whatever open state it had on the page before, so it opens only when shut.
async function openAllQuestions(p) {
  if (!(await p.locator('.all-questions').evaluate((d) => d.open))) await p.locator('.all-questions-summary').first().click();
}

async function openFolder(p) {
  await openAllQuestions(p);
  await p.locator('.all-questions-pool > :first-child').first().click();
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
let total = 0;
for (const theme of themes) for (const scheme of ['light', 'dark']) {
  for (const [name, viewport, setup, atPicker] of screens) {
    const { ctx, p } = await openScreen(browser, { url, viewport, scheme, prefs: { theme }, atPicker, setup });
    // axe ignores the top layer, so it counts the page's fixed bars as sitting over the open phone drawer. They are covered
    // by its backdrop, so hide them for the scan.
    await p.evaluate(() => { const drawer = document.querySelector('.sidebar:popover-open'); if (drawer) for (const el of document.querySelectorAll('*')) {
      if (getComputedStyle(el).position === 'fixed' && !drawer.contains(el) && !el.contains(drawer)) el.style.visibility = 'hidden';
    } });
    const axe = () => new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);
    // A pack can accept low contrast on some elements of its own theme: pack.json "a11yExclude" lists their selectors,
    // and they skip color-contrast only while that theme is on.
    const contrastScan = axe().withRules(['color-contrast']);
    const exclude = theme === pack.theme?.id ? pack.a11yExclude ?? [] : [];
    const contrast = await exclude.reduce((scan, selector) => scan.exclude(selector), contrastScan).analyze();
    const violations = [...(await axe().disableRules(['color-contrast']).analyze()).violations, ...contrast.violations];
    total += violations.length;
    console.log(`${theme} / ${scheme} / ${name}: ${violations.length}`);
    for (const v of violations) console.log(`  ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
    await ctx.close();
  }
}

// Keyboard pass over the Timeline sidebar's pool folders, the accordion pattern (docs/plans/zag-js.md).
const failed = [];
const check = (name, ok) => { console.log(`${ok ? 'pass' : 'FAIL'}: ${name}`); if (!ok) failed.push(name); };
{
  const { ctx, p } = await openScreen(browser, { url, viewport: desktop, setup: openQuestion });
  await openAllQuestions(p);
  const headers = p.locator('.all-questions-pool > :first-child');
  const names = (await headers.allTextContents()).map((n) => n.trim());
  const focused = () => p.evaluate(() => document.activeElement.textContent.trim());
  const expanded = async () => (await headers.evaluateAll((els) => els.map((el) => el.getAttribute('aria-expanded') ?? String(el.parentElement.open))));
  // What a screen reader hears for a header: its role, name and expanded state from Chromium's accessibility tree.
  const cdp = await ctx.newCDPSession(p);
  const announced = async (i) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.all-questions-pool > :first-child')[${i}]` });
    const [node] = (await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })).nodes;
    return `${node.role.value} "${node.name.value}" expanded=${node.properties?.find((x) => x.name === 'expanded')?.value.value}`;
  };
  // Up to three folders, so a pack with two still runs every check.
  const n = Math.min(3, names.length);
  await headers.first().focus();
  const walk = [];
  for (const key of [...Array(n - 1).fill('ArrowDown'), 'ArrowUp', 'End', 'Home']) { await p.keyboard.press(key); walk.push(await focused()); }
  check('Down moves to the next folder header', JSON.stringify(walk.slice(0, n - 1)) === JSON.stringify(names.slice(1, n)));
  check('Up moves to the previous folder header', walk[n - 1] === names[n - 2]);
  check('End moves to the last folder header', walk[n] === names.at(-1));
  check('Home moves to the first folder header', walk[n + 1] === names[0]);
  await p.keyboard.press('Enter');
  const opened = await announced(0);
  check(`Enter opens a folder: ${opened}`, opened.endsWith('expanded=true'));
  await p.keyboard.press(' ');
  const closed = await announced(0);
  check(`Space closes it: ${closed}`, closed.endsWith('expanded=false'));

  // n folders open, five nav updates through the picked questions, the same n still open.
  for (let i = 0; i < n; i += 1) await headers.nth(i).click();
  const before = await expanded();
  const hrefs = await p.locator('.timeline-picked a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const stops = [...hrefs.slice(1), '#/deep-dive', hrefs[0]];
  for (let i = 0; i < 5; i += 1) await p.evaluate((h) => { location.hash = h; }, stops[i % stops.length]);
  await p.waitForTimeout(100);
  check(`${n} open folders stay open across five nav updates (${before.filter((e) => e === 'true').length} open)`,
    before.filter((e) => e === 'true').length === n && JSON.stringify(await expanded()) === JSON.stringify(before));

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
