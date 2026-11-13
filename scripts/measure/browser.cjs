// 実際の画面(つまみ・刷るボタン)を、自動のタッチ入力で操作して時間を測る。
// 使い方: python3 -m http.server 4175 (リポジトリの直下で) を起動してから
//   node scripts/measure/browser.cjs [seed]
// seed から連続5つの種を使う(既定 1 → 1..5)。390x844 は回す・タップの両方、320x568 は種1つ・回すだけ。
// 刷ったあと次の紙が出るまでの時間は、最初の種の「回す」だけ完成図を最後まで見て測り、ほかは送れるようになった瞬間に送る。結果は docs/measure/browser-*.json に書く。
// 環境変数: CHROMIUM_PATH(既定 /usr/bin/google-chrome), PORT(既定 4175), SEEDS(種の数, 既定 5), WORKERS(並列ページ数, 既定 2)
// 注意: 自動入力の速さは人の操作ではない。クラウドの headless Chrome は iPhone でも GRAVITY でもない。フレーム時間は目安。
'use strict';
const fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'))}catch(e){({chromium}=require('/opt/npm-tools/node_modules/playwright'))}

const BASE_SEED=+(process.argv[2]||1)|0;
const NSEED=+(process.env.SEEDS||5);
const WORKERS=Math.max(1,+(process.env.WORKERS||2));
const PORT=+(process.env.PORT||4175);
const URL_='http://127.0.0.1:'+PORT+'/?debug=1&top=74';
const EXE=process.env.CHROMIUM_PATH||'/usr/bin/google-chrome';
const NS=[0,3,7,12,18,25,44,45,59,60]; // n = それまでに刷った枚数(prints)。挑戦中の紙は n+1 枚目
const OUT=path.join(__dirname,'..','..','docs','measure');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"計測"}})}};';
// 操作の速さ(自動入力)
const DRAG_STEP_DEG=6,DRAG_TICK_MS=16; // 16msごとに6度 = 30度/80ms
const DRAG_HOLD_MS=100; // 指を止めてから離す(弾いて回る動きを起こさない)
const TAP_MS=180,KNOB_PAUSE_MS=250;

// ---- index.html の式の写し(B: 式だけの照合用) ----
const OP_LOOK=1.2,OP_KNOB={x:.9,y:.9,r:1.3,s:1.5},OP_STEP=.15,OP_LINK=1.5,OP_PRINT=.4;
const TIME_START=46,TIME_STEP=1.1,TIME_MIN=20,TIME_PAD=4;
function cfg(n){
 if(n<3)return {tier:0,time:40};if(n<7)return {tier:1,time:45};if(n<12)return {tier:2,time:45};
 if(n<18)return {tier:3,time:42,min:32};if(n<25)return {tier:4,time:42,min:34};
 return {tier:5,time:Math.max(24,40-(n-25)*.8),min:Math.max(TIME_MIN,32-(n-25)*.6)};
}
const sheetTime=(c,n)=>n<3?c.time:Math.max(c.min||TIME_MIN,Math.min(c.time,TIME_START-n*TIME_STEP));
const TIME_FIT=n=>n<35?2.4:Math.max(2,2.4-(n-35)*.4/25);
function formula(c,n,carry){
 let best=OP_LOOK+OP_PRINT,links=0;
 c.ax.forEach((a,j)=>{best+=OP_KNOB[a]+Math.abs(c.sol[j])*OP_STEP});
 c.M.forEach((r,i)=>r.forEach((x,j)=>{if(i!==j&&x){best+=OP_LINK;links++}}));
 const tMaxBase=Math.max(sheetTime(cfg(n),n),TIME_FIT(n)*best+TIME_PAD),tMax=tMaxBase+carry;
 let dU=.45*tMax,dM=.2*tMax;
 if(cfg(n).tier>=2){dU=Math.min(tMax,Math.max(dU,2*best+1));dM=Math.min(dU,Math.max(dM,1.3*best+.5))}
 return {best,tMaxBase,tMax,dU,dM,links,tier:cfg(n).tier};
}

