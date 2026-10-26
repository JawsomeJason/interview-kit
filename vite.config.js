import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unwatchFile, watchFile } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import highlight, { markdownGlobs } from './scripts/vite-highlight-plugin.js';
import review from './scripts/vite-review-plugin.js';
import stripReviewPlugin from './scripts/vite-strip-review-plugin.js';

// Every relative path here and in the plugins and tests is relative to the app folder: npm scripts run here, and
// bin/interview-kit.js runs Vite and Vitest here when a pack repo calls it.
// The content pack: a folder of pools/, rounds/, parts/ and pack.json. KIT_PACK points elsewhere.
const pack = resolve(process.env.KIT_PACK ?? 'sample-pack');

// Writes the pack's theme id onto <html data-theme>: a pack's theme is always on, from first paint.
const packJson = resolve(pack, 'pack.json');
const packThemeId = existsSync(packJson) ? JSON.parse(readFileSync(packJson, 'utf8')).theme?.id : undefined;
const packTheme = {
  name: 'pack-theme',
  transformIndexHtml: (html) => (packThemeId ? html.replace('<html lang="en">', `<html lang="en" data-theme="${packThemeId}">`) : html),
};

// The build stamp shown on the What's new page: the app's version, the short commit of the repo holding the pack, and
// the build date. The pack's commit, because the version already pins the app and two kits with different content
// must not share a stamp. An installed app has no .git of its own anyway.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const git = (args) => execSync(`git ${args}`, { cwd: pack, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const now = new Date();
const buildDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // local date
let sha = 'unknown';
try { sha = git('rev-parse --short HEAD'); } catch {}

// The stamp is fixed when the dev server starts, so a long-running one would show an old version after a commit or a
// version bump. Restart it when either changes. logs/HEAD moves on every commit, merge and checkout.
const stampFiles = ['package.json'];
try { stampFiles.push(resolve(pack, git('rev-parse --git-path logs/HEAD'))); } catch {}
const restartOnStamp = {
  name: 'restart-on-stamp',
  apply: (_, { command }) => command === 'serve' && !process.env.VITEST,
  configureServer(server) {
    const restart = () => server.restart();
    for (const f of stampFiles) watchFile(f, { interval: 1000 }, restart);
    server.httpServer?.once('close', () => { for (const f of stampFiles) unwatchFile(f, restart); });
  },
};

// Vite watches only the app folder, so a new card in a pack outside it would wait for a restart. Only the content
// folders, so dist/, .review/, node_modules/ and .git in a pack repo never trigger a reload.
const watchPack = { name: 'watch-pack', configureServer: (server) => { server.watcher.add(['pools', 'rounds', 'parts', 'theme'].map((d) => resolve(pack, d))); } };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_SHA__: JSON.stringify(sha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [viteSingleFile(), review(resolve(pack, '.review')), stripReviewPlugin, packTheme, restartOnStamp, watchPack, highlight(markdownGlobs(pack))],
  resolve: { alias: { '@pack': pack } },
  server: { fs: { allow: ['.', pack] } },
  // An installed app sits under node_modules, which Vitest hands to Node unprocessed, so import.meta.glob would be
  // undefined in src/content.js. Inline it.
  test: { server: { deps: { inline: [/\/node_modules\/interview-kit\//] } } },
});
