const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const base = (process.env.PILOT_BASE_URL || 'http://localhost:3068').replace(/\/+$/, '');
const user = { id: 1, vendorId: 7, name: 'Fixture', username: 'admin', isAdmin: true };
const thread = { id: 7, sessionKey: 'thread-7', title: 'Low stock review', updatedAt: '2026-10-24T10:00:00Z', createdAt: '2026-10-24T09:00:00Z' };
const scopedKey = '1:1:c04b8bb8-24ca-4f54-9d48-1b6aa5cf682d';
const detail = {
  ...thread,
  messages: [
    { id: 1, role: 'user', text: 'Check stock', intent: null, createdAt: thread.createdAt },
    { id: 2, role: 'assistant', text: 'Here is the stock review.', intent: 'report_stock', cards: [], reportId: 501, table: { columns: ['Product', 'Quantity'], rows: [{ Product: 'Fixture Shiraz', Quantity: 3 }] }, createdAt: thread.updatedAt },
  ],
};

function fixtureRoute(route) {
  const request = route.request();
  const path = decodeURIComponent(new URL(request.url()).pathname);
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path === '/api/auth/me') return json({ code: 0, message: 'OK', data: user });
  if (path === '/api/ai/config/client') return json({ code: 0, message: 'OK', data: { enabled: true, aiTriggerKeywords: [] } });
  if (path === '/api/ai/threads/empty-chat') return json({ code: 0, data: { ...detail, sessionKey: 'empty-chat', messages: [] } });
  if (path === '/api/ai/threads') return json({ code: 0, message: 'OK', data: [thread] });
  if (path === '/api/ai/assistant') {
    const body = request.postDataJSON();
    return json({ code: 0, data: { intent: 'qa', answer: `Fixture reply: ${body.threadId || 'new'}`, threadId: body.threadId || scopedKey } });
  }
  if (path === `/api/ai/threads/${scopedKey}`) return json({ code: 0, data: { ...detail, id: undefined, sessionKey: scopedKey } });
  if (path === '/api/ai/threads/7' || path === '/api/ai/threads/thread-7') return json({ code: 0, message: 'OK', data: detail });
  if (path.startsWith('/api/ai/threads/')) return json({ code: 40410, message: 'Chat thread not found' }, 404);
  return json({ code: 0, message: 'OK', data: [] });
}

