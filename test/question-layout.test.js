import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// scripts/clip-audit.mjs and the browser QA measure the real page; these keep the rules that center it and size the dock.
const css = (file) => readFileSync(file, 'utf8');

test('the main column sits in the middle of the window, with the sidebar at the end of the column to its left, next to it', () => {
  expect(css('src/layouts/shell.css')).toContain('.app-cols { display: grid; grid-template-columns: minmax(var(--sidebar-width), 1fr) minmax(0, var(--main-width)) minmax(0, 1fr);');
  expect(css('src/layouts/shell.css')).toContain('.app-cols > .sidebar { justify-self: end; width: var(--sidebar-width); }');
});

test('the dock under the question is only as tall as its content, up to half the column', () => {
  expect(css('src/layouts/question.css')).toContain('.main:has(.question-side) { display: grid; grid-template-rows: auto minmax(0, 1fr) fit-content(50%); overflow: hidden; }');
  expect(css('src/style.css')).not.toContain('--dock-height');
});
