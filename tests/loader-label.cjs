'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const loading='絵の具を用意しています';
assert.match(html,/<button class="big" id="bStart" aria-busy="true" disabled>絵の具を用意しています<\/button>/);
assert.equal(html.includes('id="loadStatus"'),false);
const code=html.match(/function loadArt\(\)\{[^]*?\n\}/)?.[0];
assert.ok(code);
const button={disabled:true,textContent:loading,attrs:{'aria-busy':'true'},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};
let attempt=0, homeCalls=0, reject, resolve;
const c=vm.createContext({
 artLoading:false,artReady:false,$(id){assert.equal(id,'bStart');return button},
 loadWork(n){assert.equal(n,0);attempt++;return new Promise((a,b)=>{resolve=a;reject=b})},
 home(){homeCalls++}
});
vm.runInContext(code,c);
const settle=()=>new Promise(r=>setImmediate(r));
async function check(){
 c.loadArt();c.loadArt();assert.equal(attempt,1);assert.equal(button.textContent,loading);assert.ok(button.disabled);assert.equal(button.attrs['aria-busy'],'true');
 reject(new Error('fixture load error'));await settle();assert.equal(button.textContent,'読み込み直す');assert.equal(button.disabled,false);assert.equal(button.attrs['aria-busy'],undefined);
 c.loadArt();assert.equal(attempt,2);assert.equal(button.textContent,loading);assert.ok(button.disabled);
 resolve();await settle();assert.equal(button.textContent,'はじめる');assert.equal(button.disabled,false);assert.equal(button.attrs['aria-busy'],undefined);assert.equal(homeCalls,1);
 c.loadArt();assert.equal(attempt,2);
 console.log('PASS: loading label is on the Start button; success and retry restore the button.');
}
check().catch(e=>{console.error(e);process.exitCode=1});
