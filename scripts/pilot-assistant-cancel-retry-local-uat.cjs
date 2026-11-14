const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const base = (process.env.PILOT_BASE_URL || 'http://localhost:3068').replace(/\/+$/, '');
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH || '.local/ai-eval/assistant-cancel-retry-local.json');
const user = { id: 1, vendorId: 7, name: 'Fixture', username: 'admin', isAdmin: true };
const cancelledQuestion = 'Explain the current store sales trend';
const retryQuestion = 'Summarize yesterday sales';

function response(route, data, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 930 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const pageErrors = [];
  const assistantRequests = [];
  const assistantOutcomes = [];
  const unexpectedWrites = [];
  let releaseLateResponse;
  const lateResponse = new Promise((resolve) => { releaseLateResponse = resolve; });

  await context.addCookies([
    { name: 'orithos_access_token', value: 'workspace-fixture', url: base },
    { name: 'orithos_local_preview', value: '1', url: base },
  ]);
  await context.addInitScript((authUser) => {
    localStorage.setItem('sf_token', 'workspace-fixture');
    localStorage.setItem('sf_user', JSON.stringify(authUser));
  }, user);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/ai/assistant') {
      const body = request.postDataJSON();
      assistantRequests.push(body);
      if (body.question === cancelledQuestion) {
        assistantOutcomes.push('cancelled-question-pending');
        await lateResponse;
        try {
          await response(route, { code: 0, data: { intent: 'qa', answer: 'STALE CANCELLED ANSWER', threadId: 'cancel-fixture' } });
        } catch {}
        assistantOutcomes.push('late-cancelled-response-released');
        return;
      }
      if (body.question === retryQuestion && assistantRequests.filter((item) => item.question === retryQuestion).length === 1) {
        assistantOutcomes.push('retry-question-failed');
        return response(route, { code: 50210, message: 'AI service unavailable', data: null }, 502);
      }
      if (body.question === retryQuestion) {
        assistantOutcomes.push('retry-question-succeeded');
        return response(route, { code: 0, data: { intent: 'qa', answer: 'Recovered fixture answer', threadId: 'retry-fixture' } });
      }
      return response(route, { code: 40000, message: 'Unexpected fixture question', data: null }, 400);
    }
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && request.method() !== 'OPTIONS') {
      unexpectedWrites.push(`${request.method()} ${url.pathname}`);
      return response(route, { code: 40500, message: 'Unexpected write blocked by UAT' }, 405);
    }
    const data = url.pathname === '/api/auth/me'
      ? user
      : url.pathname === '/api/ai/config/client'
        ? { enabled: true, assistantAvailable: true, transcriptionAvailable: false, aiTriggerKeywords: [] }
        : [];
    return response(route, { code: 0, message: 'OK', data });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(name); };
  let result;
  try {
    await page.goto(`${base}/assistant`, { waitUntil: 'networkidle' });
    const composer = page.getByRole('textbox', { name: 'Ask Orithos AI', exact: true });
    await composer.fill(cancelledQuestion);
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Cancel request' }).waitFor({ state: 'visible' });
    check('cancel fixture request was submitted once', assistantRequests.filter((item) => item.question === cancelledQuestion).length === 1);
    await page.getByRole('button', { name: 'Cancel request' }).click();
    await page.getByRole('button', { name: 'Send message' }).waitFor({ state: 'visible' });
    check('cancel restores send control and enabled composer', await composer.isEnabled());
    check('cancel retains only the original user question', await page.getByText(cancelledQuestion, { exact: true }).count() === 1);
    releaseLateResponse();
    await page.waitForTimeout(1200);
    check('cancelled response arriving late is not rendered', await page.getByText('STALE CANCELLED ANSWER', { exact: true }).count() === 0);

    await composer.fill(retryQuestion);
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
    check('transient failure exposes a retry action', true);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Recovered fixture answer').waitFor({ timeout: 5000 });
    check('retry resubmits the same question without duplicating its user message',
      assistantRequests.filter((item) => item.question === retryQuestion).length === 2
      && await page.getByText(retryQuestion, { exact: true }).count() === 1);
    check('successful retry replaces the failed response',
      await page.getByText('The AI service could not complete this request. Retry, or open the sales dashboard or replenishment page to check business data.', { exact: true }).count() === 0);
    check('assistant workflow made no business write requests', unexpectedWrites.length === 0);
    check('no browser runtime errors', pageErrors.length === 0);

    result = { status: 'PASS', checks, assistantRequests, assistantOutcomes, unexpectedWrites, pageErrors };
  } catch (error) {
    result = {
      status: 'FAIL', checks, assistantRequests, unexpectedWrites, pageErrors,
      failure: error instanceof Error ? error.message : 'UNEXPECTED_FAILURE',
      assistantOutcomes,
      pageText: await page.locator('body').innerText().catch(() => ''),
    };
  } finally {
    await context.close();
    await browser.close();
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    target: base,
    scope: 'Local intercepted API fixtures only; cancellation, late-response suppression, retry, no duplicate question, no business writes',
    ...result,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: evidence.status, checks: evidence.checks, failure: evidence.failure }));
  if (evidence.status !== 'PASS') process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
