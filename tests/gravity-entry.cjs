'use strict';
// In GitHub CI: node tests/gravity-entry.cjs. No request leaves the browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const pick=(variable,choices)=>process.env[variable]??choices.find(f=>fs.existsSync(f));
const appPath=pick('NEKO_GAME_HTML',[path.join(root,'index.html'),path.join(root,'neko-release-publish-nov19/repo/index.html')]);
const entryPath=pick('NEKO_ENTRY_HTML',[path.join(root,'gravity-entry.html'),path.join(__dirname,'gravity-entry.html')]);
assert.ok(appPath&&entryPath,'cannot resolve game + entry files');
const app=fs.readFileSync(appPath),entry=fs.readFileSync(entryPath);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(process.env.EXPECTED_APP_SHA)assert.equal(sha(app),process.env.EXPECTED_APP_SHA);
assert.match(app.toString(),/<button[^>]+id="bStart"/);
assert.ok([...entry.toString()].length<=5000,'GRAVITY cap');
const origin='https://fixture.neko.invalid';
const host=origin+'/host',loader=origin+'/wrapper?debug=1',
  game='https://gbaconrice.github.io/neko-hanga/index.html',
  sdk='https://cdn.gravity.place/fe/sdk/index-1.0.2.min.js';
const stub="window.sdkCalls=0;window.AgentSDK={user:{getMyUserInfo:function(){window.sdkCalls++;return Promise.resolve({data:{name:'Fixture player'}})}}};";
const parent='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;display:block;width:100%;height:100%}</style>'+
  '<script>window.received=[];addEventListener("message",e=>{if(e.source===document.querySelector("iframe").contentWindow)received.push({origin:e.origin,data:e.data})});</script>'+
  '<iframe title="mock platform" src="'+loader+'"></iframe>';
