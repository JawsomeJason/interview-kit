import { globSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

const pack = process.env.KIT_PACK ?? 'sample-pack';
// A pack's optional brand theme follows the same rules, with raw colors allowed as in src/themes/.
const packThemes = globSync(`${pack}/theme/**/*.css`);

// The layer each folder's rules belong in; src/style.css and src/themes/ hold several layers.
const homeLayers = { components: ['components'], plugins: ['components'], layouts: ['layout'], sync: ['components', 'tokens'] };
const homeOf = (file) => (packThemes.includes(file) ? ['theme.brand'] : homeLayers[file.split('/')[1]]);

// Colors that skip the hex and function check: system colors and common names. Allowed only in themes.
const namedColor = /\b(?:canvas|canvastext|linktext|visitedtext|activetext|buttonface|buttontext|buttonborder|field|fieldtext|highlight|highlighttext|selecteditem|selecteditemtext|mark|marktext|graytext|accentcolor|accentcolortext|black|white|gray|grey|silver|red|green|blue|yellow|orange|purple|pink|brown|navy|teal)\b|\b(?:light-dark|color-mix)\(/i;

// Splits a selector list on its top-level commas, leaving :is(a, b) and friends whole.
const splitTop = (list) => {
  const parts = [''];
  let depth = 0;
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && !depth) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map((part) => part.trim());
};

// Walks each stylesheet's blocks and declarations with their ancestor preludes, so every rule
// knows its @layer. Regex-level on purpose: our CSS has no braces or semicolons inside strings.
function problems(file) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const stack = [];
  let buf = '';
  const layer = () => stack.map((p) => p.match(/^@layer ([\w.-]+)$/)?.[1]).filter(Boolean).at(-1);
  const inKeyframes = () => stack.some((p) => p.startsWith('@keyframes'));
  const block = (prelude) => {
    if (!stack.length && !/^@layer [\w.-]+$/.test(prelude)) found.push(`${file}: "${prelude}" is outside an @layer block`);
    if (prelude.startsWith('@') || inKeyframes()) return;
    const bare = prelude.replace(/\[[^\]]*\]/g, '').replace(/::?[\w-]+/g, '');
    const id = bare.match(/#[\w-]+/);
    if (id) found.push(`${file}: ID selector ${id[0]} in "${prelude}"`);
    const type = bare.match(/(?:^|[\s>+~,(])([a-zA-Z][\w-]*)/);
    if (type && !['reset', 'base'].includes(layer())) found.push(`${file}: element selector "${type[1]}" in "${prelude}" (layer ${layer()})`);
    // Every selector outside reset and base needs a class; attribute and state selectors only narrow one.
    // :root holds tokens, and theme files may style native controls by attribute ([type="checkbox"]).
    const theme = file.startsWith('src/themes/') || packThemes.includes(file);
    const classless = splitTop(prelude).filter((sel) => !/\.[\w-]/.test(sel.replace(/\[[^\]]*\]/g, '')) && sel !== ':root');
    if (classless.length && !theme && !['reset', 'base'].includes(layer())) found.push(`${file}: selector "${classless[0]}" has no class (layer ${layer()})`);
    const home = homeOf(file);
    if (home && !home.includes(layer())) found.push(`${file}: "${prelude}" is in layer ${layer()} (this folder's rules go in @layer ${home.join(' or ')})`);
  };
  const decl = (text) => {
    if (!text) return;
    if (!stack.length && !/^@layer [\w.-]+(\s*,\s*[\w.-]+)*$/.test(text) && !/^@import "[\w/.-]+" layer\([\w.-]+\)$/.test(text)) found.push(`${file}: "${text}" is outside an @layer block`);
    // No thick accent stripe down one side of a card, callout, toast or row: use a full border, tint, badge or dot.
    const stripe = text.match(/^border-(?:left|inline-start)(?:-width)?\s*:\s*(.*)$/);
    if (stripe && !/^(?:0|none|var\(--border-width\)(?:\s.*)?|1px(?:\s.*)?)$/.test(stripe[1].trim())) found.push(`${file}: side accent stripe "${text}" (use a full border, tint, badge or dot)`);
    const color = text.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i);
    if (color && !file.startsWith('src/themes/') && !packThemes.includes(file)) found.push(`${file}: raw color ${color[0]} in "${text}" (colors belong in src/themes/)`);
    const value = text.includes(':') ? text.slice(text.indexOf(':') + 1).replace(/--[\w-]+|"[^"]*"|'[^']*'/g, '') : '';
    const named = value.match(namedColor);
    if (named && !file.startsWith('src/themes/') && !packThemes.includes(file)) found.push(`${file}: color ${named[0]} in "${text}" (use a color token from src/themes/)`);
    // Every size is a token: outside @layer tokens and themes, only 0, percentages, ch measures and 100dvh are literal.
    const size = [...value.matchAll(/(?<![\w.-])(\d*\.?\d+)(?:px|r?em|r?lh|ex|cap|vw|vh|[dsl]v[hw]|vmin|vmax|cq[iwbh])\b/g)]
      .find((m) => Number(m[1]) !== 0 && m[0] !== '100dvh');
    if (size && layer() !== 'tokens' && !inKeyframes() && !file.startsWith('src/themes/') && !packThemes.includes(file)) found.push(`${file}: raw size ${size[0]} in "${text}" (add a size token in @layer tokens)`);
  };
  for (const ch of css) {
    if (ch === '{') { block(buf.trim()); stack.push(buf.trim()); buf = ''; }
    else if (ch === '}') { decl(buf.trim()); stack.pop(); buf = ''; }
    else if (ch === ';') { decl(buf.trim()); buf = ''; }
    else buf += ch;
  }
  return found;
}

