// Runs axe-core over the main screens in light and dark, desktop and phone, and exits non-zero on
// any violation. `npm run a11y` builds first; this serves dist/ on a free port (or scans A11Y_URL).
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { desktop, go, openQuestion, openScreen, openStep, pack, phone, serve, steps, theme } from './screens.mjs';

const { server, url } = await serve(process.env.A11Y_URL, 4173);

const record = async (p) => {
  await go(p, '#/decide');
  await p.locator('.decide-option input').first().check();
  await p.getByRole('textbox', { name: 'Reason' }).fill('Clear on the basics.');
  await p.getByRole('button', { name: 'Record' }).click();
};
const picker = async (p) => { await openStep(p, '.picker'); await p.locator('.picker-passion input').first().check(); };

// [name, viewport, setup, atStart]. Every segment of the run of show is scanned as well, below.
const screens = [
  ['start', desktop, async () => {}, true],
  ['phone, start', phone, async () => {}, true],
  ['start, after New interview', desktop, async (p) => { await p.locator('.session-menu summary').click(); await p.locator('.session-new').click(); }],
  ['question', desktop, openQuestion],
  ['phone, question', phone, openQuestion],
  ['question, row menu open', desktop, async (p) => { await openQuestion(p); await p.locator('.assess-menu-button').first().click(); }],
  ['nudges shown', desktop, async (p) => { await openStep(p, '.assess'); await p.keyboard.press('h'); }],
  ['picker, a passion ticked', desktop, picker],
  ['phone, picker, a passion ticked', phone, picker],
  ['menu open', desktop, async (p) => { await p.locator('.session-menu summary').click(); }],
  ['keys open', desktop, async (p) => { await p.keyboard.press('?'); }],
  ['decide', desktop, async (p) => { await go(p, '#/decide'); }],
  ['phone, decide', phone, async (p) => { await go(p, '#/decide'); }],
  ['decide, recorded', desktop, record],
  ['debrief', desktop, async (p) => { await record(p); await go(p, '#/debrief'); }],
];

const browser = await chromium.launch({ args: ['--mute-audio'] });
let total = 0;
async function scan(p, label) {
  const axe = () => new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);
  // A pack can accept low contrast on some elements of its own theme: pack.json "a11yExclude" lists their selectors,
  // and they skip color-contrast.
  const contrastScan = axe().withRules(['color-contrast']);
  const exclude = pack.a11yExclude ?? [];
  const contrast = await exclude.reduce((scan, selector) => scan.exclude(selector), contrastScan).analyze();
  const violations = [...(await axe().disableRules(['color-contrast']).analyze()).violations, ...contrast.violations];
  total += violations.length;
  console.log(`${theme} / ${label}: ${violations.length}`);
  for (const v of violations) console.log(`  ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
}
for (const scheme of ['light', 'dark']) {
  for (const [name, viewport, setup, atStart] of screens) {
    const { ctx, p } = await openScreen(browser, { url, viewport, scheme, atStart, setup });
    await scan(p, `${scheme} / ${name}`);
    await ctx.close();
  }
  for (const [label, viewport] of [['', desktop], ['phone, ', phone]]) {
    const { ctx, p } = await openScreen(browser, { url, viewport, scheme });
    for (const hash of await steps(p)) {
      await go(p, hash);
      await scan(p, `${scheme} / ${label}${hash}`);
    }
    await ctx.close();
  }
}

const failed = [];
const check = (name, ok) => { console.log(`${ok ? 'pass' : 'FAIL'}: ${name}`); if (!ok) failed.push(name); };
{
  const { ctx, p } = await openScreen(browser, { url, viewport: desktop, setup: openQuestion });
  const cdp = await ctx.newCDPSession(p);
  const question = await p.evaluate(() => location.hash);
  const [first] = await steps(p);
  // Listeners on document and window after 1 page change and after 50.
  const listeners = async () => {
    let n = 0;
    for (const expression of ['document', 'window']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      n += (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
    }
    return n;
  };
  const nav = (i) => go(p, i % 2 ? first : question);
  await nav(1);
  const after1 = await listeners();
  for (let i = 2; i <= 50; i += 1) await nav(i);
  const after50 = await listeners();
  check(`no listener leak: ${after1} document and window listeners after 1 page change, ${after50} after 50`, after1 === after50);
  await ctx.close();
}

await browser.close();
await server?.close();
console.log(total ? `${total} violation(s)` : 'No violations.');
console.log(failed.length ? `${failed.length} keyboard check(s) failed` : 'Keyboard checks pass.');
process.exit(total || failed.length ? 1 : 0);
