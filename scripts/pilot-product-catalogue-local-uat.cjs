const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const base = 'http://demo.lvh.me:3102';
const shots = 'docs/screenshots/2026-10-24-product-catalogue';
const checks = [], errors = [], writes = [];
const products = Array.from({length:45}, (_, i) => ({
  id:i+1, name:`Estate Shiraz ${String(i+1).padStart(2,'0')}`, display_name:`Estate Shiraz ${String(i+1).padStart(2,'0')}`,
  barcode:i===3?false:`930000000${i}`, default_code:`WINE-${i}`, list_price:i===2?0:12,
  price_included:i===4?null:i===2?0:13.2, price_tax:i===4?null:1.2, taxes_id:[1],
  qty_available:i===0?0:i===1?-3:24, free_qty:i===0?0:i===1?-3:20, uom_id:[1,'Units'],
  pos_categ_ids:i===5?[]:[7], available_in_pos:i!==6,
}));
const user={id:1,name:'Local Preview',username:'admin',isAdmin:true,vendorId:41,outletId:1,platformOperator:false};
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
(async()=>{
  fs.mkdirSync(shots,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--no-proxy-server']});
  try {
    for(const width of [320,390,768,1024,1440]) {
      const context=await browser.newContext({viewport:{width,height:width<768?844:980},reducedMotion:'reduce'});
      await context.addCookies([{name:'orithos_access_token',value:'catalogue-fixture',url:base}]);
      await context.addInitScript(user=>{localStorage.setItem('sf_token','catalogue-fixture');localStorage.setItem('sf_user',JSON.stringify(user));},user);
      let failNext=false, slowStarted=false;
      await context.route('**/api/**', async route=>{
        const req=route.request(), pathname=new URL(req.url()).pathname;
        const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if(pathname==='/api/auth/me')return json({code:0,data:user});
        if(pathname==='/api/odoo/session')return json({user:{name:'Fixture',allowedCompanyIds:[41]}});
        if(pathname==='/api/odoo/pos-bootstrap')return json({configs:[]});
        if(pathname==='/api/odoo/records'&&req.method()==='POST') {
          const body=req.postDataJSON();
          if(body.type==='posCategories')return json({items:[{id:7,name:'Red wine',parent_id:false}],hasNext:false});
          if(body.type!=='products')return json({items:[],hasNext:false});
          if(failNext){return json({message:'Fixture catalogue temporarily unavailable'},502);}
          let rows=products.filter(p=>(!body.query||p.name.toLowerCase().includes(body.query.toLowerCase()))&&(!body.categoryId||p.pos_categ_ids.includes(body.categoryId)));
          const filters={'out-of-stock':p=>p.qty_available===0,'negative-stock':p=>p.qty_available<0,'zero-price':p=>p.list_price===0,'missing-barcode':p=>!p.barcode,uncategorised:p=>!p.pos_categ_ids.length,hidden:p=>!p.available_in_pos};
          if(filters[body.catalogueView])rows=rows.filter(filters[body.catalogueView]);
          if(body.query==='slow'){slowStarted=true;await new Promise(resolve=>setTimeout(resolve,700));}
          return json({items:rows.slice(body.offset||0,(body.offset||0)+body.limit),hasNext:rows.length>(body.offset||0)+body.limit});
        }
        if(!['GET','HEAD','OPTIONS'].includes(req.method())){writes.push(pathname);return json({message:'Business writes blocked'},405);}
        return json({code:0,data:[]});
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/products/odoo',{waitUntil:'networkidle'});
      const main=page.locator('main').last();
      const product=name=>main.getByRole('button',{name,exact:true}).filter({visible:true});
      const quick=name=>main.getByRole('group',{name:'Catalogue quick filters'}).getByRole('button',{name,exact:true});
      await product('Estate Shiraz 01').waitFor();
      check(width+' sale price including GST',await main.getByText('$13.20',{exact:true}).filter({visible:true}).first().isVisible());
      check(width+' tax unknown labelled',await main.getByText('Tax unconfirmed',{exact:true}).filter({visible:true}).count()>0);
      check(width+' next page available',await main.getByRole('button',{name:'Next',exact:true}).isEnabled());
      await main.getByRole('button',{name:'Next',exact:true}).click();
      await product('Estate Shiraz 41').waitFor();
      check(width+' server pagination boundary',await main.getByRole('button',{name:'Next',exact:true}).isDisabled());
      for(const [view,name] of [['Negative stock','Estate Shiraz 02'],['Out of stock','Estate Shiraz 01'],['Zero price','Estate Shiraz 03'],['Missing barcode','Estate Shiraz 04'],['Uncategorised','Estate Shiraz 06'],['Hidden from POS','Estate Shiraz 07']]) {
        if(width<768)await main.getByRole('combobox',{name:'Catalogue quick view'}).selectOption({label:view});else await quick(view).click();await product(name).waitFor();
        check(width+' '+view,await main.getByRole('button',{name:'Previous',exact:true}).isDisabled());
      }
      await product('Estate Shiraz 07').click();
      const detail=page.getByRole('dialog',{name:'Estate Shiraz 07'});await detail.waitFor();
      check(width+' detail displays real unit',await detail.getByText('24 · Units',{exact:true}).isVisible());
      await page.keyboard.press('Escape');
      await detail.waitFor({state:'hidden'});
      check(width+' detail restores focus',await product('Estate Shiraz 07').evaluate(el=>el===document.activeElement));
      await product('Estate Shiraz 07').click();await detail.getByRole('button',{name:'Edit product',exact:true}).click();
      const edit=page.getByRole('dialog',{name:'Edit product'});await edit.waitFor();
      check(width+' detail to edit',await edit.getByRole('spinbutton').inputValue()==='12');
      await edit.getByRole('button',{name:'Cancel',exact:true}).click();
      await main.getByRole('button',{name:'Clear filters',exact:true}).filter({visible:true}).first().click();await product('Estate Shiraz 01').waitFor();
      const search=main.getByRole('textbox',{name:'Search products by name, barcode or SKU'});
      await search.fill('no match');await main.getByText('No matching products',{exact:true}).filter({visible:true}).waitFor();
      check(width+' empty results reset',await main.getByRole('button',{name:'Clear filters',exact:true}).filter({visible:true}).last().isVisible());
      await main.getByRole('button',{name:'Clear filters',exact:true}).filter({visible:true}).first().click();await product('Estate Shiraz 01').waitFor();
      await search.fill('slow');
      await page.waitForFunction(()=>document.querySelector('section[aria-busy="true"]'));
      check(width+' stale actions removed during debounce',await product('Estate Shiraz 01').count()===0);
      await page.waitForTimeout(350);assert.ok(slowStarted);
      await search.fill('Estate Shiraz 03');await product('Estate Shiraz 03').waitFor();await page.waitForTimeout(800);
      check(width+' stale response rejected',await product('Estate Shiraz 03').count()===1);
      await search.fill('temporary');await search.fill('Estate Shiraz 03');await product('Estate Shiraz 03').waitFor();
      check(width+' reverting query recovers',await product('Estate Shiraz 03').isVisible());
      await main.getByRole('button',{name:'Clear filters',exact:true}).filter({visible:true}).first().click();await product('Estate Shiraz 01').waitFor();
      await page.waitForTimeout(400);
      failNext=true;await main.getByRole('button',{name:'Refresh products',exact:true}).click();
      await main.getByText(/Fixture catalogue temporarily unavailable/).waitFor();
      failNext=false;await main.getByRole('button',{name:'Retry',exact:true}).click();await product('Estate Shiraz 01').waitFor();
      check(width+' load failure retry',await main.getByText(/Fixture catalogue temporarily unavailable/).count()===0);
      check(width+' no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${shots}/catalogue-${width}.png`,fullPage:true});
      await product('Estate Shiraz 01').click();
      await page.getByRole('dialog').getByRole('button',{name:'Edit product',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:`${shots}/details-${width}.png`,fullPage:true});
      check(width+' modal edit is not covered by AI',await page.getByRole('dialog').getByRole('button',{name:'Edit product',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
      check(width+' dialog fits viewport',await page.getByRole('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
      await context.close();
    }
    check('no browser errors',errors.length===0);check('no business writes',writes.length===0);
    fs.writeFileSync('docs/UAT_PRODUCT_CATALOGUE_LOCAL_2026-10-24.json',JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceTreeDirty:true,scope:'Local browser fixture; no live Odoo acceptance',checks,errors,businessWrites:writes.length},null,2));
    console.log(`${checks.length}/${checks.length} PASS; browser errors ${errors.length}; business writes ${writes.length}`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
