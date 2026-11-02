import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui=path.join(root,'pos-ui');
const require=createRequire(path.join(ui,'package.json'));
const ts=require('typescript');
const {NextRequest}=require('next/server');
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const mod=new Module(file);cache.set(file,mod);mod.filename=file;
  mod.paths=Module._nodeModulePaths(path.dirname(file));
  mod.require=id=>id.startsWith('@/')?load(path.join(ui,'src',id.slice(2))+'.ts'):require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
  return mod.exports;
}
let granted=true, foreign=false, fail=false, rawError=false, warehouseOnly=false;
let calls=[];
process.env.ODOO_BASE_URL='https://workspace.fixture.invalid';
process.env.BACKEND_URL='https://backend.fixture.invalid';
const json=body=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  assert.ok(url.includes('.fixture.invalid/'),'real network blocked');
  if(url.endsWith('/api/auth/me'))return json({code:0,data:{permissions:granted?['sell.checkout','stock.products.view']:[]}});
  if(url.endsWith('/api/tenant/odoo-binding'))return json({code:0,data:{odooCompanyId:foreign?99:41,odooStockLocationId:warehouseOnly?null:9,odooWarehouseId:3,odooProvisionStatus:'ready',sampleDataClearedAt:'2026-11-02'}});
  if(url.endsWith('/web/session/get_session_info'))return json({result:{uid:1,user_context:{allowed_company_ids:[41]}}});
  const {params:p}=JSON.parse(options.body);
  assert.equal(p.method,'search_read','no writes'); calls.push(p);
  if(fail)return new Response('{}',{status:503});
  if(rawError)return json({error:{data:{name:'ValidationError',message:'PRIVATE_RAW_PROVIDER_DATA'}}});
  if(p.model==='res.company')return json({result:[{id:41,currency_id:[1,'AUD'],partner_id:[51,'Company']}]});
  if(p.model==='res.partner')return json({result:[{id:51,country_id:[1,'Australia'],state_id:[1,'South Australia']}]});
  if(p.model==='stock.warehouse')return json({result:[{view_location_id:[9,'Warehouse']} ]});
  if(p.model==='pos.order')return json({result:[{id:71,name:'Order',pos_reference:'Receipt-71',date_order:'2026-11-02 03:00:00',session_id:[4,'Session-4']}]});
  return json({result:Array.from({length:41},(_,i)=>({id:i+1,order_id:[71,'Order'],pos_order_id:[71,'Order'],quantity:8,reserved_quantity:2}))});
};
const {GET}=load(path.join(ui,'app/api/odoo/workspace-records/route.ts'));
const request=(q,headers={})=>GET(new NextRequest('https://demo.fixture.invalid/api/odoo/workspace-records?'+q,{headers:{Cookie:'orithos_access_token=fixture; orithos_odoo_session=fixture',...headers}}));
const checks=[];
for(const type of ['lines','payments','inventory','catalogue']){
  calls=[];
  const r=await request(`type=${type}&offset=40&q=Shiraz&period=7d`);assert.equal(r.status,200);
  const b=await r.json(); assert.equal(b.items.length,40); assert.equal(b.hasNext,true);assert.equal(b.timezone,'Australia/Adelaide');
  const data=calls[0];assert.equal(data.kwargs.offset,40);assert.equal(data.kwargs.limit,41);assert.deepEqual(data.kwargs.context.allowed_company_ids,[41]);
  assert.ok(data.args[0].some(x=>Array.isArray(x)&&x[1]==='in'&&JSON.stringify(x[2])==='[41]'));
  assert.ok(data.args[0].some(x=>Array.isArray(x)&&x[1]==='ilike'&&x[2]==='Shiraz'));
  if(type==='inventory'){assert.equal(b.items[0].available,6);assert.ok(data.args[0].some(x=>JSON.stringify(x)==='["location_id","child_of",9]'));}
  if(type==='lines'||type==='payments'){assert.equal(b.items[0].receipt,'Receipt-71');assert.ok(data.args[0].some(x=>Array.isArray(x)&&x[1]==='=like'));}
  checks.push(`${type}: permission/company scope, server search, pagination, timezone and enrichment`);
}
warehouseOnly=true;calls=[];assert.equal((await request('type=inventory')).status,200);assert.equal(calls[0].model,'stock.warehouse');checks.push('inventory warehouse-only binding resolves location');warehouseOnly=false;
for(const q of ['type=res.users','type=lines&offset=-1','type=payments&offset=NaN','type=lines&period=__proto__']){const n=calls.length;assert.equal((await request(q)).status,400);assert.equal(calls.length,n);checks.push('reject '+q);}
assert.equal((await request('type=lines',{Origin:'https://foreign.invalid'})).status,403);checks.push('cross-origin rejected');
granted=false;calls=[];assert.equal((await request('type=payments')).status,403);assert.equal(calls.length,0);checks.push('unauthorized blocked before data read');granted=true;
foreign=true;calls=[];assert.equal((await request('type=inventory')).status,403);assert.equal(calls.length,0);checks.push('cross-company binding denied');foreign=false;
fail=true;assert.equal((await request('type=lines')).status,502);checks.push('provider failure is not empty success');fail=false;
rawError=true;const bad=await request('type=payments');assert.equal(bad.status,422);assert.ok(!(await bad.text()).includes('PRIVATE_RAW_PROVIDER_DATA'));checks.push('provider details sanitized');
fs.writeFileSync(path.join(root,'docs/UAT_WORKSPACE_RECORDS_ROUTE_LOCAL_2026-11-02.json'),JSON.stringify({environment:'local real route with in-memory transport; no live Odoo acceptance',businessWrites:0,checks},null,2));
console.log(`${checks.length} PASS; no network or business writes`);
