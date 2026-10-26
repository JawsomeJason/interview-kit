// Renders every scene in capture/scenes.js into src/media/ and records each in capture/manifest.json.
//   node capture/run.mjs                 render the scenes whose definition or app source changed
//   node capture/run.mjs --only <id>     render one scene, changed or not
//   node capture/run.mjs --force         render every scene
//   node capture/run.mjs --check         render every scene to a temp dir and diff against src/media/, writing nothing
// How to add a scene: capture/README.md.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, globSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { build, preview } from 'vite';
import { NOW, budgetErrors, plan, sceneHash, sha, storageFor } from './lib.js';
import { scenes } from './scenes.js';

const ROOT = resolve(import.meta.dirname, '..');
process.chdir(ROOT);
const MEDIA = 'src/media';
const MANIFEST = 'capture/manifest.json';
const PACKS = { sample: 'sample-pack', demo: 'capture/demo-pack' };
// The company name is the words of the theme name in the pack KIT_PACK points at, as in test/pack/css.test.js.
const brandWords = process.env.KIT_PACK ? (JSON.parse(readFileSync(resolve(process.env.KIT_PACK, 'pack.json'), 'utf8')).theme?.name ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean) : [];
const brandName = new RegExp(brandWords.join('|') || '(?!)', 'i');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const force = args.includes('--force') || check || only;

const STILL = { pack: 'sample', scheme: 'light', viewport: { width: 1280, height: 800 }, dpr: 2, pad: 12, steps: [] };
const CLIP = { ...STILL, dpr: 1, pad: 0, fps: 24, width: 960, crf: 23, loop: 'fade' };
const withDefaults = (scene) => ({ ...(scene.kind === 'clip' ? CLIP : STILL), ...scene });

// What a scene's pixels depend on besides its own definition: the app, the pack and this engine.
function sourceHash(pack) {
  const files = globSync(['src/**/*', 'index.html', 'vite.config.js', 'capture/*.{js,mjs}', 'capture/stages/*', `${PACKS[pack]}/**/*`])
    .filter((f) => !f.startsWith('src/media/') && !f.startsWith('src/dev/') && f !== 'capture/scenes.js').sort();
  const playwright = JSON.parse(readFileSync('node_modules/playwright/package.json', 'utf8')).version;
  return sha(files.map((f) => { try { return `${f}\n${readFileSync(f)}`; } catch { return ''; } }).join('\n') + playwright);
}

const freePort = () => new Promise((done) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => done(port)); }); });

// One production build per pack, served on a free port, so captures show what ships (no dev-only UI).
async function serve(pack) {
  process.env.KIT_PACK = PACKS[pack];
  const outDir = mkdtempSync(join(tmpdir(), `capture-${pack}-`));
  await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const server = await preview({ logLevel: 'silent', build: { outDir }, preview: { port: await freePort(), strictPort: true, open: false } });
  return { url: server.resolvedUrls.local[0].replace(/\/$/, ''), close: () => server.close() };
}

const seed = (storage) => {
  if (localStorage.getItem('capture-seeded')) return;
  for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  localStorage.setItem('capture-seeded', '1');
};

