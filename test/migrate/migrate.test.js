import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import migrate from '../../bin/commands/migrate.js';
import { loadPack } from '../../src/pack/load.js';

afterEach(() => vi.restoreAllMocks());

const LADDER = '# Ladder\n\n## Junior {#junior}\n\nWorks with guidance.\n\n## Mid {#mid}\n\nWorks alone.\n\n## Senior {#senior}\n\nLifts the team.\n';
const ROLE = ['--hiring', 'mid', '--role', 'frontend-engineer', '--name', 'Frontend engineer'];

const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' });
const status = (dir) => git(dir, 'status', '--porcelain', '-uall').split('\n').filter(Boolean);

// A copy of a format 1 pack with the ladder.md its author writes first, committed to a fresh git repository.
const packRepo = (from, { commit = true } = {}) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ik-migrate-')), 'pack');
  cpSync(from, dir, { recursive: true });
  writeFileSync(join(dir, 'ladder.md'), LADDER);
  if (commit) {
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'format 1');
  }
  return dir;
};

const run = async (...args) => {
  const out = [];
  const err = [];
  vi.spyOn(console, 'log').mockImplementation((line) => out.push(line));
  vi.spyOn(console, 'error').mockImplementation((line) => err.push(line));
  const code = await migrate(args);
  vi.restoreAllMocks();
  return { code, out: out.join('\n'), err: err.join('\n') };
};

test('migrates a copy of the sample pack in place, proves the five checks, and a second run does nothing', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack');
  expect(await run('--pack', dir, ...ROLE, '--write')).toEqual({
    code: 0,
    err: '',
    out: [
      'Migrated to format 2:',
      '  change pack.json',
      '  change pools/css/css-01-center-a-box.md',
      '  change pools/css/css-02-specificity-clash.md',
      '  change pools/css/css-03-dark-mode-colors.md',
      '  add    pools/css/pool.md',
      '  change pools/html/html-01-button-or-link.md',
      '  change pools/html/html-02-label-a-form-field.md',
      '  change pools/html/html-03-headings-outline.md',
      '  add    pools/html/pool.md',
      '  add    roles/frontend-engineer.md',
      '  change rounds/sample.md',
      '  add    scripts/intro.md',
      '  add    scripts/outro.md',
      '  add    scripts/sample.md',
      '  delete parts/intro.md',
      '  delete parts/outro.md',
      'Checks: 6 of 6 cards read the same. 16 lines removed and 26 added, all expected. Round minutes and role rounds match. Loads with 0 errors, 2 notes.',
      `To undo: run "git restore . && git clean -fd" in ${dir}.`,
    ].join('\n'),
  });
  expect(readFileSync(join(dir, 'pools/css/css-01-center-a-box.md'), 'utf8')).toBe([
    '---', 'id: css-01', 'title: "Center a box"', 'minutes: 5', 'tier: core', '---', '',
    '## Ask', '', 'Center a fixed-size box inside its parent, both ways.', '',
    '## Look for', '', '### mid', '',
    '- Uses grid place-items or flex with both alignments', '- Knows margin auto centers horizontally', '- Checks the parent has a height', '',
    '## Follow-ups', '', '- What changes if the box has no fixed size?', '- How would you center text inside it?', '',
  ].join('\n'));
  expect(readFileSync(join(dir, 'pools/css/pool.md'), 'utf8')).toBe('---\nname: "CSS"\n---\n');
  expect(readFileSync(join(dir, 'rounds/sample.md'), 'utf8')).toBe([
    '---', 'id: sample', 'name: Sample round', 'run:', '  - script: intro', '  - script: sample', '    minutes: 15',
    '  - questions: all', '    title: Deep dive', '    minutes: 20', '  - script: outro', '---', '',
  ].join('\n'));
  expect(readFileSync(join(dir, 'pack.json'), 'utf8')).toBe('{ "format": 2 }\n');
  expect(existsSync(join(dir, 'parts'))).toBe(false);

  const { model, problems } = await loadPack(dir);
  expect(problems.filter((p) => p.level === 'error')).toEqual([]);
  expect(model.roles).toEqual([expect.objectContaining({ id: 'frontend-engineer', hiring: 'mid', rounds: ['sample'] })]);
  expect(model.rounds[0].segments.map((s) => [s.ref, s.minutes])).toEqual([['intro', 5], ['sample', 15], ['all', 20], ['outro', 5]]);

  const after = status(dir);
  expect(await run('--pack', dir, ...ROLE, '--write')).toEqual({ code: 0, err: '', out: 'Already format 2, nothing to do.' });
  expect(status(dir)).toEqual(after);
});