// ---- ページに入れる: 種つき乱数・計測の記録 ----
function initScript(seed){
 return `(()=>{
 function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 // 紙を作る処理(newSheet)の中の乱数だけ別の列にする。演出の乱数は実時間で回数が揺れるので、紙の中身に混ぜない
 let sheet=mb(${seed}*7919+1),other=mb(${seed}*104729+7);
 Math.random=function(){const s=new Error().stack||'';return s.indexOf('newSheet')>=0?sheet():other()};
 window.__reseedSheet=k=>{sheet=mb(k)};
 const M=window.__meas={frames:[],ready:[],downs:[],prints:[]};
 let last=0,lastCur=null;
 function raf(ts){
  if(last)M.frames.push([ts,ts-last]);last=ts;if(M.frames.length>20000)M.frames.splice(0,10000);
  const pz=window.__pz;
  if(pz){const c=pz.cur(),s=pz.state();if(c&&c!==lastCur&&s.running&&!s.busy){lastCur=c;M.ready.push({t:performance.now(),prints:s.prints})}}
  requestAnimationFrame(raf);
 }
 requestAnimationFrame(raf);
 document.addEventListener('pointerdown',e=>{const pz=window.__pz;if(!pz)return;const s=pz.state();
  M.downs.push({t:performance.now(),kn:!!(e.target.closest&&e.target.closest('.kn')),busy:s.busy,running:s.running,revealing:s.revealing})},true);
 document.addEventListener('click',e=>{if(!(e.target.closest&&e.target.closest('#bPrint')))return;const pz=window.__pz;const s=pz.state();
  M.prints.push({t:performance.now(),tLeft:s.tLeft,tMax:s.tMax,busy:s.busy,guarded:s.guarded,revealing:s.revealing})},true);
 })();`;
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sleepUntil=t=>{const d=t-Date.now();return d>0?sleep(d):Promise.resolve()};
const stats=a=>{if(!a.length)return {n:0};const s=a.slice().sort((x,y)=>x-y),q=p=>s[Math.min(s.length-1,Math.floor(p*(s.length-1)+.5))];
 return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p50:q(.5),p95:q(.95),max:s[s.length-1],min:s[0]}};

async function openPage(browser,vp,seed){
 const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:3,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
 await page.addInitScript(initScript(seed));
 await page.goto(URL_);
 await page.waitForFunction(()=>window.__pz?.state().artReady,null,{timeout:60000});
 await page.evaluate(()=>window.__pz.rareOff(true)); // ★特色(ローラーが1.7倍遅い)は出さない。連打の受け流し(0.4秒)は本物どおり残す
 const cdp=await ctx.newCDPSession(page);
 return {ctx,page,cdp,errors};
}
const center=async(page,sel)=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2}};
// 次の紙が出て操作できるようになるのを待つ(prints が want の紙)
async function waitReady(page,want,after){
 const h=await page.waitForFunction(([w,a])=>{const r=window.__meas.ready;for(let i=r.length-1;i>=0;i--){if(r[i].t<=a)break;if(w==null||r[i].prints===w)return r[i]}return null},[want,after],{timeout:20000,polling:'raf'});
 return h.jsonValue();
}
const pnow=page=>page.evaluate(()=>performance.now());
async function tapPrint(page,acc){
 const c=await center(page,'#bPrint');
 const before=await page.evaluate(()=>window.__meas.prints.length);
 await page.touchscreen.tap(c.x,c.y);acc&&acc.events++;
 // 押した記録と、受け付けたか(完成図が出る・紙が下がる)を見る
 await sleep(30);
 const r=await page.evaluate(b=>({rec:window.__meas.prints.slice(b),s:window.__pz.state()}),before);
 return {rec:r.rec[0],accepted:r.s.revealing||r.s.busy};
}

