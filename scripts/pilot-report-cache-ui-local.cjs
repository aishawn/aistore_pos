/** Intercepted browser fixtures; validates UI behavior, not live Odoo reconciliation. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const root = path.resolve(__dirname, '..'), base = process.env.PILOT_BASE_URL || 'http://localhost:3085';
const shots = path.join(root, 'docs/screenshots/report-cache-2026-11-03');
fs.mkdirSync(shots, { recursive: true });
const user = { id: 17, vendorId: 9, outletId: 41, name: 'Fixture', username: 'fixture', isAdmin: true };
const bounds = { yesterday: ['2026-11-01T13:30:00Z', '2026-11-02T13:30:00Z', 'Yesterday'], last_week: ['2026-10-25T13:30:00Z', '2026-11-01T13:30:00Z', 'Last week'], last_month: ['2026-09-30T14:30:00Z', '2026-10-31T13:30:00Z', 'Last month'] };
const checks = [], errors = [];
function report(period, empty = false) {
  const [from, to] = bounds[period];
  return { period, from, to, generatedAt: '2026-11-03T00:00:00Z', queryThrough: to, cacheStatus: 'HIT', updateStatus: 'complete', timezone: 'Australia/Adelaide', company: 'Fixture store', currency: 'AUD', rangeHours: 24,
    revenue: empty ? 0 : 200, grossSales: empty ? 0 : 200, refunds: 0, tax: empty ? 0 : 18.18, transactions: empty ? 0 : 10, itemsSold: empty ? 0 : 20, openRegisters: 1,
    trendGranularity: period === 'yesterday' ? 'hour' : 'day', trend: empty ? [] : [{ label: period === 'yesterday' ? '2026-11-02 10:00:00' : '2026-10-15', revenue: 200, transactions: 10 }],
    recentSales: [], topProducts: [], byCategory: [], comparisonLabel: period === 'yesterday' ? 'vs same day last week' : period === 'last_week' ? 'vs previous week' : 'vs previous month', compare: { revenue: 100, transactions: 5, itemsSold: 10, revenueDeltaPct: 100, transactionsDeltaPct: 100, itemsSoldDeltaPct: 100, averageSaleDeltaPct: 0 } };
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  try {
    for (const width of [390, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await context.addCookies(['orithos_access_token', 'orithos_local_preview'].map(name => ({ name, value: name.endsWith('preview') ? '1' : 'fixture', url: base })));
      await context.addInitScript(value => localStorage.setItem('sf_user', JSON.stringify(value)), user);
      const requests = []; let deadReads = 0, fail = false, empty = false, prepare = false, taskPolls = 0, delayWeek = true, releaseWeek;
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url()), p = url.pathname;
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (p === '/api/auth/me') return json({ code: 0, data: user });
        if (p === '/api/odoo/session') return json({ user: { uid: 17, name: 'Fixture' } });
        if (p === '/api/odoo/reporting-dashboard') {
          const period = url.searchParams.get('period'); requests.push({ period, refresh: url.searchParams.get('refresh'), task: url.searchParams.get('task') });
          if (period === 'today') return json({ period, timezone: 'Australia/Adelaide', company: 'Fixture store', currency: 'AUD', revenue: 321.45, transactions: 12, openRegisters: 1, generatedAt: new Date().toISOString(), queryThrough: new Date().toISOString() });
          assert.ok(bounds[period]); assert.equal(url.searchParams.has('hours'), false);
          if (period === 'last_week' && delayWeek) { await new Promise(resolve => { releaseWeek = resolve; }); }
          if (fail) return json({ message: 'Fixture refresh failed' }, 502);
          if (prepare && !url.searchParams.has('task')) return json({ taskId: 'fixture-task', updateStatus: 'queued' }, 202);
          if (url.searchParams.has('task')) { taskPolls++; if (taskPolls < 2) return json({ taskId: 'fixture-task', updateStatus: 'running' }, 202); }
          return json(report(period, empty));
        }
        if (p === '/api/odoo/dead-stock') { deadReads++; return json({ bucketCounts: { 30: 0, 60: 0, 90: 0 }, cashValueByBucket: { 30: 0, 60: 0, 90: 0 }, invalidCostOrStockCount: 0, products: [], dataQuality: 'FIXTURE', generatedAt: '2026-11-03T00:00:00Z' }); }
        if (p === '/api/tenant/sample-data/status') return json({ code: 0, data: { state: 'inactive' } });
        if (p === '/api/odoo/pos-bootstrap') return json({ configs: [], companies: [], paymentMethods: [] });
        if (route.request().method() !== 'GET') return json({ message: 'Fixture business writes blocked' }, 405);
        return json({ code: 0, data: [] });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const check = (name, condition) => { assert.ok(condition, width + ': ' + name); checks.push({ width, name, status: 'PASS' }); };
      await page.goto(base + '/reports/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
      const group = page.getByRole('group', { name: 'Orithos sales reporting range' }); await group.waitFor({ timeout: 90000 });
      check('default Yesterday and exactly three calendar choices', await group.getByRole('button').count() === 3 && await group.getByRole('button', { name: 'Yesterday', exact: true }).getAttribute('aria-pressed') === 'true');
      const initialDead = deadReads;
      await group.getByRole('button', { name: 'Last week', exact: true }).click();
      await page.waitForFunction(() => document.body.innerText.includes('Preparing report'));
      await group.getByRole('button', { name: 'Last month', exact: true }).click();
      await page.getByRole('region', { name: 'Last month Orithos summary' }).waitFor();
      delayWeek = false; releaseWeek(); await page.waitForTimeout(150);
      check('obsolete weekly response cannot replace selected month', await page.getByRole('region', { name: 'Last month Orithos summary' }).count() === 1);
      await group.getByRole('button', { name: 'Last week', exact: true }).click();
      await page.getByRole('region', { name: 'Last week Orithos summary' }).waitFor();
      const count = requests.length;
      const switchMs = await page.evaluate(async () => {
        const started = performance.now(); const group = document.querySelector('[aria-label="Orithos sales reporting range"]');
        [...group.querySelectorAll('button')].find(button => button.textContent === 'Last month').click();
        while (!document.querySelector('section[aria-label="Last month Orithos summary"]')) await new Promise(requestAnimationFrame);
        return performance.now() - started;
      });
      check('cached period switch renders within 100 ms', switchMs < 100);
      check('cached switch adds no report request or dead-stock scan', requests.length === count && deadReads === initialDead);
      check('month date label shows inclusive natural dates', (await page.locator('main').last().innerText()).includes('01 Oct 2026 – 31 Oct 2026'));
      const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
      fail = true; await refresh.click(); await page.getByRole('alert').filter({ hasText: 'Fixture refresh failed' }).waitFor();
      check('failed refresh preserves last successful report', await page.getByRole('region', { name: 'Last month Orithos summary' }).count() === 1);
      fail = false; prepare = true; await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.waitForFunction(() => !document.body.innerText.includes('Preparing report'), { timeout: 15000 });
      await page.getByRole('alert').filter({ hasText: 'Fixture refresh failed' }).waitFor({ state: 'hidden' });
      check('manual refresh waits for one job and polls without refresh flag', taskPolls >= 2 && requests.filter(r => r.task).every(r => !r.refresh));
      prepare = false; empty = true; await refresh.click();
      await page.getByText('No Orithos sales in this period', { exact: false }).first().waitFor();
      check('empty report has no removed hour/day range links', await page.getByRole('button', { name: /^(8 hours|24 hours|7 days|30 days|90 days|180 days)$/ }).count() === 0 && await page.getByRole('link', { name: /^(8 hours|24 hours|7 days|30 days|90 days|180 days)$/ }).count() === 0);
      check('no mobile or desktop horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(shots, `reports-${width}.png`), fullPage: true });
      empty = false;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('region', { name: 'Last month Orithos summary' }).waitFor({ timeout: 60000 }).catch(async error => { console.log(JSON.stringify({ url: page.url(), requests, body: (await page.locator('body').innerText()).slice(-6000), errors })); throw error; });
      check('reload preserves the selected calendar period', await page.getByRole('button', { name: 'Last month', exact: true }).getAttribute('aria-pressed') === 'true');
      await page.goto(base + '/dashboard/workspace', { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => document.body.innerText.includes('TODAY'), null, { timeout: 90000 });
      check('home uses Today summary request', requests.some(r => r.period === 'today'));
      await page.screenshot({ path: path.join(shots, `today-${width}.png`), fullPage: true });
      await context.close();
    }
    assert.deepEqual(errors, []);
    const evidence = { target: base, browser: 'Edge headless', fixturesOnly: true, realBusinessWrites: 0, checks, errors };
    fs.writeFileSync(path.join(root, 'docs/UAT_REPORT_CACHE_UI_LOCAL_2026-11-03.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ checks: checks.length, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
