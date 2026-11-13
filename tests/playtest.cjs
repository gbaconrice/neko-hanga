// 計測版(playtest/out/harness.html)の自動スモークテスト。
// これは「自動のスモーク」であって、人の試遊の計測ではない。ここで出る時間はどれも人の時間ではない。
// 先に node scripts/playtest/build.cjs で計測版を作っておくこと。
// このテストが playtest/out を 127.0.0.1:4176 で配信する(他のテストの 4173 とは別)。
// PLAYTEST_BASE=<コミット> を付けると、そのコミットから index.html が変わっていないことも確かめる。
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const OUT_DIR=path.join(ROOT,'playtest','out');
const OUT=path.join(OUT_DIR,'harness.html');
const PORT=4176,BASE='http://127.0.0.1:'+PORT+'/harness.html';
const SMOKE='[automated SMOKE — not a human measurement]';
const log=m=>console.log(SMOKE+' '+m);

function waitPort(){return new Promise((res,rej)=>{const t0=Date.now();(function ping(){http.get('http://127.0.0.1:'+PORT+'/',r=>{r.resume();res()}).on('error',()=>{if(Date.now()-t0>8000)rej(new Error('server did not start'));else setTimeout(ping,100)})})()})}

async function main(){
 assert(fs.existsSync(OUT),'build first: node scripts/playtest/build.cjs');
 const built=fs.readFileSync(OUT,'utf8');
 const git=a=>execFileSync('git',a,{cwd:ROOT,encoding:'utf8'}).trim();
 const commit=git(['rev-parse','--short','HEAD']);

 /* ---- 7. 公開物から切り離されていること(静的) ---- */
 const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert(!/playtest|__hxb|__hx\b/.test(index),'index.html does not reference the harness');
 assert.equal(spawnSync('git',['check-ignore','-q','playtest/out/harness.html'],{cwd:ROOT}).status,0,'playtest/out is gitignored');
 assert.equal(git(['ls-files','playtest']),'','no harness output is tracked');
 if(process.env.PLAYTEST_BASE){
  assert.equal(git(['diff',process.env.PLAYTEST_BASE,'--','index.html']),'','index.html unchanged since '+process.env.PLAYTEST_BASE);
  log('index.html unchanged since '+process.env.PLAYTEST_BASE);
 }
 // 目印が見つからないとき・2つあるときは、生成が大きな声で失敗する
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'neko-playtest-'));
 try{
  const broken=path.join(tmp,'broken.html');
  fs.writeFileSync(broken,index.replace('function onTimeout(){','function onTimeOut(){'));
  let r=spawnSync(process.execPath,[path.join(ROOT,'scripts/playtest/build.cjs'),'--src',broken,'--out',path.join(tmp,'o1.html')],{encoding:'utf8'});
  assert.notEqual(r.status,0,'build must fail on a missing anchor');assert.match(r.stderr,/anchor for "timeout" found 0 times/);
  assert(!fs.existsSync(path.join(tmp,'o1.html')),'no output on failure');
  fs.writeFileSync(broken,index.replace('function judge(g){','function judge(g){}function judge(g){'));
  r=spawnSync(process.execPath,[path.join(ROOT,'scripts/playtest/build.cjs'),'--src',broken,'--out',path.join(tmp,'o2.html')],{encoding:'utf8'});
  assert.notEqual(r.status,0,'build must fail on a duplicated anchor');assert.match(r.stderr,/anchor for "judge shown" found 2 times/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
 log('build fails loudly on missing/duplicated anchors');

 /* ---- 1/2. 生成物そのもの(静的) ---- */
 assert(!built.includes('gravity.place'),'no GRAVITY SDK in the harness');
 assert(!/<script[^>]+src=/i.test(built),'no external scripts');
 assert(!built.includes('postMessage'),'no postMessage in the harness');
 assert(built.indexOf('Content-Security-Policy')<built.indexOf('<script'),'CSP comes before any script');
 assert(built.includes('"commit":"'+commit+'"'),'commit embedded (rebuild after committing)');

 const server=spawn('python3',['-m','http.server',String(PORT),'--bind','127.0.0.1'],{cwd:OUT_DIR,stdio:'ignore'});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--disable-background-networking']});
 const errors=[],requests=[];
 try{
  await waitPort();
  async function open(opts={}){
   const context=await browser.newContext({viewport:opts.viewport||{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,acceptDownloads:true});
   await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:'+PORT});
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{const u=r.url();if(!/^(data|blob):/.test(u))requests.push({u,r})});
   // 送信の見張り: message イベントと postMessage の呼び出しを数える。保存の見張り: 元の setItem を数える
   await page.addInitScript(()=>{
    window.__t={msgs:[],posts:[],setItem:0};
    addEventListener('message',e=>window.__t.msgs.push(e.data));
    const pm=window.postMessage;window.postMessage=function(){window.__t.posts.push(arguments[0]);return pm.apply(this,arguments)};
    const si=Storage.prototype.setItem;Storage.prototype.setItem=function(){window.__t.setItem++;return si.apply(this,arguments)};
   });
   if(opts.clock)await page.clock.install();
   await page.goto(opts.url||BASE);
   if(opts.clock){for(let i=0;i<200&&!(await page.evaluate(()=>window.__hx&&window.__hx.artReady()));i++)await page.clock.runFor(100)}
   await page.waitForFunction(()=>window.__hx&&window.__hx.artReady(),null,{timeout:30000});
   // 読み込み後の見張り: 計測版の見張りの上から、さらに setItem を数える
   await page.evaluate(()=>{const g=Storage.prototype.setItem;Storage.prototype.setItem=function(){window.__t.setItem++;return g.apply(this,arguments)}});
   return page;
  }
  const trial=p=>p.evaluate(()=>{const t=window.__hx.active();return t?{tl:t.tl,puzzle:t.puzzle}:null});
  const cur=p=>p.evaluate(()=>{const c=window.__pz.cur();return {mi:c.va.mi,ax:c.ax,M:c.M,sol:c.sol,v:c.v.slice()}});
  const st=p=>p.evaluate(()=>window.__pz.state());
  const records=p=>p.evaluate(()=>window.__hxUi.trials());
  async function begin(p,seed,sheetNo){
   await p.fill('#hxSheet',String(sheetNo));await p.fill('#hxSeed',String(seed));
   await p.tap('#hxStart');
   await p.waitForFunction(()=>{const t=window.__hx.active();return t&&t.tl.t_ready!=null});
  }
  async function snapshot(p){const c=await cur(p),s=await st(p);return {mi:c.mi,ax:c.ax,M:c.M,sol:c.sol,tMax:s.tMax,dM:s.dM,dU:s.dU,prints:s.prints}}
  async function abort(p){const n=(await records(p)).length;await p.tap('#hxPillBtn');await p.waitForFunction(n=>window.__hxUi.trials().length===n+1,n)}
  const noSend=async(p,where)=>{const t=await p.evaluate(()=>window.__t);
   assert.equal(t.msgs.filter(m=>m&&m.type==='gameOver').length,0,'no gameOver message '+where);assert.equal(t.posts.length,0,'postMessage never called '+where);
   assert.equal(await p.evaluate(()=>!!window.AgentSDK||!!document.querySelector('script[src*="gravity"]')),false,'AgentSDK never loaded '+where)};

  const p=await open();

  /* ---- 1. 通信: CSP があり、外への fetch は止まる ---- */
  const csp=await p.evaluate(()=>{const m=document.querySelector('meta[http-equiv="Content-Security-Policy"]');return m&&m.content});
  assert(csp&&/default-src 'none'/.test(csp)&&/connect-src 'none'/.test(csp),'CSP meta present: '+csp);
  const fetched=await p.evaluate(()=>fetch('https://example.com').then(()=>'ok',e=>'blocked: '+e.name));
  assert.match(fetched,/^blocked/,'fetch to the network is blocked');
  await p.evaluate(()=>new Promise(r=>{const im=new Image();im.onload=im.onerror=r;im.src='https://example.com/x.png'}));
  log('CSP present; fetch/image to example.com blocked');

  /* ---- 4. 同じ種なら同じ問題 ---- */
  await begin(p,12345,45);
  assert.match(await p.textContent('#hxPillText'),/挑戦中 45枚目（刷り済み n=44）/);
  const a1=await snapshot(p),t1=await trial(p);assert.equal(a1.prints,44,'sheet 45 is generated with n=44');
  assert.equal(t1.puzzle.workId,a1.mi);
  await abort(p);
  await begin(p,12345,45);const a2=await snapshot(p);await abort(p);
  assert.deepEqual(a2,a1,'same seed + same n gives the same work/axes/links/solution/time');
  await begin(p,54321,45);const b1=await snapshot(p);await abort(p);
  assert.notDeepEqual({mi:b1.mi,ax:b1.ax,M:b1.M,sol:b1.sol},{mi:a1.mi,ax:a1.ax,M:a1.M,sol:a1.sol},'a different seed gives a different sheet');
  await p.tap('#hx60');await p.fill('#hxSeed','12345');await p.tap('#hxStart');
  await p.waitForFunction(()=>{const t=window.__hx.active();return t&&t.tl.t_ready!=null});
  assert.match(await p.textContent('#hxPillText'),/挑戦中 60枚目（刷り済み n=59）/);
  const c1=await snapshot(p);assert.equal(c1.prints,59);await abort(p);
  let recs=await records(p);
  assert.deepEqual(recs.map(r=>[r.seed,r.n,r.sheetNo,r.kind,r.attempt,r.outcome]),[[12345,44,45,'初見',1,'中断'],[12345,44,45,'反復',2,'中断'],[54321,44,45,'初見',1,'中断'],[12345,59,60,'初見',1,'中断']]);
  assert.equal(recs[0].puzzleKey,recs[1].puzzleKey);assert.notEqual(recs[0].puzzleKey,recs[2].puzzleKey);
  log('same seed+n reproduces the sheet; different seed differs; n=59 works');

  /* ---- 5. 本物の操作で1枚(自動スモーク) ---- */
  await p.fill('#hxSheet','45');await p.fill('#hxSeed','777');await p.tap('#hxStart');
  await p.waitForFunction(()=>{const t=window.__hx.active();return t&&t.tl.t_operable!=null});
  await p.tap('#bPrint'); // 紙が出た直後の「刷る」は受け流される(PR#13)。押下は記録に残る
  await p.waitForFunction(()=>window.__hx.active().tl.t_ready!=null);
  await p.waitForTimeout(450);
  const sol=(await cur(p)).sol;
  const cdp=await p.context().newCDPSession(p);
  const dialAt=async j=>{const b=await p.locator('.kn').nth(j).locator('.dial').boundingBox();return {cx:b.x+b.width/2,cy:b.y+b.height/2,r:b.width*.36}};
  // つまみ0は指で回す(1目盛り=30度)。弾かないように、止めてから離す
  {const k=sol[0],d=await dialAt(0),pt=a=>({x:d.cx+d.r*Math.cos(a*Math.PI/180),y:d.cy+d.r*Math.sin(a*Math.PI/180)});
   const a0=-90,dir=Math.sign(k);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(a0)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(a0+dir*5)]});
   for(let a=10;a<=Math.abs(k)*30;a+=10)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(a0+dir*(5+a))]});
   await p.waitForTimeout(150);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  // 残りはつまみの左右をタップ(1回=1目盛り)
  for(let j=0;j<sol.length;j++){
   const d=await dialAt(j);
   for(let guard=0;guard<20;guard++){const v=(await cur(p)).v[j];if(v===sol[j])break;await p.touchscreen.tap(v<sol[j]?d.cx+d.r:d.cx-d.r,d.cy)}
  }
  const vNow=(await cur(p)).v;assert.deepEqual(vNow,sol,'all knobs aligned by real touch input');
  await p.waitForTimeout(80);
  await p.tap('#bPrint');
  await p.waitForFunction(n=>window.__hxUi.trials().length===n,5,{timeout:15000});
  recs=await records(p);const r=recs[4],tl=r.timeline;
  assert(['めろめろ','うっとり','ごろごろ'].includes(r.outcome),'graded outcome '+r.outcome);
  const order=['t_ready','t_firstInput','t_lastInput','t_print','t_judge'];
  for(const k of order)assert.equal(typeof tl[k],'number',k+' recorded');
  for(let i=1;i<order.length;i++)assert(tl[order[i-1]]<=tl[order[i]],'timeline monotonic: '+order[i-1]+' <= '+order[i]+' '+JSON.stringify(tl));
  assert(tl.t_operable<=tl.t_ready,'operable before entry animation ends');
  assert(tl.t_nextReadyWouldBe>=tl.t_judge,'reveal wait measured after the judge');
  for(const k of ['A_show_to_firstInput','B_firstInput_to_lastInput','C_lastInput_to_print','D_print_to_judge','E_judge_to_nextReady'])assert.equal(typeof r.intervals[k],'number',k);
  assert.equal(r.intervals.A_show_to_firstInput,Math.round((tl.t_firstInput-tl.t_ready)*10)/10);
  assert(r.printTaps.length>=2&&r.printTaps[0].ignored&&r.printTaps[0].reason==='tap-guard','early print tap logged as ignored by the tap guard '+JSON.stringify(r.printTaps));
  assert(r.printTaps.some(t=>t.accepted),'accepted print tap logged');
  const kinds=new Set(r.inputs.filter(i=>i.accepted).map(i=>i.kind));
  assert(kinds.has('drag')&&kinds.has('tap'),'drag and tap classified '+[...kinds]);
  assert(r.inputs.every(i=>i.pointerType==='touch'&&typeof i.axis==='string'&&typeof i.pressMs==='number'),'knob input fields');
  assert.deepEqual(r.env.pointerTypes,['touch']);
  assert.equal(r.carry,0);assert.equal(r.lives,3);assert.equal(r.tapGuardMs,400);assert.equal(r.waitTouch.active,false);assert.equal(r.streak,0);assert.equal(r.fever,0);
  assert.equal(r.rare.mode,'seed');assert.equal(r.sourceCommit,commit);assert.equal(r.n,44);assert.equal(r.sheetNo,45);
  assert(r.stepsTotal===sol.reduce((a,b)=>a+Math.abs(b),0)&&r.linkCount>=1&&r.tMax>0&&r.dM<=r.dU,'sheet ids recorded');
  assert.equal((await st(p)).running,false,'the run does not continue after the trial');
  log('real touch trial: outcome '+r.outcome+', A/B/C/D/E (ms, automated) '+JSON.stringify(r.intervals));

  /* ---- 6. 画面に正解を出さない ---- */
  const ui=await p.evaluate(()=>document.body.innerText);
  for(const s of [JSON.stringify(sol),sol.join(','),sol.join(', '),sol.join(' ')])assert(!ui.includes(s),'solution not shown: '+s);
  assert(!/正解|答え|解答|自動で合わせ|solve/i.test(await p.evaluate(()=>[...document.querySelectorAll('#hxPanel button,#hxPill button')].map(b=>b.textContent).join(' '))),'no solve button');
  assert(recs.every(x=>!('sol' in x)),'records do not carry the signed solution');

  /* ---- 2. ミスでも送らない ---- */
  await begin(p,999,45);await p.waitForTimeout(450);await p.tap('#bPrint');
  await p.waitForFunction(()=>window.__hxUi.trials().length===6);
  recs=await records(p);assert.equal(recs[5].outcome,'ミス');assert.equal(typeof recs[5].timeline.t_nextReadyWouldBe,'number');
  await noSend(p,'after a misprint');
  // 通常のゲーム(計測しない)を終わらせても、ランキングへは送らずメモリに記録だけ
  await p.tap('#hxFold');await p.waitForTimeout(450);await p.tap('#bStart');await p.waitForFunction(()=>window.__pz.state().running&&!window.__pz.state().busy);
  await p.evaluate(()=>window.__pz.setLives(1));await p.waitForTimeout(450);await p.tap('#bPrint');
  await p.waitForFunction(()=>document.getElementById('over').classList.contains('on'),null,{timeout:10000});
  assert.deepEqual(await p.evaluate(()=>window.__hx.wouldSend().map(x=>x.type)),['gameOver'],'game over recorded as would-have-sent');
  await noSend(p,'after a normal game over');
  await p.tap('#bHome');await p.tap('#hxPillBtn');

  /* ---- 8. 書き出し(押したときだけ) ---- */
  await p.tap('#hxCopy');await p.waitForFunction(()=>/コピーしました/.test(document.getElementById('hxMsg').textContent));
  const copied=JSON.parse(await p.evaluate(()=>navigator.clipboard.readText()));
  const dl=p.waitForEvent('download');await p.tap('#hxJson');const file=await (await dl).path();
  const downloaded=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const ex of [copied,downloaded]){
   assert.equal(ex.sourceCommit,commit);assert.equal(ex.trials.length,6);
   const t=ex.trials[4];assert.equal(t.sourceCommit,commit);assert.equal(t.indexSha256.length,64);assert.equal(t.seed,777);assert.equal(t.n,44);assert.equal(t.sheetNo,45);
   assert.equal(typeof t.timeline.t_print,'number');assert(ex.trials.every(x=>x.sourceCommit===commit&&x.indexSha256===ex.indexSha256));
  }
  log('copy + JSON download contain commit, seed, n, sheetNo and the timeline');

  /* ---- 3. 保存しない(この時点まで: 試行7回・通常ゲーム1回) ---- */
  const storage=async q=>q.evaluate(async()=>({ls:localStorage.length,ss:sessionStorage.length,cookie:document.cookie,idb:indexedDB.databases?(await indexedDB.databases()).length:0,spy:window.__t.setItem,guard:window.__hxGuardLog.length}));
  assert.deepEqual(await storage(p),{ls:0,ss:0,cookie:'',idb:0,spy:0,guard:0},'nothing stored');
  // 記録を消す(2回押し)
  await p.tap('#hxClear');assert.equal((await records(p)).length,6,'first tap only arms');await p.tap('#hxClear');assert.equal((await records(p)).length,0);

  /* ---- 4. 読み込み直しても同じ問題 ---- */
  await p.reload();await p.waitForFunction(()=>window.__hx&&window.__hx.artReady());
  await begin(p,12345,45);assert.deepEqual(await snapshot(p),a1,'same sheet after a page reload');await abort(p);

  /* ---- 2. 時間切れでも送らない(時計を進める) ---- */
  const q=await open({clock:true});
  await q.fill('#hxSheet','45');await q.fill('#hxSeed','4242');await q.tap('#hxStart');
  for(let i=0;i<50&&!(await q.evaluate(()=>{const t=window.__hx.active();return t&&t.tl.t_ready!=null}));i++)await q.clock.runFor(50);
  const tq=await st(q);await q.clock.runFor(Math.ceil(tq.tMax*1000)+1500);
  await q.waitForFunction(()=>window.__hxUi.trials().length===1);
  const rq=(await records(q))[0];assert.equal(rq.outcome,'時間切れ');assert(rq.timeline.t_judge>=rq.timeline.t_ready);assert.equal(rq.timeline.t_print,null);
  assert.equal(typeof rq.timeline.t_nextReadyWouldBe,'number');
  await noSend(q,'after a timeout');
  // 動作確認の画面(?check=1 相当)を開いても保存を試さない
  await q.evaluate(()=>{for(let i=0;i<5;i++)document.getElementById('logo').click()});
  assert.match(await q.textContent('#checkList'),/計測版では確かめません/);
  assert.deepEqual(await storage(q),{ls:0,ss:0,cookie:'',idb:0,spy:0,guard:0},'nothing stored (timeout context)');
  log('timeout and misprint trials: zero gameOver messages, nothing stored');

  /* ---- 小さい画面: パネルが横にはみ出さない ---- */
  for(const vp of [{width:320,height:568},{width:390,height:844}]){
   const s=await open({viewport:vp});
   assert(await s.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.getElementById('hxPanel').scrollWidth<=innerWidth),'panel fits '+vp.width);
   await begin(s,1,45);const pill=await s.locator('#hxPill').boundingBox();assert(pill.width<=vp.width&&pill.height<40,'pill is small at '+vp.width);
   const paper=await s.locator('#paper').boundingBox();assert(pill.y+pill.height<=paper.y,'pill does not cover the paper at '+vp.width);
   await abort(s);await s.context().close();
  }

  /* ---- file:// でも動く ---- */
  const f=await open({url:'file://'+OUT});await begin(f,12345,45);assert.deepEqual(await snapshot(f),a1,'file:// gives the same sheet');await abort(f);

  /* ---- 1. 通信のまとめ ---- */
  // Chrome は CSP で止めたリクエストも request イベントに出す(失敗理由 'csp')。外へ出ていないので、それは除く
  const blocked=requests.filter(x=>{const f=x.r.failure();return f&&/^csp$|BLOCKED_BY_CSP/i.test(f.errorText)}).map(x=>x.u);
  assert.deepEqual(blocked,['https://example.com/x.png'],'the deliberate image request was blocked by CSP');
  const outside=requests.filter(x=>!blocked.includes(x.u)).map(x=>x.u).filter(u=>!(u===BASE||u.startsWith(BASE+'?')||u==='file://'+OUT));
  assert.deepEqual(outside,[],'only the harness HTML itself was requested');
  assert.deepEqual(errors,[],'no page errors');
  log('requests: '+requests.length+' (the harness HTML itself, plus '+blocked.length+' deliberate request blocked by CSP)');
  console.log('PASS: playtest harness '+SMOKE+': isolation (CSP/no network, no gameOver send, no storage), seeded reproducibility (n=44, n=59, reload, file://), real touch trial timeline + intervals, tap-guard logging, export, no solution shown, build anchors fail loudly.');
 }finally{
  await browser.close();server.kill();
 }
}
main().catch(e=>{console.error(e);process.exit(1)});
