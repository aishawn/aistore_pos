/** Actual worker + Redis + route handler; fixture Odoo/backend only, no live network or business writes. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const Module = require('node:module');
const root = path.resolve(__dirname, '..'), ui = path.join(root, 'pos-ui');
const requireUi = Module.createRequire(path.join(ui, 'package.json'));
const ts = requireUi('typescript'), { NextRequest } = requireUi('next/server'), { createClient } = requireUi('redis');
const folder = path.join(root, '.local', 'report-cache-fixture-' + Date.now());
fs.mkdirSync(folder, { recursive: true });
const checks = [], errors = [], calls = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, fn) => { fn(); checks.push({ name, status: 'PASS' }); };
const port = Number(process.env.REPORT_TEST_REDIS_PORT || 16387);
const redisExe = process.env.REDIS_SERVER_EXECUTABLE || 'C:\\Program Files\\Redis\\redis-server.exe';
let redisProcess, worker, backend, client;
let limitedUser = false, deny = false, failReads = false, serviceReads = 0;
let beforeSalesRead = null;
const target = { vendorId: 9, companyId: 41, host: 'demo.fixture.invalid', timezone: 'Australia/Adelaide', database: 'reports_fixture', sampleDataClearedAt: null };
function redisStart() {
  const child = spawn(redisExe, ['--bind', '127.0.0.1', '--port', String(port), '--dir', folder, '--appendonly', 'yes', '--appendfsync', 'always', '--save', ''], { windowsHide: true, stdio: 'ignore' });
  child.on('error', error => errors.push(error.message)); return child;
}
const modules = new Map();
function load(file, source) {
  if (modules.has(file)) return modules.get(file).exports;
  const mod = new Module(file); modules.set(file, mod); mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = id => {
    if (id.startsWith('@/')) return load(path.join(ui, 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.')) { let next = path.resolve(path.dirname(file), id); if (!next.endsWith('.ts')) next += '.ts'; return load(next); }
    return requireUi(id);
  };
  mod._compile(ts.transpileModule(source ?? fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return mod.exports;
}
async function until(fn, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await pause(150); }
  throw new Error('Fixture condition timed out');
}
const request = (params, cookie = 'orithos_odoo_session=fixture; orithos_access_token=fixture') => new NextRequest(`https://${target.host}/api/odoo/reporting-dashboard?${params}`, { headers: { cookie, host: target.host } });
(async () => {
  try {
    backend = http.createServer(async (req, res) => {
      let data = ''; for await (const chunk of req) data += chunk;
      const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
      if (req.url === '/api/auth/me') return json({ code: 0, data: { id: 1, isAdmin: !limitedUser, roleCode: limitedUser ? 'CLERK' : 'ADMIN', permissions: deny ? [] : ['reports.dashboard'] } });
      if (req.url === '/api/tenant/odoo-binding') return json({ code: 0, data: { ...target, odooCompanyId: 41, odooProvisionStatus: 'ready' } });
      const input = JSON.parse(data || '{}');
      if (req.url === '/web/session/authenticate') { res.setHeader('Set-Cookie', 'session_id=worker_fixture; Path=/'); return json({ result: { uid: 17 } }); }
      if (req.url === '/web/session/get_session_info') return json({ result: { uid: 17, db: target.database, user_context: { allowed_company_ids: [41] } } });
      assert.equal(req.url, '/web/dataset/call_kw');
      const { model, method, args, kwargs } = input.params;
      assert.ok(['search_count', 'search_read', 'read_group', 'read'].includes(method), 'Worker is read-only');
      if ((req.headers.cookie || '').includes('worker_fixture')) serviceReads++;
      calls.push({ model, method, args, kwargs, at: Date.now() });
      await pause(8);
      if (model === 'res.company') return json({ result: [{ id: 41, name: 'Fixture store', currency_id: [1, 'AUD'], partner_id: [1, 'Store'] }] });
      if (model === 'res.partner') return json({ result: [{ country_id: [1, 'Australia'], state_id: [1, 'SA'] }] });
      if (beforeSalesRead && model.startsWith('pos.')) { const hook = beforeSalesRead; beforeSalesRead = null; await hook(); }
      if (failReads) return json({ error: { message: 'Fixture upstream unavailable' } });
      if (model === 'product.product') return json({ result: method === 'search_count' ? 0 : [] });
      if (method === 'search_count') return json({ result: model === 'pos.session' ? 1 : 5 });
      if (method === 'search_read' || method === 'read') return json({ result: [] });
      return json({ result: [{ amount_total: 100, amount_tax: 9.09, qty: 5, __count: 5 }] });
    });
    await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
    const base = `http://localhost:${backend.address().port}`;
    Object.assign(process.env, { REPORT_REDIS_URL: `redis://127.0.0.1:${port}`, REPORT_REDIS_DB: '1',
      ODOO_BASE_URL: base, BACKEND_URL: base, ODOO_DATABASE: target.database, REPORT_SNAPSHOT_TARGETS: JSON.stringify([target]),
      ODOO_SERVICE_USERNAME: 'fixture', ODOO_SERVICE_PASSWORD: 'fixture-not-a-real-password' });
    redisProcess = redisStart();
    let redisReady = false, redisStartError;
    for (let attempt = 0; attempt < 40 && !redisReady; attempt++) {
      const candidate = createClient({ socket: { host: '127.0.0.1', port, connectTimeout: 500, reconnectStrategy: false }, database: 1 });
      candidate.on('error', () => undefined);
      try { await candidate.connect(); client = candidate; redisReady = true; }
      catch (error) { redisStartError = error; try { candidate.destroy(); } catch { /* Failed connection already closed the client. */ } await pause(250); }
    }
    if (!redisReady) throw redisStartError || new Error('Fixture Redis did not start');
    const lib = load(path.join(ui, 'src/lib/report-snapshots.ts'));
    const scope = { ...target, uid: 17, permissionScope: 'company-admin' };
    const prefix = lib.REPORT_PREFIX;
    worker = spawn(process.execPath, ['--experimental-strip-types', 'scripts/report-worker.ts'], { cwd: ui, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    worker.stderr.on('data', data => { const value = String(data); if (value.includes('report_failed') || value.includes('Error:')) errors.push(value.slice(0, 350)); });
    const keyFor = period => prefix + 'snapshot:' + lib.snapshotKey(scope, period);
    await until(async () => (await Promise.all(['today', 'yesterday', 'last_week', 'last_month', 'dead_stock'].map(p => client.exists(keyFor(p))))).every(Boolean), 45000);
    check('worker prepares all five results without a page visit', () => assert.ok(serviceReads > 0));
    const { GET } = load(path.join(ui, 'app/api/odoo/reporting-dashboard/route.ts'));
    const timings = [];
    for (const period of ['yesterday', 'last_week', 'last_month']) {
      const before = calls.filter(c => c.model.startsWith('pos.')).length;
      for (let i = 0; i < 3; i++) { const started = performance.now(); const response = await GET(request(`period=${period}`)); const body = await response.json(); timings.push(performance.now() - started); assert.equal(response.status, 200); assert.equal(body.cacheStatus, 'HIT'); assert.equal(body.period, period); }
      check(`${period}: snapshot hit executes zero sales RPCs`, () => assert.equal(calls.filter(c => c.model.startsWith('pos.')).length, before));
    }
    const today = await (await GET(request('period=today&view=summary'))).json();
    check('home snapshot is lightweight Today with cutoff', () => { assert.equal(today.period, 'today'); assert.ok(today.queryThrough); assert.equal('trend' in today, false); });
    limitedUser = true;
    const restricted = await (await GET(request('period=yesterday', 'orithos_odoo_session=restricted; orithos_access_token=restricted'))).json();
    check('restricted user cannot consume company-admin snapshot', () => assert.equal(restricted.cacheStatus, 'LIVE'));
    const foreign = await GET(new NextRequest('https://other.fixture.invalid/api/odoo/reporting-dashboard?period=yesterday', { headers: { cookie: 'orithos_odoo_session=fixture; orithos_access_token=fixture', host: 'other.fixture.invalid' } }));
    const foreignBody = await foreign.json();
    check('different host cannot use a configured host snapshot', () => assert.equal(foreignBody.cacheStatus, 'LIVE'));
    limitedUser = false;
    const forced = await Promise.all([GET(request('period=last_month&refresh=true')), GET(request('period=last_month&refresh=true'))]);
    const jobs = await Promise.all(forced.map(r => r.json()));
    check('concurrent refreshes queue one task', () => { assert.equal(forced[0].status, 202); assert.equal(jobs[0].taskId, jobs[1].taskId); });
    await until(async () => (await (await GET(request(`period=last_month&task=${jobs[0].taskId}`))).json()).updateStatus === 'complete');
    const wrongPeriod = await GET(request(`period=yesterday&task=${jobs[0].taskId}`));
    check('task polling checks requested period and full scope', () => assert.equal(wrongPeriod.status, 404));
    const beforeInvalidate = await lib.snapshotRevision(scope);
    await lib.invalidateReportTarget(scope);
    const afterInvalidate = await lib.snapshotRevision(scope);
    check('confirmed writes change snapshot revision', () => assert.notEqual(beforeInvalidate, afterInvalidate));
    const changed = await (await GET(request('period=yesterday'))).json();
    check('invalidated report is marked stale and schedules replacement', () => { assert.equal(changed.cacheStatus, 'STALE'); assert.ok(changed.taskId); });
    await until(async () => (await (await GET(request(`period=yesterday&task=${changed.taskId}`))).json()).updateStatus === 'complete');
    const lastGood = await client.get(keyFor('last_month'));
    failReads = true;
    const failedRefresh = await (await GET(request('period=last_month&refresh=true'))).json();
    await until(async () => JSON.parse(await client.get(prefix + 'job:' + failedRefresh.taskId)).state === 'failed');
    const failedJob = JSON.parse(await client.get(prefix + 'job:' + failedRefresh.taskId));
    const savedMonth = await client.get(prefix + 'snapshot:' + failedJob.key);
    check('failed worker computation preserves the last complete snapshot', () => { assert.ok(savedMonth); assert.equal(savedMonth, lastGood); });
    const retryAt = Number(await client.zScore(prefix + 'queue', failedJob.id));
    await lib.enqueueReport(scope, 'last_month', false, true);
    check('automatic scheduling respects the first one-minute failure backoff', () => assert.ok(retryAt > Date.now() + 45_000));
    assert.equal(Number(await client.zScore(prefix + 'queue', failedJob.id)), retryAt);
    failReads = false;
    const retry = await (await GET(request('period=last_month&refresh=true'))).json();
    await until(async () => JSON.parse(await client.get(prefix + 'job:' + retry.taskId)).state === 'complete');
    const savedBeforeWrite = await client.get(keyFor('yesterday'));
    beforeSalesRead = () => lib.invalidateReportTarget(scope);
    const superseded = await (await GET(request('period=yesterday&refresh=true'))).json();
    await until(async () => JSON.parse(await client.get(prefix + 'job:' + superseded.taskId)).state === 'failed');
    const savedAfterWrite = await client.get(keyFor('yesterday'));
    check('a write during computation prevents obsolete snapshot publication', () => assert.equal(savedAfterWrite, savedBeforeWrite));
    // Stop the worker, restart Redis with its own fixture AOF, then verify persistence with a separate connection.
    worker.kill(); await until(() => worker.exitCode !== null || worker.signalCode !== null);
    await client.quit(); client = null;
    redisProcess.kill(); await until(() => redisProcess.exitCode !== null || redisProcess.signalCode !== null);
    redisProcess = redisStart(); await pause(700);
    client = createClient({ socket: { host: '127.0.0.1', port, reconnectStrategy: false }, database: 1 }); client.on('error', () => undefined); await client.connect();
    check('Redis restart retains prepared results from AOF', () => assert.ok(fs.existsSync(path.join(folder, 'appendonly.aof'))));
    assert.equal(await client.exists(keyFor('last_month')), 1);
    // Redis unavailable: actual request still succeeds using the authenticated caller's live transport.
    await client.quit(); client = null; redisProcess.kill(); await pause(200);
    const fallback = await GET(request('period=yesterday&refresh=true'));
    check('Redis outage falls back to authenticated live query', () => assert.equal(fallback.status, 200));
    const p95 = timings.sort((a, b) => a - b)[Math.ceil(timings.length * .95) - 1];
    const evidence = { target: 'local fixture Odoo/backend + real Redis + actual worker and GET handler', runtime: process.version, realBusinessWrites: 0,
      snapshotReadLocalP95Ms: Math.round(p95), checks, workerErrors: errors, limitations: ['Fixture latency is not live UAT latency.', 'Redis 3 Windows compatibility tested locally; deployment uses Redis 7.'] };
    fs.writeFileSync(path.join(root, 'docs/UAT_REPORT_CACHE_ROUTE_LOCAL_2026-11-03.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ checks: checks.length, snapshotReadLocalP95Ms: Math.round(p95), errors }, null, 2));
  } finally {
    if (client?.isOpen) await client.quit().catch(() => undefined);
    worker?.kill(); redisProcess?.kill();
    if (backend) await new Promise(resolve => backend.close(resolve));
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
