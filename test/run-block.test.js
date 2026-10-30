import { expect, test } from 'vitest';
import { runBlock } from '../src/components/run-block.js';

test('a block with a Copy button is a card of its title, the text it copies, then the button, which names what it copies', () => {
  const html = runBlock({ title: 'Paste to the candidate', md: 'Sandbox: x', copy: true });
  expect(html).toMatch(/<div class="run-block-card"><h2 class="run-block-title">Paste to the candidate<\/h2><div class="run-block-text">.*Sandbox: x.*<\/div><button type="button" class="run-block-copy" aria-label="Copy Paste to the candidate">Copy<\/button><\/div>/s);
});

test('a block without a Copy button has no card', () => {
  expect(runBlock({ title: 'Run', md: 'Steps' })).not.toContain('run-block-card');
});