test('stylesheets use layers, tokens for colors, and class-only selectors outside reset and base', () => {
  const files = [...globSync('src/**/*.css').sort(), ...packThemes];
  expect(files.length).toBeGreaterThan(10);
  expect(files.flatMap(problems)).toEqual([]);
});

// The company name is the words of the pack's theme name, so the app never spells it out. The sample pack has no
// theme and checks nothing; a branded pack run through KIT_PACK checks its own name.
test("no word of the pack's theme name in the code, docs or sample pack", () => {
  const words = (JSON.parse(readFileSync(`${pack}/pack.json`, 'utf8')).theme?.name ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const name = new RegExp(words.join('|') || '(?!)', 'i');
  const files = [...globSync('src/**/*'), ...globSync('test/**/*'), ...globSync('sample-pack/**/*'), ...globSync('capture/**/*'), 'index.html', 'README.md', 'AGENTS.md', 'package.json']
    .filter((f) => /\.(m?js|css|html|md|json)$/.test(f));
  const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n')
    .flatMap((line, i) => (name.test(line) ? [`${f}:${i + 1}`] : [])));
  expect(hits).toEqual([]);
});

test('color tokens are browser system colors in the system theme; warn and the syntax hues are the only hand-picked colors', () => {
  const theme = readFileSync('src/themes/system.css', 'utf8');
  const raw = theme.split('\n').filter((line) => /#[0-9a-f]{3,8}\b|\brgba?\(/i.test(line)).map((line) => line.trim().split(':')[0]);
  expect(raw).toEqual(['--color-warn', '--code-string', '--code-number', '--code-function', '--code-tag', '--code-attribute', '--code-property']);
});

// Every prop Open Props defines, so our names stay apart from its primitives.
const openProps = new Set(readFileSync(createRequire(import.meta.url).resolve('open-props/open-props.min.css'), 'utf8').match(/--[\w-]+(?=:)/g));
const ours = [...globSync('src/**/*.css'), ...packThemes].flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

test('none of our token names collide with an Open Props name', () => {
  expect([...new Set(ours)].filter((name) => openProps.has(name))).toEqual([]);
});

test('components and layouts use only our semantic tokens, never Open Props primitives', () => {
  const files = globSync('src/{components,layouts,sync}/**/*.css');
  const hits = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/var\((--[\w-]+)/g)]
    .filter((m) => openProps.has(m[1])).map((m) => `${f}: ${m[1]}`));
  expect(hits).toEqual([]);
});

test('the built CSS declares the layer order first and carries the Open Props scales in the tokens layer', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ik-css-'));
  await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const css = readFileSync(join(outDir, 'index.html'), 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  const firstLayer = css.match(/@layer[^{;]*[{;]/)[0];
  const tokens = css.match(/@layer tokens\{[\s\S]*?--size-3:1rem/);
  expect([firstLayer, Boolean(tokens)]).toEqual(['@layer reset,tokens,base,layout,components,utilities,theme;', true]);
}, 30_000);

// Scroll-state queries (@container scroll-state(...)) ask the element's own scroller, so they name no container.
// Media queries can't read custom properties, so the two page breakpoints are written out; this keeps them to
// exactly two ch values (phone tabs below the first, three columns from the second) and no stray px.
test('page breakpoints are the two named ch values, and container queries name declared containers', () => {
  const css = globSync('src/**/*.css').map((f) => readFileSync(f, 'utf8'));
  const widths = css.flatMap((t) => [...t.matchAll(/@media[^{]*/g)].flatMap((m) => [...m[0].matchAll(/width\s*[<>]=?\s*([\d.]+[a-z]+)|(?:min|max)-width:\s*([\d.]+[a-z]+)/g)].map((x) => x[1] ?? x[2])));
  const declared = new Set(css.flatMap((t) => [...t.matchAll(/container(?:-name)?:\s*([\w-]+)/g)].map((m) => m[1])));
  const used = css.flatMap((t) => [...t.matchAll(/@container\s+(?!scroll-state\()([\w-]+)/g)].map((m) => m[1]));
  expect([[...new Set(widths)].sort(), used.filter((name) => !declared.has(name))]).toEqual([['108ch', '154ch'], []]);
});

// Reduced motion means no motion: every transition and animation sits inside @media (prefers-reduced-motion: no-preference).
// A scroll-driven animation (its rule sets animation-timeline) tracks the reader's own scrolling, so it may stay.
test('every transition and animation waits for prefers-reduced-motion: no-preference', () => {
  const hits = [...globSync('src/**/*.css'), ...packThemes].flatMap((file) => {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const found = [];
    const stack = [];
    let rule = [];
    let buf = '';
    const flush = () => {
      const scrollDriven = rule.some((d) => d.startsWith('animation-timeline'));
      const gated = stack.some((p) => /prefers-reduced-motion:\s*no-preference/.test(p));
      const moving = rule.filter((d) => /^(?:transition|animation)(?:-name|-duration)?\s*:/.test(d) && !/:\s*none$/.test(d));
      if (moving.length && !gated && !scrollDriven) found.push(`${file}: "${moving[0]}" in "${stack.at(-1)}"`);
      rule = [];
    };
    for (const ch of css) {
      if (ch === '{') { flush(); stack.push(buf.trim()); buf = ''; }
      else if (ch === '}') { if (buf.trim()) rule.push(buf.trim()); flush(); stack.pop(); buf = ''; }
      else if (ch === ';') { if (buf.trim()) rule.push(buf.trim()); buf = ''; }
      else buf += ch;
    }
    return found;
  });
  expect(hits).toEqual([]);
});
