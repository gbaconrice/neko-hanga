'use strict';
// Executes the candidate's real voice and mute handlers with deterministic Web Audio and HTML media stand-ins.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const voice=html.slice(html.indexOf('var ac=null,muted=false;'),html.indexOf('// 短い雑音'));
const mute=html.slice(html.indexOf("$('mute').addEventListener('click'"),html.indexOf("window.addEventListener('resize'",html.indexOf("$('mute').addEventListener('click'")));
assert(voice.length>1000&&mute.length>100);
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
function make({mobile=false,web=true}={}){
 const events={media:[],web:[],stops:[],decodes:[]};
 const keys=new Map(),svg1={},svg2={};
 const choice={svg:[svg1,svg2],label:'音',setAttribute:(k,v)=>keys.set(k,v),removeAttribute:k=>keys.delete(k),addEventListener(k,fn){this[k]=fn},classList:{toggle(){}}};
 Object.defineProperty(choice,'textContent',{set(){throw Error('never replace mute icon SVG nodes')}});
 let el,context;
 class Audio {
  constructor(src){this.src=src;el=this}
  addEventListener(){}
  setAttribute(){}
  pause(){this.paused=true}
  play(){events.media.push({uri:this.src,muted:this.muted});this.paused=false;return this.script?.()??Promise.resolve()}
 }
 class AC {
  constructor(){this.state='running';this.currentTime=1;context=this}
  createGain(){return {gain:{},connect(){},disconnect(){}}}
  createBuffer(){return 'warm'}
  createBufferSource(){
   return {connect(){},disconnect(){},start(){if(this.buffer!=='warm')events.web.push(this.buffer)},stop(){events.stops.push(this.buffer)}};
  }
  decodeAudioData(b,success,fail){
   const bytes=Buffer.from(new Uint8Array(b));
   events.decodes.push(bytes.length);
   if(this.decodeFailure){fail(Error('test decoder failure'));return}
   success(bytes);
  }
 }
 const shell=vm.createContext({window:web?{AudioContext:AC}:{},navigator:{userAgent:mobile?'iPhone':'Linux'},Audio,$:()=>choice,atob:s=>Buffer.from(s,'base64').toString('latin1'),console,setTimeout,
  running:true,startMusic(){},stopMusic(){}});
 const run=s=>vm.runInContext(s,shell);
 run(voice+'\n'+mute);
 return {choice,keys,run,events,element:()=>el,context:()=>context};
}
(async()=>{
 const web=make();
 const voices=JSON.parse(web.run('JSON.stringify(CAT_VOICES)'));
 assert.equal(voices.length,3);
 assert(voices.every(x=>/^data:audio\/mpeg;base64,[A-Za-z0-9+/]+=*$/.test(x)));
 const files=voices.map(x=>Buffer.from(x.split(',')[1],'base64'));
 assert.deepEqual(files.map(bytes=>createHash('sha256').update(bytes).digest('hex')),[
  '995d04d0a50de80217e1d755a7b8363d19f21e2340075688c5f64f4cf84fd046',
  '2d8a23cf52405592f4b9f0741ce12170f6faceaec89e2d236078a155527aedd4',
  '5855d18637ac5978573cb2612ee7749fb2de3b1d7f43e12864f2ecda8c04ee9d',
 ],'the three validated recordings are embedded in the expected order');
 assert.equal(new Set(files.map(x=>x.length)).size,3);
 web.run('unlockSound()');await settle();
 assert(web.events.media[0].muted,'unlock warms the HTML element silently');
 assert.equal(web.events.decodes.length,3,'each asset is decoded once at unlock');
 for(let i=0;i<4;i++){web.run('meow()');await settle()}
 assert.deepEqual(web.events.web,[files[0],files[1],files[2],files[0]]);
 assert.equal(web.events.decodes.length,3,'repeated successes reuse decoded data');
 assert.equal(web.run('audioPlayed'),4);
 web.choice.click();assert.equal(web.keys.get('aria-pressed'),'false');assert.equal(web.run('activeMeows.length'),0);
 assert.equal(web.events.stops.length,4);web.run('meow()');await settle();assert.equal(web.run('audioPlayed'),4,'mute blocks new voices');
 web.choice.click();assert.equal(web.keys.get('aria-pressed'),'true');web.run('meow()');await settle();
 assert.deepEqual(web.events.web.at(-1),files[1],'mute does not advance the voice');
 const ios=make({mobile:true,web:false});
 ios.run('unlockSound()');await settle();
 for(let i=0;i<4;i++){ios.run('meow()');await settle()}
 assert.deepEqual(ios.events.media.filter(x=>!x.muted).map(x=>Buffer.from(x.uri.split(',')[1],'base64')),[files[0],files[1],files[2],files[0]]);
 assert.equal(ios.run('audioPlayed'),4,'WebView fallback cycles all variants, with no WebAudio');
 ios.element().script=()=>Promise.reject(Error('not allowed'));
 ios.run('meow()');await settle();
 const blockedUri=ios.events.media.at(-1).uri;
 assert.equal(ios.run('audioState'),'blocked');
 assert.equal(ios.keys.get('aria-label'),'音を再開');assert.equal(ios.choice.svg.length,2);
 ios.element().script=null;
 ios.choice.click();await settle();
 assert.equal(ios.keys.get('aria-label'),'音');assert.equal(ios.keys.has('title'),false);
 assert.equal(ios.events.media.at(-1).uri,blockedUri,'retry plays the same blocked sample');
 assert.equal(ios.run('audioPlayed'),5);ios.choice.click();
 assert(ios.element().muted&&ios.element().paused,'mute immediately pauses HTML media');
 const race=make({mobile:true,web:false});
 race.run('unlockSound()');await settle();
 let end;race.element().script=()=>new Promise(r=>{end=r});
 race.run('meow()');race.choice.click();end();await settle();
 assert.equal(race.run('audioPlayed'),0,'stale HTML promise must not count or unmute');
 const i2=make({mobile:true,web:true});
 i2.run('unlockSound()');await settle();i2.element().script=()=>Promise.reject(Error('not allowed'));
 i2.run('meow()');await settle();assert.deepEqual(i2.events.web,[files[0]],'HTML policy failures fall back to Web Audio where supported');
 console.log('PASS: three embedded variants; Web Audio and iOS fallback; block/retry preserves icons; mute and pending-play races');
})().catch(e=>{console.error(e);process.exitCode=1});
