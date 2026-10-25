import { esc } from '../esc.js';
import './candidate-field.css';

export const candidateField = (name = '') => `<input type="text" class="candidate-field" value="${esc(name)}"
  aria-label="Candidate name" placeholder="Candidate name" autocomplete="off" spellcheck="false">`;

// Every copy (start screen, header, phone drawer) stays in step and saves as you type.
export function bindCandidateFields(root, onName) {
  root.addEventListener('input', ({ target }) => {
    if (!target.classList.contains('candidate-field')) return;
    for (const field of root.querySelectorAll('.candidate-field')) if (field !== target) field.value = target.value;
    onName(target.value);
  });
}
