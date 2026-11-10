const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://cdn.gravity.place/**',r=>r.abort());
  await p.goto('http://127.0.0.1:4173/?debug=1');
  await p.waitForFunction(()=>window.__pz?.state().artReady);
  await p.tap('#bStart');await p.waitForTimeout(300);
  const cell=p.locator('.kn').first(),dial=cell.locator('.dial');
  const box=await dial.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,r=box.width*.36;
  const initial=await p.evaluate(()=>({v:window.__pz.cur().v[0],scale:visualViewport.scale}));
  for(let i=0;i<8;i++)await p.touchscreen.tap(cx+r,cy);
  assert.equal(await p.evaluate(()=>window.__pz.cur().v[0]),initial.v+8,'each rapid right tap moves one step');
  for(let i=0;i<3;i++)await p.touchscreen.tap(cx-r,cy);
  assert.equal(await p.evaluate(()=>window.__pz.cur().v[0]),initial.v+5,'left taps still work');
  assert.equal(await p.evaluate(()=>visualViewport.scale),initial.scale,'rapid taps do not zoom');
  // The non-passive guard also cancels native touch defaults in WebViews that
  // ignore touch-action. Scope includes the dial marker, not just its parent.
  assert.deepEqual(await p.evaluate(()=>{
   const target=document.querySelector('.dial i'),out={};
   for(const type of ['touchstart','touchend']){const e=new Event(type,{bubbles:true,cancelable:true});target.dispatchEvent(e);out[type]=e.defaultPrevented}
   const click=new Event('click',{bubbles:true,cancelable:true});document.querySelector('#mute').dispatchEvent(click);out.buttonClickPrevented=click.defaultPrevented;
   return out;
  }),{touchstart:true,touchend:true,buttonClickPrevented:false});
  await p.evaluate(()=>{window.__pz.cur().v[0]=0});
  const cdp=await p.context().newCDPSession(p);
  const point=a=>({x:cx+r*Math.cos(a*Math.PI/180),y:cy+r*Math.sin(a*Math.PI/180)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(-20)]});
  for(const a of [-10,0,30,60,90])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(a)]});
  await p.waitForTimeout(150); // 指を止めてから離す(弾いた勢いで回る動きは tests/joy.cjs で確かめる)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await p.evaluate(()=>window.__pz.cur().v[0]),3,'circular touch drag still rotates three steps');
  assert.equal(await p.evaluate(()=>visualViewport.scale),initial.scale);
  await p.tap('#bPrint'); // intentionally unaligned: native button click must still fire
  assert.equal(await p.evaluate(()=>window.__pz.state().lives),2);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile rapid right/left taps, unchanged zoom scale, cancelable touch defaults, circular touch drag, button activation.');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exit(1)});