test('migrates copies of the demo pack and the themed pack, the second without rounds and so without a role', async () => {
  const demo = packRepo('test/migrate/packs/demo-pack');
  const demoRun = await run('--pack', demo, ...ROLE, '--write');
  expect([demoRun.code, demoRun.out.split('\n').at(-2)]).toEqual([0, 'Checks: 7 of 7 cards read the same. 18 lines removed and 27 added, all expected. Round minutes and role rounds match. Loads with 0 errors, 2 notes.']);

  const themed = packRepo('test/migrate/packs/themed-pack');
  expect(await run('--pack', themed, '--hiring', 'mid', '--write')).toEqual({
    code: 0,
    err: '',
    out: [
      'Migrated to format 2:',
      '  change pack.json',
      '  change pools/css/css-01-grid-or-flex.md',
      '  add    pools/css/pool.md',
      'Note: this pack has no rounds/ folder, so no role was written. Add roles/<id>.md by hand.',
      'Checks: 1 of 1 cards read the same. 3 lines removed and 5 added, all expected. Loads with 0 errors, 0 notes.',
      `To undo: run "git restore . && git clean -fd" in ${themed}.`,
    ].join('\n'),
  });
  expect(readFileSync(join(themed, 'pack.json'), 'utf8')).toBe('{ "format": 2, "theme": { "id": "brand", "name": "Fixture" }, "allowResumeToTypeSafe": true, "unrankedPools": ["css"] }\n');
  for (const dir of [demo, themed]) expect(await run('--pack', dir, '--hiring', 'mid', '--write')).toEqual({ code: 0, err: '', out: 'Already format 2, nothing to do.' });
});

test('without --write it prints the plan and the proof and changes nothing', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack');
  const { code, out } = await run('--pack', dir, ...ROLE);
  expect([code, out.split('\n')[0], out.split('\n').at(-1)]).toEqual([
    0,
    'Plan for format 2 (nothing written; add --write to apply it):',
    'Checks: 6 of 6 cards read the same. 16 lines removed and 26 added, all expected. Round minutes and role rounds match. Loads with 0 errors, 2 notes.',
  ]);
  expect(status(dir)).toEqual([]);
  expect(readdirSync(join(dir, '..'))).toEqual(['pack']);
});

test('--write refuses a dirty tree and a folder outside git, and changes nothing in either', async () => {
  const dirty = packRepo('test/migrate/packs/sample-pack');
  appendFileSync(join(dirty, 'pools/css/css-01-center-a-box.md'), '\nscratch\n');
  expect(await run('--pack', dirty, ...ROLE, '--write')).toEqual({
    code: 1,
    out: '',
    err: `${dirty} has uncommitted changes. Commit or stash your changes first, so the migration can be undone with git.`,
  });
  expect(status(dirty)).toEqual([' M pools/css/css-01-center-a-box.md']);

  const loose = packRepo('test/migrate/packs/sample-pack', { commit: false });
  expect(await run('--pack', loose, ...ROLE, '--write')).toEqual({
    code: 1,
    out: '',
    err: `${loose} is not in a git repository, so the migration could not be undone. Run "git init" and commit the pack first.`,
  });
  expect([readFileSync(join(loose, 'pack.json'), 'utf8'), existsSync(join(loose, 'parts/intro.md'))]).toEqual(['{ "format": 1 }\n', true]);
});

test('a pack without ladder.md is told to write it first', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack', { commit: false });
  unlinkSync(join(dir, 'ladder.md'));
  expect(await run('--pack', dir, ...ROLE)).toEqual({
    code: 1,
    out: '',
    err: 'ladder.md is missing. Write it first, one "## Name {#id}" heading per level, lowest first, with --hiring among them: the migration puts every Look for bullet at that level.',
  });
});

