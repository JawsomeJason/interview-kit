import { expect, test } from 'vitest';
import { cardForm } from '../src/dev/review/review.js';

test('the review form offers one radio per option plus clear and remove', () => {
  const q = { id: 'x1', review: 'needs-check', reviewMd: '**Check:** It holds.\n\n**Options:**\n- Keep the new follow-up\n- Restore the old follow-up' };
  expect([...cardForm(q).matchAll(/<input type="radio" name="choice" value="([^"]+)"/g)].map((m) => m[1])).toEqual([
    'Keep the new follow-up', 'Restore the old follow-up', 'Looks good, clear the flag', 'Remove the card',
  ]);
});

test('nothing is chosen up front and Send starts disabled', () => {
  const html = cardForm({ id: 'x1', review: 'needs-check', reviewMd: '**Options:**\n- Keep\n- Drop' });
  expect([/\bchecked\b/.test(html), /<button type="submit" disabled>Send<\/button>/.test(html)]).toEqual([false, true]);
});
