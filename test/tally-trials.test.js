import { expect, test } from 'vitest';
import { parseSummary, readFolder, tally, coverage, render } from '../scripts/tally-trials.mjs';

const dir = new URL('./fixtures/summaries', import.meta.url).pathname;
const interviews = readFolder(dir);

test('the Setup line and the note lines are parsed, the old Layout label and the new Question layout label alike', () => {
  const text = 'Zed Quillfeather · Pair programming\nSetup: Question layout B · Header C · Sidebar D · Setup page A · Theme Acme · Scheme Dark (auto)\nLayout B: crowds\nTheme Acme: low contrast';
  expect(parseSummary(text)).toEqual({
    setup: { Layout: 'B', Header: 'C', Sidebar: 'D', 'Setup page': 'A', Theme: 'Pack' },
    notes: [{ group: 'Layout', variant: 'B', text: 'crowds' }, { group: 'Theme', variant: 'Pack', text: 'low contrast' }],
  });
  expect(parseSummary('Setup: Layout A · Header A · Sidebar A · Setup page A · Theme Default · Scheme Light (auto)').setup.Layout).toBe('A');
});

test('only .txt and .md files are read', () => {
  expect(interviews.map((i) => i.file)).toEqual(['four.txt', 'one.txt', 'three.md', 'two.txt']);
});

test('interviews are counted per variant', () => {
  const byTrial = Object.fromEntries(tally(interviews).map((t) => [t.group, t.variants.map((v) => `${v.variant}${v.interviews}`).join(' ')]));
  expect(byTrial).toEqual({
    Layout: 'A2 B2',
    Header: 'A2 B2 C0 D0',
    Sidebar: 'A2 B1 C0 D1',
    'Setup page': 'A1 B1 C1 D1',
    Theme: 'Default2 Pack2',
  });
});

test('notes are quoted and attributed to their file', () => {
  const layoutB = tally(interviews)[0].variants[1];
  expect(layoutB.notes).toEqual([
    { file: 'four.txt', text: 'dock keeps ticks in reach' },
    { file: 'two.txt', text: 'header crowds the pager' },
  ]);
});

test('verdicts: needs more interviews until every variant has two, ready to pick after', () => {
  expect(tally(interviews).map((t) => `${t.group}: ${t.verdict}`)).toEqual([
    'Layout: ready to pick',
    'Header: needs more interviews',
    'Sidebar: needs more interviews',
    'Setup page: needs more interviews',
    'Theme: ready to pick',
  ]);
});

test('a trial marked close needs three interviews per variant, and shows as a close call in between', () => {
  expect(tally(interviews, ['Layout'])[0].verdict).toBe('close call: give each variant one more');
});

test('rotation coverage lists the header and sidebar pairs with each layout still missing', () => {
  expect(coverage(interviews)).toEqual({
    Header: ['C with Layout A', 'C with Layout B', 'D with Layout A', 'D with Layout B'],
    Sidebar: ['B with Layout A', 'C with Layout A', 'C with Layout B', 'D with Layout B'],
  });
});

test('the output holds no candidate name and nothing from the summary body', () => {
  const out = render(interviews);
  for (const word of ['Zed', 'Quillfeather', 'Mira', 'Oddsworth', 'Pell', 'Nutmeg', 'Rook', 'Vandermeer', 'froze', 'Specificity', 'cascade', 'Lifting state up']) expect(out).not.toContain(word);
  expect(out).toContain('"header crowds the pager" (two.txt)');
  expect(out).toContain('Layout: ready to pick');
});

test("a note's indented later lines belong to that note, and the tally quotes them under it", () => {
  const text = 'Setup: Question layout A · Header B · Sidebar A · Setup page A · Theme Default · Scheme Light (auto)\n'
    + 'Header B: clock is too small\n  and the menu hides New interview\nSidebar A: fine';
  const { notes } = parseSummary(text);
  const out = render([{ file: 'five.txt', ...parseSummary(text) }]);
  expect([notes, out.includes('    - "clock is too small\n      and the menu hides New interview" (five.txt)')]).toEqual([[
    { group: 'Header', variant: 'B', text: 'clock is too small\nand the menu hides New interview' },
    { group: 'Sidebar', variant: 'A', text: 'fine' },
  ], true]);
});
