import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseCosts, type CostSale } from './dashboard-purchase-cost.ts';
import { calculateReport, type ReportRpc } from './report-data.ts';
const sale = (date='2026-11-02 12:00:00',qty=1): CostSale => ({id:1,product_id:[1335,'Water'],product_uom_id:[1,'Units'],qty,price_subtotal:4,'order_id.date_order':date});
const moves=[{id:2,product_id:[1335,'Water'],purchase_line_id:[2,'PO2'],date:'2026-11-02 13:00:00',quantity:20},{id:1,product_id:[1335,'Water'],purchase_line_id:[1,'PO1'],date:'2026-10-16 00:00:00',quantity:20}];
const purchases=[{id:1,product_id:[1335,'Water'],product_uom_id:[20,'Box of 20'],product_qty:1,price_subtotal:49.68,currency_id:[21,'AUD']},{id:2,product_id:[1335,'Water'],product_uom_id:[20,'Box of 20'],product_qty:1,price_subtotal:60,currency_id:[21,'AUD']}];
const units=[{id:1,factor:1,relative_uom_id:false},{id:20,factor:20,relative_uom_id:[1,'Units']}];
function costingRpc(po=purchases): ReportRpc {return (async(_s,model,_m,args)=>{
 if(model==='stock.move'){assert.ok(JSON.stringify(args).includes('company_id'));return moves;}
 if(model==='purchase.order.line')return po;
 if(model==='uom.uom')return units;
 throw Error('Unexpected model');
}) as ReportRpc;}
test('last completed receipt before sale; box cost divided by twenty; no future receipt',async()=>{
 const costs=await purchaseCosts(costingRpc(),'session',5,'AUD',[sale()]);assert.equal(costs.get(1),49.68/20);
 const later=await purchaseCosts(costingRpc(),'session',5,'AUD',[sale('2026-11-02 14:00:00',2)]);assert.equal(later.get(1),6);
});
test('unknown currency, absent receipt prices and refunds cannot silently use current standard cost',async()=>{
 assert.equal((await purchaseCosts(costingRpc([]),'session',5,'AUD',[sale()])).size,0);
 assert.equal((await purchaseCosts(costingRpc(),'session',5,'USD',[sale()])).size,0);
 assert.equal((await purchaseCosts(costingRpc(),'session',5,'AUD',[sale(undefined,-1)])).size,0);
});
const options={sessionId:'fixture',companyId:5,company:{name:'Fixture',currency:'AUD',timezone:'Australia/Sydney'},period:'today',summaryOnly:true,now:new Date('2026-11-03T08:00:00Z')};
function summaryRpc({net=100,failStock=false,failLines=false,mixed=false,withLines=true}={}): ReportRpc{return(async(_s,model,method,args,kwargs)=>{
 const data=JSON.stringify(args);
 if(model==='stock.quant'){
  if(failStock)throw Error('stock unavailable');
  if(JSON.stringify(kwargs).includes('product_id'))return [{product_id:[5,'Bad stock'],quantity:-5}];
  return [{product_uom_id:[1,'Units'],quantity:-5},...(mixed?[{product_uom_id:[2,'kg'],quantity:8}]:[])];
 }
 if(model==='stock.move')return [];
 if(model==='pos.order.line'){
  if(failLines)throw Error('lines unavailable');
  assert.ok(!JSON.stringify(kwargs).includes('purchase_price'));
  assert.ok(JSON.stringify(kwargs?.fields).includes('"id"'));
  return withLines?[{...sale(),order_id:[1,'Sale'],price_subtotal:net}]:[];
 }
 if(model==='pos.order'&&method==='search_read')return [{id:1,date_order:'2026-11-02 12:00:00'}];
 if(model==='pos.order'&&method==='read_group')return [{amount_total:110,amount_tax:10}];
 if(method==='search_count')return 1;
 throw Error(data);
}) as ReportRpc;}
test('tax mismatch blocks margin, preserves actual sales, and excludes negative inventory',async()=>{
 const r=await calculateReport(summaryRpc({net:110}),options);assert.equal(r.yesterdaySales,110);assert.equal(r.yesterdayNetSales,100);assert.equal(r.grossMarginStatus,'sales_mismatch');assert.equal(r.yesterdayGrossMargin,null);assert.equal(r.inventoryUnits,0);assert.equal(r.inventoryNetUnits,-5);assert.equal(r.inventoryStatus,'negative_stock');
});
test('complete Shopfront source evidence is retained as a separate margin fallback', async () => {
 const line = {id:'line-1',item:{id:'water'},quantity:1,totalPrice:11,tax:1,cost:6};
 const sourceSale = {id:1,external_id:'sale-1',created_at:'2026-11-02 12:00:00',total_price:11,total_tax:1,total_cost:6,
  raw_payload:{status:'COMPLETED',items:[{source_product_id:'water',quantity:1,line_total:11,tax:1,cost:6,raw_payload:line}],
   raw_payload:{id:'sale-1',status:'COMPLETED',createdAt:'2026-11-02T12:00:00Z',totalPrice:11,totalTax:1,totalCost:6,items:[line]}}};
 const base = summaryRpc({net:110});
 const rpc = (async (session,model,method,args,kwargs,correlationId) => {
  if(model==='shopfront.sync.sale') return method==='search_count' ? 1 : [sourceSale];
  return base(session,model,method,args,kwargs,correlationId);
 }) as ReportRpc;
 const r=await calculateReport(rpc,{...options,sourceStore:'skr'});
 assert.equal(r.grossMarginStatus,'sales_mismatch');
 assert.deepEqual(r.sourceMarginFallback,{grossMarginPercent:0.4,coverage:1});
});
test('inventory total sums signed internal stock and preserves fractional units', async () => {
 const base = summaryRpc();
 const rpc = (async (session, model, method, args, kwargs, correlationId) => {
  if (model !== 'stock.quant') return base(session, model, method, args, kwargs, correlationId);
  const domain = args[0] as unknown[][];
  assert.ok(domain.some(term => JSON.stringify(term) === JSON.stringify(['company_id', '=', 5])));
  assert.ok(domain.some(term => JSON.stringify(term) === JSON.stringify(['location_id.usage', '=', 'internal'])));
  const quantities = [8.25, -12.5, 0];
  const quantityFilter = domain.find(term => term[0] === 'quantity');
  if (JSON.stringify(kwargs).includes('product_id')) return [{product_id: [5, 'Negative stock'], quantity: -12.5}];
  // Model filtering so a positive-only query fails this regression.
  const included = quantityFilter?.[1] === '>' ? quantities.filter(q => q > 0) : quantities;
  return included.map((quantity, index) => ({ product_id: [index + 1, `Product ${index + 1}`], product_uom_id: [1, 'Units'], quantity }));
 }) as ReportRpc;
 const result = await calculateReport(rpc, options);
 assert.equal(result.inventoryUnits, 8.25);
 assert.equal(result.inventoryNetUnits, -4.25);
 assert.equal(result.inventoryAvailable, true);
 assert.equal(result.inventoryStatus, 'negative_stock');
});
test('missing receipts cannot be replaced by corrupt existing sale cost',async()=>{
 const r=await calculateReport(summaryRpc(),options);assert.equal(r.salesReconciled,true);assert.equal(r.grossMarginStatus,'unavailable');assert.equal(r.yesterdayGrossMargin,null);
});
test('partial service failure and mixed units never become verified zero values',async()=>{
 const r=await calculateReport(summaryRpc({failStock:true,failLines:true}),options);assert.equal(r.inventoryUnits,null);assert.equal(r.inventoryAvailable,false);assert.equal(r.grossMarginStatus,'unavailable');assert.equal(r.yesterdaySales,110);
 const m=await calculateReport(summaryRpc({mixed:true}),options);assert.equal(m.inventoryUnits,null);assert.equal(m.inventoryStatus,'mixed_units');
});

