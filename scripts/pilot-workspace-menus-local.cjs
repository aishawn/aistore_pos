/** Intercepted UI verification only; no live business data or writes. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.PILOT_BASE_URL || 'http://localhost:3068';
const shots = path.join(root, 'docs/screenshots/workspace-menus-2026-11-02');
fs.mkdirSync(shots, { recursive: true });
const checks = [], writes = [];
const envelope = data => ({ code: 0, data });
const user = { id: 17, vendorId: 7, username: 'fixture', name: 'Fixture', isAdmin: true };
const product = { id: 81, name: 'Fixture Shiraz', display_name: 'Fixture Shiraz', barcode: '9300000081', default_code: 'W81', list_price: 20, qty_available: 5, free_qty: 5, uom_id: [1, 'Units'], pos_categ_ids: [], available_in_pos: true, taxes_id: [] };
const config = { id: 1, name: 'Fixture Register', company: [41, 'Fixture'], timezone: 'Australia/Adelaide', session: { id: 4, name: 'Session-4', state: 'opened', config_id: [1, 'Fixture Register'], user_id: [1, 'Fixture'], start_at: '2026-11-02 03:00:00', cashBalanceStart: 0, cashBalanceEnd: 0 }, paymentMethods: [{ id: 1, name: 'Cash', type: 'cash', is_cash_count: true }], pricelistIds: [], cashRounding: null, onlyRoundCashMethod: false };
(async () => {
 const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
 try {
  for (const width of [390, 1440]) {
   const context = await browser.newContext({ viewport: { width, height: 1000 } });
   await context.addCookies(['orithos_access_token', 'orithos_local_preview'].map(name => ({ name, value: name.endsWith('preview') ? '1' : 'fixture', url: base })));
   await context.addInitScript(user => localStorage.setItem('sf_user', JSON.stringify(user)), user);
   const requests = [], errors = [];
   await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    if (p === '/api/auth/me') return route.fulfill({ json: envelope(user) });
    if (p === '/api/odoo/session') return route.fulfill({ json: { user: { id: '1', uid: 1, name: 'Fixture', database: 'fixture' } } });
    if (p === '/api/odoo/pos-bootstrap') return route.fulfill({ json: { configs: [config], activeSessionId: 4 } });
    // Quote is a read-only calculation even though its transport uses POST.
    if (p === '/api/odoo/checkout/quote') return route.fulfill({ status: 503, json: { message: 'Fixture quote unavailable' } });
    if (p === '/api/odoo/records') {
     const body = req.postDataJSON(); requests.push(body);
     return route.fulfill({ json: { items: body.type === 'products' ? [product] : [], hasNext: false } });
    }
    if (p === '/api/odoo/workspace-records') {
     requests.push(Object.fromEntries(url.searchParams));
     if (url.searchParams.get('q') === 'error') return route.fulfill({ status: 502, json: { message: 'Fixture unavailable' } });
     return route.fulfill({ json: { columns: [{ key: 'name', label: 'Record' }], items: [{ id: 81, name: 'Fixture record' }], hasNext: !Number(url.searchParams.get('offset')), timezone: 'Australia/Adelaide', currency: 'AUD' } });
    }
    if (p === '/api/odoo/stocktake' && method === 'GET') return route.fulfill({ json: envelope({ locations: [{ id: 9, name: 'Fixture Stock' }], defaultLocationId: 9, writeEnabled: false, locationSource: 'tenant-binding', products: [] }) });
    if (p === '/api/odoo/purchase-orders') return route.fulfill({ json: { items: [], hasNext: false } });
    if (p === '/api/odoo/replenishment') return route.fulfill({ json: { company: 'Fixture', historyDays: 56, periodDays: 28, coverageDays: 21, products: [], truncated: false, generatedAt: new Date().toISOString() } });
    if (p.includes('invoice') && method === 'GET') return route.fulfill({ json: envelope({ items: [], total: 0 }) });
    if (method !== 'GET') { writes.push({ p, method }); return route.fulfill({ status: 403, json: { message: 'Fixture blocks writes' } }); }
    return route.fulfill({ json: envelope([]) });
   });
   const page = await context.newPage(); page.setDefaultNavigationTimeout(180000);
   page.on('pageerror', err => errors.push(err.message));
   const check = (name, ok) => { checks.push({ width, name, status: ok ? 'PASS' : 'FAIL' }); assert.ok(ok, name); };
   try {
    await page.goto(`${base}/products/odoo`, { waitUntil: 'networkidle' });
    const more = page.locator('details').filter({ has: page.locator('summary', { hasText: /^More$/ }) });
    await more.locator('summary').click();
    check('Products More starts Catalogue Inventory Stocktake', JSON.stringify((await more.getByRole('button').allTextContents()).slice(0, 3)) === JSON.stringify(['Catalogue', 'Inventory', 'Stocktake']));
    for (const name of ['Catalogue', 'Inventory', 'Stocktake']) {
     if ((await more.getAttribute('open')) === null) await more.locator('summary').click();
     await more.getByRole('button', { name, exact: true }).click();
     const dialog = page.getByRole('dialog', { name, exact: true }); await dialog.waitFor();
     if (name !== 'Stocktake') await dialog.getByText('Fixture record', { exact: true }).waitFor();
     check(`${name} modal fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
     if (name === 'Inventory') {
      const nextPage = page.waitForResponse(r => r.url().includes('workspace-records') && r.url().includes('offset=40'));
      await dialog.getByRole('button', { name: 'Next', exact: true }).click(); await nextPage;
      await dialog.getByText('Fixture record', { exact: true }).waitFor();
      check('Inventory pagination', requests.some(r => r.type === 'inventory' && r.offset === '40'));
      await dialog.getByLabel('Search records').fill('error');
      await dialog.getByRole('alert').waitFor();
      check('Error and retry are visible', await dialog.getByRole('button', { name: 'Retry', exact: true }).isVisible());
      await dialog.getByLabel('Search records').fill('Shiraz'); await dialog.getByText('Fixture record', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(shots, `inventory-${width}.png`) });
     }
     await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    }
    await page.goto(`${base}/purchases`, { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'Purchasing views' }).waitFor();
    check('Purchases tab order', JSON.stringify(await page.getByRole('navigation', { name: 'Purchasing views' }).getByRole('link').allTextContents()) === JSON.stringify(['Orders', 'Invoices', 'Suppliers', 'Replenishment']));
    await page.getByRole('link', { name: 'Suppliers', exact: true }).last().click();
    await page.getByRole('heading', { name: 'Suppliers', exact: true }).waitFor();
    check('Suppliers renders in workspace', await page.getByRole('heading', { name: 'Purchasing', exact: true }).isVisible());
    check('Only Purchases has a Suppliers navigation entry', await page.getByRole('link', { name: 'Suppliers', exact: true }).count() === 1);
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await page.getByRole('link', { name: 'Scan invoice', exact: true }).first().waitFor();
    await page.getByRole('link', { name: 'Replenishment', exact: true }).click();
    await page.getByText(/Rule-based reorder suggestions/).waitFor();
    await page.locator('summary').filter({ hasText: /^More$/ }).click();
    check('Stock Transfers in More', await page.getByRole('link', { name: 'Stock Transfers', exact: true }).isVisible());
    const transferBox = await page.getByRole('link', { name: 'Stock Transfers', exact: true }).boundingBox();
    check('Purchases More menu fits viewport', transferBox.x >= 0 && transferBox.x + transferBox.width <= width);
    await page.screenshot({ path: path.join(shots, `purchases-${width}.png`) });
    await page.evaluate(product => localStorage.setItem('orithos-odoo-active-cart-v1:1:1', JSON.stringify({ lines: [{ product, quantity: 2, packFactor: 1 }], paymentMethodId: 1, customer: null, cashTendered: '', savedAt: new Date().toISOString() })), product);
    await page.goto(`${base}/sell`, { waitUntil: 'networkidle' });
    await page.getByLabel('Sales menu', { exact: true }).click();
    const sales = page.locator('details').filter({ has: page.getByLabel('Sales menu', { exact: true }) });
    check('Sales menu order', JSON.stringify(await sales.getByRole('button').allTextContents()) === JSON.stringify(['Sales history', 'Sales lines', 'Payments', 'Refunds', 'Current session', 'Help']));
    check('All Sales menu items are unobscured and within viewport', await sales.getByRole('button').evaluateAll(buttons => buttons.every(button => {
     const rect = button.getBoundingClientRect();
     const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
     return rect.x >= 0 && rect.right <= innerWidth && rect.y >= 0 && rect.bottom <= innerHeight && button.contains(target);
    })));
    await page.screenshot({ path: path.join(shots, `sales-dropdown-${width}.png`) });
    const cartBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('orithos-odoo-active-cart-v1:1:1') || '{}').lines);
    check('Nonempty cart restored', cartBefore?.[0]?.quantity === 2);
    for (const name of ['Sales history', 'Sales lines', 'Payments', 'Refunds', 'Current session', 'Help']) {
     if ((await sales.getAttribute('open')) === null) await page.getByLabel('Sales menu', { exact: true }).click();
     await sales.getByRole('button', { name, exact: true }).click();
     const dialog = page.getByRole('dialog').first(); await dialog.waitFor();
     if (['Sales lines', 'Payments'].includes(name)) await dialog.getByText('Fixture record', { exact: true }).waitFor();
     if (name === 'Current session') { await dialog.getByText('Session-4', { exact: true }).waitFor(); await dialog.getByRole('button', { name: 'Refresh session' }).click(); }
     check(`${name} opens without page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
     await page.screenshot({ path: path.join(shots, `${name.toLowerCase().replaceAll(' ', '-')}-${width}.png`) });
     await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    }
    check('Refunds applies refunded status', requests.some(r => r.type === 'sales' && r.status === 'refunded'));
    check('Modals preserve nonempty cart storage', JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('orithos-odoo-active-cart-v1:1:1') || '{}').lines)) === JSON.stringify(cartBefore));
    check('No uncaught browser errors', errors.length === 0);
   } catch (error) { console.error(width, error.message); checks.push({ width, name: 'scenario completion', status: 'FAIL', error: error.message, errors }); await page.screenshot({ path: path.join(shots, `failure-${width}.png`), timeout: 5000 }).catch(() => {}); }
   await context.close();
  }
 } finally { await browser.close(); }
 const result = { environment: 'intercepted local UI fixtures', base, businessWrites: 0, attemptedWrites: writes, checks, limitations: ['Fixture UI evidence only; no live Odoo business acceptance or deployment claim.'] };
 fs.writeFileSync(path.join(root, 'docs/UAT_WORKSPACE_MENUS_LOCAL_2026-11-02.json'), JSON.stringify(result, null, 2) + '\n');
 console.log(JSON.stringify(result, null, 2));
 process.exitCode = checks.some(c => c.status === 'FAIL') || writes.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
