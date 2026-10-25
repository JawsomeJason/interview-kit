import { globSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { highlightAll, markdownGlobs } from '../../scripts/vite-highlight-plugin.js';
import { questions } from '../../src/content.js';
import { md } from '../../src/markdown.js';

const pack = process.env.KIT_PACK ?? 'sample-pack';

test('the build highlights a js block into token spans', async () => {
  expect(await highlightAll(['```js\nconst x = 1;\n```\n'])).toEqual({
    'js\nconst x = 1;': '<span class="code-keyword">const</span> x = <span class="code-number">1</span>;',
  });
});

test('every fenced block in a card renders highlighted from the build', () => {
  const fenced = questions.filter((q) => /^\s*```\w/m.test(q.body));
  const plain = fenced.filter((q) => md.parse(q.body).match(/<pre class="code-block"[\s\S]*?<\/pre>/g).some((pre) => !pre.includes('<span class="code-')));
  expect([fenced.length > 0, plain.map((q) => q.id)]).toEqual([true, []]);
});

test('a block in a language the build does not know renders as plain escaped text', () => {
  expect(md.parse('```nosuchlang\n<b>&\n```\n')).toBe('<pre class="code-block" tabindex="0"><code class="code-block-text">&#60;b&#62;&#38;</code></pre>\n');
});

test('highlighted code carries only token classes, no colors or inline styles', async () => {
  const map = await highlightAll(markdownGlobs(pack).flatMap((p) => globSync(p)).map((f) => readFileSync(f, 'utf8')));
  const tags = new Set(Object.values(map).flatMap((html) => html.match(/<[^>]*>/g) ?? []));
  expect([tags.size > 0, [...tags].filter((tag) => !/^(?:<span class="code-[a-z]+">|<\/span>)$/.test(tag))]).toEqual([true, []]);
});

test("the highlighted Markdown is the pack's pools, rounds and parts plus Help and What's new, never its node_modules", () => {
  const pack = mkdtempSync(join(tmpdir(), 'ik-globs-'));
  for (const f of ['pools/css/a.md', 'rounds/r.md', 'parts/intro.md', 'node_modules/dep/README.md', 'dist/notes.md']) {
    mkdirSync(join(pack, dirname(f)), { recursive: true });
    writeFileSync(join(pack, f), '');
  }
  expect(markdownGlobs(pack).flatMap((p) => globSync(p)).map((f) => f.replace(pack, 'PACK')).sort())
    .toEqual(['CHANGELOG.md', 'HELP.md', 'PACK/parts/intro.md', 'PACK/pools/css/a.md', 'PACK/rounds/r.md']);
});
