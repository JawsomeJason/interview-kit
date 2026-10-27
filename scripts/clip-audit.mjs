// Finds focus rings and tick pops that a scrolling or clipping ancestor cuts off. On every screen it focuses each
// focusable control, takes its outline rect (border box grown by outline-offset + outline-width), and checks it
// against the padding box of every ancestor that clips (overflow other than visible, contain: paint, clip-path),
// and against the viewport edge.
// Each Look for checkbox is also grown by the largest scale in its pop keyframes. Prints one row per clip and
// exits non-zero on any. `npm run clip` builds first; this serves dist/ on a free port (or audits CLIP_URL).
import { chromium } from 'playwright';
import { audit } from './clip.mjs';
import { desktop, HEADER_MENU, openQuestion, openScreen, phone, serve, theme } from './screens.mjs';

const { server, url } = await serve(process.env.CLIP_URL, 4174);
// Controls that scale up for a moment, and the keyframes that scale them.
const pops = [{ selector: '.look-for .option-row-control', keyframes: 'tick-pop' }];

// [name, viewport, prefs, setup, atPicker]
const screens = [
  ['setup', desktop, {}, async () => {}, true],
  ['phone, setup', phone, {}, async () => {}, true],
  ['intro', desktop, {}, async () => {}],
  ['deep dive', desktop, {}, async (p) => { await p.goto(`${url}#/deep-dive`); }],
  ['question', desktop, {}, openQuestion],
  ['question, header menu open', desktop, {}, async (p) => { await openQuestion(p); await p.locator(`.app-header ${HEADER_MENU}`).click(); }],
  ['question, All questions open', desktop, {}, async (p) => { await openQuestion(p); await p.locator('.now-next-browse').click(); }],
  ['phone, question tab', phone, {}, openQuestion],
  ['phone, assess tab', phone, {}, async (p) => { await openQuestion(p); await p.locator('[data-tab=assess]').click(); }],
  ['phone, drawer open', phone, {}, async (p) => { await openQuestion(p); await p.locator('.topbar-menu').click(); }],
  ['phone, All questions open', phone, {}, async (p) => { await openQuestion(p); await p.locator('.topbar-menu').click(); await p.locator('.now-next-browse').click(); }],
  ["what's new", desktop, {}, async (p) => { await p.goto(`${url}#/whats-new`); }],
  ["phone, what's new", phone, {}, async (p) => { await p.goto(`${url}#/whats-new`); }],
  ['help', desktop, {}, async (p) => { await p.goto(`${url}#/help`); }],
  ['phone, help', phone, {}, async (p) => { await p.goto(`${url}#/help`); }],
];

const browser = await chromium.launch();
const runs = ['light', 'dark'].flatMap((scheme) => screens.map((s) => [theme, scheme, ...s]));

async function run([theme, scheme, name, viewport, prefs, setup, atPicker]) {
  const { ctx, p } = await openScreen(browser, { url, viewport, scheme, prefs, atPicker, setup });
  // One key press so script focus counts as keyboard focus and shows the ring.
  await p.keyboard.press('Tab');
  const { rings, rows } = await p.evaluate(audit, pops);
  await ctx.close();
  if (!rings) throw new Error(`${theme} / ${scheme} / ${name}: no focus ring to measure`);
  return rows.map((r) => ({ screen: `${theme} / ${scheme} / ${name}`, ...r }));
}

const found = [];
for (let i = 0; i < runs.length; i += 6) found.push(...(await Promise.all(runs.slice(i, i + 6).map(run))).flat());
await browser.close();
await server?.close();

for (const r of found) console.log(`${r.screen} | ${r.kind} | ${r.el} | ${r.clip} | ${r.sides}`);
// The same control clipped by the same ancestor on many screens is one fix.
const groups = Map.groupBy(found, (r) => `${r.kind} | ${r.el} | ${r.clip}`);
console.log(`\n${groups.size} distinct clip(s):`);
for (const [key, rows] of groups) console.log(`  ${key} | ${rows.length} screen(s), e.g. ${rows[0].screen}: ${rows[0].sides}`);
console.log(found.length ? `${found.length} clip(s) across ${runs.length} screens` : `No clips across ${runs.length} screens.`);
process.exit(found.length ? 1 : 0);
