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
 const lastWork=()=>page.evaluate(()=>{const w=window.__pz.works();const x=w[w.length-1];return {tags:x.tags,pts:x.pts,thumb:!!x.thumb}});
 // 残り時間の割合が f になるまで時計を進める
 const spend=async f=>{const s=await st();await page.clock.runFor(Math.max(0,Math.round((s.tLeft-s.tMax*f)*1000)))};
 await page.click('#bStart');await idle();
 // 最初の一枚は、つまみに触れるまで時間が減らない。1回触れて時間を動かす。
 const k0=await page.locator('.kn .dial').first().boundingBox();
 await page.mouse.move(k0.x+k0.width*.8,k0.y+k0.height/2);await page.mouse.down();await page.mouse.up();

 // 次の称号まで: あと何枚かを出し、届いたら昇格を知らせる。
 assert.equal(await page.locator('#sheetNo').textContent(),'印刷工まで3枚');
 // 判定: 残り時間で 神速・はやい・ぴったり。判子と見どころに出る。
 await align();await page.click('#bPrint');
 assert.equal((await note()).split('　')[0],'神速！');
 await page.clock.runFor(340);assert.equal(await page.locator('#paper .judge.g2').textContent(),'神速');
 assert((await lastWork()).tags.includes('神速'));assert((await lastWork()).thumb,'a small copy is kept for the result stack');
 await idle();assert.equal(await page.locator('#paper .judge').count(),0,'the stamp leaves with the sheet');
 assert.equal(await page.locator('#sheetNo').textContent(),'印刷工まで2枚');
 await spend(.65);await align();await page.click('#bPrint');
 assert.equal((await note()).split('　')[0],'はやい！');await page.clock.runFor(340);assert.equal(await page.locator('#paper .judge.g1').count(),1);
 await idle();
 await spend(.3);await align();await page.click('#bPrint');
 const n3=await note();assert.equal(n3.split('　')[0],'ぴったり！');assert(n3.includes('印刷工に昇格！'),'rank-up is announced '+n3);
 await page.clock.runFor(340);assert.equal(await page.locator('#paper .judge.g0').count(),1);
 assert(!(await lastWork()).tags.some(t=>t==='はやい'||t==='神速'));
 await idle();assert.equal(await page.locator('#sheetNo').textContent(),'刷り師まで4枚');

 // 連続の取り返し: 3連続のあとミス。「はやい」以上で刷ると4連続に戻る。
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

 // 小さい画面: いちばん長い称号の表示がスコアに重ならず、判子が紙の中に収まる。
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(100);
 const fit=await page.evaluate(()=>{const e=document.querySelector('#sheetNo');e.textContent='国宝まで10枚';const r=e.getBoundingClientRect(),m=document.querySelector('.hud .count').getBoundingClientRect();
  const p=document.querySelector('#paper'),j=document.createElement('i');j.className='judge g2';j.textContent='ぴったり';j.style.animation='none';p.appendChild(j);const a=j.getBoundingClientRect(),b=p.getBoundingClientRect();j.remove();
  return {right:r.right,score:m.left,jw:a.width,in:a.left>=b.left&&a.right<=b.right+1&&a.top>=b.top-1,clip:j.scrollWidth>j.clientWidth+1}});
 assert(fit.right<=fit.score,'the rank goal does not touch the score '+JSON.stringify(fit));assert(fit.in&&!fit.clip&&fit.jw>=28,'the stamp fits the paper and its text fits the stamp '+JSON.stringify(fit));
 await page.close();

 // 弾いて回す: 速く回して離すと、勢いで先まで回って止まる。(実時間で確かめる)
 const real=await open(false);
 await real.click('#bStart');await real.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
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
