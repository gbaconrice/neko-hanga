const startWithCompanion=require('./choose-companion.cjs');
// 次の称号まで、判定の判子、連続の取り返し、弾いて回すつまみ、結果の集計と刷り上がりの束。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const errors=[];
 async function open(clock){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
  if(clock)await page.clock.install();
  await page.goto('http://127.0.0.1:4173/?debug=1&top=98');
  await page.waitForFunction(()=>window.__pz?.state().artReady);await page.evaluate(()=>window.__pz.tapGuard(0));
  await page.evaluate(()=>window.__pz.rareOff(true));
  return page;
 }
 const page=await open(true);
 const st=()=>page.evaluate(()=>window.__pz.state());
 const idle=()=>page.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
 const align=()=>page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
 const note=()=>page.locator('#toast span').textContent();
 const stamp=page.locator('#stampSlot .successPaw');
 const expectStamp=async (grade,word)=>{
  await page.clock.runFor(640); // wait for the normal reveal and the stamp animation to settle
  assert.equal(await page.locator('#paper .judge').count(),0,'the judgement never covers the art');
  assert.equal(await stamp.count(),1);
  assert.equal(await stamp.getAttribute('alt'),word);
  assert(await stamp.evaluate((el,g)=>el.classList.contains('g'+g),grade));
  assert(await stamp.evaluate(el=>el.complete&&el.naturalWidth>0));
 };
 const expectNoStamp=async()=>{
  await idle();
  assert.equal(await stamp.count(),0,'the judgement leaves with the sheet');
  assert.equal(await page.locator('#knobs').evaluate(el=>getComputedStyle(el).visibility),'visible','next sheet knobs are shown again');
 };
 const lastWork=()=>page.evaluate(()=>{const w=window.__pz.works();const x=w[w.length-1];return {tags:x.tags,pts:x.pts,thumb:!!x.thumb}});
 // 残り時間の割合が f になるまで時計を進める
 const spend=async f=>{const s=await st();await page.clock.runFor(Math.max(0,Math.round((s.tLeft-s.tMax*f)*1000)))};
 await startWithCompanion(page);await idle();
 // 最初の一枚は、つまみに触れるまで時間が減らない。1回触れて時間を動かす。
 const k0=await page.locator('.kn .dial').first().boundingBox();
 await page.mouse.move(k0.x+k0.width*.8,k0.y+k0.height/2);await page.mouse.down();await page.mouse.up();

 // 次の称号まで: あと何枚かを出し、届いたら昇格を知らせる。
 assert.equal(await page.locator('#sheetNo').textContent(),'印刷工まで3枚');
 // 判定: 残り時間で めろめろ・うっとり・ごろごろ。判子と見どころに出る。
 await align();await page.click('#bPrint');
 assert.equal((await note()).split('　')[0],'めろめろ！');
 await expectStamp(2,'めろめろ');
 assert((await lastWork()).tags.includes('めろめろ'));assert((await lastWork()).thumb,'a small copy is kept for the result stack');
 await expectNoStamp();
 assert.equal(await page.locator('#sheetNo').textContent(),'印刷工まで2枚');
 await spend(.65);await align();await page.click('#bPrint');
 assert.equal((await note()).split('　')[0],'うっとり！');await expectStamp(1,'うっとり');
 await expectNoStamp();
 await spend(.3);await align();await page.click('#bPrint');
 const n3=await note();assert.equal(n3.split('　')[0],'ごろごろ！');assert(n3.includes('印刷工に昇格！'),'rank-up is announced '+n3);
 await expectStamp(0,'ごろごろ');
 assert(!(await lastWork()).tags.some(t=>t==='うっとり'||t==='めろめろ'));
 await idle();assert.equal(await page.locator('#sheetNo').textContent(),'刷り師まで4枚');

 // 連続の取り返し: 3連続のあとミス。「うっとり」以上で刷ると4連続に戻る。
 let s=await st();assert.equal(s.streak,3);
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 s=await st();assert.equal(s.streak,0);assert.equal(s.comeback,3);
 assert.equal(await page.locator('#combo').textContent(),'はやく刷れば4連続に戻る');assert.equal(await page.locator('#combo.back:not(.none)').count(),1);
 await page.clock.runFor(400);await align();await page.click('#bPrint');
 s=await st();assert.equal(s.streak,4,'the streak comes back');assert.equal(s.comeback,0);assert((await note()).includes('4連続に復帰！'));
 await idle();
 // 遅いと戻らない。
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 assert.equal((await st()).comeback,4);await page.clock.runFor(400);
 await spend(.3);await align();await page.click('#bPrint');
 s=await st();assert.equal(s.streak,1,'a slow print does not restore the streak');assert.equal(s.comeback,0);
 assert.equal(await page.locator('#combo.back').count(),0);
 await idle();

 // 結果: 刷った絵が1枚ずつ積み上がり、内訳が1行ずつ加算される。合計は得点と一致する。
 await page.evaluate(()=>window.__pz.setLives(1));
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 await page.waitForFunction(()=>!window.__pz.state().running);
 s=await st();const total=s.score,sum=Object.values(s.tally).reduce((a,b)=>a+b,0);
 assert.equal(sum,total,'the breakdown adds up to the score '+JSON.stringify(s.tally));assert(!s.tallyDone);
 assert.equal(await page.locator('#stack i canvas').count(),5,'one card per finished print');
 assert.equal(await page.locator('#bookSheet').evaluate(e=>e.style.opacity),'0');
 assert.equal(await page.locator('#oTally').textContent(),'きほん+'+s.tally.base);
 await page.clock.runFor(330);assert.equal(Number(await page.locator('#oNum').textContent()),s.tally.base,'the score climbs line by line');
 await page.clock.runFor(100);assert.equal(await page.locator('#oTally').textContent(),'はやさ+'+s.tally.time);
 await page.clock.runFor(4000);
 s=await st();assert(s.tallyDone);assert.equal(Number(await page.locator('#oNum').textContent()),total);assert.equal(await page.locator('#oTally').textContent(),'');
 assert.equal(await page.locator('#stack').count(),0,'the stack turns into the book');assert.equal(await page.locator('#bookSheet').evaluate(e=>e.style.opacity),'');
 // 2回目: 集計はタップで飛ばせる。もう一度あそぶと束は残らない。
 await page.click('#bRetry');await idle();
 for(let i=0;i<2;i++){await align();await page.click('#bPrint');await idle()}
 await page.evaluate(()=>window.__pz.setLives(1));await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 await page.waitForFunction(()=>!window.__pz.state().running);
 assert(!(await st()).tallyDone);await page.click('#oNum');
 s=await st();assert(s.tallyDone,'a tap skips the tally');assert.equal(Number(await page.locator('#oNum').textContent()),s.score);
 assert((await page.locator('#oCompare').textContent()).includes('前回より'));
 await page.click('#bRetry');await idle();assert.equal(await page.locator('#stack').count(),0);

 // 小さい画面: 本物の肉球印と完成絵・操作が重ならないこと。
 await page.evaluate(()=>history.replaceState(null,'','?debug=1&top=74'));
 await page.setViewportSize({width:320,height:568});
 await page.clock.runFor(100);
 const fit=await page.evaluate(()=>{
  const e=document.querySelector('#sheetNo');e.textContent='国宝まで10枚';
  return {right:e.getBoundingClientRect().right,score:document.querySelector('.hud .count').getBoundingClientRect().left};
 });
 assert(fit.right<=fit.score,'the rank goal does not touch the score '+JSON.stringify(fit));
 await align();await page.click('#bPrint');await expectStamp(2,'めろめろ');
 const layout=await stamp.evaluate(el=>{
  const r=el.getBoundingClientRect(),paper=document.querySelector('#paper').getBoundingClientRect(),btn=document.querySelector('#bPrint').getBoundingClientRect();
  return {w:r.width,left:r.left,right:r.right,top:r.top,bottom:r.bottom,paperBottom:paper.bottom,buttonTop:btn.top,
   viewportW:innerWidth,viewportH:innerHeight,knobs:getComputedStyle(document.querySelector('#knobs')).visibility};
 });
 assert(layout.left>=0&&layout.right<=layout.viewportW&&layout.top>=0&&layout.bottom<=layout.viewportH&&layout.w>=54,
  'the actual grade stamp fits the viewport '+JSON.stringify(layout));
 assert(layout.top>=layout.paperBottom&&layout.bottom<=layout.buttonTop&&layout.knobs==='hidden',
  'the stamp stays out of art and print controls '+JSON.stringify(layout));
 await expectNoStamp();
 await page.close();

 // 弾いて回す: 速く回して離すと、勢いで先まで回って止まる。(実時間で確かめる)
 const real=await open(false);
 await startWithCompanion(real);await real.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
 await real.evaluate(()=>{window.__pz.cur().v[0]=0});
 const d=await real.locator('.kn .dial').first().boundingBox(),cx=d.x+d.width/2,cy=d.y+d.height/2,r=d.width*.42;
 const at=a=>[cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180)];
 await real.mouse.move(...at(-90));await real.mouse.down();
 for(const a of [-75,-60,-45,-30,-15,0])await real.mouse.move(...at(a));
 const dragged=await real.evaluate(()=>window.__pz.cur().v[0]);
 await real.mouse.up();
 assert.equal(dragged,3,'the drag itself turns three steps');
 await real.waitForFunction(()=>window.__pz.state().spinning===0,null,{timeout:5000});
 const spun=await real.evaluate(()=>window.__pz.cur().v[0]);
 assert(spun>=dragged+2,'a flick keeps turning after release '+dragged+' -> '+spun);
 assert.equal(await real.locator('.kn .dial').first().evaluate(e=>e.classList.contains('ease')),true,'it snaps to a step');
 // 触ると止まる。ゆっくり回して止めてから離すと、勢いは付かない。
 await real.evaluate(()=>{window.__pz.cur().v[0]=0});
 await real.mouse.move(...at(-90));await real.mouse.down();
 for(const a of [-75,-60,-45,-30])await real.mouse.move(...at(a));
 await real.waitForTimeout(150);await real.mouse.up();await real.waitForTimeout(400);
 assert.equal(await real.evaluate(()=>window.__pz.cur().v[0]),2,'no flick after a pause');
 await real.close();

 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: next-rank goal and rank-up notice, three judgement grades with stamps, streak comeback (fast only), result tally (line by line, adds up, tap to skip), stack of finished prints, small screen fit, knob flick with inertia.');
}
main().catch(e=>{console.error(e);process.exit(1)});
