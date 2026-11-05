// Writes test/fixtures/evidence/: for each release tag named, the evidence file that release's own build saved after
// a scripted interview in Chromium, and beside it the summary this build reads from that file. ADR 027 says why.
//   node scripts/evidence-corpus.mjs v1.0.2 v1.1.0
// Each tag is built from a temporary worktree with this checkout's node_modules and its own examples/sample-pack.
// The people are made up, and the browser's own Copy summary is printed against this build's for a check by eye.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadPack } from '../src/pack/load.js';
import { CORPUS, summaryOf } from '../test/evidence/corpus.js';
import { go, openQuestion, rendered } from './screens.mjs';

const tags = process.argv.slice(2);
if (!tags.length) throw new Error('Name the release tags to record, like: node scripts/evidence-corpus.mjs v1.0.2 v1.1.0');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, KIT_PACK: 'examples/sample-pack' } });

// The summaries read every file against one frozen pack, copied once, so a later edit to the sample pack never moves them.
if (!existsSync(join(CORPUS, 'pack'))) cpSync('examples/sample-pack', join(CORPUS, 'pack'), { recursive: true });
const { model: pack } = await loadPack(resolve(CORPUS, 'pack'));

async function interview(url) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.getByLabel('Who are you meeting?').fill('Casey Example');
  if (await p.locator('.start-name').count()) await p.locator('.start-name').fill('Pat Example');
  await p.getByRole('button', { name: 'Start interview' }).click();
  await rendered(p);
  await openQuestion(p);
  const controls = p.locator('.assess-row .option-row-control');
  await controls.nth(0).check();
  await p.locator('.assess-menu-button').nth(1).click();
  await p.locator('.assess-menu:popover-open .assess-button').click();
  await p.locator('.assess-notes-text').fill('Talked through the trade-off before writing code.');
  await p.locator('.assess-notes-text').blur();
  await go(p, '#/decide');
  await p.locator('.decide-option input').first().check();
  await p.getByRole('textbox', { name: 'Reason' }).fill('Clear on the basics.');
  await p.getByRole('button', { name: 'Record' }).click();
  await rendered(p);
  await p.locator('.decide-copy').click();
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  await p.getByRole('button', { name: 'Share my evidence' }).first().click();
  if (await p.locator('.evidence-dialog-name input').count()) await p.locator('.evidence-dialog-name input').fill('Pat Example');
  const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.evidence-dialog-save').click()]);
  const file = readFileSync(await download.path(), 'utf8');
  await browser.close();
  return { file, copied };
}

for (const tag of tags) {
  const dir = mkdtempSync(join(tmpdir(), 'ik-corpus-'));
  try {
    run('git', ['worktree', 'add', '--detach', dir, tag]);
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'));
    run('npx', ['vite', 'build', '--logLevel', 'error'], dir);
    const html = readFileSync(join(dir, 'dist/index.html'));
    const server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    const { file, copied } = await interview(`http://127.0.0.1:${server.address().port}/`);
    server.close();
    const summary = summaryOf(pack, file);
    writeFileSync(join(CORPUS, `${tag}.json`), file);
    writeFileSync(join(CORPUS, `${tag}.txt`), summary);
    console.log(`${tag}: wrote ${tag}.json and ${tag}.txt. Its own Copy summary ${copied === summary ? 'is the same' : `differs:\n${copied}`}`);
  } finally {
    run('git', ['worktree', 'remove', '--force', dir]);
  }
}
