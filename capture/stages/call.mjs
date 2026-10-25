// The call stage: for a clip that leaves the browser tab, such as Pop out. It records the real kit, the tab before,
// one screenshot of the Pop out window per moment it can change and the tab after, then plays them back in
// call.html over a stand-in fullscreen call, one frame at a time. Steps: `popout` (a click that opens the window),
// then clicks and typing in the window, then `close`.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NOW } from '../lib.js';

const HIDE = '.trials-button { visibility: hidden !important; }';

export default async function call({ browser, scene, url, dir, open, encoder, webpPoster }) {
  const { ctx, page: tab } = await open(browser, scene, url);
  const assets = new Map();
  const keep = (buf) => {
    const name = `${createHash('sha1').update(buf).digest('hex').slice(0, 12)}.png`;
    assets.set(name, buf);
    return name;
  };
  try {
    await ctx.clock.pauseAt(NOW);
    const steps = scene.steps.filter((s) => s.at !== undefined).map((s) => ({ ...s }));
    const pop = steps.find((s) => s.do === 'popout');
    const close = steps.find((s) => s.do === 'close');
    let elapsed = 0;
    const advance = async (t) => {
      const ms = Math.round(t * 1000);
      if (ms > elapsed) { await ctx.clock.runFor(ms - elapsed); elapsed = ms; }
    };
    const clicks = [];
    const press = async (page, win, s) => {
      const box = await page.locator(s.target).first().boundingBox();
      if (!box) throw new Error(`${scene.id}: ${s.target} matched nothing visible`);
      clicks.push({ t: s.at, win, box, x: s.x, y: s.y });
      await page.mouse.click(box.x + box.width * (s.x ?? 0.5), box.y + box.height * (s.y ?? 0.5));
    };
    // Clicks before Pop out (such as opening a menu) happen in the tab, a tab screenshot after each.
    const tabFrames = [{ t: 0, src: keep(await tab.screenshot({ caret: 'hide' })) }];
    for (const s of steps.filter((x) => x.at < pop.at)) {
      await advance(s.at);
      await press(tab, 'tab', s);
      tabFrames.push({ t: s.at, src: keep(await tab.screenshot({ caret: 'hide' })) });
    }
    await advance(pop.at);
    const opened = ctx.waitForEvent('page');
    await press(tab, 'tab', pop);
    // Headless Chromium opens the window at the tab's size and ignores the size the app asks for.
    const pip = await opened;
    await pip.setViewportSize(scene.window);
    await pip.addStyleTag({ content: HIDE });

    // The window settles 1.3 s after the click; from then on, a frame at each step, each typed character and
    // each whole second (the elapsed time ticks).
    const shown = pop.at + 1.3;
    const fps = scene.fps;
    const moments = new Set([shown]);
    for (let t = Math.ceil(shown); t < close.at; t++) moments.add(t);
    for (const s of steps.filter((x) => x.at > shown && x !== close)) {
      moments.add(s.at);
      if (s.do === 'type') for (let i = 1; i <= s.value.length; i++) moments.add(s.at + Math.ceil((i * fps) / s.cps) / fps);
    }
    const frames = [];
    for (const t of [...moments].sort((a, b) => a - b)) {
      await advance(t);
      for (const s of steps) {
        if (s.at <= pop.at || s === close || s.at > t + 1e-9) continue;
        if (s.do === 'type') {
          const want = Math.min(s.value.length, Math.floor(((Math.round(t * fps) - Math.round(s.at * fps)) * s.cps) / fps));
          s.typed ??= 0;
          while (s.typed < want) await pip.keyboard.type(s.value[s.typed++]);
        } else if (!s.done) {
          s.done = true;
          await press(pip, 'pip', s);
        }
      }
      const src = keep(await pip.screenshot({ caret: 'hide' }));
      if (frames.at(-1)?.src !== src) frames.push({ t, src });
    }
    await pip.close();
    await ctx.clock.runFor(500);
    const after = keep(await tab.screenshot({ caret: 'hide' }));

    const stage = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: scene.dpr });
    try {
      const html = readFileSync(new URL('call.html', import.meta.url));
      await stage.route('http://stage.capture/**', (route) => {
        const name = route.request().url().split('/').pop();
        return route.fulfill(name === 'call.html' ? { body: html, contentType: 'text/html' } : { body: assets.get(name), contentType: 'image/png' });
      });
      await stage.addInitScript((data) => { window.STAGE = data; }, {
        tab: { ...scene.viewport, frames: tabFrames, after }, pip: { ...scene.window, frames }, clicks,
        open: pop.at, shown, close: close.at, duration: scene.duration,
      });
      await stage.goto('http://stage.capture/call.html');
      await stage.waitForSelector('body[data-ready]');
      const out = join(dir, `${scene.id}.mp4`);
      const ff = encoder(scene, out);
      let poster;
      const n = Math.round(scene.duration * fps);
      for (let f = 0; f < n; f++) {
        await stage.evaluate((t) => window.render(t), f / fps);
        const png = await stage.screenshot();
        await ff.write(png);
        if (f === Math.round((scene.poster ?? 0) * fps)) poster = png;
      }
      await ff.end();
      return { [`${scene.id}.mp4`]: readFileSync(out), [`${scene.id}.webp`]: await webpPoster(poster, out), pngs: [poster] };
    } finally { await stage.close(); }
  } finally { await ctx.close(); }
}
