const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = 'http://demo.lvh.me:3102';
const shots = 'docs/screenshots/2026-10-24-assistant-composer';
const checks = [], errors = [], requests = [];
let activePage;
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
(async () => {
  fs.mkdirSync(shots, {recursive:true});
  const browser = await chromium.launch({headless:true,args:['--no-proxy-server','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try {
    for (const width of [1440,390]) {
      const user = {id:1,name:'Local Preview',username:'admin',isAdmin:true,vendorId:1,outletId:1,platformOperator:false};
      const context = await browser.newContext({viewport:{width,height:980},reducedMotion:'reduce'});
      await context.addCookies([{name:'orithos_access_token',value:'composer-fixture',url:base}]);
      await context.addInitScript(user=>{localStorage.setItem('sf_token','composer-fixture');localStorage.setItem('sf_user',JSON.stringify(user));},user);
      let voiceOn=true;
      await context.route('**/api/**',async route=>{
        const req=route.request(), path=new URL(req.url()).pathname;
        const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
        if(path==='/api/auth/me') return json({code:0,data:user});
        if(path==='/api/odoo/session')return json({user:{name:'Fixture',allowedCompanyIds:[41]},autoRecoverConfigured:false});
        if(path==='/api/odoo/reporting-dashboard')return json({company:'Fixture store',currency:'AUD',revenue:1234.5,transactions:18,openRegisters:1});
        if(path==='/api/ai/config/client')return json({code:0,data:{enabled:true,assistantAvailable:true,transcriptionAvailable:voiceOn,aiTriggerKeywords:[]}});
        if(path==='/api/ai/assistant') {requests.push(req.postDataJSON());return json({code:0,data:{answer:'Fixture response received.',threadId:'composer-test',intent:'chat',ui:{}}});}
        if(path==='/api/ai/transcribe')return json({code:0,data:{text:'Review yesterday sales'}});
        if(req.method()==='POST'&&path==='/api/odoo/records')return json({items:[],limit:40,offset:0,hasNext:false});
        if(!['GET','HEAD','OPTIONS'].includes(req.method()))throw new Error('Unexpected write '+path);
        return json({code:0,data:[]});
      });
      const page=await context.newPage();activePage=page;page.on('pageerror',e=>errors.push(e.message));
      const open=async()=>{await page.goto(base+'/dashboard',{waitUntil:'networkidle'});await page.locator('.ov-ai-composer').waitFor();};
      const input=()=>page.locator('.ov-ai-composer').getByRole('textbox',{name:'Ask Orithos AI'});
      await open();
      check(width+' removed header chat',await page.locator('.ov-ai-trigger').count()===0);
      check(width+' empty send disabled',await page.locator('.ov-ai-composer').getByRole('button',{name:'Send message',exact:true}).isDisabled());
      check(width+' removed duplicate logo',await page.locator('.ov-toolbar a[aria-label="Open Dashboard"]').count()===0);
      await input().click();await input().fill('比较今天和昨天的销售额');
      check(width+' editing stays on dashboard',new URL(page.url()).pathname==='/dashboard');
      await input().fill('x'.repeat(4001));
      await input().press('Enter');
      check(width+' over limit keeps draft',await input().inputValue().then(text=>text.length===4001)&&new URL(page.url()).pathname==='/dashboard'&&await page.locator('.ov-ai-composer').getByRole('alert').isVisible());
      await page.getByRole('button',{name:'Review sales',exact:true}).click();
      check(width+' suggestion fills draft',await input().inputValue()==="Review my store's sales performance"&&new URL(page.url()).pathname==='/dashboard');
      await input().fill('比较今天和昨天的销售额');
      const start=requests.length;
      await input().press('Enter');await page.waitForURL('**/assistant');
      await page.getByText('Fixture response received.',{exact:false}).last().waitFor();
      check(width+' handoff exact once',requests.length===start+1&&requests.at(-1).question==='比较今天和昨天的销售额');
      check(width+' shared assistant composer',await page.locator('[data-assistant-composer]:visible').count()===1);
      const composer=page.locator('[data-assistant-composer]:visible');
      await composer.getByRole('textbox').fill('Please compare these numbers');
      await composer.locator('input[type=file]').setInputFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from('day,sales\nMonday,100\nTuesday,120')});
      await composer.getByRole('button',{name:'Send message'}).click();
      await page.waitForFunction(()=>document.querySelectorAll('[data-assistant-composer] input[aria-label="Ask Orithos AI"]:not(:disabled)').length>0);
      check(width+' sends attachment contents',requests.at(-1).question.includes('Attachment: sales.csv\nday,sales\nMonday,100'));
      await page.screenshot({path:`${shots}/assistant-${width}.png`,fullPage:true});
      await open();
      const dashboard=page.locator('.ov-ai-composer');
      await dashboard.locator('input[type=file]').setInputFiles({name:'image.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
      check(width+' unsupported file feedback',await dashboard.getByRole('alert').isVisible());
      await dashboard.locator('input[type=file]').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('Test context')});
      await dashboard.getByRole('button',{name:'Remove note.txt'}).click();
      check(width+' remove attachment',await dashboard.getByRole('button',{name:'Remove note.txt'}).count()===0);
      await dashboard.getByRole('button',{name:'Voice input',exact:true}).click();
      check(width+' HTTP microphone feedback',await dashboard.getByRole('alert').innerText().then(text=>text.includes('HTTPS or localhost')));
      // Supply a synthetic audio stream at the microphone boundary. MediaRecorder
      // and VAD run normally; this does not bypass the real browser restriction.
      await context.addInitScript(() => {
        Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
          const audio=new AudioContext();
          const oscillator=audio.createOscillator();
          const destination=audio.createMediaStreamDestination();
          oscillator.connect(destination);oscillator.start();await audio.resume();
          const track=destination.stream.getAudioTracks()[0],originalStop=track.stop.bind(track);
          track.stop=()=>{originalStop();oscillator.stop();void audio.close();};
          return destination.stream;
        }}});
      });
      await open();
      await dashboard.getByRole('button',{name:'Voice input',exact:true}).click();
      await dashboard.getByRole('button',{name:'Stop voice input'}).waitFor();
      await page.waitForTimeout(1200);
      await dashboard.getByRole('button',{name:'Stop voice input'}).click();
      await page.waitForFunction(()=>document.querySelector('.ov-ai-composer input[aria-label="Ask Orithos AI"]')?.value==='Review yesterday sales');
      check(width+' voice produces editable draft',new URL(page.url()).pathname==='/dashboard');
      await dashboard.locator('input[type=file]').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('Test context')});
      check(width+' no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      check(width+' field before microphone',await dashboard.evaluate(element=>element.querySelector('input[aria-label="Ask Orithos AI"]').getBoundingClientRect().right<=element.querySelector('button[aria-label="Voice input"]').getBoundingClientRect().left+1));
      check(width+' composer contains controls',await dashboard.evaluate(element=>element.querySelector('form').getBoundingClientRect().bottom<=element.getBoundingClientRect().bottom));
      await page.screenshot({path:`${shots}/dashboard-${width}.png`,fullPage:true});
      const count=requests.length;
      await dashboard.getByRole('button',{name:'Send message',exact:true}).click();await page.waitForURL('**/assistant');
      await page.getByText('Fixture response received.',{exact:false}).last().waitFor();
      check(width+' dashboard attachment handoff',requests.length===count+1&&requests.at(-1).question.includes('Attachment: note.txt\nTest context'));
      voiceOn=false;await open();
      check(width+' unavailable voice disabled',await dashboard.getByRole('button',{name:'Voice input',exact:true}).isDisabled());
      await context.close();
    }
    check('no page errors',errors.length===0);
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({path:shots+'/failure.png',fullPage:true});
      console.error((await activePage.locator('body').innerText()).slice(-6000));
    }
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync('docs/UAT_ASSISTANT_COMPOSER_LOCAL_2026-10-24.json',JSON.stringify({base,scope:'Local API fixtures. Real HTTP microphone limitation checked before installing synthetic getUserMedia; MediaRecorder/VAD use generated oscillator audio, cloud transcription is mocked. No real microphone/transcription or business writes.',checks,errors,requestCount:requests.length},null,2));
  }
  console.log(JSON.stringify({passed:checks.length,errors}));
})().catch(e=>{console.error(e);process.exit(1)});
