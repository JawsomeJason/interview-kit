import { existsSync, globSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// ADR 000 sets the record format; docs/adr/README.md is the log.
const adrs = globSync('docs/adr/[0-9][0-9][0-9]-*.md').sort().map((file) => {
  const text = readFileSync(file, 'utf8');
  const fm = text.match(/^---\nstatus: (.*)\ndate: (.*)\n---\n/);
  return { file, text, num: file.match(/(\d{3})-/)[1], status: fm?.[1], date: fm?.[2], title: text.match(/^# (.*)$/m)?.[1] };
});

test('every ADR has status and date frontmatter, the MADR minimal sections and a rejected option', () => {
  const sections = ['## Context and Problem Statement', '## Considered Options', '## Decision Outcome', '### Consequences'];
  const problems = adrs.flatMap(({ file, text, status, date }) => {
    const options = text.split('\n## Considered Options\n')[1]?.split('\n## ')[0] ?? '';
    return [
      !/^(proposed|accepted|experimental|superseded by \d{3})$/.test(status) && `${file}: status "${status}" (proposed, accepted, experimental or superseded by NNN)`,
      !/^\d{4}-\d{2}-\d{2}$/.test(date) && `${file}: date "${date}" (YYYY-MM-DD)`,
      ...sections.filter((s) => !text.includes(`\n${s}\n`)).map((s) => `${file}: missing "${s}"`),
      !/^\* .*Rejected/m.test(options) && `${file}: no "Rejected: <reason>" option (no rejected alternative means it is not an ADR)`,
    ].filter(Boolean);
  });
  expect(problems).toEqual([]);
});

test('ADR numbers run from 000 with no gaps, and a superseded ADR is named by its successor', () => {
  expect(adrs.map((a) => a.num)).toEqual(adrs.map((_, i) => String(i).padStart(3, '0')));
  const unlinked = adrs.filter((a) => a.status?.startsWith('superseded by'))
    .filter((a) => !adrs.find((b) => b.num === a.status.slice(-3))?.text.includes(`Supersedes ADR ${a.num}`))
    .map((a) => a.file);
  expect(unlinked).toEqual([]);
});

test('the ADR log has one row per record with its title, status and date', () => {
  const log = readFileSync('docs/adr/README.md', 'utf8');
  const rows = [...log.matchAll(/^\| \[(\d{3})\]\((.*?)\) \| (.*?) \| (.*?) \| (.*?) \|$/gm)].map((m) => m.slice(1).join(' | '));
  const cap = (s) => s && s[0].toUpperCase() + s.slice(1);
  expect(rows).toEqual(adrs.map((a) => [a.num, a.file.replace('docs/adr/', ''), a.title, cap(a.status), a.date].join(' | ')));
});

// ADRs keep the paths they were written with; the README and AGENTS.md describe the repo as it is.
test('every repo path named in README.md and AGENTS.md exists', () => {
  const missing = ['README.md', 'AGENTS.md'].flatMap((doc) => [...readFileSync(doc, 'utf8').matchAll(/`((?:src|test|scripts|docs|pack|examples|\.githooks|\.github)\/[^`\s<*]*)`/g)]
    .filter((m) => !existsSync(m[1])).map((m) => `${doc}: ${m[1]}`));
  expect(missing).toEqual([]);
});

test("the README's field tables match the schemas (node scripts/field-tables.mjs --write)", async () => {
  const { withTables } = await import('../scripts/field-tables.mjs');
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toBe(withTables(readme));
});