async function open(browser, scene, url) {
  const ctx = await browser.newContext({ viewport: scene.viewport, deviceScaleFactor: scene.dpr, colorScheme: scene.scheme,
    reducedMotion: 'reduce', timezoneId: 'UTC', locale: 'en-US' });
  // Kept before the fake clock replaces it: a clip waits on real frames so each shot holds the last change.
  await ctx.addInitScript(() => { window.__realFrame = window.requestAnimationFrame.bind(window); });
  if (scene.kind === 'clip') await ctx.clock.install({ time: NOW - 60_000 });
  else await ctx.clock.setFixedTime(NOW);
  await ctx.addInitScript(seed, storageFor(scene, version));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${scene.id}: page error ${e.message}`));
  await page.goto(`${url}/${scene.route ?? ''}`);
  const hide = scene.hide ? `${scene.hide.join(', ')} { visibility: hidden !important; }` : '';
  const css = hide + (scene.css ?? '');
  if (css) await page.addStyleTag({ content: css });
  for (const step of scene.steps.filter((s) => s.at === undefined)) await act(page, step);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function act(page, { do: verb, target, value, wait }) {
  const el = target && page.locator(target).first();
  switch (verb) {
    case 'click': await el.click(); break;
    case 'check': await el.check({ force: true }); break;
    case 'fill': await el.fill(value); break;
    case 'type': await el.pressSequentially(value); break;
    case 'press': await page.keyboard.press(value); break;
    case 'hover': await el.hover(); break;
    case 'goto': await page.evaluate((hash) => { location.hash = hash; }, value); break;
    case 'wait': await el.waitFor(); break;
    default: throw new Error(`unknown step "${verb}"`);
  }
  if (wait) await page.waitForTimeout(wait);
}

const frames = (page, n = 2) => page.evaluate((count) => new Promise((done) => {
  const next = (left) => (left ? requestAnimationFrame(() => next(left - 1)) : done());
  next(count);
}), n);

// The union of the crop selectors' boxes plus padding, or the whole viewport.
async function cropBox(page, scene) {
  if (!scene.crop) return { x: 0, y: 0, ...scene.viewport };
  const boxes = await Promise.all(scene.crop.map((s) => page.locator(s).first().boundingBox()));
  const missing = scene.crop.filter((_, i) => !boxes[i]);
  if (missing.length) throw new Error(`${scene.id}: crop selector ${missing.join(', ')} matched nothing visible`);
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - scene.pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - scene.pad);
  const right = Math.min(scene.viewport.width, Math.max(...boxes.map((b) => b.x + b.width)) + scene.pad);
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + scene.pad;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y) };
}

// A ring drawn around each highlight selector, outside the element so it moves nothing.
const RING = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #2563eb;border-radius:8px;';
const ring = (page, selector) => page.locator(selector).first().evaluate((el, style) => {
  const r = el.getBoundingClientRect();
  const div = Object.assign(document.createElement('div'), { className: 'capture-ring' });
  div.style.cssText = `${style}left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;`;
  document.body.append(div);
  return div;
}, RING);

async function shoot(browser, scene, url) {
  const { ctx, page } = await open(browser, scene, url);
  try {
    await page.mouse.move(0, 0);
    for (const s of scene.highlight ?? []) await ring(page, s);
    await frames(page);
    return await page.screenshot({ clip: await cropBox(page, scene), animations: 'disabled', caret: 'hide',
      mask: (scene.mask ?? []).map((s) => page.locator(s)) });
  } finally { await ctx.close(); }
}

// Panels side by side, each under its label, with a thin rule between: rendered as a page so text matches the UI's.
async function board(browser, pngs, labels) {
  const dims = await Promise.all(pngs.map((p) => sharp(p).metadata()));
  const labelled = labels.some(Boolean);
  const html = `<style>body{margin:0;display:flex;align-items:flex-start;background:#fff;font:30px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#555}
    .panel{margin:0;padding:${labelled ? 20 : 0}px}.panel+.panel{border-left:2px solid #ddd}.label{margin:0 0 20px;text-align:center}img{display:block}</style>${
    pngs.map((p, i) => `<figure class="panel">${labelled ? `<p class="label">${labels[i] ?? ''}</p>` : ''}<img src="data:image/png;base64,${p.toString('base64')}" width="${dims[i].width}" height="${dims[i].height}"></figure>`).join('')}`;
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 100, height: 100 } });
  try {
    await page.setContent(html);
    const size = await page.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
    await page.setViewportSize(size);
    return await page.screenshot({ fullPage: true });
  } finally { await page.close(); }
}

// UI shots are flat color and text: a palette of at most 64 colors saved lossless is sharper and smaller than lossy WebP.
// quality 90 lets the quantizer stop short of 64; at 100 it ignores the cap and keeps 256.
const webpStill = async (png, colours = 64) => sharp(await sharp(png).png({ palette: true, colours, quality: 90, dither: 0 }).toBuffer()).webp({ lossless: true, effort: 6 }).toBuffer();
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', file])).streams[0];
// A clip's poster is one of its frames at the clip's exact size.
const webpPoster = (png, mp4) => {
  const { width, height } = probe(mp4);
  return sharp(png).resize({ width, height, fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 85, effort: 6 }).toBuffer();
};

async function still(browser, scene, url) {
  const png = scene.panels
    ? await board(browser, await serial(scene.panels, (p) => shoot(browser, { ...scene, ...p }, url)), scene.panels.map((p) => p.label))
    : await shoot(browser, scene, url);
  return { [`${scene.id}.webp`]: await webpStill(png, scene.colors), pngs: [png] };
}

// ffmpeg reads PNG frames on stdin and writes a silent H.264 loop. `loop: 'fade'` blends the last half second
// into the first frame so the seam doesn't jump.
function encoder(scene, out) {
  const { fps, width, crf, loop } = scene;
  const n = Math.round(scene.duration * fps);
  const scale = `scale=${width}:-2:flags=lanczos`;
  const graph = loop === 'fade'
    ? ['-filter_complex', `[0:v]${scale},split[m][f];[f]trim=end_frame=1,loop=loop=${Math.round(fps / 2) + 1}:size=1:start=0,setpts=N/${fps}/TB[first];`
      + `[m][first]xfade=transition=fade:duration=0.5:offset=${(n - Math.round(fps / 2) - 2) / fps},format=yuv420p[v]`, '-map', '[v]']
    : ['-vf', `${scale},format=yuv420p`];
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', ...graph, '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-g', '240',
    '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = new Promise((done, fail) => ff.on('close', (code) => (code ? fail(new Error(`${scene.id}: ffmpeg exited ${code}`)) : done())));
  return {
    write: (buf) => new Promise((done) => (ff.stdin.write(buf) ? done() : ff.stdin.once('drain', done))),
    end: () => { ff.stdin.end(); return exited; },
  };
}

// The pointer drawn into clips, plus the ripple a click leaves. Positions come from the timeline, never from the OS.
const CURSOR_HTML = `<div class="capture-ripple" style="position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgb(37 99 235 / 0.85);opacity:0;pointer-events:none;z-index:2147483646"></div>
<svg class="capture-cursor" viewBox="0 0 22 28" width="22" height="28" style="position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;transform-origin:2px 2px"><path d="M2 2v21l5.5-5.2 3.6 8.2 3.6-1.6-3.6-8h7.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const clamp = (x) => Math.min(1, Math.max(0, x));
const pointIn = (box, step) => ({ x: box.x + box.width * (step.x ?? 0.5), y: box.y + box.height * (step.y ?? 0.5) });

// Cursor keyframes: rest at `from`, glide to each step's target over the 0.5 s before it, then return home.
function cursorPath(points, from, duration) {
  const keys = [[0, from]];
  for (const { t, point } of points) {
    const [lastT, last] = keys.at(-1);
    keys.push([Math.max(lastT + 0.05, t - 0.6), last], [t - 0.1, point]);
  }
  keys.push([duration - 1.2, keys.at(-1)[1]], [duration - 0.6, from]);
  return (t) => {
    for (let i = 1; i < keys.length; i++) {
      const [ta, a] = keys[i - 1];
      const [tb, b] = keys[i];
      if (t <= tb) { const k = ease(clamp((t - ta) / Math.max(tb - ta, 1e-6))); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    }
    return keys.at(-1)[1];
  };
}

// A live clip: the real app on a paused clock, one screenshot per frame. Each frame runs the steps due, moves the
// pointer, advances the app's timers by exactly one frame and seeks every CSS animation to the frame's time.
async function clip(browser, scene, url, dir) {
  const { ctx, page } = await open(browser, scene, url);
  try {
    await ctx.clock.pauseAt(NOW);
    await page.evaluate(([html, ringStyle]) => {
      document.body.insertAdjacentHTML('beforeend', html);
      // Every CSS animation plays on the clip's clock from 0, so a pulse has the same phase on every run.
      window.__capture = (t, cursor, press, ring, rings) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = t * 1000;
        }
        document.querySelector('.capture-cursor').style.transform = `translate(${cursor.x - 2}px, ${cursor.y - 2}px) scale(${1 - 0.14 * press})`;
        Object.assign(document.querySelector('.capture-ripple').style, { left: `${cursor.x}px`, top: `${cursor.y}px`,
          opacity: ring === null ? 0 : 1 - ring, transform: `scale(${ring === null ? 0.3 : 0.3 + ring * 0.9})` });
        document.querySelectorAll('.capture-ring').forEach((el) => el.remove());
        for (const r of rings) {
          const div = Object.assign(document.createElement('div'), { className: 'capture-ring' });
          div.style.cssText = `${ringStyle}left:${r.x - 6}px;top:${r.y - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;`;
          document.body.append(div);
        }
        return new Promise((done) => window.__realFrame(() => window.__realFrame(done)));
      };
    }, [CURSOR_HTML, RING]);
    const box = await cropBox(page, scene);
    const fps = scene.fps;
    const n = Math.round(scene.duration * fps);
    const timed = scene.steps.filter((s) => s.at !== undefined).map((s) => ({ ...s, frame: Math.round(s.at * fps), typed: 0 }));
    const from = scene.from ?? { x: box.x + box.width * 0.62, y: box.y + box.height * 0.82 };
    // Targets are measured when the pointer sets off toward them, so a step can aim at what an earlier step revealed.
    const points = [];
    let path = cursorPath(points, from, scene.duration);
    const clicks = [];
    const rings = [];
    const out = join(dir, `${scene.id}.mp4`);
    const ff = encoder(scene, out);
    let poster;
    let elapsed = 0;
    for (let f = 0; f < n; f++) {
      const t = f / fps;
      for (const s of timed) {
        if (s.target && !s.point && f >= s.frame - Math.round(0.6 * fps)) {
          const b = await page.locator(s.target).first().boundingBox();
          if (!b) throw new Error(`${scene.id}: step target ${s.target} matched nothing visible at ${t.toFixed(2)}s`);
          s.box = b;
          if (s.do !== 'highlight') { s.point = pointIn(b, s); points.push({ t: s.at, point: s.point }); path = cursorPath(points, from, scene.duration); }
          else s.point = true;
        }
        if (f === s.frame && !s.done) {
          s.done = true;
          if (s.do === 'click' || s.do === 'check') { await page.mouse.click(s.point.x, s.point.y); clicks.push(s.at); }
          else if (s.do === 'highlight') rings.push({ ...s.box, from: s.at, to: s.at + (s.for ?? 0.6) });
          else if (s.do === 'press') await page.keyboard.press(s.value);
          else if (s.do !== 'hover' && s.do !== 'type') await act(page, s);
        }
        // Typing runs on whole frames: by frame f, floor((f - start) * cps / fps) characters are in.
        if (s.do === 'type' && f >= s.frame) {
          const want = Math.min(s.value.length, Math.floor(((f - s.frame) * s.cps) / fps));
          while (s.typed < want) await page.keyboard.type(s.value[s.typed++]);
        }
      }
      const cursor = path(t);
      await page.mouse.move(cursor.x, cursor.y);
      const ms = Math.round((f * 1000) / fps);
      if (ms > elapsed) { await page.clock.runFor(ms - elapsed); elapsed = ms; }
      const last = clicks.filter((c) => t - c > -0.08).at(-1);
      const press = last === undefined ? 0 : clamp(1 - Math.abs(t - last - 0.02) / 0.1);
      const ago = clicks.map((c) => t - c).filter((d) => d >= 0 && d < 0.45).at(-1);
      await page.evaluate((frame) => window.__capture(...frame),
        [t, cursor, press, ago === undefined ? null : ago / 0.45, rings.filter((r) => t >= r.from && t < r.to)]);
      const png = await page.screenshot({ clip: box, caret: 'hide' });
      await ff.write(png);
      if (f === Math.round((scene.poster ?? 0) * fps)) poster = png;
    }
    await ff.end();
    return { [`${scene.id}.mp4`]: readFileSync(out), [`${scene.id}.webp`]: await webpPoster(poster, out), pngs: [poster] };
  } finally { await ctx.close(); }
}

const serial = async (list, fn) => { const out = []; for (const x of list) out.push(await fn(x)); return out; };

async function pool(list, size, fn) {
  const queue = [...list];
  await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await fn(queue.shift()); }));
}

