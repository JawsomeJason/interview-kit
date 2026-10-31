import { esc } from '../esc.js';
import { md } from '../markdown.js';
import './run-block.css';

// One titled block of a Run panel, from a script's sections or an exercise's Brief and Run. A block meant for the
// candidate is a card of its title, the text, and a Copy button for that text.
export const runBlock = ({ title, md: text, copy }) => {
  const inner = `<h2 class="run-block-title">${esc(title)}</h2><div class="run-block-text">${md.parse(text)}</div>`;
  return `<section class="run-block">${copy
    ? `<div class="run-block-card">${inner}<button type="button" class="run-block-copy" aria-label="Copy ${esc(title)}">Copy</button></div>`
    : inner}</section>`;
};

export function bindRunBlocks(root) {
  for (const button of root.querySelectorAll('.run-block-copy')) {
    const flash = (text) => { button.textContent = text; setTimeout(() => { button.textContent = 'Copy'; }, 1500); };
    // The clipboard of the window the button is in, which matters once the app is popped out.
    button.onclick = () => button.ownerDocument.defaultView.navigator.clipboard
      .writeText(button.closest('.run-block-card').querySelector('.run-block-text').innerText.trim()).then(() => flash('Copied'), () => flash('Copy failed'));
  }
}
