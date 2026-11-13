// 制限時間と判定(めろめろ・うっとり)の締め切りが、紙の操作量に合っていること。
// 序盤は従来どおり。後半は最速の操作でもめろめろに届く。時間の棒の境目は実際の締め切りの位置。
// 出る問題(絵の順番・つまみ・正解)が、ゲームごと・読み込みごとに変わること。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
// 従来の制限時間(index.html の cfg / sheetTime と同じ)
const TIME_START=46,TIME_STEP=1.1,TIME_MIN=20;
function cfg(n){
 if(n<3)return {time:40};if(n<7)return {time:45};if(n<12)return {time:45};
 if(n<18)return {time:42,min:32};if(n<25)return {time:42,min:34};
 return {time:Math.max(24,40-(n-25)*.8),min:Math.max(TIME_MIN,32-(n-25)*.6)};
}
const oldTime=n=>{const c=cfg(n);return n<3?c.time:Math.max(c.min||TIME_MIN,Math.min(c.time,TIME_START-n*TIME_STEP))};
const near=(a,b,msg,eps=1e-6)=>assert(Math.abs(a-b)<=eps,msg+' '+a+' vs '+b);
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const errors=[];
 async function open(){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
  await page.clock.install();
  await page.goto('http://127.0.0.1:4173/?debug=1&top=74');
  await page.waitForFunction(()=>window.__pz?.state().artReady);
  await page.evaluate(()=>{window.__pz.rareOff(true);window.__pz.tapGuard(0)});
  return page;
 }
 let page=await open();
 const st=()=>page.evaluate(()=>window.__pz.state());
 const idle=()=>page.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
 const run=ms=>page.clock.runFor(ms);
 const align=()=>page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
 const note=async()=>(await page.locator('#toast span').textContent()).split('　');
 // ぴったり合わせてすぐ刷り、次の紙が出るまで待つ。次の紙は prints=n で作られる
 const goTo=async n=>{await idle();await page.evaluate(n=>window.__pz.setPrints(n-1),n);await align();await page.click('#bPrint');await run(3000);await idle();return st()};
 // 紙を出してから sec 秒たつまで時計を進める
 const spendTo=async sec=>{const s=await st();await run(Math.max(0,Math.round((sec-(s.tMax-s.tLeft))*1000)))};
 const checkBar=async s=>{
  const b=await page.evaluate(()=>{const e=document.querySelector('.bar');return {w:e.clientWidth,u:parseFloat(getComputedStyle(e,'::before').left),m:parseFloat(getComputedStyle(e,'::after').left)}});
  near(b.u,b.w*(1-s.dU/s.tMax),'うっとり divider sits where the remaining time hits the deadline',.6);
  near(b.m,b.w*(1-s.dM/s.tMax),'めろめろ divider sits where the remaining time hits the deadline',.6);
 };
 await page.click('#bStart');await idle();

 /* ---- 序盤は従来どおり(やさしくしない) ---- */
 let s=await st();
 const early=async(s,n)=>{
  assert.equal(s.prints,n);near(s.tMaxBase,oldTime(n),'early limit unchanged at n='+n);near(s.tMax,s.tMaxBase+s.lastCarry,'carry is added on top');
  near(s.dM,.2*s.tMax,'early めろめろ window is the old 20% at n='+n);near(s.dU,.45*s.tMax,'early うっとり window is the old 45% at n='+n);
  assert(s.dM>=s.best,'the old window is already reachable early at n='+n);
 };
 await early(s,0);await checkBar(s);
 s=await goTo(3);await early(s,3);await checkBar(s);
 s=await goTo(6);await early(s,6);

 /* ---- 段階の境目と後半: 締め切りは操作量から決まり、最速でめろめろに届く ---- */
 const late=[];
 for(const n of [11,12,17,18,24,25,26,30,40]){
  s=await goTo(n);assert.equal(s.prints,n);
  near(s.tMax,s.tMaxBase+s.lastCarry,'carry is added on top at n='+n);
  assert(s.tMaxBase>=oldTime(n)-1e-9,'the limit never gets shorter than before at n='+n);
  const fit=n<35?3:Math.max(2.2,3-(n-35)*.8/25);near(s.tMaxBase,Math.max(oldTime(n),fit*s.best+4),'limit = max(old, factor x fastest + 4) at n='+n);
  assert(s.dM>=1.3*s.best+.5-.01&&s.dM>=.2*s.tMax-1e-9,'めろめろ window from the workload at n='+n);
  assert(s.dU>=2*s.best+1-.01&&s.dU>=.45*s.tMax-1e-9,'うっとり window from the workload at n='+n);
  assert(s.dM>s.best&&s.dM<=s.dU&&s.dU<=s.tMax,'best play reaches めろめろ at n='+n+' '+JSON.stringify([s.best,s.dM,s.dU,s.tMax]));
  if(n>=12)assert(s.dM>.2*s.tMax+1,'late sheets get a longer めろめろ window than the old 20% at n='+n);
  late.push(s.dM);await checkBar(s);
 }
 assert(new Set(late.map(x=>x.toFixed(3))).size>=4,'windows differ from sheet to sheet '+late);
 // 同じ段階の紙でも、つまみの目盛り数・連動で締め切りが変わる
 const same=[];for(let k=0;k<4;k++){s=await goTo(30);same.push(s.best.toFixed(2)+'/'+s.dM.toFixed(2))}
 assert(new Set(same).size>=2,'same tier, different workload, different windows '+same);
 /* ---- たくさん刷ったあと: 制限時間は最速の2.2倍+4秒まで縮む ---- */
 s=await goTo(60);
 assert(s.tMax>=s.dU&&s.dU>=s.dM&&s.dM>s.best,'n=60 order '+JSON.stringify(s));
 near(s.tMaxBase,Math.max(20,2.2*s.best+4),'n=60 uses the lower factor',1e-6);
 assert(s.tMaxBase<3*s.best+4,'n=60 is stricter than the mid game factor');

 /* ---- 実際に刷る: 締め切りの直前・直後で判定が変わる ---- */
 s=await goTo(30);await spendTo(s.dM-.3);await align();await page.click('#bPrint');
 assert.equal((await note())[0],'めろめろ！','just before the めろめろ deadline');
 assert(s.dM-.3>.2*s.tMax,'this would have been うっとり or worse before');
 await run(3000);await idle();s=await st();
 await spendTo((s.dM+s.dU)/2);await align();await page.click('#bPrint');
 assert.equal((await note())[0],'うっとり！','between the two deadlines');
 await run(3000);await idle();s=await st();
 await spendTo(Math.min(s.tMax-1,s.dU+.5));await align();await page.click('#bPrint');
 assert.equal((await note())[0],'ごろごろ！','past the うっとり deadline');
 await run(3000);await idle();

 /* ---- ミスのあとの取り返し: 新しい締め切りで うっとり以上なら連続が戻る ---- */
 s=await goTo(30);assert(s.streak>=2,'streak built up '+s.streak);const before=s.streak;
 await page.click('#bPrint');await run(400);await idle(); // ずれたまま刷る
 s=await st();assert.equal(s.streak,0);assert.equal(s.comeback,before);
 await spendTo(Math.max(.45*s.tMax+.3,(s.dM+s.dU)/2));s=await st();
 assert(s.tMax-s.tLeft<=s.dU,'still inside the new うっとり window');
 await align();await page.click('#bPrint');
 const nb=await note();assert(nb.includes(before+1+'連続に復帰！'),'comeback works with the new windows '+nb);
 await run(3000);await idle();

 /* ---- ラストチャンスは従来どおり5秒・割合のまま ---- */
 await page.evaluate(()=>window.__pz.setLives(1,true));await page.click('#bPrint');await run(400);await run(1500);await idle();
 s=await st();assert.equal(s.lastMode,true);assert.equal(s.tMax,5);near(s.dM,1,'last chance めろめろ = 20%');near(s.dU,2.25,'last chance うっとり = 45%');
 await checkBar(s);
 await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');await run(400);await run(8000);
 await page.waitForFunction(()=>!window.__pz.state().running);

 /* ---- 出る問題: ゲームごと・読み込みごとに変わる。1周するまで同じ絵は出ない ---- */
 const record=async count=>{
  const out=[];
  for(let k=0;k<count;k++){
   await idle();
   out.push(await page.evaluate(()=>{const c=window.__pz.cur();return {mi:c.va.mi,ax:c.ax.map(a=>a.p+a.t).join(','),sol:c.sol.join(',')}}));
   await page.evaluate(()=>window.__pz.setPrints(29));await align();await page.click('#bPrint');await run(3000);
  }
  return out;
 };
 await page.click('#bRetry');const g1=await record(160);
 const W=await page.evaluate(()=>window.__pz.W.length);
 assert.equal(new Set(g1.slice(0,W).map(x=>x.mi)).size,W,'every work appears once before any repeats');
 assert.equal(new Set(g1.map(x=>x.ax+'|'+x.sol)).size,g1.length,'knobs and answers change sheet to sheet');
 await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');await run(400);await run(8000);
 await page.waitForFunction(()=>!window.__pz.state().running);
 await page.click('#bRetry');const g2=await record(10);
 await page.close();page=await open();await page.click('#bStart');const g3=await record(10);
 const ids=g=>g.slice(0,10).map(x=>x.mi).join(',');
 assert.notEqual(ids(g1),ids(g2),'second game in the same page has a new order');
 assert.notEqual(ids(g1),ids(g3),'a reload has a new order');assert.notEqual(ids(g2),ids(g3));
 console.log('order game1:',ids(g1),'\norder game2:',ids(g2),'\norder reload:',ids(g3));
 console.log('sheets game1[0..2]:',JSON.stringify(g1.slice(0,3)));

 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: early limits and grade windows unchanged, late windows follow the workload (fastest play reaches めろめろ), stricter factor after many prints, carry included, real prints graded by the new deadlines, comeback, last chance unchanged, bar dividers at the real deadlines, varied questions across games and reloads.');
}
main().catch(e=>{console.error(e);process.exit(1)});
