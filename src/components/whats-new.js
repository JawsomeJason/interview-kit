import { Marked } from 'marked';
import changelog from '../../CHANGELOG.md?raw';
import { listClass, md } from '../markdown.js';
import { codeBlock } from './code-block.js';
import { getPref, setPref } from '../prefs.js';
import { mediaRenderer } from './media.js';
import './whats-new.css';

// Version, commit and build date are written in by the build (vite.config.js), so any copy of the
// single file says which release it is.
export const VERSION = __APP_VERSION__;
export const buildStamp = () => `<p class="build-stamp">Version ${VERSION} · ${__GIT_SHA__} · ${__BUILD_DATE__}</p>`;

// A dot on the link until the viewer has opened the page at this version (saved with the layout prefs).
export const whatsNewLink = () => `<a href="#/whats-new" class="whats-new-link">What's new${
  getPref('seenVersion') === VERSION ? '' : ' <span class="whats-new-dot" role="img" aria-label="New">●</span>'}</a>`;
export const markSeen = () => setPref('seenVersion', VERSION);

const notes = ({ lazy }) => new Marked(listClass, { renderer: {
  heading({ tokens, depth }) {
    const name = { 2: 'release-version', 3: 'release-headline' }[depth];
    return name ? `<h${depth} class="${name}">${this.parser.parseInline(tokens)}</h${depth}>\n` : false;
  },
  code: codeBlock,
  ...mediaRenderer({ lazy }),
} });
// The newest release opens the page; media further down loads as it scrolls into view.
const latest = notes({ lazy: false });
const older = notes({ lazy: true });

// The page has nothing else to focus, so the article takes a tab stop; from there the arrow keys scroll it.
export const whatsNewPage = (text = changelog) => {
  const [intro, ...releases] = text.split(/^(?=## )/m);
  const sections = releases.map((release, i) => `<section class="release${i ? '' : ' release-latest'}">${(i ? older : latest).parse(release)}</section>`);
  return `<article class="whats-new" tabindex="0" aria-label="What's new">${md.parse(intro).replace('</h1>', `</h1>${buildStamp()}`)}${sections.join('')}</article>`;
};
