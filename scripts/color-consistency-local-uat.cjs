const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const phase = process.argv[2] || 'after';
assert.ok(['before', 'after'].includes(phase));
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/screenshots/2026-10-24-color-consistency', phase);
const pos = 'http://demo.lvh.me:3102';
const brand = 'http://localhost:3000';
const user = { id: 1, username: 'palette-fixture', name: 'Palette Fixture', isAdmin: true, vendorId: 41, outletId: 1 };
const checks = [], errors = [], blockedWrites = [], limitations = [];
fs.mkdirSync(output, { recursive: true });

async function settleMarketingPage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * .75) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

function contrast(a, b) {
  const lum = s => {
    const rgb = s.startsWith('#') ? s.slice(1).match(/../g).map(v => parseInt(v, 16)) : s.match(/[\d.]+/g).slice(0, 3).map(Number);
    return rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'orithos_access_token', value: 'palette-fixture', url: pos }]);
    await context.addInitScript(user => {
      localStorage.setItem('sf_token', 'palette-fixture');
      localStorage.setItem('sf_user', JSON.stringify(user));
    }, user);
    await context.route('**/api/**', route => {
      const req = route.request(), p = new URL(req.url()).pathname;
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (p === '/api/auth/me') return json({ code: 0, data: user });
      if (p === '/api/odoo/session') return json({ user: { name: 'Palette Fixture', allowedCompanyIds: [41] }, autoRecoverConfigured: false });
      if (p === '/api/odoo/records') return json({ items: [], limit: 40, offset: 0, hasNext: false });
      if (p === '/api/odoo/pos-bootstrap') return json({ activeSessionId: 5, configs: [{ id: 3, name: 'Fixture Register', company: [41, 'Palette Fixture'], session: { id: 5, name: 'Fixture Session', state: 'opened', config_id: [3, 'Fixture Register'], user_id: [1, 'Fixture'], cashBalanceStart: 100 }, paymentMethods: [{ id: 2, name: 'Cash', type: 'cash', is_cash_count: true }], pricelistIds: [], cashRounding: null }] });
      if (p === '/api/odoo/reporting-dashboard') return json({ company: 'Palette Fixture (TEST)', currency: 'AUD', timezone: 'Australia/Adelaide', revenue: 0, transactions: 0, openRegisters: 1, trend: [], recentSales: [], topProducts: [], byCategory: [], compare: {} });
      if (p === '/api/ai/config/client') return json({ code: 0, data: { enabled: false, aiTriggerKeywords: [] } });
      if (p === '/api/subdomain-available') return json({ available: true });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
        blockedWrites.push(req.method() + ' ' + p);
        return route.fulfill({ status: 405, contentType: 'application/json', body: '{"message":"Palette audit blocked write"}' });
      }
      return json({ code: 0, data: [], items: [] });
    });
    const targets = [
      ['pos-dashboard', pos + '/dashboard'], ['pos-workspace', pos + '/dashboard/workspace'],
      ['pos-register', pos + '/register/odoo'], ['pos-stock', pos + '/stock/list'],
      ['pos-assistant', pos + '/assistant'], ['brand-home', brand + '/'],
      ['brand-features', brand + '/features'], ['brand-signup', brand + '/signup'],
    ];
    for (const width of [390, 768, 1440]) {
      for (const [name, url] of targets) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        page.on('pageerror', e => errors.push({ name, width, message: e.message }));
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        if (url.startsWith(brand)) await settleMarketingPage(page);
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
        const result = await page.evaluate(() => {
          const s = getComputedStyle(document.documentElement);
          return { primary: s.getPropertyValue('--primary').trim(), background: s.getPropertyValue('--background').trim(), overflow: document.documentElement.scrollWidth > innerWidth + 1, h1: document.querySelector('h1')?.textContent };
        });
        checks.push({ name, width, status: response.status(), ...result });
        assert.equal(response.status(), 200, name);
        if (phase === 'after') assert.equal(result.overflow, false, `${name} overflow at ${width}`);
        if (phase === 'after') {
          const primary = await page.evaluate(() => {
            const e = document.createElement('span');
            e.style.color = 'var(--primary)'; document.body.append(e);
            const c = getComputedStyle(e).color; e.remove(); return c;
          });
          assert.ok(contrast(primary, '#ffffff') >= 4.5, `${name} primary contrast`);
        }
        await page.close();
      }
      console.log(`${phase}: ${width}px captured`);
    }
    if (phase === 'after') {
      assert.equal(fs.readFileSync(path.join(root, 'pos-ui/app/brand-tokens.css'), 'utf8'), fs.readFileSync(path.join(root, '../shipany-template-dev/src/config/style/brand-tokens.css'), 'utf8'), 'both applications share the exact palette');
      for (const [app, url] of [['pos', pos + '/login'], ['brand', brand + '/signup']]) {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        for (const dark of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
          const pairs = await page.evaluate(() => {
            const resolve = token => {
              const e = document.createElement('span'); e.style.color = `var(--${token})`;
              document.body.append(e); const value = getComputedStyle(e).color; e.remove(); return value;
            };
            const pairs = [['brand-ink', 'brand-canvas'], ['brand-muted', 'brand-surface'], ['brand-on-action', 'brand-action'], ['brand-on-control', 'brand-control'], ['brand-link', 'brand-surface']];
            for (const tone of ['orange', 'blue', 'green', 'purple', 'teal', 'gray', 'pink']) pairs.push([`brand-module-${tone}`, `brand-module-${tone}-tint`]);
            return pairs.map(([a, b]) => ({ a, b, foreground: resolve(a), background: resolve(b) }));
          });
          for (const pair of pairs) {
            const ratio = contrast(pair.foreground, pair.background);
            assert.ok(ratio >= 4.5, `${app} ${dark ? 'dark' : 'light'} ${pair.a}: ${ratio}`);
            checks.push({ name: 'contrast', app, dark, ...pair, ratio });
          }
          if (app === 'brand' && dark) await page.screenshot({ path: path.join(output, 'brand-signup-dark.png'), fullPage: true });
        }
        await page.close();
      }
      const signup = await context.newPage();
      await signup.setViewportSize({ width: 390, height: 844 });
      await signup.goto(brand + '/signup', { waitUntil: 'networkidle' });
      assert.equal(await signup.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
      await signup.locator('[name=ownerName]').fill('Palette Fixture');
      await signup.locator('[name=organisationName]').fill('Palette Fixture Store');
      await signup.locator('[name=email]').fill('palette-fixture@example.test');
      const next = signup.getByRole('button', { name: 'Next', exact: true });
      await next.focus();
      assert.notEqual(await next.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
      await next.hover();
      await signup.waitForTimeout(200);
      const hover = await next.evaluate(e => ({ color: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor }));
      assert.ok(contrast(hover.color, hover.background) >= 4.5, 'hover contrast');
      await next.click();
      await signup.locator('[name=subdomain]').fill('palette-fixture-store');
      await signup.locator('[name=username]').fill('palette-fixture');
      await signup.locator('[name=password]').fill('FixtureOnly123!');
      await signup.locator('[name=passwordConfirm]').fill('FixtureOnly123!');
      await next.click();
      const outletName = signup.locator('.orithos-signup-outlet-row input').first();
      await outletName.fill('Palette Fixture Outlet');
      await next.click();
      await signup.getByRole('button', { name: 'No Your product catalog will start empty.' }).click();
      assert.equal(await signup.locator('.orithos-signup-choice.is-selected').count(), 1);
      await signup.screenshot({ path: path.join(output, 'brand-signup-selected-390.png'), fullPage: true });
      await next.click();
      await signup.locator('[name=businessType]').selectOption({ index: 1 });
      await signup.locator('[name=storeCount]').selectOption({ index: 1 });
      await next.click();
      assert.equal(await signup.locator('.orithos-signup-summary').count(), 1);
      await signup.screenshot({ path: path.join(output, 'brand-signup-confirm-390.png'), fullPage: true });
      await signup.getByRole('button', { name: 'Back', exact: true }).click();
      assert.notEqual(await signup.locator('[name=businessType]').inputValue(), '');
      checks.push({ name: 'signup-six-steps-selection-focus-hover-back', status: 'PASS', submitted: false });
      await signup.close();
      for (const url of ['/about', '/ai-retail', '/liquor-retail', '/grocery-convenience', '/pricing', '/blog', '/privacy']) {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 1000 });
        page.on('pageerror', e => errors.push({ url, message: e.message }));
        const response = await page.goto(brand + url, { waitUntil: 'networkidle', timeout: 60000 });
        await settleMarketingPage(page);
        assert.equal(response.status(), 200, url);
        checks.push({ name: 'brand' + url, width: 1440, status: response.status() });
        await page.screenshot({ path: path.join(output, `brand-${url.slice(1)}-1440.png`), fullPage: true });
        await page.close();
      }
      // This server-rendered route also depends on the local auth/config services.
      const signIn = await context.newPage();
      try {
        const response = await signIn.goto(brand + '/sign-in', { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (response.status() !== 200) limitations.push({ route: '/sign-in', status: response.status() });
        else { checks.push({ name: 'brand/sign-in', status: 200 }); await signIn.screenshot({ path: path.join(output, 'brand-sign-in-1440.png'), fullPage: true }); }
      } catch (e) { limitations.push({ route: '/sign-in', reason: e.message }); }
      await signIn.close();
    }
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(blockedWrites.length, 0, JSON.stringify(blockedWrites));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(root, `docs/UAT_COLOR_CONSISTENCY_${phase.toUpperCase()}_2026-10-24.json`), JSON.stringify({ phase, scope: 'Local browser fixtures only; no real API or business writes; no deployment verification', checks, errors, blockedWrites, limitations }, null, 2));
  }
  console.log(JSON.stringify({ phase, checks: checks.length, errors, blockedWrites, limitations }));
})().catch(e => { console.error(e); process.exitCode = 1; });
