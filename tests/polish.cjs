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
 const h0=await page.locator('#hero canvas').evaluate(c=>c.toDataURL());
 await page.clock.runFor(900);
 assert.notEqual(await page.locator('#hero canvas').evaluate(c=>c.toDataURL()),h0,'the title cat moves');
 const heroes=new Set([(await st(page)).hero]);
 for(let i=0;i<4;i++){await page.click('#hero');heroes.add((await st(page)).hero)}
 assert(heroes.size>1,'tapping the title art shows another work');
 await page.click('#bStart');
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

 // 結果画面: 刷った瞬間の控えを並べる(描き直さない)。タップで大きく見られる。
 await page.evaluate(()=>window.__pz.setLives(1));
 await page.click('#bPrint');
 await page.waitForFunction(()=>!window.__pz.state().running);
 s=await st(page);assert.equal(s.prints,5);assert.equal(s.shots,5);
 assert.equal(await page.locator('#oGrid .cell canvas').count(),5);
 assert.equal(await page.locator('.paw.spent').count(),3);
 assert(await page.evaluate(()=>[...document.querySelectorAll('#oGrid canvas')].every(c=>{
  const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;
  for(let k=0;k<d.length;k+=4)if(Math.abs(d[k]-245)>8||Math.abs(d[k+1]-239)>8||Math.abs(d[k+2]-222)>8)n++;
  return c.width===168&&n/(c.width*c.height)>.2;
 })),'every result thumbnail carries its finished print');
 assert.equal(await page.locator('#view.on').count(),0);
 const played=(await st(page)).audioPlayed;
 await page.locator('#oGrid .cell').nth(1).click();
 assert.equal(await page.locator('#view.on').count(),1);
 assert.equal((await st(page)).view,1);
 const names=await page.evaluate(()=>[...document.querySelectorAll('#oGrid .cell span')].map(e=>e.textContent.replace('★','')));
 assert((await page.locator('#vName').textContent()).includes(names[1]));
 const box=await page.locator('#vPaper').boundingBox(),rowBox=await page.locator('#view .row').boundingBox();
 assert(box.width>=160&&box.y>=98&&rowBox.y+rowBox.height<=844,'viewer fits below the GRAVITY header');
 // 拡大表示では猫が動く。
 const f0=await page.locator('#vcv').evaluate(c=>c.toDataURL());
 await page.clock.fastForward(900);
 assert.notEqual(await page.locator('#vcv').evaluate(c=>c.toDataURL()),f0,'the cat moves in the viewer');
 await page.click('#vNext');assert.equal((await st(page)).view,2);
 await page.click('#vPrev');await page.click('#vPrev');assert.equal((await st(page)).view,0);
 await page.click('#vPrev');assert.equal((await st(page)).view,4,'stepping wraps around');
 await page.waitForFunction(n=>window.__pz.state().audioPlayed>n,played);
 await page.screenshot({path:'/workspace/scratch/viewer.png'}).catch(()=>{});
 await page.click('#vClose');
 assert.equal(await page.locator('#view.on').count(),0);
 assert.equal(await page.evaluate(()=>window.scoreMessages.length),1);
 // もう一度: 拡大表示は閉じ、前の回の作品は残らない。
 await page.locator('#oGrid .cell').first().click();
 await page.click('#vClose');await page.click('#bRetry');
 s=await st(page);assert.equal(s.view,-1);assert.equal(s.shots,0);assert(s.running);
 // 複数の猫がいる絵: 2匹とも動き、頭のまわり以外は動かない。
 const multi=await page.evaluate(()=>{
  const p=window.__pz,i=p.W.findIndex(w=>w.motionTargets&&w.motionTargets.length>1),v={mi:i,sp:0,flip:0},s=256;
  const a=p.frame(v,s,.001).getContext('2d').getImageData(0,0,s,s).data,b=p.frame(v,s,.9).getContext('2d').getImageData(0,0,s,s).data;
  const zones=p.W[i].motionTargets.map(m=>({hx:(.12+.76*m.x)*s,hy:(.12+.76*m.y)*s,rx:m.rx*.76*s,ry:m.ry*.76*s})),moved=zones.map(()=>0);let outside=0;
  for(let k=0;k<a.length;k+=4){let diff=false;for(let j=0;j<3;j++)if(Math.abs(a[k+j]-b[k+j])>3)diff=true;if(!diff)continue;
   const x=k/4%s,y=Math.floor(k/4/s);let hit=false;
   zones.forEach((z,n)=>{if(x>=z.hx-z.rx-2&&x<=z.hx+z.rx+2&&y>=z.hy-z.ry-2&&y<=z.hy+z.ry+2){moved[n]++;hit=true}});if(!hit)outside++}
  return {i,moved,outside,count:p.W.filter(w=>w.motionTargets&&w.motionTargets.length>1).length};
 });
 assert(multi.i>=0&&multi.count>=20);assert(multi.moved.every(n=>n>20),'every cat moves '+JSON.stringify(multi));assert.equal(multi.outside,0,'art outside the cats stays still');
 await page.close();

 // 小さい画面でも拡大表示が収まる。
 const small=await open('http://127.0.0.1:4173/?debug=1&top=74',{width:320,height:568});
 await small.click('#bStart');await solve(small);
 await small.waitForFunction(()=>!window.__pz.state().busy);
 await small.evaluate(()=>window.__pz.setLives(1));await small.click('#bPrint');
 await small.waitForFunction(()=>!window.__pz.state().running);
 await small.locator('#oGrid .cell').first().click();
 const sb=await small.locator('#vPaper').boundingBox(),sr=await small.locator('#view .row').boundingBox();
 assert(sb.y>=74&&sr.y+sr.height<=568&&sb.width>=160,'viewer fits a 320x568 screen '+JSON.stringify({sb,sr}));
 await small.close();

 // GRAVITY用の入口: 5000文字未満。iframeなしで本体を展開し、そのまま遊べて得点を送る。
 assert(fs.readFileSync(path.join(root,'gravity-entry.html'),'utf8').length<5000);
 const entry=await open('http://127.0.0.1:4173/gravity-entry.html?debug=1&top=98');
 assert.equal(await entry.locator('iframe').count(),0);
 assert.equal(await entry.locator('#who').textContent(),'テスト刷り師');
 assert.equal(await entry.evaluate(()=>getComputedStyle(document.querySelector('#app')).position),'fixed','game styles are applied');
 await entry.click('#bStart');await solve(entry);
 await entry.waitForFunction(()=>!window.__pz.state().busy);
 await entry.evaluate(()=>window.__pz.setLives(1));await entry.click('#bPrint');
 await entry.waitForFunction(()=>window.scoreMessages.length===1);
 assert((await entry.evaluate(()=>window.scoreMessages[0].score))>0);
 await entry.close();

 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: live title art, first-touch timer and knob hint, plate focus, background bloom, reveal skip by paper/print button and auto-advance, low-time warning, result snapshots, viewer (motion, voice, stepping, small screen), multi-cat motion, GRAVITY entry loader without iframe.');
}
main().catch(e=>{console.error(e);process.exit(1)});
