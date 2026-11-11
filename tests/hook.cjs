// 中毒性の仕掛け: ラストチャンス、フィーバー、惜しい表示、刷った手ごたえ、★特色のくじ感、前回との比較。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const errors=[];
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.scoreMessages=[];window.addEventListener('message',e=>{if(e.data?.type==='gameOver')window.scoreMessages.push(e.data)})});
 await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
 await page.clock.install();
 await page.goto('http://127.0.0.1:4173/?debug=1&top=98');
 await page.waitForFunction(()=>window.__pz?.state().artReady);await page.evaluate(()=>window.__pz.tapGuard(0));
 const st=()=>page.evaluate(()=>window.__pz.state());
 const idle=()=>page.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
 const align=()=>page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
 const toast=()=>page.locator('#toast').textContent();
 await page.evaluate(()=>window.__pz.rareOff(true)); // ★特色のランダム出現を止める(★の確認は forceSp で行う)
 await page.click('#bStart');await idle();

 // つまみの音は、合う位置に近づくほど高くなる。
 const tick=await page.evaluate(()=>{const c=window.__pz.cur();return {sol:c.sol[0]}});
 const kb=await page.locator('.kn .dial').first().boundingBox(),dir=tick.sol>0?.8:.2,pitches=[];
 for(let i=0;i<Math.abs(tick.sol);i++){await page.mouse.move(kb.x+kb.width*dir,kb.y+kb.height/2);await page.mouse.down();await page.mouse.up();pitches.push((await st()).lastTick)}
 assert(pitches.length>=1);for(let i=1;i<pitches.length;i++)assert(pitches[i]>=pitches[i-1],'pitch rises toward alignment '+pitches);
 assert.equal(pitches[pitches.length-1],1000+4*230,'the aligned click is the highest');
 // 回帰: 7目盛り離れた所からでも、1目盛り近づくたびに必ず高くなる(遠い範囲で上下しない)。
 await page.evaluate(()=>{const c=window.__pz.cur();c.v[0]=c.sol[0]+7});
 const far=[];
 for(let i=0;i<7;i++){await page.mouse.move(kb.x+kb.width*.2,kb.y+kb.height/2);await page.mouse.down();await page.mouse.up();far.push((await st()).lastTick)}
 for(let i=1;i<far.length;i++)assert(far[i]>far[i-1],'pitch rises on every step from far away '+far.map(Math.round));
 assert.equal(far[far.length-1],1000+4*230);

 // 惜しい表示: 1目盛りだけずれていたら「あと1目盛り！」。
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice();c.v[c.v.length-1]+=1});
 await page.click('#bPrint');assert.equal(await toast(),'あと1目盛り！');
 await page.clock.runFor(400);
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+1)});
 if((await page.evaluate(()=>window.__pz.cur().v.length))>1){await page.click('#bPrint');assert.equal(await toast(),'おしい！ あと少し')}
 else{await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');assert.equal(await toast(),'まだずれています')}
 await page.clock.runFor(400);
 await page.evaluate(()=>window.__pz.setLives(3,true));

 // 刷った手ごたえ: 揺れと、得点が飛ぶ。
 await align();await page.click('#bPrint');
 assert.equal(await page.locator('.fly').count(),1,'the points fly from the notice to the score');
 assert.equal(await page.locator('.stage.hit').count(),0);await page.clock.runFor(330);
 assert.equal(await page.locator('.stage.hit').count(),1,'the stage shakes when the ink lands');
 await page.clock.runFor(700);assert.equal(await page.locator('.fly').count(),0);
 await idle();

 // フィーバー: 5枚続けて刷るとたまり、次の3枚は得点2倍。ミスで終わる。
 assert.equal(await page.locator('#fever i.on').count(),1);
 for(let i=0;i<4;i++){await align();await page.click('#bPrint');await idle()}
 let s=await st();assert.equal(s.fever,3,'fever starts after five prints in a row');
 assert.equal(await page.locator('#fever').textContent(),'×2 残り3枚');assert(!(await page.locator('#sheetNo').isVisible()));assert.equal(await page.locator('#paper.fever').count(),1);
 await align();await page.click('#bPrint');
 assert(await page.locator('.roller.rainbow').count()===1,'the roller is rainbow during fever');
 // 回帰: フィーバー中も紙送りのアニメーションが動く(光の指定に上書きされない)。光は紙の上に重ねて出し続ける。
 await page.waitForFunction(()=>document.querySelector('#paper').classList.contains('pout'));
 let an=await page.evaluate(()=>{const p=document.querySelector('#paper');return {cls:p.className,paper:getComputedStyle(p).animationName,glow:getComputedStyle(p,'::before').animationName}});
 assert.equal(an.paper,'pout','the sheet slides out during fever '+JSON.stringify(an));assert.equal(an.glow,'feverGlow','the fever glow keeps running '+JSON.stringify(an));
 await page.waitForFunction(()=>document.querySelector('#paper').classList.contains('pin'));
 an=await page.evaluate(()=>{const p=document.querySelector('#paper');return {paper:getComputedStyle(p).animationName,glow:getComputedStyle(p,'::before').animationName}});
 assert.equal(an.paper,'pin','the next sheet slides in during fever '+JSON.stringify(an));assert.equal(an.glow,'feverGlow');
 assert((await toast()).includes('フィーバー×2'));
 const fw=await page.evaluate(()=>{const w=window.__pz.works();return w[w.length-1]});assert(fw.tags.includes('フィーバー'));
 await idle();assert.equal((await st()).fever,2);
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 s=await st();assert.equal(s.fever,0,'a miss ends fever');assert.equal(s.feverGauge,0);assert.equal(await page.locator('#paper.fever').count(),0);
 await page.clock.runFor(400);

 // ★特色: プレイ中は普通の色で、刷った瞬間に金色のローラーと光で分かる。
 await align();await page.evaluate(()=>window.__pz.forceSp(1));await page.click('#bPrint');await idle();
 s=await st();assert.equal(s.spHide,1,'the special print is hidden while playing');
 assert.equal(await page.evaluate(()=>window.__pz.cur().va.sp),0);
 const inks=await page.evaluate(()=>window.__pz.cur().cols.join());
 await align();await page.click('#bPrint');
 assert.equal(await page.locator('.roller.gold').count(),1,'a golden roller');
 assert((await toast()).includes('★'));
 const last=await page.evaluate(()=>{const w=window.__pz.works();return w[w.length-1].sp});assert.equal(last,1,'the work is recorded as special');
 await page.clock.runFor(500);assert.equal((await st()).roll<1,true,'the golden roller is slower');
 await page.clock.runFor(300);assert.equal(await page.locator('#paper .flash').count(),1,'a golden flash when the print lands');
 await idle();
 assert(inks.length>0);
 assert.equal(await page.locator('#paper .flash').count(),0);
 // 回帰: ★特色は金色のローラーが通り終わるまで早送りできず、光が次の紙の上に出ない。
 await align();await page.evaluate(()=>window.__pz.forceSp(2));await page.click('#bPrint');await idle();
 const spSheet=await page.evaluate(()=>window.__pz.cur().va.mi);
 await align();await page.click('#bPrint');await page.waitForFunction(()=>window.__pz.state().canSkip);
 // 早送りできる最短の時間(600ミリ秒)は過ぎたが、金色のローラー(714ミリ秒)はまだ通っている所でタップする。
 while((await st()).revealAge<610)await page.clock.runFor(10);
 // クリック操作には実時間がかかるので、タップと確認をページの中で一度に行う。
 const early=await page.evaluate(()=>{const b=window.__pz.state();document.querySelector('#paper').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));const a=window.__pz.state();
  return {age:b.revealAge,rollMs:b.rollMs,roll:b.roll,revealing:a.revealing,canSkip:a.canSkip}});
 assert(early.rollMs>700&&early.age>=600&&early.age<early.rollMs&&early.roll<1,'the tap lands after 600ms while the golden roller is still crossing '+JSON.stringify(early));
 assert(early.revealing&&early.canSkip,'a tap cannot skip while the golden roller is still crossing '+JSON.stringify(early));
 while((await st()).revealAge<760)await page.clock.runFor(10);
 assert.equal(await page.locator('#paper .flash').count(),1,'the flash belongs to the special sheet');
 await page.click('#paper');assert(!(await st()).canSkip,'the tap skips once the roller has passed');
 await idle();
 assert.notEqual(await page.evaluate(()=>window.__pz.cur().va.mi),spSheet);
 assert.equal(await page.locator('#paper .flash').count(),0,'no flash leaks onto the next sheet');

 // ラストチャンス: 肉球がなくなると1回だけ、5秒の1色の紙。刷れたら肉球1つで復活。
 await page.evaluate(()=>window.__pz.setLives(1,true));
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 await page.clock.runFor(350);
 s=await st();assert(s.running,'the game continues');assert(s.lastMode);assert.equal(s.lives,0);
 assert(await page.locator('#lastBanner').isVisible());assert.equal(await page.locator('#game.lastMode').count(),1);
 await page.clock.runFor(1200);await idle();
 s=await st();assert(!(await page.locator('#lastBanner').isVisible()));assert.equal(s.tMax,5);
 assert.equal(await page.evaluate(()=>window.__pz.cur().ax.length),2,'one plate, no rotation');
 assert.equal(await page.locator('#hint').textContent(),'刷れたら復活。時間は5秒です');
 await align();await page.click('#bPrint');
 s=await st();assert.equal(s.lives,1);assert(!s.lastMode);assert((await page.locator('#toast span').textContent()).startsWith('復活！'));
 assert.equal(await page.locator('#game.lastMode').count(),0);
 await idle();
 // 2回目はない。
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.map(x=>x+3)});await page.click('#bPrint');
 await page.waitForFunction(()=>!window.__pz.state().running);
 await page.clock.runFor(5000);
 assert.equal(await page.locator('#oCompare').textContent(),'','no comparison on the first game');
 const first=(await st()).score;
 assert.equal(await page.evaluate(()=>window.scoreMessages.length),1);

 // 2回目: ラストチャンスを時間切れで逃すと終わる。結果には前回との比較が出る。
 await page.click('#bRetry');await idle();
 await page.evaluate(()=>window.__pz.setLives(1,true));
 await page.clock.runFor(Math.round(((await st()).tLeft+.6)*1000));
 await page.waitForFunction(()=>window.__pz.state().lastMode);
 await page.clock.runFor(1300);await idle();
 await page.clock.runFor(5600);
 await page.waitForFunction(()=>!window.__pz.state().running);
 const second=(await st()).score;
 await page.clock.runFor(5000); // 集計が終わると、前回との比較が出る
 const cmp=await page.locator('#oCompare').textContent();
 assert(cmp.includes('前回より')&&cmp.includes('ベストまであと'+(first-second)+'点'),'comparison with the previous game '+cmp);
 assert.equal((await st()).sessionBest,first);

 // 小さい画面: ラストチャンスの予告とフィーバーの表示が収まる。
 await page.setViewportSize({width:320,height:568});
 await page.click('#bRetry');await idle();
 const fit=await page.evaluate(()=>{const b=document.querySelector('#lastBanner');b.classList.remove('show');b.hidden=false;const r=b.getBoundingClientRect();b.hidden=true;
  document.querySelector('#sheetNo').hidden=true;const f=document.querySelector('#fever');f.classList.add('on');f.textContent='×2 残り3枚';const q=f.getBoundingClientRect(),side=document.querySelector('.hud .mid').getBoundingClientRect();return {l:r.left,r:r.right,w:innerWidth,fr:q.right,mid:side.left}});
 assert(fit.l>=0&&fit.r<=fit.w,'the last-chance banner fits '+JSON.stringify(fit));
 assert(fit.fr<=fit.mid+4,'the fever label does not run into the score '+JSON.stringify(fit));
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: rising knob pitch, near-miss messages, shake and flying points, fever (gauge, x2, rainbow roller, ends on miss), hidden special print revealed by golden roller and flash (no early skip, no leak onto the next sheet), fever keeps sheet transitions, monotonic pitch from far away, last chance (banner, 5s one-plate sheet, revive once, timeout ends), comparison with the previous game, small screen fit.');
}
main().catch(e=>{console.error(e);process.exit(1)});
