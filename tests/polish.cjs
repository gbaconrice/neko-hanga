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
  await page.waitForFunction(()=>window.__pz?.state().artReady);await page.evaluate(()=>window.__pz.tapGuard(0));
  return page;
 }
 const st=page=>page.evaluate(()=>window.__pz.state());
 const solve=async page=>{await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint')};

 const page=await open('http://127.0.0.1:4173/?debug=1&top=98');
 // 題字は1文字ずつ左から現れ、最後に肉球の判子が出る。説明は文章で読める。
 assert.equal(await page.locator('#logo.play span').count(),4);
 const delays=await page.locator('#logo span').evaluateAll(els=>els.map(e=>parseFloat(getComputedStyle(e).animationDelay)));
 assert(delays.every((d,i)=>i===0||d>delays[i-1]),'letters appear left to right '+delays);
 assert((await page.locator('#stamp').evaluate(e=>parseFloat(getComputedStyle(e).animationDelay)))>delays[3],'the stamp lands last');
 assert.equal(await page.locator('#logo').getAttribute('aria-label'),'ねこ版画');
 const how=await page.locator('.how li').allTextContents();assert.equal(how.length,3);assert(how.every(s=>s.endsWith('。')),'rules are full sentences');
 assert.equal(await page.evaluate(()=>document.fonts.check('900 20px NekoMaru','ねこ版画刷る')),true,'the rounded font is embedded');
 // タイトルの絵は動く。タップしても別の作品には替わらず、鳴かない。
 await page.waitForFunction(()=>window.__pz.state().hero>=0);
 const h0=await page.locator('#hero canvas').evaluate(c=>c.toDataURL());
 await page.clock.runFor(900);
 assert.notEqual(await page.locator('#hero canvas').evaluate(c=>c.toDataURL()),h0,'the title cat moves');
 const heroBefore=await st(page);
 for(let i=0;i<3;i++){await page.click('#hero');await page.clock.runFor(200)}
 const heroAfter=await st(page);
 assert.equal(heroAfter.hero,heroBefore.hero,'tapping the title art keeps the same work');assert.equal(heroAfter.audioPlayed,heroBefore.audioPlayed,'the title art stays quiet');
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
 // 版が合うと、つまみとトンボが反応する。「刷る」は光らせない。合うまでは反応しない。
 assert.equal(await page.locator('.kn.locked,#paper.aligned').count(),0);
 assert.equal(await page.locator('#sheetNo').textContent(),'印刷工まで3枚');assert.equal(await page.locator('#combo.none').count(),1);
 const knobs=await page.evaluate(()=>{const c=window.__pz.cur();return c.sol.map((s,i)=>s-c.v[i])});
 for(let j=0;j<knobs.length;j++){const b=await page.locator('.kn .dial').nth(j).boundingBox();
  for(let n=0;n<Math.abs(knobs[j]);n++){await page.mouse.move(b.x+b.width*(knobs[j]>0?.8:.2),b.y+b.height/2);await page.mouse.down();await page.mouse.up()}}
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#bPrint')).animationName),'none','the print button does not light up');
 const mv=await st(page),neat=mv.moves===mv.minMoves;assert(mv.moves>=mv.minMoves&&mv.minMoves>0);
 assert.equal(await page.locator('.kn.locked').count(),knobs.length);assert.equal(await page.locator('#paper.aligned').count(),1);
 assert((await page.locator('#paper .lk').count())>=4,'rings pulse on the registration marks');
 // 完成の瞬間: ローラーが左から通り、通った所から完成図に替わる。
 await page.click('#bPrint');
 assert.equal(await page.locator('#toast b').textContent().then(s=>/^\+\d+$/.test(s)),true,'the gained points are shown large');
 assert.equal(await page.locator('#combo').textContent(),'1連続中　次の得点 ×1.1');
 assert.equal((await page.locator('#toast').textContent()).includes('むだなし'),neat,'the neat bonus needs the fewest steps');
 assert.equal(await page.evaluate(()=>window.__pz.works()[0].tags.includes('むだなし')),neat);
 // ローラーは左から通るので、最後に替わる右上の隅で確かめる
 const corner=()=>page.locator('#cv').evaluate(c=>{const d=c.getContext('2d').getImageData(c.width-5,4,1,1).data;return Math.abs(d[0]-245)+Math.abs(d[1]-239)+Math.abs(d[2]-222)});
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
 const lim=await st(page);assert(lim.baseTime<45&&lim.baseTime>=38,'the base time limit shrinks as sheets go by (carried time is added on top) '+lim.baseTime);
 await page.clock.runFor(Math.round((lim.tLeft-3.5)*1000)); // 1コマずつ進める(ゲーム内の時間は1コマ最大0.1秒)
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
 // 絵をタップすると動きを最初から見直せる。鳴き声は出さない。
 const played=(await st(page)).audioPlayed;await page.click('#bookCanvas');await page.clock.runFor(300);
 assert.equal((await st(page)).audioPlayed,played,'tapping a page stays quiet');
 assert.equal(await page.locator('#over .lbl').count(),0,'no heading label on the result');
 assert.equal(await page.locator('#oPrints').textContent(),'5枚');
 // ページには加点と見どころが出て、いちばん高得点の1枚にだけ札が付く。
 assert(/^\+\d+点$/.test(await page.locator('#bookPts').textContent()));
 const bestAt=await page.evaluate(()=>{const w=window.__pz.works();let b=0;w.forEach((x,i)=>{if(x.pts>w[b].pts)b=i});return b});
 assert.equal(await page.locator('#bookBest').isVisible(),(await st(page)).bookIndex===bestAt);assert((await page.locator('#oRank').textContent()).length>0);
 for(let i=2;i<5;i++){await page.click('#bookNext');await page.waitForFunction(n=>window.__pz.state().bookIndex===n,i)}
 assert(await page.locator('#bookNext').isDisabled());
 assert.equal(await page.locator('#bookCount').textContent(),'5 / 5');
 for(const size of [{width:390,height:844},{width:360,height:640},{width:320,height:568}]){
  await page.setViewportSize(size);await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>{const p=document.querySelector('#bookPage').getBoundingClientRect(),row=document.querySelector('#over>.row').getBoundingClientRect();return {top:p.top,bottom:p.bottom,width:p.width,row:row.bottom,nav:document.querySelector('#bookFoot').getBoundingClientRect().bottom,arrow:document.querySelector('#bookNext').getBoundingClientRect().width}});
  assert(layout.top>=98&&layout.width>=150&&layout.nav<=layout.row&&layout.arrow>=40&&layout.row<=size.height,'storybook fits embedded phone '+JSON.stringify({size,layout}));
 }
 await page.screenshot({path:'/workspace/scratch/animation/storybook.png'});
 assert.equal(await page.evaluate(()=>window.scoreMessages.length),1);
 assert((await st(page)).decodedWorks<=4,'decoded artwork memory is bounded');
 await page.click('#bRetry');await page.waitForFunction(()=>!window.__pz.state().busy);
 assert.equal((await st(page)).prints,0);
 await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');await page.waitForFunction(()=>!window.__pz.state().running);
 assert(await page.locator('#bookEmpty').isVisible());assert(!(await page.locator('#bookPage').isVisible()));
 await page.close();

 // 動作確認: 題字を5回タップで開き、項目が並ぶ。
 const chk=await open('http://127.0.0.1:4173/?debug=1&top=98');
 assert.equal(await chk.locator('#check.on').count(),0);
 for(let i=0;i<5;i++)await chk.click('#logo');
 assert.equal(await chk.locator('#check.on').count(),1);
 const items=await chk.locator('#checkList dt').allTextContents();
 assert(['GRAVITYの中','SDK','名前','上の余白','音'].every(k=>items.includes(k)),'check items '+items);
 assert((await chk.locator('#checkList').textContent()).includes('98px'));
 await chk.click('#checkClose');assert.equal(await chk.locator('#check.on').count(),0);
 // 途中で閉じると、その時点の得点を送る。終了時は、より高いときだけ送り直す。
 await chk.click('#bStart');await chk.waitForFunction(()=>!window.__pz.state().busy);
 await chk.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await chk.click('#bPrint');await chk.waitForFunction(()=>!window.__pz.state().busy);
 await chk.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 const mid=await chk.evaluate(()=>window.scoreMessages.map(m=>m.score));assert.equal(mid.length,1);assert.equal(mid[0],(await st(chk)).score);
 await chk.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await chk.evaluate(()=>window.scoreMessages.length),1,'the same score is not sent twice');
 await chk.evaluate(()=>window.__pz.setLives(1));await chk.click('#bPrint');await chk.waitForFunction(()=>!window.__pz.state().running);
 assert.equal(await chk.evaluate(()=>window.scoreMessages.length),1,'game over does not resend an unchanged score');
 await chk.close();

 // 回帰: 成功→失敗→成功で、連続倍率の表示が同じ文言でも再び現れる。
 const combo=await open('http://127.0.0.1:4173/?debug=1&top=98');
 await combo.click('#bStart');await combo.waitForFunction(()=>!window.__pz.state().busy);
 const comboState=()=>combo.locator('#combo').evaluate(e=>({hidden:e.classList.contains('none'),text:e.textContent,opacity:getComputedStyle(e).opacity}));
 assert((await comboState()).hidden,'no multiplier before the first print');
 await solve(combo);await combo.waitForFunction(()=>!window.__pz.state().busy);
 let cs=await comboState();assert(!cs.hidden);assert.equal(cs.text,'1連続中　次の得点 ×1.1');
 await combo.click('#bPrint');await combo.waitForFunction(()=>{const s=window.__pz.state();return s.lives===2&&!s.busy});
 assert((await comboState()).hidden,'a miss hides the multiplier');
 await solve(combo);await combo.waitForFunction(()=>!window.__pz.state().busy);
 cs=await comboState();assert.equal((await st(combo)).streak,1);
 assert(!cs.hidden,'the multiplier shows again after success, miss, success '+JSON.stringify(cs));assert.equal(cs.text,'1連続中　次の得点 ×1.1');
 await combo.clock.runFor(400);assert.equal((await comboState()).opacity,'1');
 await combo.close();

 // GRAVITY用の入口: 5000文字未満。iframeなしで本体を展開し、そのまま遊べて得点を送る。
 // フォントのライセンス: 配布するHTMLに著作権表記とOFL全文が入り、fonts/OFL.txt と一致する。
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),ofl=fs.readFileSync(path.join(root,'fonts/OFL.txt'),'utf8').replace(/\r\n/g,'\n').trim();
 const fontBlock=html.match(/\/\* FONT_START \*\/([\s\S]*?)\/\* FONT_END \*\//)[1];
 assert(fontBlock.includes(ofl),'index.html carries the full OFL text');
 assert(ofl.startsWith('Copyright 2021 The Zen Maru Gothic Project Authors')&&ofl.includes('SIL OPEN FONT LICENSE Version 1.1'));
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
 console.log('PASS: combo label after success-miss-success, font license notice in HTML, logo reveal and stamp, sentence rules, embedded rounded font, quiet title art, plate lock and ready feedback, first-touch timer and knob hint, plate focus, background bloom, reveal skip by paper/print button and auto-advance, low-time warning, storybook (one work per page, animation, replay voice, arrows, swipe, keyboard, boundaries, empty state, phone layouts), bounded decoded artwork cache, GRAVITY entry loader without iframe.');
}
main().catch(e=>{console.error(e);process.exit(1)});