const ocr = (png, dir, name) => {
  const file = join(dir, `${name}.ocr.png`);
  writeFileSync(file, png);
  return execFileSync('tesseract', [file, '-', '--psm', '3'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
};

// Decodes a few evenly spaced frames from each clip and counts the pixels that differ.
function clipDiff(a, b) {
  const [pa, pb] = [probe(a), probe(b)];
  if (pa.width !== pb.width || pa.height !== pb.height || pa.nb_read_frames !== pb.nb_read_frames) return 1;
  const raw = (file, frame) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });
  let worst = 0;
  for (const k of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const frame = Math.floor(pa.nb_read_frames * k);
    const diff = pixelmatch(raw(a, frame), raw(b, frame), null, pa.width, pa.height, { threshold: 0.1 });
    worst = Math.max(worst, diff / (pa.width * pa.height));
  }
  return worst;
}

const started = performance.now();
const selected = scenes.map(withDefaults).filter((s) => !only || s.id === only);
if (only && !selected.length) throw new Error(`no scene with id "${only}"`);
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const sources = Object.fromEntries(Object.keys(PACKS).map((p) => [p, sourceHash(p)]));
const hashes = Object.fromEntries(selected.map((s) => [s.id, sceneHash(s, sources[s.pack])]));
const onDisk = Object.fromEntries(globSync(`${MEDIA}/*`).map((f) => [f.slice(MEDIA.length + 1), sha(readFileSync(f))]));
const steps = force ? selected.map(({ id }) => ({ id, hash: hashes[id], action: 'render' })) : plan(selected, manifest, hashes, onDisk);
const todo = selected.filter((s) => steps.find((p) => p.id === s.id).action === 'render');
const outDir = check ? mkdtempSync(join(tmpdir(), 'capture-check-')) : MEDIA;
const scratch = mkdtempSync(join(tmpdir(), 'capture-work-'));
const problems = [];
const rendered = {};

