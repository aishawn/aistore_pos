/** Browser fixtures only. No live network, stock or other business writes. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.LIST_FOOTER_BASE || 'http://localhost:3072';
const shots = path.join(root, 'docs/screenshots/products-append-2026-11-03');
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
        if (p === '/api/odoo/sales-daily') {
          const body = req.postDataJSON(), offset = body.offset || 0, limit = body.limit || 40;
          const rows = products.map((p, index) => ({date:new Date(Date.UTC(2026,10,3-index)).toISOString().slice(0,10),salesTransactions:1,refundTransactions:0,salesAmount:10,refundAmount:0,netSales:10,tax:1}));
          requests.push({type:'sales-daily',offset});
          return json({items:rows.slice(offset,offset+limit),hasNext:offset+limit<rows.length,offset,limit,timezone:'Australia/Adelaide',currency:'AUD'});
        }
        if (p === '/api/odoo/purchase-orders') {
          const u = new URL(req.url()), offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || 40);
          const rows = products.map(p => ({id:p.id,name:'PO '+p.id,partner_id:[1,'Supplier'],date_order:'2026-11-03 12:00:00',state:'draft',order_line:[],amount_total:10,currency_id:[1,'AUD']}));
          requests.push({type:'purchase-orders',offset});
          return json({items:rows.slice(offset,offset+limit),hasNext:offset+limit<rows.length,offset,limit});
        }
        if (p === '/api/odoo/records') {
          const body = req.postDataJSON();
          if (body.type === 'sales') {
            const rows=products.map(p=>({id:p.id,name:'Sale '+p.id,pos_reference:'Receipt '+p.id,date_order:'2026-11-03 12:00:00',amount_total:10,amount_tax:1,state:'paid',partner_id:false,session_id:false,user_id:false}));
            requests.push(body);
            return json({items:rows.slice(body.offset||0,(body.offset||0)+body.limit),hasNext:(body.offset||0)+body.limit<rows.length,offset:body.offset||0,limit:body.limit});
          }
          if (body.type === 'posCategories') return json({ items: [{ id: 1, name: 'Wine', parent_id: false }], hasNext: false });
          requests.push(body);
          if (body.offset && failAppend) return json({ message: 'Fixture append failed' }, 502);
          if (body.offset && expireAppend) { expireAppend = false; return json({ message: 'Inventory results expired. Refresh to load current stock.' }, 409); }
          if (body.query === 'slow') { slowStarted = true; await new Promise(resolve => setTimeout(resolve, 850)); }
          let rows = products.filter(p => !body.query || p.name.toLowerCase().includes(body.query.toLowerCase()));
          if (body.catalogueView === 'negative-stock') rows = rows.filter(p => p.qty_available < 0);
          if (body.catalogueView === 'out-of-stock') rows = rows.filter(p => p.qty_available === 0);
          rows.sort((a, b) => (body.sortBy === 'qty_available' ? a.qty_available - b.qty_available : a.name.localeCompare(b.name)) * (body.sortDirection === 'desc' ? -1 : 1) || a.id - b.id);
          if (!body.inventoryReport) return json({items:rows.slice(body.offset || 0,(body.offset || 0)+body.limit),limit:body.limit,offset:body.offset || 0,hasNext:(body.offset || 0)+body.limit<rows.length,total:rows.length});
          const snapshotId = body.snapshotId || `fixture-${snapshots.size + 1}`;
          if (body.snapshotId) assert.ok(snapshots.has(body.snapshotId)); else snapshots.set(snapshotId, rows);
          return json({ items: rows.slice(body.offset || 0, (body.offset || 0) + body.limit), limit: body.limit, offset: body.offset || 0, hasNext: (body.offset || 0) + body.limit < rows.length, snapshotId, total: rows.length, totalItems: rows.length, totalQty: rows.reduce((sum, p) => sum + p.qty_available, 0), totalStockValue: noCost ? null : rows.reduce((sum, p) => sum + p.qty_available * 2, 0), missingCostItems: noCost ? rows.length : 0, mixedUnits: false });
        }
        if (req.method() !== 'GET') { writes.push(p); return json({ message: 'Writes blocked' }, 405); }
        return json({ code: 0, data: [] });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(180000);
      page.on('pageerror', error => errors.push(error.stack || error.message));
      for (const pathname of ['/products', '/reports/inventory']) {
        await page.goto(base + pathname, { waitUntil: 'load' });
        const main = page.locator('main').last();
        const scroll = main.getByTestId('product-results-scroll');
        const summary = main.locator('footer[aria-label="Totals for all matching products"]');
        await summary.getByText('Loaded 40 / 125 products', {exact:true}).waitFor().catch(async e=>{console.log((await main.innerText()).slice(-1800));await page.screenshot({path:path.join(shots,'failure.png')});throw e;});
        check(width, pathname + ' footer flush with page bottom', await summary.evaluate(el => Math.abs(el.getBoundingClientRect().bottom - el.closest('main').getBoundingClientRect().bottom) <= 1));
        check(width, pathname + ' footer outside scrolling content', await summary.evaluate(el => !el.closest('[data-testid="product-results-scroll"]')));
        check(width, pathname + ' load more immediately visible', await summary.getByRole('button', {name:'Load more', exact:true}).isVisible());
        await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});
        await summary.getByText('Loaded 80 / 125 products', {exact:true}).waitFor();
        check(width, pathname + ' ordinary API scrolling appends next batch', true);
        await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});
        await summary.getByText('Loaded 120 / 125 products', {exact:true}).waitFor();
        await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});
        await summary.getByText('Loaded 125 / 125 products', {exact:true}).waitFor();
        const completedRequests = requests.length;
        await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'))});
        await page.waitForTimeout(250);
        check(width, pathname + ' final batch stops requests', requests.length === completedRequests);
        check(width, pathname + ' completed status visible above footer', await scroll.getByText('All results loaded',{exact:true}).isVisible());
        check(width, pathname + ' scroll content ends above footer', await scroll.evaluate(el=>el.getBoundingClientRect().bottom)<= (await summary.boundingBox()).y+1);
        check(width, pathname + ' no horizontal page overflow', await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(shots, pathname.replaceAll('/','-')+'-'+width+'.png')});
        if (pathname === '/products') {
          await page.getByRole('button',{name:'Refresh products',exact:true}).click();
          await summary.getByText('Loaded 40 / 125 products',{exact:true}).waitFor();
          failAppend = true;
          await summary.getByRole('button',{name:'Load more',exact:true}).click();
          await page.getByRole('alert').filter({hasText:'Fixture append failed'}).waitFor();
          check(width,'ordinary API append failure preserves first batch',await summary.getByText('Loaded 40 / 125 products',{exact:true}).isVisible());
          failAppend = false;
          const beforeRetry = requests.length;
          await page.getByRole('button',{name:'Retry',exact:true}).click();
          await summary.getByText('Loaded 80 / 125 products',{exact:true}).waitFor();
          check(width,'ordinary API retry resumes offset 40 without snapshot',requests[beforeRetry].offset === 40 && !requests[beforeRetry].snapshotId);
        }
      }
      await context.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(`${checks.length}/${checks.length} PASS; browser errors 0; live writes 0`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(root, 'docs/UAT_PRODUCTS_APPEND_LOCAL_2026-11-03.json'), JSON.stringify({ scope: 'Local intercepted browser fixture; no live acceptance', checks, errors, liveBusinessWrites: writes.length }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
