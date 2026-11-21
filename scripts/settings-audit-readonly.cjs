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
      if (env.SETTINGS_UAT_HOSTS && !env.SETTINGS_UAT_HOSTS.split(',').includes(host)) continue;
      assert.ok(password, `Missing ${host} credentials`);
      const base = `https://${host}.orithos.com.au`;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const login = await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { username, password } });
      assert.equal((await login.json()).code, 0, `${host} login`);
      const version = await (await context.request.get(base + '/api/public/version')).json();
      checks.push({ host, check: 'Runtime identity', version });
      const settingsResponse = await context.request.get(base + '/api/settings/company');
      assert.equal(settingsResponse.status(), 200, `${host} company settings`);
      const settingsEnvelope = await settingsResponse.json();
      const companySettings = settingsEnvelope?.data ?? settingsEnvelope;
      const company = {
        name: companySettings?.['company.name']?.value,
        timezone: companySettings?.['company.timezone']?.value,
        currencyCode: companySettings?.['company.currency.code']?.value,
      };
      assert.ok(company.timezone?.trim() && company.currencyCode?.trim());
      checks.push({
        host,
        check: 'Company settings API and regional data',
        result: 'PASS',
        legalCompanyNameConfigured: Boolean(company.name?.trim()),
      });
      const blockedWrites = [];
      await context.route('**/api/**', async route => {
        const req = route.request();
        const pathname = new URL(req.url()).pathname;
        const readOnlySearch = req.method() === 'POST' && pathname === '/api/odoo/records';
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !pathname.startsWith('/api/auth/') && !readOnlySearch) { blockedWrites.push(new URL(req.url()).pathname); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(60000);
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      for (const width of (env.SETTINGS_UAT_WIDTHS ? env.SETTINGS_UAT_WIDTHS.split(',').map(Number) : [390, 768, 1440])) {
        await page.setViewportSize({ width, height: 900 });
        for (const [label, route] of [['Company','/settings/company/general'],['Company','/settings/company/date-time'],['Staff & access','/settings/staff'],['Store','/settings/registers-outlets'],['Store','/settings/payment'],['Store','/settings/tax'],['Store','/settings/hardware'],['Store','/settings/customerdisplay'],['Store','/settings/receipts'],['Store','/settings/keys'],['Store','/settings/rules'],['Store','/settings/loyalty'],['Store','/settings/surcharging'],['Store','/settings/push'],['Data','/settings/data'],['Account','/settings/account?tab=connection'],['Account','/settings/account?tab=unknown']]) {
          await page.goto(base + route, { waitUntil: 'domcontentloaded' });
          const nav = page.getByRole('navigation', { name: 'Settings sections', exact: true });
          await nav.waitFor();
          if (await nav.getByRole('combobox').isVisible()) assert.equal(await nav.getByRole('combobox').inputValue(), label === 'Company' ? '/settings/company/general' : label === 'Staff & access' ? '/settings/staff' : label === 'Store' ? '/settings/registers-outlets' : label === 'Data' ? '/settings/data' : '/settings/account');
          else {
            assert.equal(await nav.locator('[aria-current="page"]').innerText(), label);
            assert.equal(await nav.getByRole('link').evaluateAll(links => links.filter(link => link.getClientRects().length).some(link => { const range = document.createRange(); range.selectNodeContents(link); const text = range.getBoundingClientRect(); const box = link.getBoundingClientRect(); return text.left < box.left || text.right > box.right; })), false, 'Tab text must fit its control');
          }
          if (route.endsWith('/general')) {
            await page.getByLabel('Legal company name').waitFor();
            assert.equal(await page.getByLabel('Legal company name').inputValue(), company.name ?? '');
          }
          if (route.endsWith('/date-time')) {
            await page.getByLabel('Timezone').waitFor();
            assert.equal(await page.getByLabel('Timezone').inputValue(), company.timezone);
          }
          if (['/settings/registers-outlets','/settings/payment','/settings/tax'].includes(route)) {
            await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
            assert.deepEqual((await page.locator('main').getByRole('alert').allTextContents()).map(text => text.trim()).filter(Boolean), [], `${route} must load real data without an error`);
          }
          if (route.includes('tab=connection')) await page.getByText(/Connected · \d+ accessible POS registers/).waitFor({ timeout: 30000 });
          if (route.includes('tab=unknown')) await page.getByRole('heading', { name: 'Change password', exact: true }).waitFor();
          for (const theme of ['light', 'dark']) {
            await page.evaluate(t => { document.documentElement.classList.toggle('dark', t === 'dark'); document.documentElement.setAttribute('data-theme', t); }, theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${host} ${width} ${route} overflow`);
          }
          if (['/settings/company/general','/settings/hardware','/settings/account?tab=connection'].includes(route)) {
            fs.mkdirSync(path.dirname(output), { recursive: true });
            await page.screenshot({ path: path.join(path.dirname(output), `settings-audit-${host}-${width}-${route.split('/').at(-1).replace(/[^a-z0-9]/gi, '-')}-dark.png`) });
          }
          checks.push({ host, width, route, themes: ['light','dark'], check: 'Unified navigation and no document overflow', result: 'PASS' });
        }
      }
      const runtimeSupportedLabels = new Set([
        'Quantity Pricing Method', 'Family Price Distribution Method', 'Price Rounding Mode', 'Discounts Require Reason',
        'Legal company name', 'ABN', 'Street address', 'City', 'Postcode', 'Phone', 'Email',
        'Require Password', 'Cash In Reasons', 'Cash Out Reasons', 'Timezone', 'Date Format',
        'Time Format', 'Start of the Week', 'Round To',
      ]);
      const companyRoutes = [
        '/settings/company/general', '/settings/company/general-display', '/settings/company/login-after-sale',
        '/settings/company/sell-screen', '/settings/company/outlets', '/settings/company/date-time',
        '/settings/company/currency', '/settings/company/search', '/settings/company/integrations',
        '/settings/company/miscellaneous',
      ];
      const companyFields = [];
      for (const route of companyRoutes) {
        await page.goto(base + route, { waitUntil: 'domcontentloaded' });
        await page.locator('main form label').first().waitFor();
        const rows = await page.locator('main form label').evaluateAll(labels => labels.map(label => {
          const row = label.parentElement;
          const control = label.querySelector('input,select,textarea,button');
          return {
            label: label.childNodes[0]?.textContent?.trim() ?? '',
            disabled: control?.disabled ?? true,
            storedOnly: row?.querySelector('p')?.textContent?.includes('Stored only; this setting does not affect Orithos behavior yet.') ?? false,
          };
        }));
        companyFields.push(...rows);
      }
      const supportedFields = companyFields.filter(field => runtimeSupportedLabels.has(field.label));
      const inertFields = companyFields.filter(field => !runtimeSupportedLabels.has(field.label));
      assert.equal(companyFields.length, 60, `${host} company field catalogue size`);
      assert.equal(supportedFields.length, 19, `${host} runtime-supported company fields`);
      assert.equal(inertFields.length, 41, `${host} stored-only company fields`);
      assert.ok(supportedFields.every(field => !field.disabled && !field.storedOnly), `${host} supported fields must remain editable`);
      assert.ok(inertFields.every(field => field.disabled && field.storedOnly), `${host} stored-only fields must be disabled and labelled`);
      checks.push({ host, check: 'All company fields reflect runtime support in the UI', supported: supportedFields.length, storedOnly: inertFields.length, result: 'PASS' });
      await page.goto(base + '/settings/staff');
      const add = page.getByRole('button', { name: 'Add staff', exact: true });
      if (host === 'demo') await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Add staff' && !button.disabled));
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
      for (const [oldRoute, destination] of [['/settings/registers/general','/settings/registers-outlets']]) {
        await page.goto(base + oldRoute); await page.waitForURL(base + destination);
        checks.push({ host, check: 'Legacy redirect', oldRoute, destination, result: 'PASS' });
      }
      // Fault injection verifies UI retry behavior only, not service acceptance.
      let failCompany = true;
      await context.route('**/api/settings/company', route => failCompany ? route.fulfill({ status: 502, json: { message: 'Temporary company failure' } }) : route.continue());
      await page.goto(base + '/settings/company/date-time');
      await page.getByRole('alert').filter({ hasText: 'Temporary company failure' }).waitFor();
      failCompany = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByLabel('Timezone').waitFor();
      assert.equal(await page.getByLabel('Timezone').inputValue(), company.timezone);
      checks.push({ host, check: 'Regional failure and retry', evidence: 'UI fault injection', result: 'PASS' });
      assert.deepEqual(blockedWrites, []);
      assert.deepEqual(pageErrors, []);
      checks.push({ host, check: 'No browser page errors or attempted business writes', result: 'PASS' });
      const finalVersion = await (await context.request.get(base + '/api/public/version')).json();
      assert.equal(finalVersion.frontend?.commit, version.frontend?.commit, `${host} frontend SHA changed during UAT`);
      assert.equal(finalVersion.backend?.commit, version.backend?.commit, `${host} backend SHA changed during UAT`);
      checks.push({ host, check: 'Runtime identity stable during UAT', version: finalVersion, result: 'PASS' });
      console.log(`${host}: PASS`);
      await context.close();
    }
  } finally { await browser.close(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
