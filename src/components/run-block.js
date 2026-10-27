import { esc } from '../esc.js';
import { md } from '../markdown.js';
import './run-block.css';

// One titled block of a Run panel, from a script's sections or an exercise's Brief and Run. A block meant for the
// candidate gets a Copy button for its text.
export const runBlock = ({ title, md: text, copy }) => `<section class="run-block"><h2 class="run-block-title">${esc(title)}</h2>
  <div class="run-block-text">${md.parse(text)}</div>${copy ? '<button type="button" class="run-block-copy">Copy</button>' : ''}</section>`;

export function bindRunBlocks(root) {
  for (const button of root.querySelectorAll('.run-block-copy')) {
    const flash = (text) => { button.textContent = text; setTimeout(() => { button.textContent = 'Copy'; }, 1500); };
    // The clipboard of the window the button is in, which matters once the app is popped out.
    button.onclick = () => button.ownerDocument.defaultView.navigator.clipboard
      .writeText(button.previousElementSibling.innerText.trim()).then(() => flash('Copied'), () => flash('Copy failed'));
  }
}
