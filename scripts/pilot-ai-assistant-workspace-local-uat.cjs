const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const base = (process.env.PILOT_BASE_URL || 'http://demo.lvh.me:3102').replace(/\/+$/, '');
const user = { id: 1, name: 'Fixture', username: 'admin', isAdmin: true };
const thread = { id: 7, sessionKey: 'thread-7', title: 'Low stock review', updatedAt: '2026-10-24T10:00:00Z', createdAt: '2026-10-24T09:00:00Z' };
const detail = {
  ...thread,
  messages: [
    { id: 1, role: 'user', text: 'Check stock', intent: null, createdAt: thread.createdAt },
    { id: 2, role: 'assistant', text: 'Here is the stock review.', intent: 'report_stock', cards: [], reportId: 501, table: { columns: ['Product', 'Quantity'], rows: [{ Product: 'Fixture Shiraz', Quantity: 3 }] }, createdAt: thread.updatedAt },
  ],
};

function fixtureRoute(route) {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path === '/api/auth/me') return json({ code: 0, message: 'OK', data: user });
  if (path === '/api/ai/config/client') return json({ code: 0, message: 'OK', data: { enabled: false, aiTriggerKeywords: [] } });
  if (path === '/api/ai/threads') return json({ code: 0, message: 'OK', data: [thread] });
  if (path === '/api/ai/threads/7') return json({ code: 0, message: 'OK', data: detail });
  return json({ code: 0, message: 'OK', data: [] });
}

async function createContext(browser, width, errors) {
  const context = await browser.newContext({ viewport: { width, height: 930 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'orithos_access_token', value: 'workspace-fixture', url: base }]);
  await context.addInitScript((authUser) => {
    localStorage.setItem('sf_token', 'workspace-fixture');
    localStorage.setItem('sf_user', JSON.stringify(authUser));
  }, user);
  await context.route('**/api/**', fixtureRoute);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
  await page.goto(`${base}/assistant`, { waitUntil: 'networkidle' });
  await page.getByText('Suggested workflows').waitFor({ state: width >= 768 ? 'visible' : 'hidden' });
  return { context, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const { context, page } = await createContext(browser, width, errors);
      check(`${width}px has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width >= 768) {
        await page.getByRole('link', { name: 'Open Dashboard' }).first().click();
        await page.waitForURL(/\/dashboard$/);
        check(`${width}px logo opens dashboard`, new URL(page.url()).pathname === '/dashboard');
        await context.close();
        const historyContext = await createContext(browser, width, errors);
        const historyPage = historyContext.page;
        await historyPage.getByRole('button', { name: 'History', exact: true }).click();
        await historyPage.getByText(thread.title).waitFor();
        check(`${width}px history list loads`, true);
        await historyPage.getByRole('button', { name: thread.title }).click();
        await historyPage.getByText(detail.messages[1].text).waitFor();
        check(`${width}px thread restores`, true);
        check(`${width}px table and report link restore`, await historyPage.getByRole('table').count() === 1 && await historyPage.locator('a[href="/reports/ai/501"]').count() === 1);
        await historyPage.getByRole('button', { name: 'New chat' }).click();
        check(`${width}px new chat clears messages`, await historyPage.getByText(detail.messages[1].text).count() === 0);
        await historyPage.getByRole('button', { name: 'History', exact: true }).click();
        await historyPage.getByText(thread.title).waitFor();
        await historyPage.keyboard.press('Escape');
        check(`${width}px escape returns to workspace`, await historyPage.getByText('Suggested workflows').count() === 1);
        await historyPage.getByRole('button', { name: 'Low stock analysis' }).click();
        await historyPage.waitForURL(/\/stock\/replenishment$/);
        check(`${width}px workflow navigates`, new URL(historyPage.url()).pathname === '/stock/replenishment');
        await historyContext.context.close();
      } else {
        await page.getByRole('button', { name: 'Chat history' }).click();
        await page.getByText(thread.title).waitFor();
        check('390px mobile history remains accessible', true);
        check('390px mobile logo is link', await page.getByRole('link', { name: 'Open Dashboard' }).count() === 1);
      }
      await context.close();
    }
    check('no page errors', errors.length === 0);
    const evidence = { base, scope: 'Local intercepted API fixtures only; no real AI, production writes, deployment or backend acceptance', checks, errors };
    fs.writeFileSync('docs/UAT_AI_ASSISTANT_WORKSPACE_LOCAL_2026-10-24.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
