const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
const base = 'http://demo.lvh.me:3102';
const shots = 'docs/screenshots/2026-10-24-workspace-design';
const checks = [];
const errors = [];
const writes = [];
const readPosts = [];
const admin = {id:1,name:'admin',username:'admin',isAdmin:true,vendorId:1,outletId:1,pendingPasswordReset:false,platformOperator:false};
const summary = {company:'Orithos Pilot Liquor Store (TEST)',currency:'AUD',timezone:'Australia/Adelaide',revenue:0,transactions:0,openRegisters:1};
const check = (name, value) => { assert.ok(value, name); checks.push({name,status:'PASS'}); };
(async () => {
 fs.mkdirSync(shots,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-proxy-server']});
 try {
 async function create(width,user=admin,state={}) {
  const context=await browser.newContext({viewport:{width,height:980},reducedMotion:'reduce'});
  await context.addCookies([{name:'orithos_access_token',value:'workspace-fixture',url:base}]);
  await context.addInitScript(user=>{localStorage.setItem('sf_token','workspace-fixture');localStorage.setItem('sf_user',JSON.stringify(user));},user);
  await context.route('**/api/**',async route=>{
   const req=route.request(), path=new URL(req.url()).pathname;
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(path==='/api/odoo/records' && req.method()==='POST') {readPosts.push(path);return json({items:[],limit:40,offset:0,hasNext:false});}
   if(!['GET','HEAD','OPTIONS'].includes(req.method())) {writes.push(req.method()+' '+path);return json({message:'Blocked'},405);}
   if(path==='/api/auth/me')return json({code:0,message:'OK',data:user});
   if(path==='/api/odoo/session')return json({user:{name:'Fixture',allowedCompanyIds:[41]},autoRecoverConfigured:false});
   if(path==='/api/odoo/reporting-dashboard') {
    if(state.hold)await state.hold;
    if(state.fail)return json({message:'Fixture summary unavailable'},503);
    return json(state.summary||summary);
   }
   if(path==='/api/ai/config/client')return json({code:0,message:'OK',data:{enabled:false,aiTriggerKeywords:[]}});
   return json({code:0,message:'OK',data:[]});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page};
 }
 async function open(page) {await page.goto(base+'/dashboard/workspace',{waitUntil:'networkidle'});await page.locator('.ov-module').first().waitFor();}
 for(const width of [1752,1440,1024,768,390]) {
  const {context,page}=await create(width);await open(page);
  check(width+' seven cards',await page.locator('.ov-module').count()===7);
  check(width+' grid columns',await page.locator('.ov-modules').evaluate((e,n)=>getComputedStyle(e).gridTemplateColumns.split(' ').length===n,width>=1200?4:width>=640?2:1));
  check(width+' no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.ov-workspace,.ov-summary,.ov-module,.ov-briefing')].every(e=>e.scrollWidth<=e.clientWidth+1)));
  check(width+' zero revenue shown',await page.locator('.ov-summary dd').first().innerText()==='$0.00');
  check(width+' zero transactions shown',await page.locator('.ov-summary dd').nth(1).innerText()==='0');
  check(width+' no repeated heading brand',await page.locator('.ov-header .ov-brand').count()===0);
  check(width+' all cards actionable',await page.locator('.ov-module').evaluateAll(es=>es.every(e=>e.tagName==='A'&&e.getAttribute('href'))));
  await page.setViewportSize({width,height:Math.max(980,await page.locator('.ov-page').evaluate(e=>e.scrollHeight))});
  await page.screenshot({path:shots+'/workspace-'+width+'.png',fullPage:true});await page.setViewportSize({width,height:980});
  if(width===1752) {
   const links=await page.locator('.ov-module,.ov-actions a,.ov-report-link').evaluateAll(es=>es.map(e=>({href:e.getAttribute('href'),text:e.textContent})));
   for(const [i,link] of links.entries()) {

    // Find by exact destination within the workspace; some actions share destinations.
    const locator=page.locator('.ov-workspace a').filter({hasText:link.text.trim()}).first();
    await locator.click();await page.waitForURL(url=>url.pathname===link.href);
    check('navigation '+link.text.trim(),new URL(page.url()).pathname===link.href);
    await open(page);
   }
   await page.locator('.ov-module').first().focus();
   check('visible keyboard focus',await page.locator('.ov-module').first().evaluate(e=>getComputedStyle(e).outlineStyle!=='none'));
  }
  await context.close();
 }
 const state={summary:{...summary,transactions:undefined,openRegisters:undefined}};
 const missing=await create(1440,admin,state);await open(missing.page);
 check('missing metrics use em dash',await missing.page.locator('.ov-summary dd').nth(1).innerText()==='—'&&await missing.page.locator('.ov-summary dd').nth(2).innerText()==='—');
 await missing.context.close();
 const clerk={...admin,isAdmin:false,roleCode:'CLERK',permissions:['sell.checkout','customers.view']};
 const restricted=await create(1440,clerk);await open(restricted.page);
 check('permission filtered cards',JSON.stringify(await restricted.page.locator('.ov-module h3').allTextContents())===JSON.stringify(['Sell','Customers']));
 check('restricted report and integrations hidden',await restricted.page.locator('.ov-report-link').count()===0&&await restricted.page.locator('.ov-actions a').count()===1);
 await restricted.context.close();
 let release;const loadingState={hold:new Promise(r=>release=r),fail:true};
 const failure=await create(1440,admin,loadingState);
 await failure.page.goto(base+'/dashboard/workspace',{waitUntil:'domcontentloaded'});
 await failure.page.getByRole('status',{name:'Loading dashboard'}).waitFor();check('loading skeleton visible',true);
 release();await failure.page.locator('.ov-error').waitFor();check('load error visible',await failure.page.locator('.ov-error').innerText().then(t=>t.includes('Dashboard could not refresh')));
 loadingState.fail=false;loadingState.hold=null;
 await failure.page.getByRole('button',{name:'Retry',exact:true}).click();await failure.page.locator('.ov-module').first().waitFor();check('retry recovers workspace',await failure.page.locator('.ov-error').count()===0);
 await failure.context.close();
 const radial=await create(1440);await radial.page.goto(base+'/dashboard',{waitUntil:'networkidle'});
 await radial.page.locator('.ov-ring-node > a').first().waitFor();
 check('radial remains direct links',await radial.page.locator('.ov-ring-node > a').count()===6&&await radial.page.locator('.ov-ring-node small,.ov-ring-node > button').count()===0);
 await radial.page.locator('.ov-ring-node > a').nth(1).hover();await radial.page.waitForTimeout(250);
 check('radial no expanded submenu',await radial.page.locator('.ov-submenu,.ov-inline-children').count()===0);
 await radial.context.close();
 check('no page errors',errors.length===0);check('no business writes',writes.length===0);
 } finally {await browser.close();fs.writeFileSync('docs/UAT_WORKSPACE_DESIGN_LOCAL_2026-10-24.json',JSON.stringify({base,scope:'Local API fixtures; no real business writes or deployment verification',checks,errors,writes,readPosts},null,2));}
 console.log(JSON.stringify({passed:checks.length,errors,writes}));
})().catch(e=>{console.error(e);process.exit(1)});





