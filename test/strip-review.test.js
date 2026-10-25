import { expect, test } from 'vitest';
import { stripReview } from '../scripts/vite-strip-review-plugin.js';
import { parseReview } from '../src/components/review-mark.js';

const card = '---\nid: x1\nreview: needs-check\n---\n## Ask\n\nWhy?\n\n## Review\n\n**Changed:** Ask\n- **Before:** Old\n- **After:** New\n\n**Check:** It holds.\n\n**Options:**\n- Keep\n- Restore the old bullet\n';

test('the build drops the Review section from a card but keeps its flag and the rest', () => {
  expect(stripReview(card)).toBe('---\nid: x1\nreview: needs-check\n---\n## Ask\n\nWhy?\n\n');
});

test('a card with a section after Review keeps that section', () => {
  expect(stripReview('## Review\n\nnotes\n\n## Follow-ups\n\n- f1\n')).toBe('## Follow-ups\n\n- f1\n');
});

test('dev still reads the Review section into changes, check and options', () => {
  expect(parseReview(card.split('## Review\n\n')[1])).toEqual({
    changes: [{ what: 'Ask', before: 'Old', after: 'New' }],
    check: 'It holds.',
    options: ['Keep', 'Restore the old bullet'],
  });
});

test("the build drops HELP.md's guess markers along with the blank line after each", () => {
  expect(stripReview('A reason.\n\n<!-- guess: A reason. -->\n\nNext.\n')).toBe('A reason.\n\nNext.\n');
});
