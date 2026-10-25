import { expect, test, vi } from 'vitest';
import { hint } from '../src/components/hint.js';

const interestInvokers = (supported) =>
  vi.stubGlobal('HTMLButtonElement', supported ? class { get interestForElement() { return null; } } : class {});

// Hover and focus open a hint through interest; a tap shows no interest, so the same button also opens it as a command.
// Show, not toggle: a click after hovering leaves it open. Checked on emulated touch in Chromium (QA's p4 script).
test('hint escapes its text, and opens on hover or focus and on a tap or click', () => {
  interestInvokers(true);
  expect(hint('h1', 'no room', '<b>"5" & 4</b>')).toBe('<button type="button" class="hint" aria-describedby="h1" interestfor="h1" commandfor="h1" command="show-popover">no room</button>'
    + '<span id="h1" class="hint-popover" popover="hint">&#60;b&#62;&#34;5&#34; &#38; 4&#60;/b&#62;</span>');
});

test('without interest invokers, hint falls back to a click command', () => {
  interestInvokers(false);
  expect(hint('h1', 'no room', 'why')).toBe('<button type="button" class="hint" aria-describedby="h1" commandfor="h1" command="toggle-popover">no room</button>'
    + '<span id="h1" class="hint-popover" popover="hint">why</span>');
});
