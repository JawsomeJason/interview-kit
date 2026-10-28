#!/usr/bin/env node
// interview-kit <dev|build|test> [--pack <dir>] [--outDir <dir>] [--without <plugin,...>] [flags for vite or vitest]
//
// Runs this app against a content pack from the pack's own repo. Each command runs the tool the app's own npm scripts
// run, with the working directory set to the app folder and KIT_PACK set to the pack's absolute path. That is the whole
// contract: vite.config.js, its plugins and the tests resolve every path from the app folder, exactly as in the app's
// checkout, and read the pack from KIT_PACK. Paths the caller gives are resolved against the caller's folder first.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { enabledPlugins } from '../scripts/vite-plugins.js';
import { PACK_FORMAT } from '../src/pack-format.js';

const app = resolve(import.meta.dirname, '..');
const here = process.cwd();

// Removes `--name value` or `--name=value` from args and returns the value, so the rest passes through untouched.
const take = (args, name) => {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const [flag, value = args[i + 1]] = args[i].split(/=(.*)/s);
  args.splice(i, flag === args[i] ? 2 : 1);
  return value;
};

// A tool's CLI script, found from this file, so a pack repo's hoisted copy and a linked checkout's own copy both work.
const require = createRequire(import.meta.url);
const cli = (name) => {
  const pkg = require.resolve(`${name}/package.json`);
  const { bin } = JSON.parse(readFileSync(pkg, 'utf8'));
  return resolve(dirname(pkg), typeof bin === 'string' ? bin : bin[name]);
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const [name, ...args] = process.argv.slice(2);
if (name === 'check') process.exit(await (await import('./commands/check.js')).default(args));
if (name === 'migrate') process.exit(await (await import('./commands/migrate.js')).default(args));
if (!['dev', 'build', 'test'].includes(name)) fail('Usage: interview-kit <dev|build|test> [--pack <dir>] [--outDir <dir>] [--without <plugin,...>] [vite or vitest flags]');
const pack = resolve(here, take(args, 'pack') ?? '.');
if (!existsSync(resolve(pack, 'pack.json'))) fail(`No pack.json in ${pack}. Run this from a pack repo, or pass --pack <dir>.`);
const packJson = relative(here, resolve(pack, 'pack.json'));
let config;
try {
  config = JSON.parse(readFileSync(resolve(pack, 'pack.json'), 'utf8'));
} catch {
  fail(`${packJson} is not valid JSON. Fix it so it reads like {"format": ${PACK_FORMAT}}.`);
}
const format = config?.format;
if (format !== PACK_FORMAT) fail(`${packJson} has ${format === undefined ? 'no format' : `format ${JSON.stringify(format)}`}, and this kit reads format ${PACK_FORMAT}. ${format === 1 ? 'Run "interview-kit migrate" to move it.' : `Update the pack to format ${PACK_FORMAT}.`}`);

// Checked here for a plain message before Vite starts; the Vite plugin reads KIT_WITHOUT and pack.json again.
const without = take(args, 'without') ?? '';
try {
  enabledPlugins(app, without, config.plugins, packJson);
} catch (e) {
  fail(e.message);
}

// The built file lands in the caller's folder, since Vite would otherwise write it inside node_modules. The build
// empties that folder first, so it must not be the pack or a folder holding it. A folder inside the pack, such as the
// default dist in a pack's own repo, is fine until it holds pack content: a build only ever writes .html there.
const outDir = resolve(here, take(args, 'outDir') ?? 'dist');
const within = (from, to) => { const up = relative(from, to); return up !== '..' && !up.startsWith(`..${sep}`) && !isAbsolute(up); };
const holdsContent = (dir) => existsSync(dir) && readdirSync(dir, { recursive: true, withFileTypes: true }).some((f) => f.isFile() && !f.name.endsWith('.html'));
if (name === 'build' && within(outDir, pack)) fail(`--outDir ${outDir} holds the pack, and the build empties it first. Pick a folder outside the pack.`);
if (name === 'build' && within(pack, outDir) && holdsContent(outDir)) fail(`--outDir ${outDir} is inside the pack and holds files the build would delete. Pick an empty folder or one outside the pack.`);

const [tool, toolArgs] = {
  dev: ['vite', args],
  build: ['vite', ['build', '--outDir', outDir, '--emptyOutDir', ...args]],
  test: ['vitest', ['run', '--dir', 'test/pack', ...args]],
}[name];
const child = spawn(process.execPath, [cli(tool), ...toolArgs], { cwd: app, env: { ...process.env, KIT_PACK: pack, KIT_WITHOUT: without }, stdio: 'inherit' });
// Ctrl-C reaches the child from the terminal; a SIGTERM from npm or a process manager does not, so pass it on.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 1));
