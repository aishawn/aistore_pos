/** Intercepted browser regression only: every real business write is blocked. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LIST_FOOTER_BASE || 'http://localhost:3072';
const root = path.resolve(__dirname, '..');
const checks = [], errors = [], writes = [];
const cases = [
  ['/customers', 'customers', 'customer-results-scroll', 'Search customers by name, phone, email or customer code'],
  ['/suppliers', 'suppliers', 'supplier-results-scroll', 'Search suppliers by name, phone, email, ABN or reference'],
  ['/purchases', 'purchase-orders', 'purchase-results-scroll', 'Search purchase orders by RFQ, order or supplier'],
  ['/stock/capped-pricing', 'pricelist-items', 'base-prices-scroll', 'Search Orithos price rules'],
  ['/stock/list', 'products', 'stock-results-scroll', 'Search stock products'],
  ['/stock/price-suggestions', 'price-suggestions', 'price-suggestions-scroll', null],
];
const user = { id: 17, vendorId: 41, username: 'fixture', name: 'Fixture', isAdmin: true };
const check = (width, route, name, ok) => { assert.ok(ok, `${width} ${route}: ${name}`); checks.push({ width, route, name, status: 'PASS' }); };
function row(id, prefix = 'Record') {
  return { id, name: `${prefix} ${String(id).padStart(3, '0')}`, display_name: `${prefix} ${String(id).padStart(3, '0')}`,
    productName: `${prefix} ${String(id).padStart(3, '0')}`, productId: id, sku: `SKU${id}`, default_code: `SKU${id}`,
    list_price: 11, qty_available: 1, free_qty: 1, pos_categ_ids: [], taxes_id: [], available_in_pos: true,
    phone: false, email: false, ref: false, vat: false, category_id: [], property_product_pricelist: false, credit: 0,
    partner_id: [1, 'Supplier'], date_order: '2026-11-03 12:00:00', state: 'draft', order_line: [], amount_total: 11, currency_id: [1, 'AUD'],
    priceSetName: 'Standard', sourceType: 'PROVIDED', source: 'Standard', startDate: null, endDate: null, quantity: 1, cappedPrice: null, currentPrice: 11, cost: 5, ruleType: 'fixed',
    unit: 'Units', soldUnits: 1, onHand: 1, currentMargin: 0.2, suggestedPrice: 12, suggestedMargin: 0.3, status: 'raise', reason: 'Fixture', currentListPrice: 11, suggestedListPrice: 12 };
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [390, 1440]) for (const [pathname, kind, testid, searchLabel] of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies(['orithos_access_token', 'orithos_local_preview'].map(name => ({ name, value: name.endsWith('preview') ? '1' : 'fixture', url: base })));
      await context.addInitScript(value => localStorage.setItem('sf_user', JSON.stringify(value)), user);
      const requests = [];
      let failAppend = true, appendInFlight = 0, maxConcurrent = 0;
      await context.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname;
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (p === '/api/auth/me') return json({ code: 0, data: user });
        if (p === '/api/odoo/session') return json({ user: { uid: 17, name: 'Fixture' } });
        if (p === '/api/odoo/pos-bootstrap') return json({ configs: [] });
        if (p === '/api/odoo/transfers') return json({ locations: [], items: [] });
        if (p === '/api/odoo/customer-groups' || p === '/api/odoo/pricelists') return json({ items: [], hasNext: false });
        const body = p === '/api/odoo/records' ? req.postDataJSON() : Object.fromEntries(url.searchParams);
        if (body.type === 'posCategories') return json({ items: [], hasNext: false });
        const isList = p === '/api/odoo/records' && body.type === kind || p === `/api/odoo/${kind}`;
        if (!isList) {
          if (req.method() !== 'GET') { writes.push(p); return json({ message: 'Business writes blocked' }, 405); }
          return json({ code: 0, data: [] });
        }
        const offset = Number(body.offset || 0), limit = Number(body.limit || 10);
        const query = kind === 'price-suggestions' ? Number(body.marginTarget) === 0.35 ? 'slow' : Number(body.marginTarget) === 0.4 ? 'fast' : '' : body.query || '';
        requests.push({ offset, query, limit });
        if (offset > 0) { appendInFlight++; maxConcurrent = Math.max(maxConcurrent, appendInFlight); }
        try {
          await new Promise(resolve => setTimeout(resolve, query === 'slow' ? 1400 : 120));
          if (offset > 0 && failAppend) return json({ message: 'Fixture append failed' }, 502);
          const total = query ? 2 : kind === 'customers' || kind === 'suppliers' || kind === 'purchase-orders' ? 97 : 35;
          const rows = Array.from({ length: total }, (_, i) => row(i + 1, query === 'fast' ? 'Fast' : query === 'slow' ? 'Slow' : 'Record'));
          // A repeated row must not make the next offset follow the deduplicated UI count.
          if (!query && offset > 0 && offset < total) rows[offset] = row(1);
          const items = rows.slice(offset, offset + limit);
          if (kind === 'price-suggestions') return json({ products: items, company: 'Fixture', marginTarget: Number(body.marginTarget), historyDays: 28, generatedAt: new Date().toISOString(), nextOffset: offset + limit < total ? offset + limit : null, truncated: offset + limit < total });
          return json({ items: kind === 'pricelist-items' ? items.map(item => ({...item,id:String(item.id)})) : items, offset, limit, total, hasNext: offset + limit < total });
        } finally { if (offset > 0) appendInFlight--; }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', error => errors.push({ pathname, width, message: error.message }));
      await page.goto(base + pathname, { waitUntil: 'load', timeout: 180000 });
      const scroll = page.getByTestId(testid);
      const record = name => kind === 'products' ? scroll.getByLabel(`Product name for ${name}`, { exact: true }).filter({ visible: true }) : scroll.getByText(name, { exact: true }).filter({ visible: true });
      await scroll.waitFor();
      for (let i = 0; i < 8 && !requests.some(r => r.offset > 0); i++) {
        await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(300);
      }
      const alert = page.getByRole('alert').filter({ hasText: 'Fixture append failed' });
      await alert.waitFor();
      const failed = requests.filter(r => r.offset > 0).at(-1);
      const count = requests.length;
      await page.waitForTimeout(450);
      check(width, pathname, 'failure pauses automatic retries', requests.length === count);
      check(width, pathname, 'failure retains loaded rows', await record('Record 001').count() === 1);
      failAppend = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await alert.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('[aria-live]')).some(el => /Loading more/.test(el.textContent)));
      check(width, pathname, 'retry resumes the failed offset', requests[count]?.offset === failed.offset);
      if (kind === 'purchase-orders') {
        await page.locator('summary').filter({ hasText: 'More' }).click();
        await page.getByRole('link', { name: 'Stock Transfers', exact: true }).click();
        await page.waitForURL('**/purchases?tab=transfers');
        await page.locator('summary').filter({ hasText: 'More' }).click();
        await page.getByRole('navigation', { name: 'Purchasing views' }).getByRole('link', { name: 'Orders', exact: true }).click();
        await scroll.waitFor();
      }
      for (let i = 0; i < 20; i++) {
        await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
        if (await scroll.getByText(/All (suggestions|\d+ products) loaded|\d+ (customers|suppliers|purchase orders|prices) loaded/, { exact: true }).count()) break;
        await page.waitForTimeout(200);
      }
      const offsets = requests.slice(count).filter(r => r.offset > 0).map(r => r.offset);
      check(width, pathname, 'paging uses consumed rows despite deduplication', offsets.length > 1 && offsets.slice(1).every((value, i) => value > offsets[i]));
      check(width, pathname, 'duplicate rows are hidden', await record('Record 001').count() === 1);
      check(width, pathname, 'append requests do not overlap', maxConcurrent === 1);
      const done = requests.length;
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(400);
      check(width, pathname, 'last batch stops loading', requests.length === done);
      if (kind !== 'products') {
        const beforeRefresh = requests.length;
        await page.getByRole('button', { name: /^Refresh/ }).first().click();
        const last = ['customers', 'suppliers', 'purchase-orders'].includes(kind) ? 'Record 097' : 'Record 035';
        await record(last).waitFor({ state: 'hidden' });
        await record('Record 001').first().waitFor();
        check(width, pathname, 'refresh restarts at offset zero', requests[beforeRefresh]?.offset === 0);
        check(width, pathname, 'refresh replaces appended rows', await record(last).count() === 0);
      }
      // Slow old query must never replace the newer query/margin target.
      const change = async value => searchLabel ? page.getByLabel(searchLabel, { exact: true }).fill(value) : page.getByLabel('Target margin').selectOption(value === 'slow' ? '0.35' : '0.4');
      await change('slow');
      for (let i = 0; i < 30 && !requests.some(r => r.query === 'slow'); i++) await page.waitForTimeout(100);
      assert.ok(requests.some(r => r.query === 'slow'));
      await change('fast');
      await record('Fast 001').first().waitFor();
      await page.waitForTimeout(1500);
      check(width, pathname, 'stale query cannot overwrite new results', await record('Slow 001').count() === 0);
      check(width, pathname, 'filter starts at offset zero', requests.filter(r => r.query === 'fast').every(r => r.offset === 0));
      check(width, pathname, 'no horizontal document overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await context.close();
      console.log(`${width} ${pathname} PASS`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(`${checks.length}/${checks.length} PASS; browser errors 0; real business writes 0`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(root, 'docs/UAT_CONTINUOUS_LISTS_LOCAL_2026-11-03.json'), JSON.stringify({ scope: 'Local intercepted browser fixtures only', checks, errors, realBusinessWrites: writes.length }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