async function createContext(browser, width, errors) {
  const context = await browser.newContext({ viewport: { width, height: 930 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'orithos_access_token', value: 'workspace-fixture', url: base }, { name: 'orithos_local_preview', value: '1', url: base }]);
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
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--no-proxy-server'] });
  const errors = [];
  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(name); };
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const { context, page } = await createContext(browser, width, errors);
      check(`${width}px store context removed`, await page.getByRole('button', { name: 'Store context' }).count() === 0);
      check(`${width}px AI Assistant tab removed`, await page.getByRole('button', { name: 'AI Assistant', exact: true }).count() === 0);
      check(`${width}px has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(`${base}/assistant?chat=${encodeURIComponent(scopedKey)}`, { waitUntil: 'networkidle' });
      await page.getByText(detail.messages[1].text).waitFor({ timeout: 5000 });
      check(`${width}px encoded tenant/user session URL restores dialogue`, true);
      check(`${width}px direct URL remains stable`, new URL(page.url()).searchParams.get('chat') === scopedKey);
      await page.goto(`${base}/assistant`, { waitUntil: 'networkidle' });
      if (width >= 768) {
        await page.getByRole('link', { name: 'Open Dashboard' }).first().click();
        await page.waitForURL(/\/dashboard$/);
        check(`${width}px logo opens dashboard`, new URL(page.url()).pathname === '/dashboard');
        await context.close();
        const historyContext = await createContext(browser, width, errors);
        const historyPage = historyContext.page;
        check(`${width}px workflows start collapsed`, await historyPage.getByRole('button', { name: 'Suggested workflows' }).getAttribute('aria-expanded') === 'false');
        await historyPage.getByRole('button', { name: 'History', exact: true }).click();
        await historyPage.getByText(thread.title).waitFor();
        check(`${width}px history list loads`, true);
        await historyPage.getByRole('button').filter({ has: historyPage.getByText(thread.title, { exact: true }) }).click();
        await historyPage.getByText(detail.messages[1].text).waitFor();
        check(`${width}px thread restores`, true);
        check(`${width}px thread has URL`, new URL(historyPage.url()).searchParams.get('chat') === '7');
        await historyPage.reload({ waitUntil: 'networkidle' });
        await historyPage.getByText(detail.messages[1].text).waitFor();
        check(`${width}px refresh restores chat`, true);
        await historyPage.getByRole('textbox', { name: 'Ask Orithos AI', exact: true }).fill('Explain this fixture');
        await historyPage.getByRole('textbox', { name: 'Ask Orithos AI', exact: true }).press('Enter');
        await historyPage.getByText('Fixture reply: thread-7').waitFor();
        check(`${width}px continues selected session`, true);
        check(`${width}px table and report link restore`, await historyPage.getByRole('table').count() === 1 && await historyPage.locator('a[href="/reports/ai/501"]').count() === 1);
        await historyPage.getByRole('button', { name: 'New chat' }).click();
        check(`${width}px new chat clears messages`, await historyPage.getByText(detail.messages[1].text).count() === 0);
        check(`${width}px new chat resets URL`, new URL(historyPage.url()).search === '');
        await historyPage.goBack({ waitUntil: 'networkidle' });
        await historyPage.getByText(detail.messages[1].text).waitFor();
        check(`${width}px back restores chat`, true);
        await historyPage.goForward({ waitUntil: 'networkidle' });
        await historyPage.getByText(detail.messages[1].text).waitFor({ state: 'hidden' });
        check(`${width}px forward restores new chat`, true);
        await historyPage.getByRole('button', { name: 'History', exact: true }).click();
        await historyPage.getByText(thread.title).waitFor();
        check(`${width}px history uses main view`, await historyPage.locator('aside').getByText(thread.title).count() === 0);
        await historyPage.getByRole('button', { name: 'Back', exact: true }).click();
        await historyPage.getByText(thread.title).waitFor({ state: 'hidden' });
        check(`${width}px history Back returns to dialogue`, true);
        await historyPage.getByRole('button', { name: 'New chat' }).click();
        await historyPage.getByRole('textbox', { name: 'Ask Orithos AI', exact: true }).fill('Hello fixture');
        await historyPage.getByRole('textbox', { name: 'Ask Orithos AI', exact: true }).press('Enter');
        await historyPage.getByText('Fixture reply: new').waitFor();
        check(`${width}px new reply gets its own URL`, new URL(historyPage.url()).searchParams.get('chat') === scopedKey);
        await historyPage.reload({ waitUntil: 'networkidle' });
        await historyPage.getByText(detail.messages[1].text).waitFor();
        check(`${width}px session-key URL restores chat`, true);
        await historyPage.getByRole('button', { name: 'Suggested workflows' }).click();
        check(`${width}px workspace remains accessible`, await historyPage.getByText('Suggested workflows').count() === 1);
        await historyPage.getByRole('button', { name: 'Low stock analysis' }).click();
        await historyPage.waitForURL(/\/stock\/replenishment$/);
        check(`${width}px workflow navigates`, new URL(historyPage.url()).pathname === '/stock/replenishment');
        await historyContext.context.close();
      } else {
        await page.getByRole('button', { name: 'Chat history' }).click();
        await page.getByText(thread.title).waitFor();
        check('390px mobile history remains accessible', true);
        await page.getByRole('button', { name: thread.title }).click();
        await page.getByText(detail.messages[1].text).waitFor();
        check('390px opens history URL', new URL(page.url()).searchParams.get('chat') === '7');
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByText(detail.messages[1].text).waitFor();
        check('390px direct URL restores chat', true);
        await page.goto(`${base}/assistant?chat=empty-chat`, { waitUntil: 'networkidle' });
        await page.getByRole('alert').filter({ hasText: 'no recoverable messages' }).waitFor();
        check('empty saved history explicitly reports unavailable messages', await page.getByText(detail.messages[1].text).count() === 0);
        await page.goto(`${base}/assistant?chat=missing`, { waitUntil: 'networkidle' });
        await page.getByRole('alert').waitFor();
        check('missing chat shows error without previous dialogue', await page.getByText(detail.messages[1].text).count() === 0);
        check('390px mobile logo is link', await page.getByRole('link', { name: 'Open Dashboard' }).count() === 1);
      }
      await context.close();
    }
    check('no page errors', errors.length === 0);
    const evidence = { base, scope: 'Local intercepted API fixtures only; no real AI, production writes, deployment or backend acceptance', checks, errors };
    fs.writeFileSync('docs/UAT_AI_ASSISTANT_HISTORY_LOCAL_2026-11-03.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