test('--write touches only the migration files: .git, docs, package.json and ignored files keep their bytes', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules/kept.txt'), 'ignored\n');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs/keep.md'), 'keep me\n');
  writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
  writeFileSync(join(dir, 'AGENTS.md'), '# Agents\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'extras');

  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const hashes = () => Object.fromEntries([...walk(join(dir, '.git')).filter((f) => !f.endsWith('/index')), ...['node_modules/kept.txt', 'docs/keep.md', 'package.json', 'AGENTS.md', '.gitignore', 'ladder.md'].map((f) => join(dir, f))]
    .map((f) => [relative(dir, f), createHash('sha1').update(readFileSync(f)).digest('hex')]));
  const before = hashes();

  expect((await run('--pack', dir, ...ROLE, '--write')).code).toBe(0);
  expect(hashes()).toEqual(before);
  expect(status(dir)).toEqual([
    ' M pack.json',
    ' D parts/intro.md',
    ' D parts/outro.md',
    ' M pools/css/css-01-center-a-box.md',
    ' M pools/css/css-02-specificity-clash.md',
    ' M pools/css/css-03-dark-mode-colors.md',
    ' M pools/html/html-01-button-or-link.md',
    ' M pools/html/html-02-label-a-form-field.md',
    ' M pools/html/html-03-headings-outline.md',
    ' M rounds/sample.md',
    '?? pools/css/pool.md',
    '?? pools/html/pool.md',
    '?? roles/frontend-engineer.md',
    '?? scripts/intro.md',
    '?? scripts/outro.md',
    '?? scripts/sample.md',
  ]);
});

test('a run that cannot be proven writes nothing and says why', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack');
  writeFileSync(join(dir, 'rounds/sample.md'), readFileSync(join(dir, 'rounds/sample.md'), 'utf8').replace('minutes: 45', 'minutes: 25'));
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'scripts/intro.md'), '---\nid: intro\nname: Mine\nminutes: 3\n---\n\n## Script\n\nHand written.\n');
  writeFileSync(join(dir, 'competencies.md'), '# Competencies\n\n## Craft {#craft}\n\nBuilds it well.\n');
  writeFileSync(join(dir, 'pools.json'), JSON.stringify({ css: ['craft'], forms: ['craft'] }));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'faults');

  expect(await run('--pack', dir, ...ROLE, '--rounds', 'sample,final', '--pool-competencies', join(dir, 'pools.json'), '--write')).toEqual({
    code: 1,
    err: '',
    out: [
      '--pool-competencies: "forms" is not a pool in this pack. Pools: css, html.',
      'rounds/sample.md: 25 minutes less intro (5), outro (5) and Deep dive (20) leaves -5 minutes for the round\'s own script.',
      '--rounds: "final" is not a round in this pack. Rounds: sample.',
      'scripts/intro.md: already exists and is not a format 1 file this migration converts. Move it aside first.',
      'Nothing was written.',
    ].join('\n'),
  });
  expect(status(dir)).toEqual([]);
});

test('--pool-competencies writes each pool\'s competencies, and --rounds sets the role\'s rounds', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack');
  writeFileSync(join(dir, 'competencies.md'), '# Competencies\n\n## Craft {#craft}\n\nBuilds it well.\n\n## Judgment {#judgment}\n\nPicks well.\n');
  writeFileSync(join(dir, 'pools.json'), JSON.stringify({ css: ['craft', 'judgment'], html: ['craft'] }));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'competencies');

  const { code, out } = await run('--pack', dir, ...ROLE, '--rounds', 'sample', '--pool-competencies', join(dir, 'pools.json'), '--write');
  expect([code, out.split('\n').at(-2)]).toEqual([0, 'Checks: 6 of 6 cards read the same. 16 lines removed and 28 added, all expected. Round minutes and role rounds match. Loads with 0 errors, 2 notes.']);
  expect(readFileSync(join(dir, 'pools/css/pool.md'), 'utf8')).toBe('---\nname: "CSS"\ncompetencies: [craft, judgment]\n---\n');
});

test('interview-kit migrate runs from a pack folder, and refuses an option it does not know', async () => {
  const dir = packRepo('test/migrate/packs/sample-pack');
  const cli = (...args) => spawnSync(process.execPath, [join(process.cwd(), 'bin/interview-kit.js'), 'migrate', ...args], { cwd: dir, encoding: 'utf8' });
  const plan = cli(...ROLE);
  expect([plan.status, plan.stdout.split('\n')[0]]).toEqual([0, 'Plan for format 2 (nothing written; add --write to apply it):']);
  const bad = cli(...ROLE, '--wirte');
  expect([bad.status, bad.stderr.trim()]).toEqual([1, '--wirte is not an option of migrate. Usage: interview-kit migrate --hiring <level> [--role <id> --name "<Role name>"] [--rounds <a,b>] [--pool-competencies <file.json>] [--pack <dir>] [--write]']);
  const missing = cli('--role', 'x');
  expect([missing.status, missing.stderr.trim()]).toEqual([1, '--hiring is required: the level id from ladder.md that every migrated anchor sits at. Usage: interview-kit migrate --hiring <level> [--role <id> --name "<Role name>"] [--rounds <a,b>] [--pool-competencies <file.json>] [--pack <dir>] [--write]']);
  expect(status(dir)).toEqual([]);
});
