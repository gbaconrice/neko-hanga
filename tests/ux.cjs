// 注文・加点の知らせ・結果の表示が、狭い画面でも欠けず、古い値のまま残らないこと。
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
  // ぴったり合わせて刷る(むだなし)。wait は刷ったあとに進める時間
  const good=async(wait=3000)=>{await idle();await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice();c.moves=c.min});await page.click('#bPrint');await run(wait)};
  const end=async()=>{await idle();await page.evaluate(()=>window.__pz.setLives(1));await page.click('#bPrint');await run(400);await run(6000)};
  const hint=()=>page.evaluate(()=>{const e=document.querySelector('#hint'),tx=e.querySelector('.tx');return {text:tx?tx.textContent:e.textContent,order:!!tx,on:e.querySelectorAll('.pips i.on').length,n:e.querySelectorAll('.pips i').length}});
  const setOrder=(k,n,t,p)=>page.evaluate(([k,n,t,p])=>{const o=window.__pz.state().order;o.k=k;o.n=n;o.t=t;o.p=p},[k,n,t,p]);

  /* ---- 結果: ベストと同点のとき「あと0点」を出さない ---- */
  await page.click('#bStart');await end();
  assert.equal(await page.locator('#oCompare').textContent(),'');
  await page.click('#bRetry');await end();
  assert.equal(await page.locator('#oCompare').textContent(),'前回と同じ点','a tie with the best does not say 0 points to go'+tag);

  /* ---- 注文の進み具合は、刷った時点で出る ---- */
  await page.click('#bRetry');
  for(let i=0;i<4;i++)await good(); // 4枚目の紙には案内が出ないので、注文が見える
  await idle();
  await setOrder('fast',3,'時間を半分以上残して刷る',0);await good(); // 書き換えた注文を次の紙で表示させる
  await idle();
  let hv=await hint();assert.deepEqual([hv.order,hv.on,hv.n],[true,1,3],'the order and its progress are shown '+JSON.stringify(hv));
  await good(1000); // 完成図を見せている間
  hv=await hint();
  assert.equal((await st()).order.p,2);
  assert.equal(hv.on,2,'order progress is shown as soon as the sheet is printed'+tag);
  // 達成したら、次の注文に替わる(前の注文が残らない)
  await run(2500);await idle();
  // 7枚刷ったあとの紙は案内が出て注文を隠すので、その次の紙で確かめる
  let s=await st();assert.equal(s.prints,6);await good();await good();await idle();
  await setOrder('fast',3,'時間を半分以上残して刷る',2);
  await good(1000);
  hv=await hint();s=await st();
  assert((await page.locator('#toast span').textContent()).includes('注文達成'));
  assert.equal(hv.text,s.order.t,'the next order replaces the finished one at once '+JSON.stringify(hv)+tag);
  assert.equal(hv.on,s.order.p);assert.notEqual(hv.n,0);
  await run(2500);await end();

  /* ---- 結果の絵本: 見どころが多いページでも、枚数・得点・見どころが崩れない ---- */
  const works=await page.evaluate(()=>window.__pz.works().map(x=>(x.tags||[]).length));
  const rich=works.indexOf(Math.max(...works));assert(works[rich]>=3,'a page with several highlights exists '+JSON.stringify(works));
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
  await setOrder('fast',3,'時間を半分以上残して刷る',2);
  await good(80); // 10枚目・5連続・★特色・注文達成・肉球回復・フィーバーが重なる
  let t=await page.evaluate(()=>{const e=document.querySelector('#toast'),sp=e.querySelector('span'),a=e.getBoundingClientRect(),b=sp.getBoundingClientRect(),st=document.querySelector('#stage').getBoundingClientRect();
   return {box:[a.left,a.right],text:[b.left,b.right],h:b.height,stage:[st.left,st.right],msg:sp.textContent}});
  assert(t.msg.split('　').length>=6,'several notices at once '+t.msg);
  assert(t.text[0]>=0&&t.text[1]<=w,'a long notice is not pushed off the screen '+JSON.stringify(t)+tag);
  assert(t.text[0]>=t.box[0]-1&&t.text[1]<=t.box[1]+1&&t.box[0]>=t.stage[0]&&t.box[1]<=t.stage[1],'the notice text stays inside its card '+JSON.stringify(t)+tag);
  await run(3000);await good(80);
  t=await page.evaluate(()=>{const sp=document.querySelector('#toast span');return {h:sp.getBoundingClientRect().height,msg:sp.textContent}});
  assert(t.h<=20,'a short notice stays on one line '+JSON.stringify(t)+tag);

  /* ---- 復活した紙に、ラストチャンスの案内が残らない ---- */
  await run(3000);await idle();await page.evaluate(()=>window.__pz.setLives(1,true));await page.click('#bPrint');await run(2200);await idle();
  s=await st();assert.equal(s.lastMode,true);assert.equal((await hint()).text,'刷れたら復活。時間は5秒です');
  await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await page.click('#bPrint');await run(1000);
  assert((await page.locator('#toast span').textContent()).includes('復活！'));
  hv=await hint();s=await st();
  assert.notEqual(hv.text,'刷れたら復活。時間は5秒です','the last-chance guide is cleared once revived'+tag);
  assert.equal(hv.text,s.order.t);assert.equal(hv.on,s.order.p);
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: tie with the best, order progress shown at print time, next order shown at once, book caption with many highlights, long notices wrap inside the screen, last-chance guide cleared on revival (320x568 and 390x844, touch).');
}
main().catch(e=>{console.error(e);process.exit(1)});
