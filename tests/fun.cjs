// 楽しさの追加分: ローラー、ヤレ紙、時間の持ち越し、オルゴールのBGM。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const errors=[];
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
 await page.clock.install();
 await page.goto('http://127.0.0.1:4173/?debug=1&top=98');
 await page.waitForFunction(()=>window.__pz?.state().artReady);
 const st=()=>page.evaluate(()=>window.__pz.state());
 const idle=()=>page.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
 const align=()=>page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});

 await page.click('#bStart');await idle();

 // 11. オルゴールが鳴り始める。
 await page.clock.runFor(300);
 let s=await st();assert(s.music,'music box starts with the game');assert(s.musicNotes>0,'notes are scheduled');

 // 1. ローラー: 刷った直後は左から完成図に替わり、右はまだ合わせた版のまま。
 await align();
 const px=await page.locator('#cv').evaluate(c=>c.width);
 const pick=x=>page.locator('#cv').evaluate((c,x)=>{const d=c.getContext('2d').getImageData(x,Math.round(c.height*.03),1,1).data;return Math.abs(d[0]-245)+Math.abs(d[1]-239)+Math.abs(d[2]-222)},x);
 await page.click('#bPrint');
 assert.equal(await page.locator('#paper .roller').count(),1,'a roller crosses the paper');
 await page.clock.runFor(190);
 s=await st();assert(s.roll>0&&s.roll<1,'the roller is midway '+s.roll);
 assert((await pick(Math.round(px*.04)))>30,'the left side already shows the finished art');
 assert((await pick(Math.round(px*.96)))<12,'the right side is still the plain plate');
 await page.clock.runFor(400);
 assert.equal((await st()).roll,1);assert.equal(await page.locator('#paper .roller').count(),0,'the roller leaves');
 assert((await pick(Math.round(px*.96)))>30,'the whole sheet is finished');
 // 4. 早く刷ると、残り時間の一部が次の紙へ持ち越される。
 const carried=(await st()).carry;assert(carried>0&&carried<=6,'some time is carried '+carried);
 await idle();
 s=await st();assert.equal(s.lastCarry,carried);assert(Math.abs(s.tMax-(s.baseTime+carried))<1e-9);assert(s.tLeft>s.baseTime,'the next sheet starts with extra time');
 assert.equal(await page.locator('#carry').textContent(),'+'+carried.toFixed(1)+'秒');
 // 音を切るとBGMが止まり、戻すとまた鳴る。
 await idle();
 await page.click('#mute');assert(!(await st()).music,'mute stops the music');
 await page.click('#mute');await page.clock.runFor(200);assert((await st()).music,'unmute restarts the music');
 // 2. ずれたまま刷ると、紙を丸めて捨てる。下の紙はそのまま残り、続けて合わせられる。持ち越しは消える。
 const sheet=await page.evaluate(()=>window.__pz.cur().va.mi);
 await page.click('#bPrint');
 assert.equal(await page.locator('#stage .yare canvas').count(),1,'the misprint is crumpled');
 s=await st();assert.equal(s.lives,2);assert.equal(s.carry,0);
 await page.clock.runFor(800);
 assert.equal(await page.locator('#stage .yare').count(),0,'the crumpled sheet is thrown away');
 assert.equal(await page.evaluate(()=>window.__pz.cur().va.mi),sheet,'the same sheet stays to fix');
 assert.equal(await page.locator('#paper').evaluate(e=>getComputedStyle(e).opacity),'1');
 // 時間切れも丸めて捨て、次の紙は持ち越しなしで始まる。
 await page.clock.runFor(Math.round(((await st()).tLeft+.5)*1000));
 await page.waitForFunction(()=>window.__pz.state().lives===1);
 assert.equal(await page.locator('#stage .yare').count(),1);
 await idle();
 s=await st();assert.equal(s.lastCarry,0);assert(!(await page.locator('#paper').evaluate(e=>e.classList.contains('gone'))),'the next sheet is visible');await page.waitForFunction(()=>getComputedStyle(document.querySelector('#paper')).opacity==='1');
 // 結果画面には音ボタンがないので、BGMは止まる。
 await page.click('#bPrint');await page.waitForFunction(()=>!window.__pz.state().running);
 assert(!(await st()).music,'the result screen is quiet');
 await page.click('#bHome');assert(!(await st()).music,'the title is quiet');
 // 小さい画面でも、持ち越しの表示が上部の余白にかからない。
 await page.setViewportSize({width:320,height:568});
 await page.click('#bStart');await idle();
 const ct=await page.evaluate(()=>{const c=document.querySelector('#carry').getBoundingClientRect();return {top:c.top,right:c.right,w:innerWidth}});
 assert(ct.top>=74&&ct.right<=ct.w,'the carried-time label fits '+JSON.stringify(ct));
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: roller wipe left to right, crumpled misprints and timeouts, carried time, music box (game only, mute/unmute, quiet result and title), small screen fit.');
}
main().catch(e=>{console.error(e);process.exit(1)});