if (todo.length) {
  const packs = [...new Set(todo.map((s) => s.pack))];
  const servers = Object.fromEntries(await Promise.all(packs.map(async (p) => [p, await serve(p)])));
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  try {
    await pool(todo, 4, async (scene) => {
      const t0 = performance.now();
      const url = servers[scene.pack].url;
      const result = scene.kind !== 'clip' ? await still(browser, scene, url)
        : scene.stage ? await (await import(`./stages/${scene.stage}.mjs`)).default({ browser, scene, url, dir: scratch, open, encoder, webpPoster })
        : await clip(browser, scene, url, scratch);
      const { pngs, ...files } = result;
      rendered[scene.id] = { files, pngs };
      console.log(`rendered ${scene.id} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    });
  } finally {
    await browser.close();
    await Promise.all(Object.values(servers).map((s) => s.close()));
  }
}

for (const scene of todo) {
  const files = {};
  for (const [name, buf] of Object.entries(rendered[scene.id].files)) {
    writeFileSync(join(outDir, name), buf);
    const meta = name.endsWith('.mp4')
      ? probe(join(outDir, name))
      : await sharp(buf).metadata();
    files[name] = { bytes: buf.length, width: meta.width, height: meta.height, sha: sha(buf) };
  }
  manifest[scene.id] = { hash: hashes[scene.id], files };
}

const media = globSync(`${MEDIA}/*`).map((f) => f.slice(MEDIA.length + 1));
const finalBytes = (name) => (check && existsSync(join(outDir, name)) ? readFileSync(join(outDir, name)) : readFileSync(join(MEDIA, name))).length;
problems.push(...budgetErrors([...new Set([...media, ...todo.flatMap((s) => Object.keys(rendered[s.id].files))])].map((name) => ({ name, bytes: finalBytes(name) }))));

if (check) {
  for (const scene of todo) {
    for (const name of Object.keys(rendered[scene.id].files)) {
      const theirs = join(MEDIA, name);
      if (!existsSync(theirs)) { problems.push(`${name} is missing from ${MEDIA}`); continue; }
      if (name.endsWith('.mp4')) {
        const worst = clipDiff(join(outDir, name), theirs);
        if (worst > 0.005) problems.push(`${name} differs: ${(worst * 100).toFixed(2)}% of pixels on its worst sampled frame`);
      } else if (sha(readFileSync(join(outDir, name))) !== sha(readFileSync(theirs))) problems.push(`${name} differs from the committed file`);
    }
    rendered[scene.id].pngs.forEach((png, i) => {
      if (brandName.test(ocr(png, scratch, `${scene.id}-${i}`))) problems.push(`${scene.id}: the company name shows in the picture`);
    });
  }
  const known = new Set(selected.flatMap((s) => Object.keys(manifest[s.id]?.files ?? {})));
  if (!only) for (const name of media.filter((m) => !known.has(m))) problems.push(`${MEDIA}/${name} comes from no scene`);
} else if (todo.length) {
  writeFileSync(MANIFEST, `${JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2)}\n`);
}

const skipped = steps.filter((s) => s.action === 'skip').length;
console.log(`${todo.length} rendered, ${skipped} unchanged, in ${((performance.now() - started) / 1000).toFixed(1)}s${check ? ` (check, output in ${outDir})` : ''}`);
if (problems.length) {
  console.error(problems.map((p) => `FAIL ${p}`).join('\n'));
  process.exit(1);
}
