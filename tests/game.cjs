const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const errors=[],requests=[];
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{
  Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage is unavailable in GRAVITY')}});
  window.scoreMessages=[];window.addEventListener('message',e=>{if(e.data?.type==='gameOver')window.scoreMessages.push(e.data)});
 });
 await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:'window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};'}));
 await page.clock.install();
 await page.goto('http://127.0.0.1:4173/?debug=1&top=98');
 await page.waitForFunction(()=>window.__pz?.state().artReady);
 assert.equal(await page.locator('#who').textContent(),'テスト刷り師');
 assert.equal(await page.locator('#bGal,#gal,#det').count(),0);
 const total=JSON.parse(fs.readFileSync(path.join(root,'art/catalog.json'),'utf8')).length;
 assert(total>=144);assert.equal(await page.evaluate(()=>window.__pz.W.length),total);
 assert.equal(requests.filter(u=>!u.startsWith('http://127.0.0.1:4173/?')&&!u.includes('cdn.gravity.place')).length,0,'art and sound must work without an asset server');
 // Render all distinct works, mirrored works and all special palettes.
 const art=await page.evaluate(()=>{
  const p=window.__pz,hashes=[],coverage=[];
  p.W.forEach((_,i)=>{
   const c=p.thumb(p.plain(i),256),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;
   let n=0;for(let k=0;k<d.length;k+=4)if(Math.abs(d[k]-245)>8||Math.abs(d[k+1]-239)>8||Math.abs(d[k+2]-222)>8)n++;
   hashes.push(c.toDataURL());coverage.push(n/(c.width*c.height));
   for(let sp=1;sp<=5;sp++)p.thumb({mi:i,sp,flip:1},64);
  });
  return {unique:new Set(hashes).size,min:Math.min(...coverage),max:Math.max(...coverage)};
 });
 assert.equal(art.unique,total);assert(art.min>.2&&art.max<.98);
 await page.screenshot({path:'/workspace/scratch/title.png'});
 await page.click('#bStart');
 await page.waitForFunction(()=>window.__pz.state().meows===1);
 const bounds=await page.locator('.kn').first().boundingBox();
 const before=await page.evaluate(()=>window.__pz.cur().v[0]);
 await page.mouse.click(bounds.x+bounds.width*.8,bounds.y+30);
 assert.equal(await page.evaluate(()=>window.__pz.cur().v[0]),before+1,'right tap increments one step');
 await page.click('#bHelp');
 assert.equal(await page.evaluate(()=>window.__pz.state().helps),0);
 async function solve(){await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint')}
 // An aligned preview must show the same central artwork as the final print.
 // This catches a central mask or explanatory text obscuring the illustration.
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
 await page.mouse.click(bounds.x+bounds.width*.8,bounds.y+30);
 await page.mouse.click(bounds.x+bounds.width*.2,bounds.y+30);
 assert(await page.evaluate(()=>{
  const p=window.__pz,c=document.querySelector('#cv'),t=p.thumb(p.cur().va,c.width/Math.min(2,devicePixelRatio),true);
  const x=Math.floor(c.width*.25),w=Math.floor(c.width*.5);
  const a=c.getContext('2d').getImageData(x,x,w,w).data,b=t.getContext('2d').getImageData(x,x,w,w).data;
  return a.every((n,i)=>n===b[i]);
 }),'central artwork remains fully visible while aligning');
 await page.screenshot({path:'/workspace/scratch/adjusting.png'});
 const hidden=await page.locator('#cv').evaluate(c=>c.toDataURL());
 await solve();
 assert.equal(await page.evaluate(()=>window.__pz.state().prints),1);
 assert(await page.evaluate(()=>window.__pz.state().score)>0);
 assert(await page.evaluate(()=>window.__pz.state().revealing));
 assert.notEqual(await page.locator('#cv').evaluate(c=>c.toDataURL()),hidden);
 // The printed image is made from the same three masks as the thumbnail, not a fourth overlay.
 assert(await page.evaluate(()=>{
  const p=window.__pz,c=document.querySelector('#cv'),v=p.cur().va,t=p.thumb(v,c.width/Math.min(2,devicePixelRatio));
  return c.toDataURL()===t.toDataURL();
 }),'printed composition matches its artwork');
 await page.screenshot({path:'/workspace/scratch/printed.png'});
 await page.click('#mute');
 assert.equal(await page.locator('#mute').textContent(),'音 OFF');
 await page.waitForFunction(()=>!window.__pz.state().busy);
 // Every difficulty tier stays playable on short embedded phone screens.
 for(const prints of [3,7,12,18,25,40]){
  await page.evaluate(n=>window.__pz.setPrints(n),prints);await solve();await page.waitForFunction(()=>!window.__pz.state().busy);
  const c=await page.evaluate(()=>({n:window.__pz.cur().ax.length,sol:window.__pz.cur().sol.length}));
  assert(c.n>=4&&c.n<=6&&c.n===c.sol);
 }
 for(const size of [{width:390,height:844},{width:360,height:640},{width:320,height:568}]){
  await page.setViewportSize(size);
  await page.evaluate(()=>{document.documentElement.style.setProperty('--top',innerHeight>=812?'98px':'74px');window.dispatchEvent(new Event('resize'))});
  await page.waitForTimeout(350);
  const layout=await page.evaluate(()=>{
   const b=document.querySelector('#bPrint').getBoundingClientRect(),c=document.querySelector('#paper').getBoundingClientRect(),h=document.querySelector('#knobs').getBoundingClientRect();
   return {buttonBottom:b.bottom,paperBottom:c.bottom,knobTop:h.top,paperTop:c.top,labelBottom:document.querySelector('#hint').getBoundingClientRect().bottom,paperWidth:c.width,viewport:innerHeight};
  });
  assert(layout.buttonBottom<=layout.viewport,'print button visible '+JSON.stringify(size));
  assert(layout.paperBottom<=layout.knobTop+1,'paper does not overlap knobs '+JSON.stringify({size,layout}));
  assert(layout.paperTop>=layout.labelBottom-1,'paper does not overlap label '+JSON.stringify({size,layout}));
  assert(layout.paperWidth>=120);
 }
 await page.waitForTimeout(300);
 await page.screenshot({path:'/workspace/scratch/small-phone.png'});
 // A failed print is debounced and the final score is posted exactly once.
 await page.evaluate(()=>window.__pz.setLives(1));
 await page.click('#bPrint');await page.waitForFunction(()=>!window.__pz.state().running);
 await page.waitForFunction(()=>window.scoreMessages.length===1);
 assert.equal(await page.locator('#over.on').count(),1);
 assert.equal(await page.locator('#oGrid .cell').count(),7);
 await page.click('#bRetry');
 assert.equal(await page.evaluate(()=>window.__pz.state().prints),0);
 assert.equal(await page.evaluate(()=>window.__pz.state().score),0);
 await page.evaluate(()=>window.__pz.setLives(1));
 await page.clock.runFor(41000);
 assert.equal(await page.evaluate(()=>window.__pz.state().running),false,'timeout ends play');
 assert.equal(await page.evaluate(()=>window.scoreMessages.length),2,'one score per play');
 assert.equal(await page.locator('#oGrid .cell').count(),0,'results reset on retry');
 assert.deepEqual(errors,[]);
 console.log('PASS: standalone HTML, storage unavailable, all works × 6 palettes, pointer tap/help, reveal, 7 successes, all difficulty tiers, 3 embedded phone sizes, failure/retry/timeout, one score per play.');
 console.log('Artwork ink coverage:',art.min.toFixed(3),art.max.toFixed(3));
 await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
