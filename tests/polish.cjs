// 結果画面の控え・拡大表示、完成図の早送り、残り時間の警告、GRAVITY用の入口を確かめる。
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const errors=[];
 async function open(url,size){
  const page=await browser.newPage({viewport:size||{width:390,height:844},deviceScaleFactor:2});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.scoreMessages=[];window.addEventListener('message',e=>{if(e.data?.type==='gameOver')window.scoreMessages.push(e.data)})});
  await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
  await page.route('https://gbaconrice.github.io/neko-hanga/index.html',r=>r.fulfill({contentType:'text/html; charset=utf-8',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(root,'index.html'))}));
  await page.clock.install();
  await page.goto(url);
  await page.waitForFunction(()=>window.__pz?.state().artReady);
  return page;
 }
 const st=page=>page.evaluate(()=>window.__pz.state());
 const solve=async page=>{await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint')};

 const page=await open('http://127.0.0.1:4173/?debug=1&top=98');
 // タイトルの絵は動き、タップすると別の作品に替わる。
 await page.waitForFunction(()=>window.__pz.state().hero>=0);
 const h0=await page.locator('#hero canvas').evaluate(c=>c.toDataURL());
 await page.clock.runFor(900);
 assert.notEqual(await page.locator('#hero canvas').evaluate(c=>c.toDataURL()),h0,'the title cat moves');
 const heroes=new Set([(await st(page)).hero]);
 for(let i=0;i<4;i++){const before=(await st(page)).hero;await page.click('#hero');await page.waitForFunction(n=>window.__pz.state().hero!==n,before);heroes.add((await st(page)).hero)}
 assert(heroes.size>1,'tapping the title art shows another work');
 await page.click('#bStart');await page.waitForFunction(()=>!window.__pz.state().busy);
 // 最初の一枚: つまみに触れるまで時間は減らず、回す案内が出る。触れると案内が消えて時間が動く。
 assert((await st(page)).waitTouch);assert.equal(await page.locator('.tip').count(),1);
 const bar=()=>page.locator('#tbar').evaluate(e=>e.getBoundingClientRect().width);
 const full=await bar();await page.clock.runFor(3000);assert.equal(await bar(),full,'the timer waits for the first touch');
 // つまみを押している間だけ、動かない版が薄くなる。
 const kb=await page.locator('.kn .dial').first().boundingBox(),normal=await page.locator('#cv').evaluate(c=>c.toDataURL());
 await page.mouse.move(kb.x+kb.width*.8,kb.y+kb.height/2);await page.mouse.down();
 assert((await st(page)).focus.filter(Boolean).length===1);
 assert.notEqual(await page.locator('#cv').evaluate(c=>c.toDataURL()),normal,'other plates dim while a knob is held');
 await page.mouse.up();
 assert.equal((await st(page)).focus,null);assert.equal(await page.locator('.tip').count(),0);
 await page.clock.runFor(1000);assert((await bar())<full,'the timer runs after the first touch');
 // 完成の瞬間: 背景は中央から広がる。広がりきると、控えと同じ絵になる。
 await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
 await page.click('#bPrint');
 const corner=()=>page.locator('#cv').evaluate(c=>{const d=c.getContext('2d').getImageData(4,4,1,1).data;return Math.abs(d[0]-245)+Math.abs(d[1]-239)+Math.abs(d[2]-222)});
 assert((await corner())<12,'the corner is still paper when the print lands');
 await page.clock.runFor(600);
 assert((await corner())>30,'the background reaches the corner');
 await page.waitForFunction(()=>!window.__pz.state().busy);

 // 完成図: すぐのタップでは送られず、少し見せたあとはタップで次へ進む。
 await solve(page);
 await page.waitForFunction(()=>window.__pz.state().canSkip);
 await page.click('#paper');
 assert((await st(page)).revealing,'an immediate tap does not skip the finished print');
 await page.clock.fastForward(700);
 await page.click('#paper');
 assert(!(await st(page)).canSkip,'tapping the paper skips after the minimum display time');
 await page.waitForFunction(()=>!window.__pz.state().busy);
 assert.equal((await st(page)).prints,2);
 // 「刷る」でも送れ、誤ってミス扱いにならない。
 await solve(page);
 await page.waitForFunction(()=>window.__pz.state().canSkip);
 await page.clock.fastForward(700);
 await page.click('#bPrint');
 await page.waitForFunction(()=>!window.__pz.state().busy);
 let s=await st(page);assert.equal(s.prints,3);assert.equal(s.lives,3);
 // 送らなければ、決まった時間で自動的に進む。
 await solve(page);
 await page.waitForFunction(()=>!window.__pz.state().busy);
 assert.equal((await st(page)).prints,4);

 // 残り時間が少なくなると、バーが警告表示になる。次の紙で消える。
 assert.equal(await page.locator('.bar.low').count(),0);
 await page.clock.runFor(41500); // 1コマずつ進める(ゲーム内の時間は1コマ最大0.1秒)
 await page.waitForFunction(()=>document.querySelector('.bar.low'));
 assert.equal((await st(page)).lives,3,'the warning appears before the time runs out');
 await solve(page);
 await page.waitForFunction(()=>!window.__pz.state().busy);
 assert.equal(await page.locator('.bar.low').count(),0);

 // One finished work per page; cat frames keep playing while browsing.
 await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');
 await page.waitForFunction(()=>!window.__pz.state().running);
 await page.waitForFunction(()=>document.querySelector('#bookCount').textContent==='1 / 5');
 assert.equal(await page.locator('#bookCanvas').count(),1);assert.equal(await page.locator('#oGrid,#view').count(),0);
 const names=await page.evaluate(()=>window.__pz.works().map(w=>window.__pz.W[w.mi].n));
 assert((await page.locator('#bookName').textContent()).includes(names[0]));
 assert(await page.locator('#bookPrev').isDisabled());assert(!(await page.locator('#bookNext').isDisabled()));
 const f0=await page.locator('#bookCanvas').evaluate(c=>c.toDataURL());await page.clock.runFor(650);
 assert.notEqual(await page.locator('#bookCanvas').evaluate(c=>c.toDataURL()),f0,'authored cat animation plays on book page');
 await page.click('#bookNext');await page.waitForFunction(()=>window.__pz.state().bookIndex===1);
 assert((await page.locator('#bookName').textContent()).includes(names[1]));
 await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>window.__pz.state().bookIndex===0);
 const bb=await page.locator('#bookCanvas').boundingBox();
 await page.mouse.move(bb.x+bb.width*.75,bb.y+bb.height*.5);await page.mouse.down();await page.mouse.move(bb.x+bb.width*.25,bb.y+bb.height*.5,{steps:5});await page.mouse.up();
 await page.waitForFunction(()=>window.__pz.state().bookIndex===1);
 const played=(await st(page)).audioPlayed;await page.click('#bookCanvas');await page.waitForFunction(n=>window.__pz.state().audioPlayed>n,played);
 for(let i=2;i<5;i++){await page.click('#bookNext');await page.waitForFunction(n=>window.__pz.state().bookIndex===n,i)}
 assert(await page.locator('#bookNext').isDisabled());
 assert.equal(await page.locator('#bookCount').textContent(),'5 / 5');
 for(const size of [{width:390,height:844},{width:360,height:640},{width:320,height:568}]){
  await page.setViewportSize(size);await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>{const p=document.querySelector('#bookPage').getBoundingClientRect(),row=document.querySelector('#over>.row').getBoundingClientRect();return {top:p.top,bottom:p.bottom,width:p.width,row:row.bottom,nav:document.querySelector('#bookNav').getBoundingClientRect().bottom}});
  assert(layout.top>=98&&layout.width>=150&&layout.nav<=size.height&&layout.row<=size.height,'storybook fits embedded phone '+JSON.stringify({size,layout}));
 }
 await page.screenshot({path:'/workspace/scratch/animation/storybook.png'});
 assert.equal(await page.evaluate(()=>window.scoreMessages.length),1);
 assert((await st(page)).decodedWorks<=4,'decoded artwork memory is bounded');
 await page.click('#bRetry');await page.waitForFunction(()=>!window.__pz.state().busy);
 assert.equal((await st(page)).prints,0);
 await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');await page.waitForFunction(()=>!window.__pz.state().running);
 assert(await page.locator('#bookEmpty').isVisible());assert(!(await page.locator('#bookPage').isVisible()));
 await page.close();

 // GRAVITY用の入口: 5000文字未満。iframeなしで本体を展開し、そのまま遊べて得点を送る。
 assert(fs.readFileSync(path.join(root,'gravity-entry.html'),'utf8').length<5000);
 const entry=await open('http://127.0.0.1:4173/gravity-entry.html?debug=1&top=98');
 assert.equal(await entry.locator('iframe').count(),0);
 assert.equal(await entry.locator('#who').textContent(),'テスト刷り師');
 assert.equal(await entry.evaluate(()=>getComputedStyle(document.querySelector('#app')).position),'fixed','game styles are applied');
 await entry.click('#bStart');await entry.waitForFunction(()=>!window.__pz.state().busy);await solve(entry);
 await entry.waitForFunction(()=>!window.__pz.state().busy);
 await entry.evaluate(()=>window.__pz.setLives(1));await entry.click('#bPrint');
 await entry.waitForFunction(()=>window.scoreMessages.length===1);
 assert((await entry.evaluate(()=>window.scoreMessages[0].score))>0);
 await entry.close();

 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: live title art, first-touch timer and knob hint, plate focus, background bloom, reveal skip by paper/print button and auto-advance, low-time warning, storybook (one work per page, animation, replay voice, arrows, swipe, keyboard, boundaries, empty state, phone layouts), bounded decoded artwork cache, GRAVITY entry loader without iframe.');
}
main().catch(e=>{console.error(e);process.exit(1)});
