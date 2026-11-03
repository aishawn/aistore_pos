/** Browser fixtures only; no live network or business writes. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.PILOT_BASE_URL || 'http://localhost:3072';
const shots = path.join(root, 'docs/screenshots/reports-period-2026-11-03');
const checks = [], errors = [];
const user = { id: 17, vendorId: 41, name: 'Fixture', username: 'fixture', isAdmin: true };
const check = (width, name, ok) => { assert.ok(ok, `${width}: ${name}`); checks.push({ width, name, status: 'PASS' }); };
const periods = {
  yesterday: ['Yesterday', '2026-11-01 13:30:00', '2026-11-02 13:30:00', 'vs same day last week'],
  last_week: ['Last week', '2026-10-25 13:30:00', '2026-11-01 13:30:00', 'vs previous week'],
  last_month: ['Last month', '2026-09-30 14:30:00', '2026-10-31 13:30:00', 'vs previous month'],
};
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  try {
    for (const width of [390, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await context.addCookies(['orithos_access_token', 'orithos_local_preview'].map(name => ({ name, value: name.endsWith('preview') ? '1' : 'fixture', url: base })));
      await context.addInitScript(value => localStorage.setItem('sf_user', JSON.stringify(value)), user);
      const requests = [];
      let slowWeek = false, releaseWeek, weekStarted = false, empty = false, fail = false;
      await context.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname;
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (p === '/api/auth/me') return json({ code: 0, data: user });
        if (p === '/api/odoo/session') return json({ user: { uid: 17, name: 'Fixture' } });
        if (p === '/api/odoo/reporting-dashboard') {
          const period = url.searchParams.get('period'); requests.push(period);
          assert.ok(periods[period]); assert.equal(url.searchParams.has('hours'), false);
          if (slowWeek && period === 'last_week') {
            weekStarted = true; await new Promise(resolve => { releaseWeek = resolve; });
          }
          if (fail) return json({ message: 'Fixture report failed' }, 502);
          const [, from, to, comparisonLabel] = periods[period];
          return json({ period, from, to, comparisonLabel, timezone: 'Australia/Adelaide', company: 'Fixture store', currency: 'AUD', rangeHours: 24,
            revenue: empty ? 0 : 200, grossSales: empty ? 0 : 200, refunds: 0, tax: empty ? 0 : 18.18, transactions: empty ? 0 : 10, itemsSold: empty ? 0 : 20, openRegisters: 1,
            trendGranularity: period === 'yesterday' ? 'hour' : 'day', trend: empty ? [] : [{ label: period === 'yesterday' ? '2026-11-02 10:00:00' : '2026-10-15', revenue: 200, transactions: 10 }],
            recentSales: [], topProducts: [], byCategory: [], compare: { revenue: 100, transactions: 5, itemsSold: 10, revenueDeltaPct: empty ? -100 : 100, transactionsDeltaPct: empty ? -100 : 100, itemsSoldDeltaPct: empty ? -100 : 100, averageSaleDeltaPct: empty ? -100 : 0 } });
        }
        if (p === '/api/odoo/dead-stock') return json({}, 503);
        if (req.method() !== 'GET') return json({ message: 'Writes blocked' }, 405);
        return json({ code: 0, data: [] });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/reports/dashboard`, { waitUntil: 'domcontentloaded' });
      const group = page.getByRole('group', { name: 'Orithos sales reporting range' });
      await group.waitFor({ timeout: 15000 }).catch(async error => { console.error({ url: page.url(), body: await page.locator("body").innerText(), requests, errors }); await page.screenshot({ path: path.join(shots, "failure.png") }); throw error; });
      check(width, 'default Yesterday, only three calendar options', requests.every(p => p === 'yesterday') && await group.getByRole('button').count() === 3 && await group.getByRole('button', { name: 'Yesterday', exact: true }).getAttribute('aria-pressed') === 'true');
      for (const period of ['last_week', 'last_month']) {
        await group.getByRole('button', { name: periods[period][0], exact: true }).click();
        await page.locator(`section[aria-label="${periods[period][0]} Orithos summary"]`).waitFor();
        await page.getByText(`+100.0% ${periods[period][3]}`, { exact: true }).first().waitFor();
        check(width, `${period}: correct request and comparison copy`, requests.at(-1) === period);
      }
      check(width, 'Last month shows inclusive natural month dates', (await page.locator('main').last().innerText()).includes('01 Oct 2026 – 31 Oct 2026'));
      await page.screenshot({ path: path.join(shots, `reports-month-${width}.png`) });
      const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
      await refresh.click(); await page.waitForFunction(() => !document.querySelector('button[disabled] svg.animate-spin'));
      check(width, 'Refresh retains Last month', requests.at(-1) === 'last_month');
      slowWeek = true;
      await group.getByRole('button', { name: 'Last week', exact: true }).click();
      await page.waitForTimeout(100); assert.ok(weekStarted);
      await group.getByRole('button', { name: 'Yesterday', exact: true }).click();
      await page.locator('section[aria-label="Yesterday Orithos summary"]').waitFor();
      releaseWeek(); await page.waitForTimeout(300); slowWeek = false;
      check(width, 'late Last week response cannot replace Yesterday', await page.locator('section[aria-label="Yesterday Orithos summary"]').count() === 1);
      fail = true; await refresh.click(); await page.getByText('Fixture report failed', { exact: false }).first().waitFor();
      fail = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByText('Fixture report failed', { exact: false }).first().waitFor({ state: 'hidden' });
      check(width, 'failed refresh retries current period', requests.at(-1) === 'yesterday');
      empty = true; await refresh.click(); await page.getByText('No Orithos sales in this period', { exact: true }).waitFor();
      check(width, 'empty states have no retired range shortcuts', await page.getByRole('button', { name: /Try |8 hours|24 hours|90 days|180 days|7 days|30 days/ }).count() === 0);
      check(width, 'range controls fit viewport', await group.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
      check(width, 'no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(shots, `reports-${width}.png`) });
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root, 'docs/UAT_REPORTS_PERIOD_UI_LOCAL_2026-11-03.json'), JSON.stringify({ target: base, fixtureOnly: true, status: 'PASS', checks, errors, businessWrites: 0, liveOdooVerified: false }, null, 2));
    console.log(JSON.stringify({ status: 'PASS', checks: checks.length, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
