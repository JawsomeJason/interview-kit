import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// SHA-256 of the brand name and the brand font name of a private pack, hashed so the plain words never appear here.
const HASHES = new Set([
  '46958b2c27b88a1e2c9b5716aeb6b790a9b4e5d86c640c8b34403d1f29bdc506',
  '914d57f5c287e12058f65a55004ce6cc6dd991d9d1bb04ba4e636653c5a7beba',
]);

test('no tracked text file contains a word of a private pack', () => {
  const hits = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean).flatMap((file) => {
    const bytes = readFileSync(file);
    if (bytes.includes(0)) return [];
    const words = bytes.toString('utf8').split(/[^\p{L}\p{N}]+|(?<=\p{Ll})(?=\p{Lu})/u).map((w) => w.toLowerCase());
    return words.some((w) => HASHES.has(createHash('sha256').update(w).digest('hex'))) ? [file] : [];
  });
  expect(hits).toEqual([]);
});
