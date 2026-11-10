const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await p.addInitScript(()=>{
   window.fetch=()=>Promise.reject(Error('WebView connect-src blocks fetch'));
   const Native=window.AudioContext;
   window.AudioContext=class extends Native{constructor(...args){super(...args);
    const analyser=this.createAnalyser();analyser.connect(this.destination);window.audioProbe=analyser;
    const gain=this.createGain.bind(this),dest=this.destination;
    this.createGain=()=>{const g=gain(),connect=g.connect.bind(g);g.connect=(target,...rest)=>connect(target===dest?analyser:target,...rest);return g};
   }};
  });
  await p.route('https://cdn.gravity.place/**',r=>r.abort());
  await p.goto('http://127.0.0.1:4173/?debug=1');await p.waitForFunction(()=>window.__pz?.state().artReady);
  assert.equal(await p.title(),'ねこ版画');assert.equal(await p.locator('#printLabel').count(),0);
  await p.click('#bStart');await p.waitForFunction(()=>window.__pz.state().meows===1);
  assert.equal(await p.locator('.paw:not(.spent)').count(),3);
  await p.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await p.click('#bPrint');
  await p.waitForFunction(()=>window.__pz.state().audioPlayed>0);
  await p.waitForFunction(()=>{
   const a=new Float32Array(window.audioProbe.fftSize);window.audioProbe.getFloatTimeDomainData(a);
   return a.reduce((sum,v)=>sum+v*v,0)/a.length>.00001;
  });
  assert.equal(await p.evaluate(()=>window.__pz.state().audioContext),'running');
  await p.waitForTimeout(150);
  await p.waitForTimeout(600); // 背景が広がりきってから比べる
  await p.evaluate(()=>{window.firstPrint=document.querySelector('#cv').getContext('2d').getImageData(0,0,document.querySelector('#cv').width,document.querySelector('#cv').height).data});
  await p.waitForTimeout(650);
  const motion=await p.evaluate(()=>{
   const c=document.querySelector('#cv'),p=window.__pz,v=p.cur().va,w=p.W[v.mi],s=c.width;
   // 複数の猫がいる絵は、それぞれの頭のまわりだけが動く。
   const zones=(w.motionTargets&&w.motionTargets.length?w.motionTargets:[w.motion]).map(m=>({hx:(.12+.76*(v.flip?1-m.x:m.x))*s,hy:(.12+.76*m.y)*s,rx:m.rx*.76*s,ry:m.ry*.76*s}));
   const now=c.getContext('2d').getImageData(0,0,s,s).data;let inside=0,outside=0;
   for(let i=0;i<now.length;i+=4){let diff=false;for(let j=0;j<3;j++)if(Math.abs(now[i+j]-window.firstPrint[i+j])>3)diff=true;
    if(diff){const x=i/4%s,y=Math.floor(i/4/s);if(zones.some(z=>x>=z.hx-z.rx-2&&x<=z.hx+z.rx+2&&y>=z.hy-z.ry-2&&y<=z.hy+z.ry+2))inside++;else outside++}
   }return {inside,outside};
  });
  assert(motion.inside>50,'illustrated cat moves');assert.equal(motion.outside,0,'background and surrounding art stay still');
  await p.screenshot({path:'/workspace/scratch/completed-cat.png'});
  await p.click('#mute');assert.equal(await p.evaluate(()=>window.__pz.state().activeVoices),0);
  console.log('PASS: all paired works; cat motion changes',motion.inside,'pixels; background is fixed; direct embedded audio produces a signal with fetch blocked; mute stops voices.');
  const fallback=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'});
  await fallback.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;window.fetch=()=>Promise.reject(Error('blocked'))});
  await fallback.route('https://cdn.gravity.place/**',r=>r.abort());
  await fallback.goto('http://127.0.0.1:4173/?debug=1');await fallback.waitForFunction(()=>window.__pz?.state().artReady);
  await fallback.tap('#bStart');await fallback.waitForTimeout(200);
  await fallback.evaluate(()=>{const c=window.__pz.cur();c.v=c.sol.slice()});await fallback.tap('#bPrint');
  await fallback.waitForFunction(()=>window.__pz.state().audioPlayed>0);
  assert.equal(await fallback.evaluate(()=>window.__pz.state().audioContext),'unsupported');
  console.log('PASS: mobile HTMLAudio voice fallback without Web Audio or fetch.');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exit(1)});
