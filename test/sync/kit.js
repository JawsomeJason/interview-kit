// Page helpers for the two-browser specs over the kit harness.js builds: open a laptop, start an interview, invite,
// knock and meet.
export async function laptop(browser, url, { init, hash = '' } = {}) {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  await page.goto(url + hash);
  await page.evaluate(() => window.ready);
  return page;
}

export const text = (page, selector, want, timeout = 15_000) => page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [selector, want], { timeout });

export async function start(page, name, candidate = 'Sam Lee') {
  await page.locator('.start-name').fill(name);
  await page.getByLabel('Who are you meeting?').fill(candidate);
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
}

export async function fromMenu(page, label) {
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: label }).click();
  const code = await page.locator('.sync-dialog .sync-code').inputValue();
  await page.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();
  return code;
}

export async function knock(page, code, name) {
  await page.locator('.start-name').fill(name);
  await page.locator('.sync-join-code').fill(code);
  await page.getByRole('button', { name: 'Join' }).click();
}

// Jason invites and lets Alex in; both see each other connected over the relay.
export async function meet(browser, url, init) {
  const jason = await laptop(browser, url, { init });
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url, { init });
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(jason, '.sync-status', 'Connected to Alex');
  await text(alex, '.sync-status', 'Connected to Jason');
  return [jason, alex];
}
