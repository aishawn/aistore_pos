// Node 24+. Read-only Odoo reconciliation; credentials come from the environment.
import { calculateReport } from '../pos-ui/src/lib/report-data.ts';
import { getOdooCompanyTimezone } from '../pos-ui/src/lib/odoo-store-timezone.ts';

const argument = name => process.argv[process.argv.indexOf(name) + 1];
const companyId = Number(process.argv.includes('--company') ? argument('--company') : 0);
const database = process.argv.includes('--database') ? argument('--database') : '';
const base = process.env.ODOO_URL || 'https://odoo.orithos.com.au';
if (!Number.isInteger(companyId) || companyId <= 0 || !database || database.startsWith('--')) {
  throw new Error('Provide explicit --company ID --database NAME');
}
if (!process.env.ODOO_USER || !process.env.ODOO_PASS) throw new Error('Set ODOO_USER and ODOO_PASS privately');
let cookie = '';
async function call(path, params) {
  const response = await fetch(new URL(path, base), {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
    signal: AbortSignal.timeout(30_000),
  });
  for (const value of response.headers.getSetCookie()) {
    if (value.startsWith('session_id=')) cookie = value.split(';')[0];
  }
  if (!response.ok) throw new Error(`Odoo HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error('Odoo RPC failed; no business data was changed');
  return body.result;
}
try {
  const login = await call('/web/session/authenticate', { db: database, login: process.env.ODOO_USER, password: process.env.ODOO_PASS });
  if (!login?.uid) throw new Error('Odoo authentication failed');
  const rpc = async (_session, model, method, args, kwargs = {}) => {
    if (!['search_read', 'read', 'read_group', 'search_count'].includes(method)) throw new Error('Read-only method required');
    return call('/web/dataset/call_kw', { model, method, args, kwargs: { ...kwargs,
      context: { allowed_company_ids: [companyId], force_company: companyId } } });
  };
  const [company] = await rpc('', 'res.company', 'read', [[companyId]], { fields: ['name', 'partner_id', 'currency_id'] });
  if (!company) throw new Error('Company not accessible');
  const [partner] = await rpc('', 'res.partner', 'read', [[company.partner_id[0]]], { fields: ['country_id', 'state_id'] });
  const timezone = getOdooCompanyTimezone(partner.country_id, partner.state_id);
  const result = await calculateReport(rpc, { sessionId: '', companyId,
    company: { name: company.name, currency: company.currency_id[1], timezone }, summaryOnly: true, period: 'today' });
  console.log(JSON.stringify({ database, companyId, readOnly: true, auditedAt: new Date().toISOString(), result }, null, 2));
} catch {
  console.error('Read-only dashboard audit failed. Check target, private credentials, connectivity and Odoo read permissions. No business records were modified.');
  process.exitCode = 1;
}
