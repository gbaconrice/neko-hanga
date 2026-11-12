// 加点の知らせ・結果の表示が、狭い画面でも欠けず、古い値のまま残らないこと。
// 注文とむだなしは外した。おたすけは10枚ごとの記念で1つ増える。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const errors=[];
 for(const [w,h] of [[320,568],[390,844]]){
  const tag=' @'+w+'x'+h;
  const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
  await page.clock.install();
  await page.goto('http://127.0.0.1:4173/?debug=1&top=74');
  await page.waitForFunction(()=>window.__pz?.state().artReady);
  await page.evaluate(()=>{window.__pz.rareOff(true);window.__pz.tapGuard(0)}); // 連打の受け流しは tests/qa.cjs で確かめる
  const st=()=>page.evaluate(()=>window.__pz.state());
  const idle=()=>page.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
  const run=ms=>page.clock.runFor(ms);
  // ぴったり合わせて刷る。wait は刷ったあとに進める時間
  const good=async(wait=3000)=>{await idle();await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint');await run(wait)};
  const end=async()=>{await idle();await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');await run(400);await run(6000)};
  const hint=()=>page.locator('#hint').textContent();
  const noOld=t=>assert(!/注文|むだなし/.test(t),'orders and the neat bonus are gone: '+t);

  /* ---- 結果: ベストと同点のとき「あと0点」を出さない ---- */
  await page.click('#bStart');await end();
  assert.equal(await page.locator('#oCompare').textContent(),'');
  await page.click('#bRetry');await end();
  assert.equal(await page.locator('#oCompare').textContent(),'前回と同じ点','a tie with the best does not say 0 points to go'+tag);

  /* ---- 注文の行は出ない。案内がない紙では空 ---- */
  await page.click('#bRetry');await idle();
  assert.equal(await hint(),'つまみを回して、＋印を重ねましょう');
  for(let i=0;i<4;i++){await good(1000);noOld(await page.locator('#toast').textContent());await run(2000)}
  await idle();
  assert.equal(await hint(),'','no order line on a sheet without a guide'+tag);
  /* ---- おたすけは5枚刷るごとに1つ増える(上限3)。記念の加点は10枚ごと ---- */
  let s=await st();assert.equal(s.prints,4);assert.equal(s.helps,1);
  await good(1000);
  let note=await page.locator('#toast span').textContent();
  assert(note.includes('おたすけ+1')&&!note.includes('枚達成'),'the fifth print gives one help '+note);noOld(note);
  assert.equal((await st()).helps,2);assert.equal(await page.locator('#hpN').textContent(),'×2','the help count is shown at once');
  // 加点の数字がスコアへ飛んだあと、札に空白が残らない
  let card=await page.evaluate(()=>{const t=document.querySelector('#toast'),b=t.querySelector('b'),sp=t.querySelector('span');return {b:getComputedStyle(b).display,gap:sp.getBoundingClientRect().top-t.getBoundingClientRect().top}});
  assert.equal(card.b,'none','the flown number leaves no blank in the notice '+JSON.stringify(card)+tag);assert(card.gap<=12,'no empty band above the notice text '+JSON.stringify(card));
  await run(2000);await idle();await page.evaluate(()=>window.__pz.setPrints(9));await good(1000);
  note=await page.locator('#toast span').textContent();
  assert(note.includes('10枚達成')&&note.includes('おたすけ+1'),'the tenth print gives the milestone and one help '+note);
  assert.equal((await st()).helps,3);
  await run(2000);await idle();await page.evaluate(()=>window.__pz.setPrints(14));await good(1000);
  note=await page.locator('#toast span').textContent();
  assert(!note.includes('おたすけ'),'no help beyond the limit '+note);assert.equal((await st()).helps,3);
  /* ---- 後半の制限時間: つまみが6つの段階は下限を上げてある ---- */
  await run(2000);await idle();
  const base=async()=>Math.round((await st()).baseTime*10)/10;
  assert.equal(await base(),32,'16th sheet (two rotations and a link)'+tag);
  await page.evaluate(()=>window.__pz.setPrints(23));await good();await idle();
  assert.equal(await base(),34,'25th sheet (scale knob)'+tag);
  await page.evaluate(()=>window.__pz.setPrints(29));await good();await idle();
  assert.equal(await base(),29,'31st sheet: the limit comes down slowly');
  await page.evaluate(()=>window.__pz.setPrints(59));await good();await idle();
  assert.equal(await base(),20,'the limit stops at 20 seconds');
  await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint');await run(1000);
  await run(2000);await end();
  // 結果: 注文の札と、注文・むだなしの集計行はない。内訳の合計は得点と同じ
  assert.equal(await page.locator('#oOrders').count(),0);
  noOld(await page.locator('#over .head').textContent());
  s=await st();assert.deepEqual(Object.keys(s.tally).sort(),['base','combo','fever','mile','sp','time']);
  assert.equal(Object.values(s.tally).reduce((a,b)=>a+b,0),s.score,'the tally adds up to the score');
  assert.equal(await page.locator('#oNum').textContent(),String(s.score));

  /* ---- 結果の絵本: 見どころが多いページでも、枚数・得点・見どころが崩れない ---- */
  const works=await page.evaluate(()=>window.__pz.works().map(x=>(x.tags||[]).length));
  const rich=works.indexOf(Math.max(...works));assert(works[rich]>=2,'a page with two highlights exists '+JSON.stringify(works));
  noOld(await page.evaluate(()=>window.__pz.works().map(x=>(x.tags||[]).join('・')).join(' ')));
  await page.evaluate(i=>window.__pz.bookTurn(i,false),rich);await run(300);
  let cap=await page.evaluate(()=>{const g=s=>{const r=document.querySelector(s).getBoundingClientRect();return {t:r.top,b:r.bottom,l:r.left,r:r.right,h:r.height}};
   const tg=document.querySelector('#bookTags');return {foot:g('#bookFoot'),cap:g('#bookFoot .cap'),name:g('#bookName'),count:g('#bookCount'),pts:g('#bookPts'),tags:g('#bookTags'),cut:tg.scrollWidth>tg.clientWidth,text:document.querySelector('#bookFoot .meta').textContent}});
  assert(cap.count.h<=20&&cap.pts.h<=20,'the page number and the points stay on one line '+JSON.stringify(cap)+tag);
  assert(cap.tags.h<=20,'the highlights stay on one line '+JSON.stringify(cap)+tag);
  assert(cap.name.t>=cap.foot.t-1&&cap.tags.b<=cap.foot.b+1,'the caption stays inside the foot of the page '+JSON.stringify(cap)+tag);
  assert(cap.count.l>=cap.cap.l-1&&cap.pts.r<=cap.cap.r+1&&cap.tags.l>=cap.cap.l-1&&cap.tags.r<=cap.cap.r+1,'the caption does not run under the page buttons '+JSON.stringify(cap)+tag);
  if(w>=390)assert.equal(cap.cut,false,'highlights are not cut on a regular phone '+cap.text);
  // 見どころが1つのページは、これまでどおり1行
  const plain=works.findIndex(n=>n===1);
  if(plain>=0){await page.evaluate(i=>window.__pz.bookTurn(i,false),plain);await run(300);
   const one=await page.evaluate(()=>{const a=document.querySelector('#bookCount').getBoundingClientRect(),b=document.querySelector('#bookTags').getBoundingClientRect();return Math.abs(a.bottom-b.bottom)});
   if(w>=390)assert(one<4,'a short caption keeps its single line');}

  /* ---- 加点の知らせ: 項目が多くても画面の外へ出ない ---- */
  await page.click('#bRetry');
  for(let i=0;i<4;i++){if(i===3)await page.evaluate(()=>window.__pz.forceSp(5));await good()}
  await idle();
  // 短い知らせは1行のまま
  await page.evaluate(()=>{window.__pz.setPrints(9);window.__pz.setLives(2,true)});
  await good(80); // 10枚目・5連続・★特色・おたすけ+1・肉球回復・フィーバーが重なる
  let t=await page.evaluate(()=>{const e=document.querySelector('#toast'),sp=e.querySelector('span'),a=e.getBoundingClientRect(),b=sp.getBoundingClientRect(),st=document.querySelector('#stage').getBoundingClientRect();
   return {box:[a.left,a.right],text:[b.left,b.right],h:b.height,stage:[st.left,st.right],msg:sp.textContent}});
  assert(t.msg.split('　').length>=6,'several notices at once '+t.msg);
  assert(t.text[0]>=0&&t.text[1]<=w,'a long notice is not pushed off the screen '+JSON.stringify(t)+tag);
  assert(t.text[0]>=t.box[0]-1&&t.text[1]<=t.box[1]+1&&t.box[0]>=0&&t.box[1]<=w,'the notice text stays inside its card, and the card inside the screen (the card is mid-bounce here) '+JSON.stringify(t)+tag);
  await run(3000);await good(80);
  t=await page.evaluate(()=>{const sp=document.querySelector('#toast span');return {h:sp.getBoundingClientRect().height,msg:sp.textContent}});
  assert(t.h<=20,'a short notice stays on one line '+JSON.stringify(t)+tag);

  /* ---- 復活した紙に、ラストチャンスの案内が残らない ---- */
  await run(3000);await idle();await page.evaluate(()=>window.__pz.setLives(1,true));await page.click('#bPrint');await run(2200);await idle();
  s=await st();assert.equal(s.lastMode,true);assert.equal(await hint(),'刷れたら復活。時間は5秒です');
  await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint');await run(1000);
  assert((await page.locator('#toast span').textContent()).includes('復活！'));
  assert.equal(await hint(),'','the last-chance guide is cleared once revived'+tag);
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: tie with the best, no order line, help gained every fifth print (up to 3), no blank in the notice, longer time limits late in the game, tally without orders and neat bonus, book caption with many highlights, long notices wrap inside the screen, last-chance guide cleared on revival (320x568 and 390x844, touch).');
}
main().catch(e=>{console.error(e);process.exit(1)});
