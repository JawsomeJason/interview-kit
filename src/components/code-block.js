import { highlighted } from 'virtual:highlighted';
import { esc } from '../esc.js';
import './code-block.css';

// Marked's code renderer for every page. The build highlights each fenced block it finds in the pack, HELP.md and
// CHANGELOG.md (scripts/vite-highlight-plugin.js), so the page carries no highlighter. A block the build didn't
// see, or a language it doesn't know, shows as plain text. A wide block scrolls, so it takes a tab stop for the arrow keys.
export const codeBlock = ({ text, lang = '' }) =>
  `<pre class="code-block" tabindex="0"><code class="code-block-text">${highlighted(lang.trim(), text) ?? esc(text)}</code></pre>\n`;
