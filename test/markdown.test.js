import { expect, test } from 'vitest';
import { roundPage } from '../src/components/round-page.js';
import { md } from '../src/markdown.js';

test('every list marked renders carries class md-list, so themes can style it', () => {
  const html = md.parse('- a\n  - nested\n- b\n\n3. c\n4. d\n');
  expect([html.match(/<(?:ul|ol)[^>]*>/g), roundPage({ name: 'R', body: '1. Say hi\n2. Ask\n' }).includes('<ol class="md-list">')])
    .toEqual([['<ul class="md-list">', '<ul class="md-list">', '<ol class="md-list" start="3">'], true]);
});