test('receipt estimates cannot replace the original ledger valuation', async () => {
 const base = summaryRpc();
 const costing = costingRpc();
 const rpc = (async (session, model, method, args, kwargs, correlationId) => {
  if (['stock.move', 'purchase.order.line', 'uom.uom'].includes(model)) return costing(session, model, method, args, kwargs, correlationId);
  return base(session, model, method, args, kwargs, correlationId);
 }) as ReportRpc;
 const r = await calculateReport(rpc, options);
 assert.equal(r.grossMarginStatus, 'unavailable');
 assert.equal(r.grossMarginCoverage, 0);
 assert.equal(r.yesterdayGrossMargin, null);
 assert.equal(r.yesterdayTax, 10);
});

test('no sales is distinct from unavailable sales and never produces a margin', async () => {
 const base = summaryRpc({withLines: false});
 const rpc = (async (session, model, method, args, kwargs, correlationId) => {
  if (model === 'pos.order' && method === 'read_group') return [];
  return base(session, model, method, args, kwargs, correlationId);
 }) as ReportRpc;
 const r = await calculateReport(rpc, options);
 assert.equal(r.yesterdaySales, 0);
 assert.equal(r.yesterdaySalesAvailable, true);
 assert.equal(r.grossMarginStatus, 'no_sales');
 assert.equal(r.yesterdayGrossMargin, null);
});

test('latest invalid receipt price cannot fall back to older price; explicit free purchase is valid', async () => {
 const bad = purchases.map(row => ({...row, price_subtotal: row.id === 2 ? -1 : row.price_subtotal}));
 assert.equal((await purchaseCosts(costingRpc(bad), 'session', 5, 'AUD', [sale('2026-11-02 14:00:00')])).size, 0);
 const free = purchases.map(row => ({...row, price_subtotal: 0}));
 assert.equal((await purchaseCosts(costingRpc(free), 'session', 5, 'AUD', [sale()])).get(1), 0);
});

test('truncated receipt history is rejected rather than labeled verified', async () => {
 const rpc = (async () => Array.from({length: 10001}, () => moves[0])) as ReportRpc;
 await assert.rejects(purchaseCosts(rpc, 'session', 5, 'AUD', [sale()]), /incomplete/);
});
