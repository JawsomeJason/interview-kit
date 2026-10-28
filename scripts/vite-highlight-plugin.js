import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Lexer, walkTokens } from 'marked';
import { bundledLanguages, createHighlighter } from 'shiki';
import { esc } from '../src/esc.js';

// Highlights every fenced block in the Markdown the app renders into virtual:highlighted, at build and dev time,
// for the code renderer in src/components/code-block.js.

// A TextMate theme whose "colors" are token names. Each token becomes <span class="code-NAME">, colored by the
// --code-NAME tokens in src/themes/system.css, so the output holds no colors and every theme can recolor it.
const theme = {
  name: 'code-tokens',
  colors: { 'editor.foreground': 'foreground' },
  tokenColors: [
    // Punctuation and operators stay plain: they were 6 in 10 spans, so coloring them doubled the page's code.
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: 'foreground' } },
    { scope: ['keyword', 'storage', 'keyword.operator.new', 'keyword.operator.expression', 'variable.language'], settings: { foreground: 'keyword' } },
    { scope: ['string', 'punctuation.definition.string'], settings: { foreground: 'string' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'comment' } },
    { scope: ['constant.numeric', 'constant.language', 'keyword.other.unit', 'support.constant'], settings: { foreground: 'number' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function'], settings: { foreground: 'function' } },
    { scope: ['entity.name.tag', 'support.class.component', 'entity.name.type', 'support.type.primitive', 'support.type.builtin', 'entity.other.inherited-class'], settings: { foreground: 'tag' } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: 'attribute' } },
    { scope: ['support.type.property-name', 'meta.object-literal.key', 'variable.other.property', 'support.variable.property'], settings: { foreground: 'property' } },
  ],
};

// A block's HTML: one span per run of same-colored tokens, plain text for the rest.
const toHtml = (lines) => lines.map((line) => line
  .reduce((runs, { content, color }) => {
    if (runs.at(-1)?.color === color) runs.at(-1).content += content;
    else runs.push({ content, color });
    return runs;
  }, [])
  .map(({ content, color }) => (color === 'foreground' ? esc(content) : `<span class="code-${color}">${esc(content)}</span>`))
  .join('')).join('\n');

const fences = (markdown) => {
  const found = [];
  walkTokens(new Lexer().lex(markdown), (t) => { if (t.type === 'code' && t.lang) found.push({ lang: t.lang.trim(), text: t.text }); });
  return found;
};

// Highlighted HTML for each fenced block in the given Markdown sources, keyed `${lang}\n${code}`.
// A language Shiki doesn't ship is skipped, so its block renders as plain text.
export async function highlightAll(sources) {
  const blocks = sources.flatMap(fences).filter(({ lang }) => lang in bundledLanguages);
  const highlighter = await createHighlighter({ themes: [theme], langs: [...new Set(blocks.map((b) => b.lang))] });
  // No time limit: Shiki gives up on a line after 500 ms by default, so a loaded machine built partly plain blocks.
  return Object.fromEntries(blocks.map(({ lang, text }) =>
    [`${lang}\n${text}`, toHtml(highlighter.codeToTokensBase(text, { lang, theme: theme.name, tokenizeTimeLimit: 0 }))]));
}

const id = 'virtual:highlighted';

// The Markdown the app renders: the pack's cards, rounds and parts, plus Help and What's new from the app folder. Named
// folders, not `${pack}/**`, because a pack repo's root holds node_modules.
export const markdownGlobs = (pack) => [`${pack}/{pools,rounds,roles,scripts,exercises}/**/*.md`, `${pack}/{ladder,competencies}.md`, 'HELP.md', 'CHANGELOG.md'];

// patterns: globs of the Markdown files the app renders, relative to the app folder.
export default (patterns) => ({
  name: 'highlight',
  resolveId: (source) => (source === id ? `\0${id}` : undefined),
  // load() watches only the files that existed, so a new Markdown file re-runs it on the next request.
  configureServer(server) {
    server.watcher.on('add', (file) => {
      const mod = file.endsWith('.md') && server.moduleGraph.getModuleById(`\0${id}`);
      if (mod) server.moduleGraph.invalidateModule(mod);
    });
  },
  async load(resolved) {
    if (resolved !== `\0${id}`) return undefined;
    const files = patterns.flatMap((p) => globSync(p)).map((f) => resolve(f));
    for (const f of files) this.addWatchFile(f);
    const map = await highlightAll(files.map((f) => readFileSync(f, 'utf8')));
    return `const blocks = ${JSON.stringify(map)};\nexport const highlighted = (lang, text) => blocks[\`\${lang}\\n\${text}\`];\n`;
  },
});
