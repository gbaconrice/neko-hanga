// 連打・操作の中断・画面の復帰・遷移のくり返しで、タイマーや表示や入力状態が取り残されないこと。
// 狭い画面とタッチ操作で確かめる。画面の非表示は visibilitychange を擬似的に起こしている(実機の裏画面ではない)。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const SDK='window.AgentSDK={user:{getMyUserInfo:()=>Promise.resolve({data:{name:"テスト刷り師"}})}};';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const errors=[];
 async function open(w,h){
  const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.gravity.place/**',r=>r.fulfill({contentType:'text/javascript',body:SDK}));
  await page.addInitScript(()=>{window.__posts=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='gameOver')window.__posts.push(e.data.score)})});
  await page.clock.install();
  await page.goto('http://127.0.0.1:4173/?debug=1&top=74');
  await page.waitForFunction(()=>window.__pz?.state().artReady);
  await page.evaluate(()=>{
   window.__pz.rareOff(true);
   window.pe=(el,type,id,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerId:id,clientX:x,clientY:y,bubbles:true,cancelable:true,pointerType:'touch',isPrimary:id===1}));
   window.knob=(j,a)=>{const d=document.querySelectorAll('.kn .dial')[j],r=d.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,R=r.width*.4;return {cell:d.parentNode,d,x:cx+Math.cos(a*Math.PI/180)*R,y:cy+Math.sin(a*Math.PI/180)*R}};
   window.ang=d=>{const m=/rotate\(([-\d.]+)deg\)/.exec(d.style.transform||'');return m?+m[1]:0};
   window.vis=h=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>h?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'))};
   window.leftovers=()=>{const q=s=>document.querySelectorAll(s).length,c=id=>document.getElementById(id).className,s=window.__pz.state();
    return {game:c('game'),paper:c('paper'),lives:c('lives'),feverOn:c('fever'),pips:q('#fever i.on'),bannerHidden:document.getElementById('lastBanner').hidden,bar:document.querySelector('.bar').className,carry:c('carry')+document.getElementById('carry').textContent,
     stray:q('.judge')+q('.roller')+q('.flash')+q('.yare')+q('.pt')+q('.lk')+q('.fly')+q('#stack'),sheetNoHidden:document.getElementById('sheetNo').hidden,sc:document.getElementById('sc').textContent,combo:document.getElementById('combo').classList.contains('none'),
     running:s.running,busy:s.busy,lives3:s.lives,fever:s.fever,gauge:s.feverGauge,lastMode:s.lastMode,lastUsed:s.lastUsed,streak:s.streak,score:s.score,helps:s.helps,comeback:s.comeback,carryS:s.carry+s.lastCarry,spinning:s.spinning,focus:s.focus,canSkip:s.canSkip,revealing:s.revealing,prePlates:s.prePlates,prints:s.prints}};
  });
  return page;
 }
 const CLEAN={game:'screen on',paper:'paper',lives:'lives',feverOn:'',pips:0,bannerHidden:true,bar:'bar',carry:'',stray:0,sheetNoHidden:false,sc:'0',combo:true,
  running:true,busy:false,lives3:3,fever:0,gauge:0,lastMode:false,lastUsed:false,streak:0,score:0,helps:1,comeback:0,carryS:0,spinning:0,focus:null,canSkip:false,revealing:false,prePlates:false,prints:0};

 for(const [w,h] of [[320,568],[390,844]]){
  const tag=' @'+w+'x'+h;
  const page=await open(w,h);
  const st=()=>page.evaluate(()=>window.__pz.state());
  const on=id=>page.evaluate(i=>document.getElementById(i).classList.contains('on'),id);
  const idle=()=>page.waitForFunction(()=>{const s=window.__pz.state();return s.running&&!s.busy});
  const align=()=>page.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});
  const box=sel=>page.locator(sel).first().boundingBox();
  // ボタンの下寄り・右寄りを押す(別の画面のボタンと重なりやすい位置)
  const low=async sel=>{const b=await box(sel);return [b.x+b.width*.7,b.y+b.height-6]};
  const tap=async(x,y)=>page.touchscreen.tap(x,y);
  const run=ms=>page.clock.runFor(ms);
  const print=async()=>{const b=await box('#bPrint');await tap(b.x+b.width/2,b.y+b.height/2)};
  const good=async()=>{await idle();await run(450);await align();await print();await run(2800);await idle()};

  /* ---- 連打: はじめる ---- */
  let p=await low('#bStart');
  await tap(p[0],p[1]);await run(150);await tap(p[0],p[1]);await run(100);await idle();
  let s=await st();
  assert.equal(s.lives,3,'a double tap on the start button does not misprint the first sheet'+tag);
  // 2度目のタップがつまみに当たる配置でも、つまみは動かず、最初の一枚の「触るまで時間が減らない」も保たれる
  await page.evaluate(()=>{const k=knob(0,0);pe(k.cell,'pointerdown',1,k.x,k.y);pe(k.cell,'pointerup',1,k.x,k.y)});
  s=await st();
  assert.equal(s.waitTouch,true,'the first sheet still waits for the first touch'+tag);
  assert.deepEqual(await page.evaluate(()=>window.__pz.cur().v),[0,0],'a stray tap right after the start does not turn a knob'+tag);
  // おたすけ側(左寄り)に当たっても使われない
  const hb=await box('#bHelp');await tap(hb.x+hb.width/2,hb.y+hb.height/2);
  assert.equal((await st()).helps,1,'a stray tap right after the start does not spend the help'+tag);
  // つまみは待たせない: 紙が出た直後でも回せる
  await run(450);await good();await idle();
  let v=await page.evaluate(()=>{const k=knob(0,0),v0=window.__pz.cur().v[0];pe(k.cell,'pointerdown',1,k.x,k.y);pe(k.cell,'pointerup',1,k.x,k.y);return [v0,window.__pz.cur().v[0],window.__pz.state().guarded]});
  assert.equal(v[2],true,'the print button is held back when a sheet arrives');assert.equal(v[1],v[0]+1,'knobs respond immediately on a new sheet'+tag);

  /* ---- 連打: 完成図の早送り ---- */
  await run(450);await align();await print();await run(700);
  for(let i=0;i<4;i++){await print();await run(170)}
  s=await st();
  assert.equal(s.prints,2);assert.equal(s.busy,false);assert.equal(s.lives,3,'taps that skip the finished print do not misprint the next sheet'+tag);assert.equal(s.streak,2);
  // 押し続けている間は反応しない。手を止めたあとの1回は、ふつうに刷る(ずれていれば刷り損じ)
  for(let i=0;i<8;i++){await print();await run(170)}
  assert.equal((await st()).lives,3,'continuous tapping is ignored until it stops'+tag);
  await run(450);await print();await run(400);
  assert.equal((await st()).lives,2,'a deliberate press after a pause still counts'+tag);

  /* ---- つまみ: 刷り損じの間に持っていた指 ---- */
  await idle();
  await page.evaluate(()=>{let k=knob(0,0);pe(k.cell,'pointerdown',1,k.x,k.y);for(let a=5;a<=40;a+=5){k=knob(0,a);pe(k.cell,'pointermove',1,k.x,k.y)}});
  let r=await page.evaluate(()=>({v:window.__pz.cur().v[0],ang:ang(knob(0,0).d),focus:window.__pz.state().focus}));
  assert(r.focus&&r.ang!==r.v*30,'the dial follows the finger while held '+JSON.stringify(r));
  await page.evaluate(()=>window.__pz.setLives(3,true));
  await page.evaluate(()=>document.querySelector('#bPrint').click()); // もう1本の指で刷る(ずれている)
  s=await st();assert.equal(s.busy,true);assert.equal(s.lives,2);
  await page.evaluate(()=>{const k=knob(0,45);pe(k.cell,'pointermove',1,k.x,k.y)});
  await run(600);
  await page.evaluate(()=>{const k=knob(0,45);pe(k.cell,'pointerup',1,k.x,k.y)});
  r=await page.evaluate(()=>({v:window.__pz.cur().v[0],ang:ang(knob(0,0).d),focus:window.__pz.state().focus,busy:window.__pz.state().busy}));
  assert.equal(r.focus,null,'plates are not left dimmed after a misprint while a knob is held'+tag);
  assert.equal(r.ang,r.v*30,'the dial snaps back to its step after the interruption '+JSON.stringify(r));
  // 刷り損じの間に指を離した場合
  await page.evaluate(()=>{let k=knob(0,0);pe(k.cell,'pointerdown',1,k.x,k.y);for(let a=5;a<=40;a+=5){k=knob(0,a);pe(k.cell,'pointermove',1,k.x,k.y)};document.querySelector('#bPrint').click();pe(k.cell,'pointerup',1,k.x,k.y)});
  await run(600);
  r=await page.evaluate(()=>({v:window.__pz.cur().v[0],ang:ang(knob(0,0).d),focus:window.__pz.state().focus}));
  assert.equal(r.ang,r.v*30,'the dial snaps when released during the misprint pause '+JSON.stringify(r));assert.equal(r.focus,null);
  assert.equal((await st()).lives,1);

  /* ---- つまみ: 同じつまみに2本の指 ---- */
  r=await page.evaluate(()=>{
   const c=window.__pz.cur(),v0=c.v[0],m0=window.__pz.state().moves,seen=[];
   let a1=knob(0,0),a2=knob(0,180);pe(a1.cell,'pointerdown',1,a1.x,a1.y);pe(a2.cell,'pointerdown',2,a2.x,a2.y);
   for(let a=3;a<=33;a+=3){a1=knob(0,a);pe(a1.cell,'pointermove',1,a1.x,a1.y);seen.push(c.v[0]-v0);a2=knob(0,180+a);pe(a2.cell,'pointermove',2,a2.x,a2.y);seen.push(c.v[0]-v0)}
   pe(a1.cell,'pointerup',1,a1.x,a1.y);pe(a2.cell,'pointerup',2,a2.x,a2.y);
   return {seen,moved:window.__pz.state().moves-m0,end:c.v[0]-v0,focus:window.__pz.state().focus};
  });
  assert(r.seen.every(d=>d===0||d===1),'two fingers on one knob do not make it jump '+JSON.stringify(r));
  assert.equal(r.end,1);assert.equal(r.moved,1);assert.equal(r.focus,null);
  // pointercancel: 回した分は残し、つまみは目盛りに戻り、そのあとの動きは無視する
  r=await page.evaluate(()=>{
   const c=window.__pz.cur(),v0=c.v[0];let k=knob(0,0);pe(k.cell,'pointerdown',1,k.x,k.y);
   for(let a=5;a<=35;a+=5){k=knob(0,a);pe(k.cell,'pointermove',1,k.x,k.y)}
   pe(k.cell,'pointercancel',1,k.x,k.y);const v1=c.v[0];k=knob(0,120);pe(k.cell,'pointermove',1,k.x,k.y);
   const s=window.__pz.state();return {d:v1-v0,after:c.v[0]-v1,ang:ang(k.d),v:c.v[0],focus:s.focus,spinning:s.spinning};
  });
  assert.equal(r.d,1);assert.equal(r.after,0,'moves after pointercancel are ignored');assert.equal(r.ang,r.v*30);assert.equal(r.focus,null);assert.equal(r.spinning,0);

  /* ---- 画面の復帰(擬似): 遊んでいる途中 ---- */
  await page.evaluate(()=>window.__pz.setLives(3,true));
  await idle();await run(450);
  let a=await st();assert.equal(a.music,true);
  await page.evaluate(()=>vis(true));assert.equal((await st()).music,false,'music stops while hidden');
  await page.clock.fastForward(30000); // 裏にいる間は画面が更新されない
  await page.evaluate(()=>vis(false));await run(100);
  let b=await st();
  assert.equal(b.music,true,'music returns with the game');assert(a.tLeft-b.tLeft<.5,'time away is not charged '+a.tLeft+' -> '+b.tLeft);assert.equal(b.busy,false);assert.equal(b.running,true);
  // 完成図の途中で隠れて戻る
  await align();await run(350);await print();await run(300);
  await page.evaluate(()=>vis(true));s=await st();assert.equal(s.activeVoices,0,'the cat voice stops when hidden');
  await page.clock.fastForward(20000);await page.evaluate(()=>vis(false));await run(500);await idle();
  s=await st();assert.equal(s.revealing,false);assert.equal(s.canSkip,false);assert(s.tMax-s.tLeft<.5,'the next sheet starts with its full time '+s.tLeft+'/'+s.tMax);assert.equal(s.music,true);

  /* ---- フィーバー → ラストチャンス → 結果 → すぐ再挑戦 ---- */
  for(let i=0;i<4;i++)await good();
  s=await st();assert.equal(s.fever,3,'fever is on '+JSON.stringify({g:s.feverGauge,st:s.streak}));assert.equal(await page.locator('#paper.fever').count(),1);
  await page.evaluate(()=>window.__pz.setLives(1,true));
  await run(450);await print();await run(330); // ずれたまま刷る → ラストチャンス
  s=await st();assert.equal(s.lastMode,true);assert.equal(s.fever,0);assert.equal(await page.locator('#paper.fever').count(),0,'fever glow ends with the last chance');
  assert.equal(await page.locator('#lastBanner').isHidden(),false);
  // 予告の間の操作は何も起こさない
  for(let i=0;i<3;i++){await print();await page.evaluate(()=>{const k=knob(0,0);pe(k.cell,'pointerdown',1,k.x,k.y);pe(k.cell,'pointerup',1,k.x,k.y)});await run(120)}
  await page.evaluate(()=>{vis(true);vis(false)}); // 予告の途中で隠れて戻る
  await run(1500);await idle();
  s=await st();assert.equal(s.lastMode,true);assert.equal(s.lives,0);assert.equal(s.tMax,5);assert.equal(await page.locator('#lastBanner').isHidden(),true);
  assert.deepEqual(await page.evaluate(()=>window.__pz.cur().v),[0,0],'input during the banner did not move the last-chance sheet');
  // あわてて「刷る」を押し続ける → 時間切れ → 結果。押し続けても結果は飛ばされない
  const pb=await box('#bPrint'),px=pb.x+pb.width/2,py=pb.y+pb.height/2; // 結果に替わっても同じ場所を押し続ける
  // 「刷る」の左端は、結果画面では「タイトルへ」に重なる。中央は「もう一度あそぶ」に重なる
  for(let i=0;i<40;i++){await tap(i%2?pb.x+6:px,py);await run(180)}
  assert.equal(await on('over'),true,'the result stays while the player keeps tapping'+tag);
  s=await st();assert.equal(s.running,false);assert.equal(s.music,false);
  assert.equal((await page.evaluate(()=>window.__posts)).length,1,'the score is sent once');
  await page.evaluate(()=>{vis(true);vis(false)});assert.equal((await st()).music,false,'returning on the result screen does not start the music');
  // 手を止めてから「もう一度あそぶ」を2度押し
  await run(450);p=await low('#bRetry');
  await tap(p[0],p[1]);await run(150);await tap(p[0],p[1]);await run(100);await idle();await run(300);
  assert.deepEqual(await page.evaluate(()=>leftovers()),CLEAN,'nothing is left over after fever, last chance, result and an immediate retry'+tag);
  assert.equal((await st()).music,true);

  /* ---- 音の切り替えが遷移のあとも保たれる ---- */
  await page.locator('#mute').tap();
  assert.equal(await page.locator('#mute').textContent(),'音 OFF');assert.equal((await st()).music,false);
  await page.evaluate(()=>window.__pz.setLives(1)); // ラストチャンスなしで終わらせる
  await run(450);await print();await run(400);
  assert.equal(await on('over'),true);await run(2500);
  // 「タイトルへ」を2度押しても、そのまま次のゲームが始まらない
  const hm=await box('#bHome'),hx=hm.x+hm.width/2,hy=hm.y+6; // 狭い画面では、ここがタイトルの「はじめる」に重なる
  await tap(hx,hy);await run(150);await tap(hx,hy);await run(100);
  assert.equal(await on('title'),true,'a double tap on the title button does not start a game'+tag);assert.equal((await st()).running,false);
  await run(450);await page.locator('#bStart').tap();await run(100);await idle();await run(450);
  let m=await st();
  assert.equal(await page.locator('#mute').textContent(),'音 OFF','mute survives result, title and a new game'+tag);assert.equal(await page.locator('#mute.off').count(),1);assert.equal(m.music,false);
  await page.evaluate(()=>{vis(true);vis(false)});await align();await print();await run(2800);await idle();
  let m2=await st();
  assert.equal(m2.music,false,'returning from the background keeps the sound off');assert.equal(m2.musicNotes,m.musicNotes);assert.equal(m2.audioPlayed,m.audioPlayed,'no voice while muted');
  await page.locator('#mute').tap();
  assert.equal(await page.locator('#mute').textContent(),'音 ON');assert.equal((await st()).music,true,'unmuting brings the music back');
  await page.context().close();
 }
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: double taps on start/retry/title, skip taps, continuous tapping, held knob through a misprint, two fingers on one knob, pointercancel, simulated background return, fever to last chance to result to retry with nothing left over, mute kept across screens (320x568 and 390x844, touch).');
}
main().catch(e=>{console.error(e);process.exit(1)});