const html='text/html; charset=utf-8';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function eventually(fn,msg){
  for(let n=0;n<200;n++){if(await fn())return; await pause(25)}
  throw new Error(msg);
}
async function fixture(browser,{holdPages=false,holdSdk=false}={},test){
  const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  const hits=[],unhandled=[],errors=[],pages=[],sdks=[];
  try{
    await c.route('**/*',async route=>{
      const u=route.request().url();if(u.startsWith('data:'))return route.continue();
      if(u===origin+'/favicon.ico')return route.fulfill({status:204,body:''});
      if(u===host)return route.fulfill({status:200,contentType:html,body:parent});
      if(u===loader)return route.fulfill({status:200,contentType:html,body:entry});
      if(u===game){
        hits.push(u);
        pages.push((status=200)=>route.fulfill({status,contentType:html,headers:{'access-control-allow-origin':origin},body:status===200?app:'fixture error'}));
        if(!holdPages)await pages.at(-1)();
        return;
      }
      if(u===sdk){
        hits.push(u);sdks.push(()=>route.fulfill({status:200,contentType:'application/javascript',body:stub}));
        if(!holdSdk)await sdks.at(-1)();
        return;
      }
      unhandled.push(u);await route.abort();
    });
    const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
    if(holdPages)await page.clock.install();
    await page.goto(host,{waitUntil:'domcontentloaded'});
    const frame=await (await page.waitForSelector('iframe')).contentFrame();assert.ok(frame);
    await frame.waitForURL(loader,{waitUntil:'domcontentloaded'});
    const ex={page,frame,hits,pages,sdks,start:frame.locator('#bStart:not([disabled])'),retry:frame.locator('#retry')};
    await test(ex);
    assert.equal(page.frames().length,2);
    assert.equal(frame.childFrames().length,0,'never add iframe inside GRAVITY host frame');
    assert.deepEqual(errors,[]);assert.deepEqual(unhandled,[]);
    return hits;
  }finally{await c.close()}
}
async function solveByTouch(frame){
  await frame.waitForFunction(()=>{const s=window.__pz?.state();return s?.running&&!s.busy&&!s.guarded});
  const knobs=frame.locator('#knobs .kn');
  assert.ok(await knobs.count()>0);
  for(let i=0;i<await knobs.count();i++){
    const knob=knobs.nth(i),box=await knob.boundingBox();
    const step=await frame.evaluate(i=>window.__pz.cur().sol[i]-window.__pz.cur().v[i],i);
    for(let j=0;j<Math.abs(step);j++)await knob.tap({position:{x:box.width*(step<0?.32:.68),y:Math.min(box.height/2,35)}});
  }
  assert.ok(await frame.evaluate(()=>{const {sol,v}=window.__pz.cur();return sol.every((k,i)=>k===v[i])}));
}
async function verifyGame(f){
  await f.start.waitFor();
  assert.equal(await f.frame.locator('#app').count(),1);
  assert.equal(await f.retry.count(),0);
  await f.frame.waitForFunction(()=>document.querySelector('#who').textContent==='Fixture player');
  assert.equal(await f.frame.evaluate(()=>window.sdkCalls),1);
}
async function main(){
  const browser=await chromium.launch({chromiumSandbox:true,headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{
    const results={};
    results.stalledSDK=await fixture(browser,{holdSdk:true},async f=>{
      await eventually(()=>f.sdks.length===1,'SDK route was not hit');
      await f.start.waitFor({timeout:12000});
      assert.equal(await f.frame.locator('#who').textContent(),'');
      assert.equal(await f.frame.evaluate(()=>typeof window.loadUser),'undefined','real game encapsulates loadUser');
      await f.start.tap();
      const cat=f.frame.locator('#companionChoices [data-cat-id="white"]');
      await cat.waitFor();await f.frame.waitForFunction(()=>!window.__pz.state().guarded);
      await cat.tap();await solveByTouch(f.frame);
      await f.frame.locator('#bPrint').tap();
      await f.frame.waitForFunction(()=>window.__pz.state().prints===1&&window.__pz.state().score>0);
      const points=await f.frame.evaluate(()=>window.__pz.state().score);
      assert.deepEqual(await f.page.evaluate(()=>received),[]);
      await f.sdks[0]();
      await verifyGame(f);
      await f.frame.evaluate(()=>{dispatchEvent(new Event('pagehide'));dispatchEvent(new Event('pagehide'))});
      await f.page.waitForFunction(()=>received.length===1);
      await pause(100);
      assert.deepEqual(await f.page.evaluate(()=>received),[{origin,data:{type:'gameOver',score:points}}]);
      assert.equal(f.sdks.length,1);
    });
    results.slowPages=await fixture(browser,{holdPages:true},async f=>{
      await eventually(()=>f.pages.length===1,'game route was not hit');
      // Avoid a real 18s pause under CI. The application clock is unchanged.
      await f.page.clock.fastForward(18100);
      await f.retry.waitFor({state:'visible'});
      assert.match(await f.frame.locator('#boot').textContent(),/続いて/);
      await f.pages[0]();
      await verifyGame(f);
      assert.equal(f.pages.length,1);
    });
    results.retry=await fixture(browser,{holdPages:true},async f=>{
      await eventually(()=>f.pages.length===1,'first game route was not hit');
      await f.page.clock.fastForward(18100);
      await f.retry.tap();
      await eventually(()=>f.pages.length===2,'retry never reached game');
      await f.pages[1]();
      // The previous response may already have been aborted by chromium;
      // otherwise attempt to deliver it after the new request.
      await f.pages[0]().catch(()=>{});
      await verifyGame(f);
      assert.equal(f.pages.length,2);
      assert.equal(f.sdks.length,1);
    });
    results.failedPages=await fixture(browser,{holdPages:true},async f=>{
      await eventually(()=>f.pages.length===1,'first game route was not hit');
      await f.pages[0](503);await f.retry.waitFor({state:'visible'});
      assert.match(await f.frame.locator('#boot').textContent(),/読み込めません/);
      await f.retry.tap();
      await eventually(()=>f.pages.length===2,'retry never reached game');
      await f.pages[1]();await verifyGame(f);
      assert.equal(f.pages.length,2);
    });
    console.log(JSON.stringify({app:sha(app),entry:sha(entry),results,network:'all requests intercepted; mock score origin only'}));
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
