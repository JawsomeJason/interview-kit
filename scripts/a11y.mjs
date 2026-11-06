// Runs axe-core over the main screens in light and dark, desktop and phone, and exits non-zero on
// any violation. `npm run a11y` builds first; this serves dist/ on a free port (or scans A11Y_URL).
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { desktop, go, openQuestion, openScreen, openStep, pack, phone, serve, steps, theme } from './screens.mjs';
import { loadPack } from '../src/pack/load.js';
import { itemsOf, observables } from '../src/model/observables.js';

const { server, url } = await serve(process.env.A11Y_URL, 4173);

const record = async (p) => {
  await go(p, '#/decide');
  await p.locator('.decide-option input').first().check();
  await p.getByRole('textbox', { name: 'Reason' }).fill('Clear on the basics.');
  await p.getByRole('button', { name: 'Record' }).click();
};
const picker = async (p) => { await openStep(p, '.picker'); await p.locator('.picker-named').first().click(); await p.locator('.picker-ask').first().click(); };
// The course on a question: Done on it, then back to it, so it reads as finished and an edit says it becomes an amendment.
const revisit = async (p) => { await openQuestion(p); await p.keyboard.press('d'); await p.waitForTimeout(150); await p.keyboard.press('['); await p.waitForTimeout(150); };
// A session in Listen mode, from the start page.
const listen = async (p) => {
  await p.getByLabel('Who are you meeting?').fill('Ada Lovelace');
  if (await p.locator('.start-name').count()) await p.locator('.start-name').fill('Grace Hopper');
  await p.locator('input[name="marking"][value="ai"]').check();
  await p.getByRole('button', { name: 'Start interview' }).click();
  await p.waitForFunction(() => document.querySelector('main')?.dataset.route === location.hash);
  await openQuestion(p);
};
// A second opinion's evidence file for the first question this round lists: every Look for row proposed, with a quote.
const { model } = await loadPack(process.env.KIT_PACK ?? 'examples/sample-pack');
const secondOpinion = async (p) => {
  const me = await p.evaluate(() => [...document.querySelectorAll('.course-step')].map((a) => a.dataset.step).find((k) => k && !k.includes('/')));
  const [role, round] = await p.evaluate(() => [document.querySelector('.session-round').textContent, location.hash]);
  const card = itemsOf(model).get(me);
  const r = model.rounds.find((x) => round.startsWith(`#/${x.id}/`));
  const h = (i) => `${(0x0194c0de0000 + i).toString(16).padStart(12, '0')}.0000`;
  const pub = [{ t: 'open', v: 2, sid: 'ai-sid', author: 'a-ai', role: model.roles.find((x) => role.startsWith(x.name))?.id ?? model.roles[0].id, round: r.id, pack: { id: model.id, version: 'second-opinion', sha: 'transcript' } },
    { t: 'name', name: 'Second opinion (AI)' }, { t: 'put', k: 'session.candidate', v: 'Ada Lovelace' }, { t: 'decided' }].map((e, n) => ({ n, h: h(n), ...e }));
  const prv = observables(card).map((o, n) => ({ n, h: h(10 + n), t: 'mark', o: o.ref, d: o.digest, s: n % 2 ? 'unseen' : 'seen', src: 'ai', quote: 'I would reach for the native element here, so focus and the name come for free.', at: `${12 + n}:04` }));
  return Buffer.from(JSON.stringify({ kit: 'interview-kit-evidence', v: 2, author: 'a-ai', pub, prv }));
};
const proposals = async (p) => {
  await openQuestion(p);
  const file = await secondOpinion(p);
  await record(p);
  await p.locator('.evidence-add-input').setInputFiles({ name: 'second-opinion.json', mimeType: 'application/json', buffer: file });
  await p.waitForSelector('.proposal');
  await p.locator('.proposal-button[data-act="accept"]').first().click();
};

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
  ['course dock, Skip open', desktop, async (p) => { await openQuestion(p); await p.keyboard.press('s'); }],
  ['course dock, Bookmark open', desktop, async (p) => { await openQuestion(p); await p.keyboard.press('b'); }],
  ['course, a finished step revisited', desktop, revisit],
  ['phone, course, a finished step revisited', phone, revisit],
  ['course, off the path', desktop, async (p) => { await openQuestion(p); const off = model.libs.questions.cards.find((c) => !c.id.startsWith('css'))?.id; await go(p, `${(await p.evaluate(() => location.hash)).split('/').slice(0, 3).join('/')}/${off}`); }],
  ['Listen mode, question', desktop, listen, true],
  ['decide, second opinion proposals', desktop, proposals],
  ['phone, decide, second opinion proposals', phone, proposals],
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

{
  const { ctx, p } = await openScreen(browser, { url, viewport: desktop, setup: openQuestion });
  const tree = async () => p.locator('.session-nav').ariaSnapshot();
  const links = async () => p.locator('.session-nav .course-path .course-step').evaluateAll((as) => as.map((a) => ({ name: a.getAttribute('aria-label'), state: a.querySelector('.course-state')?.textContent.trim(), current: a.getAttribute('aria-current') })));
  const words = /(Now · \d+ min|Up next|Done [^,]+|Skipped · [^,]+|Left [^,]+|\d+ min)(, amended at .+)?$/;
  const named = (list) => list.every((l) => l.name && l.state && words.test(l.name) && l.name.includes(l.state));
  let list = await links();
  check('every course step has a name that carries its state in words, and the same words show', named(list));
  check('exactly one course step is aria-current="step"', list.filter((l) => l.current === 'step').length === 1);
  check('the accessibility tree names the course navigation and its current step', /navigation "Course"/.test(await tree()) && (await tree()).includes(list.find((l) => l.current).name));
  check("the dock's main button names its key", (await p.locator('.course-dock [data-course="main"]').getAttribute('aria-keyshortcuts')) === 'd');
  const at = () => p.evaluate(() => location.hash);
  const was = await at();
  await p.keyboard.press('d');
  await p.waitForFunction((h) => location.hash !== h, was);
  list = await links();
  check('d alone finishes the step and moves the current step on, with no mouse', list.some((l) => /Done /.test(l.name)) && (await at()) !== was);
  await p.keyboard.press('s');
  check('s opens the Skip reasons as a named group with focus on the first', (await p.getByRole('group', { name: 'Skip reason' }).count()) === 1
    && (await p.evaluate(() => document.activeElement?.dataset.focus)) === 'skip-1');
  await p.keyboard.press('1');
  await p.waitForTimeout(150);
  check('1 skips with No time, and the rail says so in words', (await links()).some((l) => /Skipped · No time/.test(l.name)));
  await p.keyboard.press('[');
  await p.waitForTimeout(150);
  check('[ steps back, and the step left reads Left', (await links()).some((l) => /, Left /.test(l.name)));
  await p.keyboard.press('b');
  check('b opens the bookmark word box with focus in it', (await p.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'One word for this bookmark, optional');
  await p.keyboard.type('strong');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  check('Enter saves the bookmark and says so in the live region', /Bookmarked .+ · strong\./.test(await p.locator('.course-toast').textContent()));
  await ctx.close();
}

await browser.close();
await server?.close();
console.log(total ? `${total} violation(s)` : 'No violations.');
console.log(failed.length ? `${failed.length} keyboard check(s) failed` : 'Keyboard checks pass.');
process.exit(total || failed.length ? 1 : 0);