// 1つのつまみを指で回して k 目盛り動かす
async function dragKnob(cdp,box,k,acc){
 const cx=box.x+box.width/2,cy=box.y+box.height/2,r=box.width*.36;
 const pt=a=>({x:cx+r*Math.cos(a*Math.PI/180),y:cy+r*Math.sin(a*Math.PI/180),id:1,radiusX:8,radiusY:8,force:1});
 const a0=-90,total=Math.abs(k)*30,dir=Math.sign(k);
 // 送信の完了(画面側の受け取り)を待たずに、時刻どおりに送る。待つと1回ごとに数フレーム遅れ、指の速さが落ちる
 const sent=[];let t=Date.now();const t0=t;
 sent.push(cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(a0)]}));acc.events++;
 for(let d=0;d<=total;d+=DRAG_STEP_DEG){
  t+=DRAG_TICK_MS;await sleepUntil(t);
  sent.push(cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(a0+dir*d)]}));acc.events++;
 }
 await Promise.all(sent);const t1=Date.now();
 acc.drag.push({deg:total,ms:t1-t0}); // 実際に回せた速さ(最初の位置合わせの1回分を含む)
 await sleep(DRAG_HOLD_MS);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});acc.events++;
}
async function tapKnob(page,box,k,acc){
 const cx=box.x+box.width/2,cy=box.y+box.height/2,r=box.width*.36,x=k>0?cx+r:cx-r;
 let t=Date.now();
 for(let i=0;i<Math.abs(k);i++){if(i){t+=TAP_MS;await sleepUntil(t)}await page.touchscreen.tap(x,cy);acc.events++}
}

