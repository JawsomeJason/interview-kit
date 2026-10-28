import { expect, test } from 'vitest';
import { md } from '../src/markdown.js';

test('every list marked renders carries class md-list, so themes can style it', () => {
  const html = md.parse('- a\n  - nested\n- b\n\n3. c\n4. d\n');
  expect(html.match(/<(?:ul|ol)[^>]*>/g)).toEqual(['<ul class="md-list">', '<ul class="md-list">', '<ol class="md-list" start="3">']);
});
