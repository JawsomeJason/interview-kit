import { Marked } from 'marked';
import { codeBlock } from './components/code-block.js';

// The one Markdown renderer for cards, rounds, parts and the review alert. Every list it renders gets
// class md-list, so a theme can style Markdown lists under the class-only selector rule.
export const listClass = { hooks: { postprocess: (html) => html.replace(/<(ul|ol)(?=[\s>])/g, '<$1 class="md-list"') } };
export const md = new Marked(listClass, { renderer: { code: codeBlock } });
