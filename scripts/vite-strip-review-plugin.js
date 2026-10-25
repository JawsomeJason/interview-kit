import { readFileSync } from 'node:fs';

const REVIEW = /^## Review\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
const GUESS = /^<!-- guess: .* -->\r?\n(\r?\n)?/gm;
export const stripReview = (raw) => raw.replace(REVIEW, '').replace(GUESS, '');

// Build only: the editing notes in a card's ## Review section and HELP.md's guess markers stay out of the built file.
// The `review:` flag stays.
export default {
  name: 'strip-review',
  apply: 'build',
  enforce: 'pre',
  load(id) {
    if (!id.endsWith('.md?raw')) return null;
    return `export default ${JSON.stringify(stripReview(readFileSync(id.slice(0, -4), 'utf8')))};`;
  },
};
