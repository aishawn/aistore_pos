/** Browser fixtures only. No live network, stock or other business writes. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.PILOT_BASE_URL || 'http://127.0.0.1:3071';
const shots = path.join(root, 'docs/screenshots/inventory-report-2026-11-03');
const checks = [], errors = [], writes = [];
const products = Array.from({ length: 125 }, (_, index) => ({ id: index + 1, name: `Wine ${String(index + 1).padStart(3, '0')}`, display_name: `Wine ${String(index + 1).padStart(3, '0')}`, barcode: `930${index}`, default_code: false, list_price: 10, price_included: 11, price_tax: 1, taxes_id: [1], qty_available: index - 3, free_qty: index - 3, uom_id: [1, 'Units'], pos_categ_ids: [1], available_in_pos: true }));
const user = { id: 17, vendorId: 41, name: 'Fixture', username: 'fixture', isAdmin: true };
const check = (width, name, ok) => { assert.ok(ok, `${width}: ${name}`); checks.push({ width, name, status: 'PASS' }); };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  try {
    for (const width of [390, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies(['orithos_access_token', 'orithos_local_preview'].map(name => ({ name, value: name.endsWith('preview') ? '1' : 'fixture', url: base })));
      await context.addInitScript(value => localStorage.setItem('sf_user', JSON.stringify(value)), user);
      const requests = [], snapshots = new Map();
      let failAppend = false, expireAppend = false, slowStarted = false, noCost = false;
      await context.route('**/api/**', async route => {
        const req = route.request(), p = new URL(req.url()).pathname;
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (p === '/api/auth/me') return json({ code: 0, data: user });
        if (p === '/api/odoo/session') return json({ user: { uid: 17, name: 'Fixture' } });
        if (p === '/api/odoo/pos-bootstrap') return json({ configs: [] });
        if (p === '/api/odoo/records') {
          const body = req.postDataJSON();
          if (body.type === 'posCategories') return json({ items: [{ id: 1, name: 'Wine', parent_id: false }], hasNext: false });
          assert.equal(body.inventoryReport, true); requests.push(body);
          if (body.offset && failAppend) return json({ message: 'Fixture append failed' }, 502);
          if (body.offset && expireAppend) { expireAppend = false; return json({ message: 'Inventory results expired. Refresh to load current stock.' }, 409); }
          if (body.query === 'slow') { slowStarted = true; await new Promise(resolve => setTimeout(resolve, 850)); }
          let rows = products.filter(p => !body.query || p.name.toLowerCase().includes(body.query.toLowerCase()));
          if (body.catalogueView === 'negative-stock') rows = rows.filter(p => p.qty_available < 0);
          if (body.catalogueView === 'out-of-stock') rows = rows.filter(p => p.qty_available === 0);
          rows.sort((a, b) => (body.sortBy === 'qty_available' ? a.qty_available - b.qty_available : a.name.localeCompare(b.name)) * (body.sortDirection === 'desc' ? -1 : 1) || a.id - b.id);
          const snapshotId = body.snapshotId || `fixture-${snapshots.size + 1}`;
          if (body.snapshotId) assert.ok(snapshots.has(body.snapshotId)); else snapshots.set(snapshotId, rows);
          return json({ items: rows.slice(body.offset || 0, (body.offset || 0) + body.limit), limit: body.limit, offset: body.offset || 0, hasNext: (body.offset || 0) + body.limit < rows.length, snapshotId, total: rows.length, totalItems: rows.length, totalQty: rows.reduce((sum, p) => sum + p.qty_available, 0), totalStockValue: noCost ? null : rows.reduce((sum, p) => sum + p.qty_available * 2, 0), missingCostItems: noCost ? rows.length : 0, mixedUnits: false });
        }
        if (req.method() !== 'GET') { writes.push(p); return json({ message: 'Writes blocked' }, 405); }
        return json({ code: 0, data: [] });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(180000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/reports/inventory', { waitUntil: 'networkidle' });
      const main = page.locator('main').last();
      const product = name => main.getByRole('button', { name, exact: true }).filter({ visible: true });
      const summary = main.locator('footer[aria-label="Totals for all matching products"]');
      await product('Wine 001').waitFor();
      await summary.getByText('Loaded 40 / 125 products', { exact: true }).waitFor();
      check(width, 'report title and full-result totals before scrolling', await main.getByRole('heading', { name: 'Inventory report', exact: true }).isVisible() && (await summary.textContent()).includes('$14,750.00'));
      check(width, 'summary stays inside viewport', await summary.evaluate(el => { const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }));
      for (const count of [80, 120, 125]) {
        await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await summary.getByText(`Loaded ${count} / 125 products`, { exact: true }).waitFor();
      }
      check(width, 'continuous append loads all rows exactly once', await product('Wine 125').isVisible() && requests.filter(r => r.offset > 0).length === 3);
      check(width, 'completed list announces all loaded', await main.getByText('All results loaded', { exact: true }).isVisible());
      await main.evaluate(el => { el.scrollTop = 0; });
      if (width >= 1280) {
        await main.getByRole('columnheader').getByRole('button', { name: 'On hand', exact: true }).click();
        await product('Wine 001').waitFor();
        await main.getByRole('columnheader').getByRole('button', { name: 'On hand', exact: true }).click();
      } else await main.getByRole('combobox', { name: 'Sort inventory' }).selectOption('qty_available:desc');
      await product('Wine 125').waitFor();
      check(width, 'sorting resets results and sends global descending order', requests.at(-1).sortBy === 'qty_available' && requests.at(-1).sortDirection === 'desc' && !requests.at(-1).offset);
      if (width >= 1280) check(width, 'aria-sort exposes direction', await main.getByRole('columnheader').filter({ hasText: 'On hand' }).getAttribute('aria-sort') === 'descending');
      const query = main.getByRole('textbox', { name: 'Search products by name, barcode or SKU' });
      await query.fill('no match'); await main.getByText('No matching products', { exact: true }).filter({ visible: true }).waitFor();
      await summary.getByText('Loaded 0 / 0 products', { exact: true }).waitFor();
      check(width, 'empty search has zero totals', (await summary.textContent()).includes('$0.00'));
      await query.fill('slow'); await page.waitForTimeout(400); assert.ok(slowStarted);
      await query.fill('Wine 003'); await product('Wine 003').waitFor(); await page.waitForTimeout(950);
      check(width, 'stale query response does not replace new results', await product('Wine 003').isVisible() && (await summary.textContent()).includes('Loaded 1 / 1'));
      await query.fill(''); await product('Wine 125').waitFor();
      failAppend = true; await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await main.getByText(/Fixture append failed/).waitFor();
      check(width, 'append failure preserves existing products', await product('Wine 125').count() === 1);
      failAppend = false;
      await main.getByRole('button', { name: 'Retry', exact: true }).click();
      await summary.getByText('Loaded 80 / 125 products', { exact: true }).waitFor();
      check(width, 'retry resumes failed page with snapshot', requests.at(-1).offset === 40 && Boolean(requests.at(-1).snapshotId));
      await main.getByRole('button', { name: 'Refresh products', exact: true }).click();
      await summary.getByText('Loaded 40 / 125 products', { exact: true }).waitFor();
      expireAppend = true; await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await main.getByRole('button', { name: 'Refresh results', exact: true }).waitFor();
      await main.getByRole('button', { name: 'Refresh results', exact: true }).click();
      await summary.getByText('Loaded 40 / 125 products', { exact: true }).waitFor();
      check(width, 'expired snapshot refreshes from first batch', requests.at(-1).offset === 0 && !requests.at(-1).snapshotId);
      noCost = true; await main.getByRole('button', { name: 'Refresh products', exact: true }).click();
      await summary.getByText(/Cost unavailable for 125/).waitFor();
      check(width, 'missing cost is explicit', (await summary.textContent()).includes('Unavailable'));
      check(width, 'no viewport horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await main.evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: path.join(shots, `inventory-${width}.png`) });
      await context.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(`${checks.length}/${checks.length} PASS; browser errors 0; live writes 0`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(root, 'docs/UAT_INVENTORY_REPORT_UI_LOCAL_2026-11-03.json'), JSON.stringify({ scope: 'Local intercepted browser fixture; no live acceptance', checks, errors, liveBusinessWrites: writes.length }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
