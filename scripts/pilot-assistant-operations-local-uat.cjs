// Fixture UI verification only. Does not contact SKR or accept live business writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.PILOT_BASE_URL || 'http://localhost:3127';
const output = process.env.UAT_OUTPUT_DIR || '.local/assistant-operations';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  const errors = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 919 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: 'orithos_access_token', value: 'fixture', url: base }, { name: 'orithos_local_preview', value: '1', url: base }]);
      const requests = [];
      let salesAvailable = false;
      await context.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ path: url.pathname, method: request.method() });
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/auth/me') return json({ code: 0, data: { id: 1, name: 'Fixture', username: 'admin', isAdmin: true } });
        if (url.pathname === '/api/ai/config/client') return json({ code: 0, data: { enabled: true, assistantAvailable: true, transcriptionAvailable: false } });
        if (url.pathname === '/api/odoo/replenishment') return json({
          company: 'Fixture store', coverageDays: 21, reviewRequiredCount: 9713, generatedAt: '2026-11-01T00:00:00Z',
          products: [{ id: 501, name: 'Fixture Beer', unit: 'cases', recommendationStatus: 'READY', suggestedQuantity: 8 }],
        });
        if (url.pathname === '/api/odoo/reporting-dashboard') {
          assert.equal(url.searchParams.get('period'), 'this_week');
          return salesAvailable ? json({ company: 'Fixture store', period: 'this_week', revenue: 1234.5,
            transactions: 18, currency: 'AUD', from: '2026-10-25 13:30:00', to: '2026-11-01 00:00:00', timezone: 'Australia/Adelaide' })
            : json({ message: 'Unavailable' }, 503);
        }
        return json({ code: 0, data: [] });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/assistant`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByRole('button', { name: /Check stock levels/ }).click();
      const restock = page.getByRole('region', { name: 'Replenishment suggestions' });
      await restock.getByText('Review needed', { exact: true }).waitFor();
      await restock.getByText(/Fixture Beer.*8 cases/).waitFor();
      await page.getByRole('button', { name: /Analyse sales/ }).click();
      const sales = page.getByRole('region', { name: "This week's sales" });
      await sales.getByText(/No figures were generated/).waitFor();
      salesAvailable = true;
      await sales.getByRole('button', { name: 'Retry', exact: true }).click();
      await sales.getByText(/net sales.*1,234.50/).waitFor();
      assert.equal(await sales.count(), 1, 'retry replaces failed card');
      assert.equal(await sales.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      assert.equal(requests.filter((request) => request.path === '/api/ai/assistant' || request.path.startsWith('/api/ai/commands')).length, 0);
      assert.equal(requests.filter((request) => request.method !== 'GET').length, 0);
      await page.screenshot({ path: `${output}/assistant-${width}.png`, fullPage: true });
      checks.push({ width, partialData: 'PASS', salesRetry: 'PASS', noOverflow: 'PASS', businessWrites: 0 });
      await context.close();
    }
    assert.deepEqual(errors, []);
    const evidence = { scope: 'Local mocked API UI only; not live SKR, deployment, or model/provider acceptance', checks, errors };
    fs.writeFileSync(`${output}/result.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
