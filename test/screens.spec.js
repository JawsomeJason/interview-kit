import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { openScreen } from '../scripts/screens.mjs';

let browser;
let server;
let url;

// A kit reads IndexedDB before it draws the setup page, so on a busy machine the page has loaded with nothing drawn.
const slowStart = `<!doctype html><title>slow start</title><main></main><script>
setTimeout(() => {
  document.querySelector('main').innerHTML = '<form><label>Your name <input class="start-name" required></label>'
    + '<label>Who are you meeting? <input required></label><button>Start interview</button></form>';
  document.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    location.hash = '#/intro';
    document.querySelector('main').dataset.route = '#/intro';
  };
}, 500);
</script>`;

beforeAll(async () => {
  browser = await chromium.launch();
  server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(slowStart));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}/`;
});
afterAll(async () => { await browser?.close(); server?.close(); });

test('openScreen starts the interview when the setup page with a name box draws after the page loads', async () => {
  const { ctx, p } = await openScreen(browser, { url, viewport: { width: 1280, height: 800 } });
  expect(await p.evaluate(() => location.hash)).toBe('#/intro');
  await ctx.close();
}, 15_000);
