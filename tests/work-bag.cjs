'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const catalogSize=JSON.parse(fs.readFileSync(path.join(__dirname,'..','art','catalog.json'),'utf8')).length;
assert(catalogSize>=153,'keep all the original 153 works');
const lastIndex=catalogSize-1;
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const pick=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+1);assert(i>=0&&j>i,a);return html.slice(i,j)};
const clock=pick('var GRADES=','var SPIN_MIN=')+pick('var TIME_START=','// GRAVITY上部UI')+pick('function cfg(n){','// 称号(刷れた枚数)');
const draw=pick('function rnd(n){','\n',)+pick('function shuffle(a){','\n')+pick('var lastShownWork=-1;','function newSheet(){');
const gen=pick('  var mov=shuffle([0,1,2])','  cur={va:va');
const timing=pick('  lastCarry=lastMode?0:carry;','  var bar=');
const help=pick('    var mile=prints%MILESTONE','    var pts=');
assert.match(html,/loadWork\(va\.mi\)\.then\(function\(\)\{if\(!running\|\|request!==sheetRequest\)return;\n  lastShownWork=va\.mi/);
// The bag reset must survive a retry, independent of which sound code starts.
const start=pick('function start(){','function home(){');
assert.match(start,/\blastShownWork=-1;/,'start clears the last-work marker');
assert.match(start,/\bbag=\[\]/,'start discards the previous shuffled bag');
const ctx=vm.createContext({});
vm.runInContext(clock+'\n'+draw+'\n'+`
var bag=[],W=Array.from({length:${catalogSize}});
var LAST_TIME=5,MILESTONE=10;
var nativeRandom=Math.random;
function seed(n){Math.random=function(){n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
function work(){return lastShownWork=drawWorkIndex()}
function reset(){bag=[];lastShownWork=-1}
function getTiming(prints,isLast,c0){
  var lastMode=isLast,carry=c0,lastCarry,cur,tMax,tLeft,c=cfg(prints);
  if(lastMode)c={tier:c.tier,mov:1,rot:0,scl:0,links:0,u:2.4,range:3,time:LAST_TIME};
  ${gen}
  cur={ax,M,sol};
  ${timing}
  const stock=sheetTime(c,prints)+lastCarry;
  return {stock,tMax,base:cur.tMaxBase,dM:cur.dM,dU:cur.dU,best:cur.best,signature:JSON.stringify([ax,M,sol])};
}
function applyHelp(prints,helps){
  ${help}
  return helps;
}
`,ctx);
const run=s=>vm.runInContext(s,ctx);
run(`Math.random=()=>.999999;lastShownWork=${lastIndex};`);
assert.notEqual(run('work()'),lastIndex,'recreate guaranteed stock failure: identity shuffle would repeat prior endpoint');
assert.equal(run('bag.length'),lastIndex);
assert(run(`bag.includes(${lastIndex})`),'previous art remains available once in the new cycle');
run('reset();Math.random=()=>.999999;');assert.equal(run('work()'),lastIndex,'retry does not inherit old last work');
run('reset();W=[{}];lastShownWork=0;');assert.equal(run('work()'),0,'single work never stalls');
let decks=0,draws=0,lateSamples=0,timingSamples=0;
for(let i=1;i<=256;i++){
 run(`reset();W=Array.from({length:${catalogSize}});seed(${i})`);
 let previous=-1;
 for(let lap=0;lap<4;lap++){
  const cards=run(`Array.from({length:${catalogSize}},work)`);
  assert.equal(new Set(cards).size,catalogSize);
  assert.notEqual(cards[0],previous);
  previous=cards.at(-1);decks++;draws+=cards.length;
 }
}
for(const n of [0,2,3,6,7,11,12,17,18,24,25,35,45,59,75,catalogSize-1,catalogSize,catalogSize+1,300]){
 run('seed(1758)');
 const v=run(`Array.from({length:256},(_,i)=>getTiming(${n},false,i%7))`);
 assert(new Set(v.map(q=>q.signature)).size>(n<3?90:150),'varied puzzle layout, couplings and solution at n='+n);
 v.forEach(q=>{
  assert(q.tMax>=q.stock && q.dM<=q.dU && q.dU<=q.tMax);
  assert(q.dM>=q.best,'modeled fastest reaches best grade');
  assert(q.dM+1e-8>=q.stock*.2 && q.dU+1e-8>=q.stock*.45);
  if(n>=25){
   assert(q.tMax>q.stock && q.dM>q.stock*.2 && q.dU>q.stock*.45,'stronger late configuration budget');
   lateSamples++;
  }
  timingSamples++;
 });
}
const last=run('getTiming(60,true,6)');
assert.equal(last.tMax,5);assert(Math.abs(last.dM-1)<1e-8);assert.equal(last.dU,2.25);
assert.deepEqual(Array.from(run('[applyHelp(4,1),applyHelp(5,1),applyHelp(6,1),applyHelp(9,2),applyHelp(10,2),applyHelp(15,3),applyHelp(25,0)]')),[1,2,1,2,3,3,1]);
console.log(JSON.stringify({decks,draws,timingSamples,lateSamples,helpCases:7,forcedBoundary:'PASS',releaseTimingChanged:false}));
