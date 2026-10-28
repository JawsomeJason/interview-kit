import { execFileSync } from 'node:child_process';
import { expect, test } from 'vitest';

// Levels are pack data, so the app names none. Word boundaries keep identifiers such as hasDecided and words such as
// "staffing" out of it.
test('no file in src or bin names a hiring level', () => {
  let out = '';
  try { out = execFileSync('grep', ['-rniE', '\\b(sde|junior|senior|principal|staff)\\b', 'src', 'bin'], { encoding: 'utf8' }); } catch (e) { if (e.status !== 1) throw e; }
  expect(out.split('\n').filter(Boolean)).toEqual([]);
});
