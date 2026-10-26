// Finds focus rings and tick pops that a scrolling or clipping ancestor cuts off. On every screen it focuses each
// focusable control, takes its outline rect (border box grown by outline-offset + outline-width), and checks it
// against the padding box of every ancestor that clips (overflow other than visible, contain: paint, clip-path),
// and against the viewport edge.
// Each Look for checkbox is also grown by the largest scale in its pop keyframes. Prints one row per clip and
// exits non-zero on any. `npm run clip` builds first; this serves dist/ on a free port (or audits CLIP_URL).
import { chromium } from 'playwright';
import { desktop, HEADER_MENU, openQuestion, openScreen, phone, serve, themes } from './screens.mjs';

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

// Runs in the page: every clip of a focus ring or a pop, as rows.
function audit(pops) {
  const name = (el) => el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
  const label = (el) => {
    const text = (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return text ? `${name(el)} "${text}"` : name(el);
  };
  const ring = (el, r, cs = getComputedStyle(el)) => {
    const grow = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
    return { left: r.left - grow, right: r.right + grow, top: r.top - grow, bottom: r.bottom + grow };
  };
  const scaled = (r, s) => {
    const dx = ((r.right - r.left) * (s - 1)) / 2, dy = ((r.bottom - r.top) * (s - 1)) / 2;
    return { left: r.left - dx, right: r.right + dx, top: r.top - dy, bottom: r.bottom + dy };
  };
  // Clips between el and the page: each ancestor's padding box on the axes it clips, up to the top layer.
  const clips = (el) => {
    const out = [];
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const paint = /paint|strict|content/.test(cs.contain) || cs.clipPath !== 'none';
      const x = paint || cs.overflowX !== 'visible', y = paint || cs.overflowY !== 'visible';
      if (x || y) {
        const b = a.getBoundingClientRect();
        const m = cs.overflowX === 'clip' || cs.overflowY === 'clip' ? parseFloat(cs.overflowClipMargin) || 0 : 0;
        const left = b.left + a.clientLeft - m, top = b.top + a.clientTop - m;
        out.push({ el: a, x, y, left, top, right: left + a.clientWidth + 2 * m, bottom: top + a.clientHeight + 2 * m });
      }
      if (a.matches(':popover-open, :modal') || cs.position === 'fixed') break;
    }
    // The viewport edge clips too: a ring that hangs past it is cut off, as at the phone bar's corner. A clipping
    // ancestor already bounds what shows (a scrolled drawer's rows sit outside the viewport until scrolled in).
    if (!out.length) out.push({ el: document.documentElement, x: true, y: true, left: 0, top: 0, right: innerWidth, bottom: innerHeight });
    return out;
  };
  const check = (el, kind, r) => clips(el).flatMap((c) => {
    // An axis where the ring is longer than the clip box (a scrollable article) can't fit, so it doesn't count.
    const x = c.x && r.right - r.left <= c.right - c.left, y = c.y && r.bottom - r.top <= c.bottom - c.top;
    const over = { left: x ? c.left - r.left : 0, right: x ? r.right - c.right : 0, top: y ? c.top - r.top : 0, bottom: y ? r.bottom - c.bottom : 0 };
    const sides = Object.entries(over).filter(([, px]) => px > 0.5).map(([side, px]) => `${side} ${px.toFixed(1)}`);
    return sides.length ? [{ kind, el: label(el), clip: name(c.el), sides: sides.join(', ') }] : [];
  });

  const keyframeScale = (want) => {
    let max = 1;
    const walk = (rules) => { for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule && rule.name === want) for (const k of rule.cssRules) {
        for (const m of `${k.style.transform} ${k.style.scale}`.matchAll(/scale\(\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)|^\s*([\d.]+)/g)) {
          max = Math.max(max, ...[m[1], m[2], m[3]].filter(Boolean).map(Number));
        }
      }
      if (rule.cssRules) walk(rule.cssRules);
    } };
    for (const sheet of document.styleSheets) walk(sheet.cssRules);
    return max;
  };

  // With a dialog or popover open, only its controls are in reach.
  const scope = [...document.querySelectorAll(':popover-open, :modal')].at(-1) ?? document;
  const focusable = [...scope.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.checkVisibility({ visibilityProperty: true }));
  const rows = [];
  let rings = 0;
  for (const el of focusable) {
    el.focus();
    if (document.activeElement !== el || !el.matches(':focus-visible')) continue;
    rings++;
    rows.push(...check(el, 'focus', ring(el, el.getBoundingClientRect())));
    for (const pop of pops) if (el.matches(pop.selector)) {
      // Ticked from the keyboard: the ring scales with the box.
      rows.push(...check(el, 'pop', scaled(ring(el, el.getBoundingClientRect()), keyframeScale(pop.keyframes))));
    }
  }
  document.activeElement?.blur();
  return { rings, rows };
}

const browser = await chromium.launch();
const runs = themes.flatMap((theme) => ['light', 'dark'].flatMap((scheme) => screens.map((s) => [theme, scheme, ...s])));

async function run([theme, scheme, name, viewport, prefs, setup, atPicker]) {
  const { ctx, p } = await openScreen(browser, { url, viewport, scheme, prefs: { layout: 'a', ...prefs, theme }, atPicker, setup });
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
