const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const base = process.env.AI_FLOAT_UAT_BASE || 'http://demo.lvh.me:3102';
assert.ok(['localhost', '127.0.0.1', 'demo.lvh.me'].includes(new URL(base).hostname), 'Local fixture UAT only');
const checks = [];
const errors = [];
const shots = 'docs/screenshots/2026-10-24-ai-float';
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
const user = { id: 1, name: 'admin', username: 'admin', isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false };
const position = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('orithos-ai-float-anchor')));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 980 }, hasTouch: true });
      await context.addCookies([{ name: 'orithos_access_token', value: 'float-fixture', url: base }]);
      await context.addInitScript(user => {
        localStorage.setItem('sf_token', 'float-fixture');
        localStorage.setItem('sf_user', JSON.stringify(user));
      }, user);
      await context.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const data = path === '/api/auth/me' ? user : path === '/api/ai/config/client' ? { enabled: false, aiTriggerKeywords: [] } : [];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'OK', data }) });
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/products', { waitUntil: 'networkidle' });
      const fab = page.getByRole('button', { name: 'Open Orithos AI assistant', exact: true });
      const dialog = page.getByRole('dialog', { name: 'Orithos AI assistant', exact: true });
      await fab.waitFor();
      await page.evaluate(() => {
        window.nativeDrags = 0;
        document.addEventListener('dragstart', () => window.nativeDrags++);
      });
      // Small increments over the image edge reliably reproduced native image drag cancellation.
      for (const [label, dx, dy, steps] of [['slow edge', -100, -110, 100], ['fast centre', -45, -70, 2]]) {
        const before = await fab.boundingBox();
        const sx = before.x + before.width / 2;
        const sy = before.y + (label === 'slow edge' ? 8 : before.height / 2);
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(sx + dx, sy + dy, { steps });
        await page.mouse.up();
        await page.mouse.move(0, 0);
        const after = await fab.boundingBox();
        check(`${width} ${label} follows pointer`, Math.abs(after.x - before.x - dx) < 2 && Math.abs(after.y - before.y - dy) < 2);
        check(`${width} ${label} release does not open chat`, await dialog.count() === 0);
      }
      check(`${width} no native image drag`, await page.evaluate(() => window.nativeDrags === 0));
      check(`${width} no white CSS border`, await fab.locator('[role="img"]').evaluate(el => getComputedStyle(el).borderTopWidth === '0px'));
      const saved = await position(page);
      await fab.click();
      await dialog.waitFor();
      check(`${width} opening panel preserves orb anchor`, JSON.stringify(await position(page)) === JSON.stringify(saved));
      await page.getByRole('button', { name: 'Close assistant', exact: true }).last().click();
      await fab.waitFor();
      check(`${width} closing panel preserves orb anchor`, JSON.stringify(await position(page)) === JSON.stringify(saved));
      await page.reload({ waitUntil: 'networkidle' });
      await fab.waitFor();
      check(`${width} reload restores anchor`, JSON.stringify(await position(page)) === JSON.stringify(saved));

      const cdp = await context.newCDPSession(page);
      const beforeTouch = await fab.boundingBox();
      const tx = beforeTouch.x + 32, ty = beforeTouch.y + 32;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 60 * step / 10, y: ty - 90 * step / 10 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(100);
      const afterTouch = await fab.boundingBox();
      check(`${width} real touch drag follows finger`, Math.abs(afterTouch.x - beforeTouch.x - 60) < 2 && Math.abs(afterTouch.y - beforeTouch.y + 90) < 2);
      check(`${width} touch release does not open chat`, await dialog.count() === 0);

      const cancelBox = await fab.boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelBox.x + 32, y: cancelBox.y + 32 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelBox.x + 52, y: cancelBox.y + 12 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await fab.focus();
      await page.keyboard.press('Enter');
      await dialog.waitFor();
      check(`${width} cancel does not swallow next keyboard activation`, await dialog.isVisible());
      await page.keyboard.press('Escape');
      await fab.waitFor();
      await fab.click();
      await dialog.waitFor();
      check(`${width} next click opens normally`, await dialog.isVisible());
      await page.keyboard.press('Escape');
      await fab.waitFor();

      // Drag beyond the viewport, then resize while the chat is expanded.
      const edge = await fab.boundingBox();
      await page.mouse.move(edge.x + 32, edge.y + 32);
      await page.mouse.down();
      await page.mouse.move(-100, -100, { steps: 20 });
      await page.mouse.up();
      await page.mouse.move(0, 0);
      const bounded = await fab.boundingBox();
      check(`${width} offscreen drag is clamped`, bounded.x >= 8 && bounded.y >= 8);
      await fab.click();
      await dialog.waitFor();
      await page.setViewportSize({ width: 320, height: 640 });
      await page.keyboard.press('Escape');
      await fab.waitFor();
      await page.mouse.move(0, 0);
      const resized = await fab.boundingBox();
      check(`${width} resize keeps orb visible`, resized.x >= 8 && resized.y >= 8 && resized.x + resized.width <= 312 && resized.y + resized.height <= 632);
      await page.setViewportSize({ width, height: 980 });
      await fab.screenshot({ path: `${shots}/orb-${width}.png` });
      await page.screenshot({ path: `${shots}/page-${width}.png` });
      await context.close();
    }
    check('no browser page errors', errors.length === 0);
    const report = { date: '2026-10-24', base, sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), worktreeDirty: true, runnerNode: process.version, scope: 'Local browser fixtures only; all API requests intercepted; no business writes or deployment verification', checks, errors };
    fs.writeFileSync('docs/UAT_AI_FLOAT_LOCAL_2026-10-24.json', JSON.stringify(report, null, 2) + '\n');
    console.log(`${checks.length}/${checks.length} PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
