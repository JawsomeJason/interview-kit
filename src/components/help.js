import { Marked } from 'marked';
import text from '../../HELP.md?raw';
import { esc } from '../esc.js';
import { md } from '../markdown.js';
import { codeBlock } from './code-block.js';
import { invoker } from './hint.js';
import { mediaRenderer } from './media.js';
import { whatsNewLink } from './whats-new.js';
import './help.css';

// HELP.md writes each FAQ entry as `### Question? {#id}` followed by a `>` short answer. The short answer
// leads the entry on the page and is the text of that entry's ? icon elsewhere in the kit.
const ENTRY = /^### (.+?) \{#([\w-]+)\}\n+((?:> .*\n?)+)/gm;
const entries = new Map([...text.matchAll(ENTRY)].map(([, question, id, quote]) => [id, { question, short: quote.replace(/^> /gm, '').trim().replace(/\n/g, ' ') }]));

// The What's new and Help links, side by side in the header and the phone drawer.
export const pageLinks = () => `${whatsNewLink()}<a href="#/help" class="help-link">Help</a>`;

// A ? that opens the entry's short answer, with a link to the whole entry on the Help page.
export function helpHint(id) {
  const entry = entries.get(id);
  if (!entry) throw new Error(`HELP.md has no entry {#${id}}`);
  return `<button type="button" class="hint help-hint" aria-label="${esc(entry.question)}" aria-describedby="hint-${id}" ${invoker(`hint-${id}`)}>?</button>`
    + `<span id="hint-${id}" class="hint-popover help-hint-popover" popover="hint">${md.parseInline(entry.short)} <a class="help-hint-more" href="#/help/${id}">More in Help</a></span>`;
}

// The Help page shows its whole text; #/help/<id> also points at one entry.
export const helpEntry = (route) => route.match(/^#\/help\/([\w-]+)$/)?.[1] ?? null;

// Ticks during the answer, a score only after: the one picture on the page.
const figures = {
  'ticks-to-score': `<figure class="help-figure"><div class="help-flow">
    <div class="help-flow-step"><p class="help-flow-label">While they answer</p><ul class="help-flow-ticks">
      <li class="help-flow-tick is-ticked"><span class="help-flow-box" role="img" aria-label="Ticked">✓</span>Names the trade-off</li>
      <li class="help-flow-tick is-ticked"><span class="help-flow-box" role="img" aria-label="Ticked">✓</span>Tests an edge case</li>
      <li class="help-flow-tick"><span class="help-flow-box" role="img" aria-label="Not ticked"></span>Explains the cost</li></ul>
      <p class="help-flow-note">No score in sight</p></div>
    <span class="help-flow-arrow" aria-hidden="true">→</span>
    <div class="help-flow-step"><p class="help-flow-label">After, on the Deep dive page</p>
      <p class="help-flow-score">2 of 3 <span class="help-flow-word">Solid</span></p></div>
  </div><figcaption class="help-figure-caption">You tick what you hear. The kit counts the ticks and shows the score after the interview.</figcaption></figure>`,
};

// Markdown elements get classes, since component CSS selects by class only.
const page = new Marked({
  renderer: {
    heading({ tokens, depth }) {
      const name = { 1: 'help-title', 2: 'help-heading', 3: 'help-question' }[depth];
      return `<h${depth} class="${name}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    blockquote({ tokens }) { return `<blockquote class="help-answer">${this.parser.parse(tokens)}</blockquote>\n`; },
    code(token) { return token.lang === 'figure' ? figures[token.text.trim()] : codeBlock(token); },
    ...mediaRenderer({ lazy: true }),
  },
  hooks: { postprocess: (html) => html.replace(/<(ol|ul|li|table|p)>/g, (_, tag) => `<${tag} class="help-${{ ol: 'steps', ul: 'list', li: 'item', table: 'table', p: 'text' }[tag]}">`) },
});

const toc = () => `<ul class="help-toc">${[...entries].map(([id, { question }]) =>
  `<li class="help-toc-item"><a href="#/help/${id}">${esc(question)}</a></li>`).join('')}</ul>`;

// Each FAQ entry is a section the route can point at; the question list follows the FAQ's opening line.
export const helpPage = () => {
  const [before, ...faq] = text.split(/^(?=### )/m);
  const sections = faq.map((chunk) => {
    const id = chunk.match(/^### .+? \{#([\w-]+)\}/)[1];
    return `<section class="help-entry" id="faq-${id}" tabindex="-1">${page.parse(chunk.replace(/ \{#[\w-]+\}/, ''))}</section>`;
  });
  return `<article class="help" tabindex="0" aria-label="Help">${page.parse(before)}${toc()}${sections.join('')}</article>`;
};

// A link to the entry already in the URL fires no hashchange, so the router never runs; show the entry again here.
function reshowEntry(e) {
  const link = e.target.closest?.('a');
  const href = link?.getAttribute('href');
  if (href !== location.hash || !helpEntry(href)) return;
  e.preventDefault();
  link.closest('[popover]')?.hidePopover();
  showHelpEntry(e.currentTarget.body, href);
}

// Scrolls to the entry the route names and focuses it, so the reader starts there.
export function showHelpEntry(el, route) {
  // The same listener added twice is added once, so every render can make sure it's there.
  el.ownerDocument.addEventListener('click', reshowEntry);
  const entry = el.querySelector(`#faq-${helpEntry(route)}`);
  if (!entry) return;
  entry.setAttribute('data-target', '');
  const jump = () => entry.scrollIntoView({ block: 'start' });
  jump();
  entry.focus({ preventScroll: true });
  // A theme's web font can swap in after the jump and push the entry down, so jump again once it is in.
  const { fonts } = el.ownerDocument;
  if (fonts?.status === 'loading') fonts.ready.then(jump);
}
