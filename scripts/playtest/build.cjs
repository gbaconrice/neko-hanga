#!/usr/bin/env node
// 人の試遊を測るための「計測版」を、公開している index.html から作る。
// 出力は playtest/out/harness.html(.gitignore 済み・コミットしない・公開しない)。
// index.html 自体は変更しない。差し替えはすべて「その文字列がちょうど1回だけある」ことを確かめてから行う。
//   node scripts/playtest/build.cjs [--src index.html] [--out playtest/out/harness.html]
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const VERSION='1';
const ROOT=path.resolve(__dirname,'..','..');
function arg(name,def){const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?path.resolve(process.argv[i+1]):def}
const SRC=arg('--src',path.join(ROOT,'index.html'));
const OUT=arg('--out',path.join(ROOT,'playtest','out','harness.html'));

function fail(msg){console.error('playtest build FAILED: '+msg);process.exit(1)}
function count(s,a){let n=0,i=0;while((i=s.indexOf(a,i))!==-1){n++;i+=a.length}return n}
function git(args){try{return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch(e){return null}}

const html=fs.readFileSync(SRC,'utf8');
const sha=crypto.createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');
const commit=git(['rev-parse','--short','HEAD'])||'unknown';
const dirty=path.resolve(SRC)===path.join(ROOT,'index.html')?git(['status','--porcelain','--','index.html'])!=='':true;
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const guard=read('guard.js'),bridge=read('bridge.js');
const meta={version:VERSION,commit,indexSha256:sha,indexDirty:!!dirty,builtAt:new Date().toISOString()};
const harness=read('harness.js').replace('/*__HX_META__*/null',()=>JSON.stringify(meta));
if(harness.indexOf('"indexSha256"')<0)fail('META placeholder missing in harness.js');
for(const [name,code] of [['guard.js',guard],['bridge.js',bridge],['harness.js',harness]])
 if(/<\/script/i.test(code))fail(name+' must not contain a closing script tag');

// 通信を一切させない(ゲームの埋め込み data: の画像・音・フォントだけ許す)
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

// [名前, 目印(ちょうど1回), 置き換え後]
const PATCHES=[
 ['title','<title>ねこ版画</title>','<title>ねこ版画 計測版</title>'],
 ['csp + remove GRAVITY SDK + storage guard',
  '<script src="https://cdn.gravity.place/fe/sdk/index-1.0.2.min.js"></script>',
  '<meta http-equiv="Content-Security-Policy" content="'+CSP+'">\n<meta name="robots" content="noindex">\n<script>\n'+guard+'</script>'],
 ['bridge object',"(function(){'use strict';","(function(){'use strict';\nvar __hxb={on:false}; // playtest harness"],
 ['start(): late-sheet conditions',"show('game');hud();newSheet();startMusic();","show('game');if(__hxb.on)__hxb.prep();hud();newSheet();startMusic();"],
 ['newSheet(): stop after the trial sheet','function newSheet(){\n  revealing=false;busy=true;var request=++sheetRequest;','function newSheet(){\n  if(__hxb.on&&__hxb.issued){__hxb.nextCalled();return}\n  revealing=false;busy=true;var request=++sheetRequest;'],
 ['newSheet(): seeded random on','  var c=cfg(prints);\n','  var hxR=__hxb.on?__hxb.beginSeed():null;\n  var c=cfg(prints);\n'],
 ['newSheet(): work from seed','var va=variant(bag.pop(),prints,forcedSp||(rareOff?0:undefined));forcedSp=0;','var va=variant(hxR?hxR.work:bag.pop(),prints,forcedSp||(rareOff?0:undefined));forcedSp=0;'],
 ['newSheet(): seeded random off','cur={va:va,cols:cols(va),ax:ax,M:M,sol:sol,v:ax.map(function(){return 0}),u:c.u,tier:c.tier,moves:0};','cur={va:va,cols:cols(va),ax:ax,M:M,sol:sol,v:ax.map(function(){return 0}),u:c.u,tier:c.tier,moves:0};if(hxR)__hxb.endSeed(cur);'],
 ['newSheet(): operable',"busy=false;tapHold();draw();anim('pin',240);","busy=false;tapHold();draw();anim('pin',240);if(__hxb.on)__hxb.ready();"],
 ['onPrint(): accepted','if(!running||busy||!artReady||tapHeld())return;au();','if(!running||busy||!artReady||tapHeld())return;au();if(__hxb.on)__hxb.printAccepted();'],
 ['onPrint(): grade','var spent=tMax-tLeft,grade=spent<=cur.dM?2:spent<=cur.dU?1:0,back=false,up=rank(prints+1)!==rank(prints);','var spent=tMax-tLeft,grade=spent<=cur.dM?2:spent<=cur.dU?1:0,back=false,up=rank(prints+1)!==rank(prints);if(__hxb.on)__hxb.graded(grade);'],
 ['onPrint(): misprint',"var missMsg=total===1?'あと1目盛り！':most<=1?'おしい！ あと少し':'まだずれています';","var missMsg=total===1?'あと1目盛り！':most<=1?'おしい！ あと少し':'まだずれています';if(__hxb.on)__hxb.miss(total,most);"],
 ['judge shown','function judge(g){','function judge(g){if(__hxb.on)__hxb.judgeShown(g);'],
 ['timeout','function onTimeout(){','function onTimeout(){if(__hxb.on)__hxb.timeout();'],
 ['slide','if(gone)return;gone=true;skipReveal=null;clearTimeout(timer);','if(gone)return;gone=true;skipReveal=null;clearTimeout(timer);if(__hxb.on)__hxb.slide();'],
 ['sendScore(): no postMessage',"try{window.parent.postMessage({type:'gameOver',score:score},'*')}catch(e){}","try{__hxb.wouldSend.push({type:'gameOver',score:score,t:Math.round(performance.now())})}catch(e){} // 計測版: 送らずに記録だけ"],
 ['openCheck(): no storage probe',"try{localStorage.setItem('neko_check','1');localStorage.removeItem('neko_check');store='使えます'}catch(e){}","store='計測版では確かめません';"],
 ['debug hook always on',"try{if(new URLSearchParams(location.search).get('debug'))window.__pz={","try{if(true)window.__pz={"],
 ['bridge code','/* まだ出ていない絵の山 */}}catch(e){}','/* まだ出ていない絵の山 */}}catch(e){}\n'+bridge],
 ['harness UI','</body>','<script>\n'+harness+'</script>\n</body>'],
];

let out=html;
for(const [name,anchor,repl] of PATCHES){
 const n=count(out,anchor);
 if(n!==1)fail('anchor for "'+name+'" found '+n+' times (expected exactly 1): '+JSON.stringify(anchor.slice(0,80)));
 out=out.replace(anchor,()=>repl);
}

// 仕上がりの確認: 外への通信・送信・保存につながる記述が残っていないこと
const game=out.replace(guard,''); // 見張り(guard.js)は送信・保存の関数を「上書きする」側なので、確認から外す
const banned=[['gravity.place',0],['postMessage',0],['localStorage',0],['sessionStorage',0],['indexedDB',0],['sendBeacon',0],['XMLHttpRequest',0],['WebSocket',0],['fetch(',0],['<link',0],['<iframe',0],['src="http',0],['src=\'http',0]];
for(const [tok,max] of banned){const n=count(game,tok);if(n>max)fail('output still contains '+JSON.stringify(tok)+' ('+n+'x)')}
if(count(out,'Content-Security-Policy')!==1)fail('CSP meta missing');
if(out.indexOf('Content-Security-Policy')>out.indexOf('<script'))fail('CSP must come before the first script');

fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,out);
console.log('playtest harness written: '+path.relative(process.cwd(),OUT)+' ('+(out.length/1e6).toFixed(1)+' MB) commit '+commit+(dirty?' (index.html dirty)':'')+' index sha256 '+sha.slice(0,12)+' patches '+PATCHES.length);
