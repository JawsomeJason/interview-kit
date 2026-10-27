import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { expect, test } from 'vitest';
import { parse as parseFlat } from '../../src/frontmatter.js';
import { loadPack } from '../../src/pack/load.js';

const FIXTURES = 'test/fixtures/packs';
const shown = (problems) => problems.map((p) => `${p.level} ${p.file ? `${p.file}${p.line ? `:${p.line}` : ''}  ` : ''}${p.message}`);

const copy = (name = 'sample-pack') => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ik-load-')), name);
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
};
const edit = (dir, path, from, to) => {
  const file = join(dir, path);
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${path}: "${from}" not found, so the fault was not planted`);
  writeFileSync(file, text.replace(from, to));
};

const bullets = ({ libs }) => [...libs.questions.cards, ...libs.exercise, ...libs.script].flatMap((item) => item.lookFor ?? []);
const layers = (model, roleId) => {
  const ids = model.ladder.map((l) => l.id);
  const hiring = ids.indexOf(model.roles.find((r) => r.id === roleId).hiring);
  const count = { main: 0, placement: 0, basics: 0, above: 0 };
  for (const b of bullets(model)) {
    const offset = ids.indexOf(b.level) - hiring;
    count[offset === 0 ? 'main' : offset === -1 ? 'placement' : offset < 0 ? 'basics' : 'above']++;
  }
  return count;
};
const roundMinutes = (model) => Object.fromEntries(model.rounds.map((r) => [r.id, r.segments.reduce((sum, s) => sum + s.minutes, 0)]));

test('the three example packs load with no problems, with and without strict, and lay out as design section 4 says', async () => {
  const results = [];
  for (const [pack, roles] of [['sample-pack', ['frontend-engineer', 'senior-frontend-engineer']], ['designer-pack', ['product-designer']], ['sre-pack', ['sre']]]) {
    const loose = await loadPack(join(FIXTURES, pack));
    const strict = await loadPack(join(FIXTURES, pack), { strict: true });
    results.push([pack, shown(loose.problems), shown(strict.problems), roundMinutes(loose.model), ...roles.map((r) => [r, layers(loose.model, r)])]);
  }
  expect(results).toEqual([
    ['sample-pack', [], [], { practical: 60 },
      ['frontend-engineer', { main: 8, placement: 4, basics: 0, above: 4 }],
      ['senior-frontend-engineer', { main: 4, placement: 8, basics: 4, above: 0 }]],
    ['designer-pack', [], [], { 'portfolio-review': 60 }, ['product-designer', { main: 3, placement: 2, basics: 0, above: 2 }]],
    ['sre-pack', [], [], { incident: 60 }, ['sre', { main: 4, placement: 1, basics: 0, above: 1 }]],
  ]);
});

test('22 planted faults each get their own message, file and line, and nothing else is reported', async () => {
  const dir = copy();
  const css = 'pools/css/css-04-menu-cut-off-by-its-card.md';
  const html = 'pools/html/html-01-button-or-link.md';
  const ex = 'exercises/review-a-pr/exercise.md';
  writeFileSync(join(dir, 'pools/html/html-01-copy.md'), readFileSync(join(dir, html), 'utf8'));
  writeFileSync(join(dir, 'pools/html/html-05-mismatch.md'), readFileSync(join(dir, html), 'utf8').replace('id: html-01', 'id: html-06'));
  edit(dir, 'pools/html/pool.md', 'competencies: [craft]\n', '');
  edit(dir, css, '### mid\n\n- Explains', '### Middle\n\n- Explains');
  edit(dir, 'roles/frontend-engineer.md', 'hiring: mid', 'hiring: mid-level');
  edit(dir, 'rounds/practical.md', 'exercise: review-a-pr', 'exercise: review-pr');
  edit(dir, css, '- Checks the rules in devtools instead of guessing', '- Understands how devtools shows the rules');
  edit(dir, 'pools/html/html-05-mismatch.md', 'title:', 'poolName: "HTML"\ntitle:');
  edit(dir, 'rounds/practical.md', '  - script: outro\n---\n', '  - script: outro\n---\n\nSay hello first.\n');
  edit(dir, ex, 'hand-made, though `src/ds` has both. #judgment', 'hand-made, though `src/ds` has both. #judgement');
  edit(dir, ex, 'no live region. {#error-link}', 'no live region. {#divs}');
  edit(dir, ex, '  - Show it: Click the field and press Tab. Focus skips the controls.\n', '  - Show it: Click the field and press Tab. Focus skips the controls.\n  - Check the console too\n');
  edit(dir, ex, '  - Nudge: Try the page without the mouse.', '  - nudge: Try the page without the mouse.');
  edit(dir, ex, '  - Why: Every shopper', '  1. Press Tab from the field\n  - Why: Every shopper');
  edit(dir, ex, 'competencies: [craft]\n---', 'competencies: [craft]\ndimensions: [craft]\n---');
  edit(dir, css, '### senior\n\n- Compares', '### senior\n\nSeniors also know the stacking rules.\n\n- Compares');
  edit(dir, html, '## Follow-ups', '## Notes for interviewers\n\nKeep it short.\n\n## Follow-ups');
  edit(dir, css, '## Stretch\n\n### mid', '## Stretch\n\n- A flat prompt.\n\n### mid');
  edit(dir, 'rounds/practical.md', '    minutes: 10', '    minute: 10');
  edit(dir, html, 'title: "Button or link?"', 'title: Menu cut off #1 culprit');
  edit(dir, css, 'title: "Menu cut off by its card"', 'title: Menu cut off: a card problem');

  const { model, problems } = await loadPack(dir);
  expect([model, shown(problems)]).toEqual([null, [
    'error exercises/review-a-pr/exercise.md:6  dimensions: is not a key an exercise takes.\n  Keys: id, name, minutes, competencies. Did you mean "competencies"?',
    'error exercises/review-a-pr/exercise.md:35  This line is not shown anywhere: "  - Check the console too".\n  A nested line needs a label, such as "- Why: ...", or move it up to its own bullet.',
    'error exercises/review-a-pr/exercise.md:36  This line is not shown anywhere: "  - nudge: Try the page without the mouse.".\n  A label starts with a capital letter. Did you mean "- Nudge:"?',
    'error exercises/review-a-pr/exercise.md:39  This line is not shown anywhere: "  1. Press Tab from the field".\n  A numbered line under a bullet is not kept. Write it as "- Nudge: ..." or "- Why: ...", or fold it into the bullet.',
    'error exercises/review-a-pr/exercise.md:48  {#divs} is used twice in this file.\n  Pinned ids must be unique.',
    'error exercises/review-a-pr/exercise.md:51  #judgement is not a competency in competencies.md.\n  Use one of: craft, judgment, communication.',
    'error pools/css/css-04-menu-cut-off-by-its-card.md:3  "title: Menu cut off: a card problem" is not valid YAML: Nested mappings are not allowed in compact mappings.\n  Put the value in quotes.',
    'note pools/css/css-04-menu-cut-off-by-its-card.md:24  Look for, junior: starts with "Understands", which a candidate cannot show in an interview.\n  Try proposes, names, compares, asks or explains.',
    'error pools/css/css-04-menu-cut-off-by-its-card.md:26  Look for: "### Middle" is not a level.\n  Did you mean "mid"? Levels: junior, mid, senior.',
    'error pools/css/css-04-menu-cut-off-by-its-card.md:34  This line is not shown anywhere: "Seniors also know the stacking rules.".\n  Put it in a bullet starting with "- " under "### senior", or delete it.',
    'error pools/css/css-04-menu-cut-off-by-its-card.md:46  This line is not shown anywhere: "- A flat prompt.".\n  Under "## Stretch", put it under a "### <level>" heading. Levels: junior, mid, senior.',
    'error pools/html/html-01-button-or-link.md:3  title: was cut at " #", because YAML reads " #" as a comment.\n  Put the value in quotes.',
    'error pools/html/html-01-button-or-link.md:20  "## Notes for interviewers" is not a section a card takes.\n  Sections: Ask, Look for, Follow-ups, Stretch, Review.',
    'error pools/html/html-01-copy.md:2  id: "html-01" is also used by pools/html/html-01-button-or-link.md.\n  Item ids are unique across the pack, because evidence refs start with the item id. Rename one.',
    'error pools/html/html-05-mismatch.md:2  id: "html-06" does not match its file "html-05-mismatch.md".\n  Rename the file to "html-06.md" or "html-06-<slug>.md".',
    'error pools/html/html-05-mismatch.md:3  poolName: is set by the folder and pool.md now.\n  Delete this line.',
    'error roles/frontend-engineer.md:4  hiring: "mid-level" is not a level in ladder.md.\n  Levels there: junior, mid, senior. Did you mean "mid"?',
    'error rounds/practical.md:7  run entry 3: exercise "review-pr" does not exist.\n  Exercises in this pack: review-a-pr.',
    'error rounds/practical.md:8  run entry 4: minutes come from nowhere.\n  Add "minutes:" to this entry.',
    'error rounds/practical.md:10  run entry 4: "minute" is not a run entry key. Did you mean "minutes"?',
    'error rounds/practical.md:14  This line is not shown anywhere: "Say hello first.".\n  A round is its run list only. Move the text into scripts/practical.md and add "- script: practical" to run.',
    'note 9 Look for bullets have no competency while competencies.md names some; they show under "Other". First: pools/html/html-01-button-or-link.md:16',
  ]]);
});

test('the grammar keeps wrapped bullets, tags and pins in either order, level names, and a ladder with no title', async () => {
  const dir = copy();
  const css = 'pools/css/css-04-menu-cut-off-by-its-card.md';
  edit(dir, css, '- Says what the fix does to keyboard focus #communication',
    '- Says what the fix does to\n  keyboard focus and screen readers #communication\n- Alpha behavior #judgment {#a}\n- Beta behavior {#b} #judgment');
  edit(dir, 'pools/html/html-01-button-or-link.md', '### mid', '### Mid');
  edit(dir, 'ladder.md', '# Engineer ladder\n\n', '');

  const { model, problems } = await loadPack(dir);
  const card = (id) => model.libs.questions.cards.find((c) => c.id === id);
  expect([shown(problems), card('css-04').lookFor.slice(3), card('html-01').lookFor.map((b) => b.level)]).toEqual([[], [
    { level: 'mid', text: 'Moves the menu out of the clip, and names the trade-off', competencies: ['judgment'] },
    { level: 'mid', text: 'Says what the fix does to keyboard focus and screen readers', competencies: ['communication'] },
    { level: 'mid', text: 'Alpha behavior', pin: 'a', competencies: ['judgment'] },
    { level: 'mid', text: 'Beta behavior', pin: 'b', competencies: ['judgment'] },
    { level: 'senior', text: 'Compares a portal and the popover API, with costs', competencies: ['judgment'] },
    { level: 'senior', text: 'Proposes one shared overlay so the bug stops coming back', competencies: ['judgment'] },
  ], ['mid', 'mid', 'mid']]);
});

test('strict makes the house rules errors, and accepts an avoided verb only at the level pack.json allows it', async () => {
  const dir = copy();
  const css = 'pools/css/css-04-menu-cut-off-by-its-card.md';
  writeFileSync(join(dir, 'pack.json'), '{ "format": 2, "lint": { "allowVerbs": { "senior": ["leads"] } } }\n');
  edit(dir, css, '- Compares a portal', '- Leads the overlay work for the team #judgment\n- Compares a portal');
  edit(dir, css, '- Moves the menu out', '- Leads the fix for the clipped menu #judgment\n- Moves the menu out');
  edit(dir, css, '- Checks the rules in devtools instead of guessing', '- Checks the rules in devtools, then reads the computed styles, then tries each fix in the page before shipping');
  edit(dir, 'scripts/outro.md', 'then thank them for coming.', 'then thank them — for coming.');

  const strict = await loadPack(dir, { strict: true });
  const loose = await loadPack(dir);
  expect([shown(strict.problems), strict.model, shown(loose.problems), loose.model === null]).toEqual([[
    'error pools/css/css-04-menu-cut-off-by-its-card.md:24  Look for, junior: "Checks the rules in devtools, then reads..." has 19 words.\n  Keep anchors under 12 words so they read mid-call.',
    'error pools/css/css-04-menu-cut-off-by-its-card.md:29  Look for, mid: starts with "Leads", which a candidate cannot show in an interview.\n  Try proposes, names, compares, asks or explains.',
    'error scripts/outro.md:10  this line has an em dash.\n  Use a period, comma or colon.',
  ], null, [
    'note pools/css/css-04-menu-cut-off-by-its-card.md:24  Look for, junior: "Checks the rules in devtools, then reads..." has 19 words.\n  Keep anchors under 12 words so they read mid-call.',
    'note pools/css/css-04-menu-cut-off-by-its-card.md:29  Look for, mid: starts with "Leads", which a candidate cannot show in an interview.\n  Try proposes, names, compares, asks or explains.',
  ], false]);
});

test('a YAML syntax error and a schema error both print the file and line', async () => {
  const dir = copy();
  edit(dir, 'pools/css/css-04-menu-cut-off-by-its-card.md', 'minutes: 8', 'minutes: ten');
  edit(dir, 'pools/html/pool.md', 'name: HTML and accessibility', 'name: [HTML, accessibility');
  expect(shown((await loadPack(dir)).problems)).toEqual([
    'error pools/css/css-04-menu-cut-off-by-its-card.md:4  minutes: must be a whole number.\n  Write a whole number, such as 10.',
    'error pools/html/pool.md:2  "name: [HTML, accessibility" is not valid YAML: Flow sequence in block collection must be sufficiently indented and end with a ].\n  Put the value in quotes.',
  ]);
});

test('a format 1 pack gets the one stop message and nothing else', async () => {
  expect(shown((await loadPack('test/migrate/packs/sample-pack')).problems)).toEqual([
    'error pack.json:1  format: this pack is format 1 and this kit reads format 2. Run "interview-kit migrate" to move it.',
  ]);
});

test("every frontmatter in today's sample pack reads the same under yaml as under src/frontmatter.js", () => {
  const files = ['pools', 'rounds', 'parts'].flatMap((dir) => readdirSync(join('test/migrate/packs/sample-pack', dir), { recursive: true })
    .filter((f) => f.endsWith('.md')).map((f) => join('test/migrate/packs/sample-pack', dir, f)));
  const differ = files.filter((file) => {
    const raw = readFileSync(file, 'utf8');
    const flat = parseFlat(raw);
    delete flat.body;
    return JSON.stringify(parseYaml(raw.match(/^---\n([\s\S]*?)\n---/)[1])) !== JSON.stringify(flat);
  });
  expect([files.length, differ]).toEqual([9, []]);
});
