const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const envPath = process.env.SETTINGS_ENV_FILE || path.resolve(__dirname, '../.env');
const env = { ...Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(s => s && !s.startsWith('#') && s.includes('=')).map(s => { const i = s.indexOf('='); return [s.slice(0, i).trim(), s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; })), ...process.env };
const output = process.env.SETTINGS_UAT_OUTPUT || path.resolve(__dirname, '../temp/settings-audit-results.json');
const checks = [];
const report = { scope: 'Read-only real-service checks; simulated failures separately labelled. No staff/company writes.', checks };
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [host, username, password] of [['demo', 'admin', env.INITIAL_ADMIN_PASSWORD], ['skr', env.ORITHOS_SKR_USER, env.ORITHOS_SKR_PASS]]) {
      assert.ok(password, `Missing ${host} credentials`);
      const base = `https://${host}.orithos.com.au`;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const login = await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { username, password } });
      assert.equal((await login.json()).code, 0, `${host} login`);
      await context.request.get(base + '/api/odoo/session');
      const version = await (await context.request.get(base + '/api/public/version')).json();
      checks.push({ host, check: 'Runtime identity', version });
      const company = (await (await context.request.get(base + '/api/odoo/company')).json()).data;
      assert.ok(company?.id && company.name && company.timezone && company.currency_id);
      checks.push({ host, check: 'Company envelope and real regional data', result: 'PASS' });
      const blockedWrites = [];
      await context.route('**/api/**', async route => {
        const req = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !new URL(req.url()).pathname.startsWith('/api/auth/')) { blockedWrites.push(new URL(req.url()).pathname); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [label, route] of [['Company','/settings/company/general'],['Company','/settings/company/date-time'],['Staff & access','/settings/staff'],['Store','/settings/registers-outlets'],['Store','/settings/payment'],['Store','/settings/tax'],['Store','/settings/hardware'],['Store','/settings/receipts'],['Data','/settings/data'],['Account','/settings/account?tab=connection'],['Account','/settings/account?tab=unknown']]) {
          await page.goto(base + route, { waitUntil: 'domcontentloaded' });
          const nav = page.getByRole('navigation', { name: 'Settings sections', exact: true });
          await nav.waitFor();
          if (width < 640) assert.equal(await nav.getByRole('combobox').inputValue(), label === 'Company' ? '/settings/company/general' : label === 'Staff & access' ? '/settings/staff' : label === 'Store' ? '/settings/registers-outlets' : label === 'Data' ? '/settings/data' : '/settings/account');
          else assert.equal(await nav.locator('[aria-current="page"]').innerText(), label);
          if (route.endsWith('/general')) { await page.getByLabel('Legal company name').waitFor(); assert.equal(await page.getByLabel('Legal company name').inputValue(), company.name); assert.equal(await page.getByLabel('Business timezone').inputValue(), company.timezone); }
          if (route.includes('tab=connection')) await page.getByText(/Connected · \d+ accessible POS registers/).waitFor({ timeout: 30000 });
          if (route.includes('tab=unknown')) await page.getByRole('heading', { name: 'Change password', exact: true }).waitFor();
          for (const theme of ['light', 'dark']) {
            await page.evaluate(t => { document.documentElement.classList.toggle('dark', t === 'dark'); document.documentElement.setAttribute('data-theme', t); }, theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${host} ${width} ${route} overflow`);
          }
          checks.push({ host, width, route, themes: ['light','dark'], check: 'Unified navigation and no document overflow', result: 'PASS' });
        }
      }
      await page.goto(base + '/settings/staff');
      const add = page.getByRole('button', { name: 'Add staff', exact: true });
      if (await add.isEnabled()) {
        await add.click();
        const dialog = page.getByRole('dialog');
        const select = dialog.getByLabel('Role template');
        const roles = await select.locator('option').evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent })).filter(n => n.value));
        for (const role of roles) {
          const expected = (await (await context.request.get(base + `/api/roles/${role.value}/permissions`)).json()).data;
          await select.selectOption(role.value);
          await dialog.getByRole('heading', { name: `Inherited permissions · ${role.text}`, exact: true }).waitFor();
          await page.waitForFunction(() => !document.querySelector('[role="dialog"]')?.textContent.includes('Loading role permissions'));
          assert.equal(await dialog.locator('li').count(), expected.length);
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        checks.push({ host, check: 'Read-only staff modal matches each real role permission list; Escape closes', result: 'PASS' });
      }
      for (const [oldRoute, destination] of [['/settings/company/currency','/settings/company/date-time'],['/settings/company/integrations','/settings/account?tab=connection'],['/settings/registers/general','/settings/registers-outlets'],['/settings/customerdisplay','/settings/hardware']]) {
        await page.goto(base + oldRoute); await page.waitForURL(base + destination);
        checks.push({ host, check: 'Legacy redirect', oldRoute, destination, result: 'PASS' });
      }
      // Fault injection verifies UI retry behavior only, not service acceptance.
      let failCompany = true;
      await context.route('**/api/odoo/company', route => failCompany ? route.fulfill({ status: 502, json: { message: 'Temporary company failure' } }) : route.continue());
      await page.goto(base + '/settings/company/date-time');
      await page.getByRole('alert').filter({ hasText: 'Could not load regional settings' }).waitFor();
      failCompany = false;
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByText(company.timezone, { exact: true }).waitFor();
      checks.push({ host, check: 'Regional failure and retry', evidence: 'UI fault injection', result: 'PASS' });
      assert.deepEqual(blockedWrites, []);
      assert.deepEqual(pageErrors, []);
      checks.push({ host, check: 'No browser page errors or attempted business writes', result: 'PASS' });
      console.log(`${host}: PASS`);
      await context.close();
    }
  } finally { await browser.close(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