// 1枚: 紙が出た瞬間から、つまみを全部合わせて刷るまで
async function measureSheet(pg,style,n,nextN,seed,natural){
 const {page,cdp}=pg;
 const info=await page.evaluate(()=>{const c=window.__pz.cur(),s=window.__pz.state(),vh=innerHeight;
  const boxes=[...document.querySelectorAll('#knobs .kn .dial')].map(d=>{const r=d.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
  const pb=document.querySelector('#bPrint').getBoundingClientRect();
  return {ax:c.ax.map(a=>a.t),sol:c.sol.slice(),v:c.v.slice(),M:c.M.map(r=>r.slice()),tier:c.tier,
   s:{prints:s.prints,best:s.best,dM:s.dM,dU:s.dU,tMax:s.tMax,tLeft:s.tLeft,tMaxBase:s.tMaxBase,lastCarry:s.lastCarry,lives:s.lives,busy:s.busy},
   boxes,vh,printBottom:pb.bottom,offscreen:boxes.filter(b=>b.y<0||b.y+b.height>vh).length+(pb.bottom>vh?1:0)}});
 const ready=(await page.evaluate(()=>window.__meas.ready.at(-1)));
 const acc={events:0,fixes:0,misses:[],drag:[]};
 const tStartWall=Date.now(),pStart=await pnow(page);
 const order=info.ax.map((_,j)=>j); // つまみの値は互いに独立(連動は版のずれにだけ効く)ので、左上から順に合わせる
 let first=true;
 for(const j of order){
  const k=info.sol[j]-info.v[j];if(!k)continue;
  if(!first)await sleep(KNOB_PAUSE_MS);first=false;
  if(style==='drag')await dragKnob(cdp,info.boxes[j],k,acc);else await tapKnob(page,info.boxes[j],k,acc);
  await sleep(20);
  let v=await page.evaluate(j=>window.__pz.cur().v[j],j);
  // 入力が受け付けられなかった・ずれた: 記録して、タップで直す
  let guard=0;while(v!==info.sol[j]&&guard++<20){acc.misses.push({j,want:info.sol[j],got:v});await tapKnob(page,info.boxes[j],Math.sign(info.sol[j]-v),acc);acc.fixes++;await sleep(20);v=await page.evaluate(j=>window.__pz.cur().v[j],j)}
 }
 await sleep(KNOB_PAUSE_MS);
 const pre=await page.evaluate(()=>({all:window.__pz.cur().v.every((v,i)=>v===window.__pz.cur().sol[i]),spinning:window.__pz.state().spinning}));
 // 刷る直前に、次に作られる紙の枚数を決めておく(刷ると prints+1 になる。判定と時間はこの紙の値で決まるので影響しない)
 await page.evaluate(([m,k])=>{window.__pz.setPrints(m);window.__reseedSheet(k)},[nextN-1,seed*1000+nextN+1]);
 let pr=await tapPrint(page,acc),printRetries=0;
 while(!pr.accepted&&printRetries<5){printRetries++;await sleep(450);pr=await tapPrint(page,acc)}
 const tEndWall=Date.now();
 // 判定の判子が出るのを待つ
 await page.waitForFunction(()=>document.querySelector('#paper .judge'),null,{timeout:5000});
 const res=await page.evaluate(([a,b])=>{const j=document.querySelector('#paper .judge');
  const fr=window.__meas.frames.filter(f=>f[0]>a&&f[0]<=b).map(f=>f[1]);
  const downs=window.__meas.downs.filter(d=>d.t>=a&&d.t<=b);
  return {grade:j.textContent,gcls:j.className,toast:(document.querySelector('#toast span')||{}).textContent||'',fr,
   ignoredDowns:downs.filter(d=>d.kn&&(d.busy||!d.running||d.revealing)).length,downs:downs.length}},[ready.t,pr.rec?pr.rec.t:1e15]);
 const printT=pr.rec.t;
 // 刷ってから次の紙が出るまで: natural=完成図を最後まで見る / skip=送れるようになった瞬間に紙をタップ
 let overhead;
 if(natural){const r=await waitReady(page,nextN,printT);overhead={mode:'natural',ms:r.t-printT}}
 else{
  await page.waitForFunction(()=>window.__pz.state().canSkip&&window.__pz.state().revealAge>=600,null,{timeout:8000,polling:'raf'});
  const c=await center(page,'#paper');await page.touchscreen.tap(c.x,c.y);
  const r=await waitReady(page,nextN,printT);overhead={mode:'skip',ms:r.t-printT};
 }
 const spent=pr.rec.tMax-pr.rec.tLeft;
 const f=formula({ax:info.ax,sol:info.sol,M:info.M},n,info.s.lastCarry);
 const fs_=stats(res.fr);
 return {seed,style,n,sheet:n+1,tier:info.tier,knobs:info.ax.length,axes:info.ax.join(''),steps:info.sol.reduce((x,y)=>x+Math.abs(y),0),links:f.links,
  sig:info.ax.join('')+':'+info.sol.join(',')+':'+info.M.flat().join(''),
  best:info.s.best,dM:info.s.dM,dU:info.s.dU,tMax:info.s.tMax,tMaxBase:info.s.tMaxBase,carry:info.s.lastCarry,
  readyToStartMs:pStart-ready.t, // 紙が出たのを検知してから最初の入力までの遅れ(計測側の遅れ)
  wallMs:printT-ready.t,wallNodeMs:tEndWall-tStartWall,gameSec:spent,events:acc.events,fixes:acc.fixes,misses:acc.misses,printRetries,dragDegPerMs:acc.drag.length?acc.drag.reduce((x,d)=>x+d.deg,0)/acc.drag.reduce((x,d)=>x+d.ms,0):null,
  printGuarded:!!pr.rec.guarded,ignoredKnobDowns:res.ignoredDowns,alignedBeforePrint:pre.all,
  grade:res.grade,gradeCls:res.gcls,toast:res.toast,gradeByFormula:spent<=info.s.dM?'めろめろ':spent<=info.s.dU?'うっとり':'ごろごろ',
  ratioSpentBest:spent/info.s.best,marginM:info.s.dM-spent,
  frames:{n:fs_.n,mean:fs_.mean,p95:fs_.p95,max:fs_.max,over33:res.fr.filter(x=>x>33).length,over50:res.fr.filter(x=>x>50).length},
  overhead,offscreen:info.offscreen,
  formulaOK:{best:Math.abs(f.best-info.s.best)<1e-9,tMaxBase:Math.abs(f.tMaxBase-info.s.tMaxBase)<1e-9,tMax:Math.abs(f.tMax-info.s.tMax)<1e-9,dM:Math.abs(f.dM-info.s.dM)<1e-9,dU:Math.abs(f.dU-info.s.dU)<1e-9}};
}

// 1つのページで、ある種・ある操作の仕方の紙を n の順に全部測る
async function runSeries(browser,vp,seed,style,natural){
 const pg=await openPage(browser,vp,seed),{page}=pg,out=[];
 try{
  await page.evaluate(k=>window.__reseedSheet(k),seed*1000+NS[0]+1);
  // 最初の紙は「さわってね」の案内で時間が止まる紙。ここで最初の n の紙を作る
  await page.evaluate(()=>window.__pz.setPrints(0));
  const c=await center(page,'#bStart');await page.touchscreen.tap(c.x,c.y);
  let r=await waitReady(page,null,0);
  await sleep(450); // 画面が替わった直後の0.4秒は入力を受け付けない
  await page.evaluate(([m,k])=>{const c=window.__pz.cur();c.v=c.sol.slice();window.__pz.setPrints(m);window.__reseedSheet(k)},[NS[0]-1,seed*1000+NS[0]+1]);
  const p0=await tapPrint(page);if(!p0.accepted)throw new Error('setup print not accepted');
  await page.waitForFunction(()=>window.__pz.state().canSkip&&window.__pz.state().revealAge>=600,null,{polling:'raf'});
  const pc=await center(page,'#paper');await page.touchscreen.tap(pc.x,pc.y);
  await waitReady(page,NS[0],p0.rec.t);
  for(let i=0;i<NS.length;i++){
   const n=NS[i],nextN=i+1<NS.length?NS[i+1]:NS[i]+1;
   const s=await page.evaluate(()=>window.__pz.state());if(s.prints!==n)throw new Error('expected prints '+n+' got '+s.prints);
   await page.evaluate(()=>window.__pz.setLives(3,true));
   const t0=Date.now();out.push(await measureSheet(pg,style,n,nextN,seed,natural));
   if(process.env.VERBOSE){const o=out.at(-1);console.error(vp.width,seed,style,'n='+n,'loop',Date.now()-t0,'wall',Math.round(o.wallMs),'node',o.wallNodeMs,'ev',o.events,'oh',Math.round(o.overhead.ms),o.grade)}
  }
 }finally{out.forEach(o=>o.pageErrors=pg.errors.slice());await pg.ctx.close()}
 return out;
}

// 連打の受け流し(0.4秒)の効き方: 紙が出た直後に刷るボタンを連打したとき
async function guardCheck(browser){
 const pg=await openPage(browser,{width:390,height:844},BASE_SEED),{page}=pg,res={};
 try{
  const c=await center(page,'#bStart');await page.touchscreen.tap(c.x,c.y);
  const r0=await waitReady(page,null,0);
  // 画面が替わった直後につまみをタップ → 受け付けない時間
  const b=await page.evaluate(()=>{const r=document.querySelector('#knobs .kn .dial').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
  const v0=await page.evaluate(()=>window.__pz.cur().v[0]);
  const t=[];for(let i=0;i<8;i++){const at=await pnow(page);await page.touchscreen.tap(b.x+b.width*.86,b.y+b.height/2);await sleep(10);t.push({ms:Math.round(at-r0.t),v:await page.evaluate(()=>window.__pz.cur().v[0])});await sleep(60)}
  res.knobAfterScreen={v0,taps:t};
  await sleep(400);
  // 紙を出してすぐ、合わせた状態で 200ms ごとに刷るを押す
  const trial=async gap=>{
   await page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
   const before=await page.evaluate(()=>window.__meas.ready.at(-1));
   const taps=[];let ok=false;
   for(let i=0;i<10&&!ok;i++){const x=await tapPrint(page);taps.push({ms:Math.round(x.rec.t-before.t),accepted:x.accepted,guarded:x.rec.guarded});ok=x.accepted;if(!ok)await sleep(gap-30)}
   // 受け付けられないまま終わったら、0.5秒手を止めてからもう一度押す
   if(!ok){await sleep(500);const x=await tapPrint(page);taps.push({ms:Math.round(x.rec.t-before.t),accepted:x.accepted,guarded:x.rec.guarded,afterPause:true})}
   return taps;
  };
  res.firstSheetMash200=await trial(200);
  await page.waitForFunction(()=>window.__pz.state().canSkip&&window.__pz.state().revealAge>=600,null,{polling:'raf'});
  let pc=await center(page,'#paper');await page.touchscreen.tap(pc.x,pc.y);await waitReady(page,1,0);
  res.mash200=await trial(200);
  await page.waitForFunction(()=>window.__pz.state().canSkip&&window.__pz.state().revealAge>=600,null,{polling:'raf'});
  pc=await center(page,'#paper');await page.touchscreen.tap(pc.x,pc.y);await waitReady(page,2,0);
  res.mash450=await trial(450);
 }finally{await pg.ctx.close()}
 return res;
}

async function pool(tasks,k){const out=[];let i=0;await Promise.all(Array.from({length:k},async()=>{while(i<tasks.length){const t=tasks[i++];out.push(...await t())}}));return out}

(async()=>{
 const T0=Date.now();
 fs.mkdirSync(OUT,{recursive:true});
 const browser=await chromium.launch({executablePath:EXE,headless:true,args:['--no-sandbox']});
 try{
  const seeds=Array.from({length:NSEED},(_,i)=>BASE_SEED+i);
  const tasks=[];
  for(const seed of seeds)for(const style of ['drag','tap'])tasks.push(async()=>{const t=Date.now();const r=await runSeries(browser,{width:390,height:844},seed,style,seed===BASE_SEED&&style==='drag');r.forEach(x=>x.vp='390x844');console.error(`390x844 seed ${seed} ${style}: ${((Date.now()-t)/1000).toFixed(0)}s`);return r});
  for(const style of ['drag'])tasks.push(async()=>{const t=Date.now();const r=await runSeries(browser,{width:320,height:568},BASE_SEED,style,false);r.forEach(x=>x.vp='320x568');console.error(`320x568 seed ${BASE_SEED} ${style}: ${((Date.now()-t)/1000).toFixed(0)}s`);return r});
  const rows=await pool(process.env.ONLY?tasks.slice(0,+process.env.ONLY):tasks,WORKERS);
  const guard=await guardCheck(browser);
  const order=(a,b)=>a.vp.localeCompare(b.vp)||a.seed-b.seed||a.style.localeCompare(b.style)||a.n-b.n;
  rows.sort(order);
  // 同じ種・同じ n の紙は、操作の仕方が違っても同じ中身か(再現性)
  const sigs={};let sameSheet=0,diffSheet=0;
  rows.forEach(r=>{const k=r.vp+'/'+r.seed+'/'+r.n;if(sigs[k]===undefined)sigs[k]=r.sig;else if(sigs[k]===r.sig)sameSheet++;else diffSheet++});
  const meta={date:new Date().toISOString(),baseSeed:BASE_SEED,seeds,ns:NS,workers:WORKERS,chrome:await browser.version(),runtimeSec:(Date.now()-T0)/1000,
   op:{DRAG_STEP_DEG,DRAG_TICK_MS,DRAG_HOLD_MS,TAP_MS,KNOB_PAUSE_MS},sameSheetAcrossStyles:sameSheet,differentSheetAcrossStyles:diffSheet};
  fs.writeFileSync(path.join(OUT,'browser-raw.json'),JSON.stringify({meta,rows,guard},null,1));
  // 集計(段階ごと × 操作の仕方)
  const sum=[];
  for(const vp of ['390x844','320x568'])for(const style of ['drag','tap'])for(const n of NS){
   const g=rows.filter(r=>r.vp===vp&&r.style===style&&r.n===n);if(!g.length)continue;
   const m=f=>stats(g.map(f));
   sum.push({vp,style,n,sheet:n+1,tier:g[0].tier,samples:g.length,knobs:m(r=>r.knobs).mean,steps:m(r=>r.steps).mean,best:m(r=>r.best),dM:m(r=>r.dM),dU:m(r=>r.dU),
    wallSec:m(r=>r.wallMs/1000),gameSec:m(r=>r.gameSec),ratio:m(r=>r.gameSec/r.best),marginM:m(r=>r.marginM),events:m(r=>r.events).mean,
    grades:g.reduce((o,r)=>(o[r.grade]=(o[r.grade]||0)+1,o),{}),gradeMismatch:g.filter(r=>r.grade!==r.gradeByFormula).length,
    frameMean:m(r=>r.frames.mean).mean,frameP95:m(r=>r.frames.p95).max,frameMax:m(r=>r.frames.max).max,over33:g.reduce((x,r)=>x+r.frames.over33,0),frames:g.reduce((x,r)=>x+r.frames.n,0),
    fixes:g.reduce((x,r)=>x+r.fixes,0),printRetries:g.reduce((x,r)=>x+r.printRetries,0),ignored:g.reduce((x,r)=>x+r.ignoredKnobDowns,0),offscreen:Math.max(...g.map(r=>r.offscreen)),
    formulaFail:g.filter(r=>!Object.values(r.formulaOK).every(Boolean)).length,
    overheadNatural:stats(g.filter(r=>r.overhead.mode==='natural').map(r=>r.overhead.ms)),overheadSkip:stats(g.filter(r=>r.overhead.mode==='skip').map(r=>r.overhead.ms))});
  }
  fs.writeFileSync(path.join(OUT,'browser-summary.json'),JSON.stringify({meta,summary:sum,guard},null,1));
  // 画面に表(Markdown)を出す
  const f1=x=>x==null||isNaN(x)?'-':x.toFixed(1),f2=x=>x==null||isNaN(x)?'-':x.toFixed(2);
  for(const vp of ['390x844','320x568']){
   console.log(`\n### ${vp}\n\n| n（何枚目） | 段階 | 操作 | 紙 | つまみ | 目盛り計 | 最速見積もり best | めろめろ締切 dM | 実測 経過(ゲーム内) 平均 [最大] | 経過÷best | dMまでの余裕 最小 | 実時間 平均 | 入力数 | 判定 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
   sum.filter(s=>s.vp===vp).sort((a,b)=>a.n-b.n||a.style.localeCompare(b.style)).forEach(s=>console.log(`| n=${s.n}（${s.sheet}枚目） | ${s.tier} | ${s.style==='drag'?'回す':'タップ'} | ${s.samples} | ${f1(s.knobs)} | ${f1(s.steps)} | ${f1(s.best.mean)}秒 | ${f1(s.dM.mean)}秒 | ${f1(s.gameSec.mean)} [${f1(s.gameSec.max)}]秒 | ${f2(s.ratio.mean)} | ${f1(s.marginM.min)}秒 | ${f1(s.wallSec.mean)}秒 | ${f1(s.events)} | ${Object.entries(s.grades).map(([k,v])=>k+v).join(' ')} |`));
   console.log(`\n| n（何枚目） | 操作 | フレーム平均 | p95(最大の紙) | 最長 | 33ms超/全フレーム | 直し | 刷る再押し | 無視された入力 | 画面外 | 式不一致 | 判定の食い違い | 刷る→次の紙(完成図を見る) | 刷る→次の紙(送る) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
   sum.filter(s=>s.vp===vp).sort((a,b)=>a.n-b.n||a.style.localeCompare(b.style)).forEach(s=>console.log(`| n=${s.n}（${s.sheet}枚目） | ${s.style==='drag'?'回す':'タップ'} | ${f1(s.frameMean)}ms | ${f1(s.frameP95)}ms | ${f1(s.frameMax)}ms | ${s.over33}/${s.frames} | ${s.fixes} | ${s.printRetries} | ${s.ignored} | ${s.offscreen} | ${s.formulaFail} | ${s.gradeMismatch} | ${s.overheadNatural.n?f1(s.overheadNatural.mean)+'ms':'-'} | ${s.overheadSkip.n?f1(s.overheadSkip.mean)+'ms':'-'} |`));
  }
  console.log('\nguard:',JSON.stringify(guard));
  console.log('meta:',JSON.stringify(meta));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
