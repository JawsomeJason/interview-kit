import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// scripts/clip-audit.mjs (npm run clip) is the real check; this keeps the room where it fixed clips.
const css = (file) => readFileSync(file, 'utf8');

test('room tokens fit a focus ring, and a ticked box mid-pop with its ring', () => {
  expect(css('src/style.css')).toContain('--focus-room: calc(var(--focus-ring) + var(--focus-offset));');
  expect(css('src/style.css')).toContain('--pop-room: calc(2 * var(--focus-room));');
});

test('each column that clipped a ring keeps the room inside and gives it back outside', () => {
  expect(css('src/layouts/shell.css')).toContain('.sidebar, .main { scroll-padding-block: var(--focus-room); padding-inline: var(--focus-room); margin-inline: calc(-1 * var(--focus-room)); }');
  expect(css('src/layouts/a.css')).toContain('.layout-a .main:has(.question-side), .layout-a .question-side { padding-inline: var(--pop-room); margin-inline: calc(-1 * var(--pop-room)); }');
  expect(css('src/layouts/b.css')).toContain('padding: var(--pop-room); margin: calc(-1 * var(--pop-room)); }');
  expect(css('src/layouts/b.css')).toContain('.layout-b .main:has(.question-side) { padding-inline: var(--pop-room); margin-inline: calc(-1 * var(--pop-room)); }');
});
