/* ===== 計測版だけの橋渡し(ゲームの閉じた範囲の中に差し込む) =====
   ゲームの状態を読み書きできるのはここだけ。外の計測画面(harness.js)には window.__hx だけを見せる。
   正解(sol)は外へ渡さない。外へ渡すのは「目盛りの数(絶対値)」と問題の指紋(ハッシュ)だけ。 */
(function(){
  var H=__hxb,origRandom=null,PIN_MS=240,MISS_BUSY_MS=320;
  H.trial=null;H.issued=false;H.wouldSend=[];H.listener=null;
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function mix(seed,n){var h=2166136261>>>0,s=String(seed)+'|'+String(n);for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h}
  function fnv(s){var h=2166136261>>>0;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return ('0000000'+h.toString(16)).slice(-8)}
  function rel(t){return Math.round((performance.now()-t.t0)*10)/10}
  function emit(type){if(H.listener)try{H.listener(type,H.trial)}catch(e){}}
  function restore(){if(origRandom){Math.random=origRandom;origRandom=null}}
  // start() の初期化のあと、最初の紙を作る前に呼ばれる: 後半の普通の紙と同じ条件にする
  H.prep=function(){
    var t=H.trial;if(!t)return;
    t.waitTouchWouldBe=!!waitTouch;waitTouch=false;firstPlay=false;
    prints=t.n;lives=3;shownLives=3;lastUsed=false;lastMode=false;carry=0;lastCarry=0;fever=0;feverGauge=0;streak=0;comeback=0;
    told={start:1,two:1,r:1,link:1,s:1}; // 後半の紙では、操作の案内はもう出ない
    forcedSp=0;rareOff=!!t.rareOff;
    screenUntil=0; // 後半の紙は「画面が替わった直後」ではない(紙替わりの「刷る」受け流しは newSheet が普段どおり掛ける)
    t.conditions={lives:lives,carry:carry,fever:fever,feverGauge:feverGauge,streak:streak,helpsAtStart:helps,tapGuardMs:TAP_GUARD_MS,knobScreenGuardCleared:true,waitTouchActive:false,waitTouchWouldBe:t.waitTouchWouldBe,rareMode:t.rareOff?'rareOff(true)':'seed',hintsSuppressed:true};
  };
  // newSheet の乱数を種から作る(作り終わったら Math.random を戻す)
  H.beginSeed=function(){
    var t=H.trial;if(!t||H.issued)return null;H.issued=true;
    var r=mulberry32(mix(t.seed,t.n)),work=Math.floor(r()*W.length);
    origRandom=Math.random;Math.random=r;setTimeout(restore,0); // 万一途中で止まっても戻す
    return {work:work};
  };
  H.endSeed=function(c){
    restore();var t=H.trial;if(!t)return;
    var links=0,steps=c.sol.map(function(s){return Math.abs(s)});
    for(var i=0;i<c.M.length;i++)for(var j=0;j<c.M.length;j++)if(i!==j&&c.M[i][j])links++;
    t.puzzle={workId:c.va.mi,workName:W[c.va.mi].n,flip:c.va.flip,rare:!!(c.va.spHide||c.va.sp),rareKind:c.va.spHide||c.va.sp||0,tier:c.tier,
      axes:c.ax.map(function(a){return {plate:a.p,type:a.t}}),M:c.M.map(function(r){return r.slice()}),linkCount:links,
      stepsPerKnob:steps,stepsTotal:steps.reduce(function(a,b){return a+b},0),
      key:fnv(JSON.stringify([c.va.mi,c.va.flip,c.ax,c.M,c.sol]))};
  };
  // 紙が操作できるようになった(busy=false)。入場アニメ(.paper.pin)が終わった時刻を「表示」とする
  H.ready=function(){
    var t=H.trial;if(!t||t.tl.t_operable!=null)return;
    t.tl.t_operable=rel(t);
    t.puzzle.best=cur.best;t.puzzle.tMax=tMax;t.puzzle.tMaxBase=cur.tMaxBase;t.puzzle.dM=cur.dM;t.puzzle.dU=cur.dU;t.conditions.lastCarry=lastCarry;t.conditions.waitTouchAtReady=!!waitTouch;
    var an=[];try{an=paper.getAnimations().filter(function(a){return a.animationName==='pin'})}catch(e){}
    function done(m){if(H.trial!==t||t.tl.t_ready!=null)return;t.tl.t_ready=rel(t);t.readyMethod=m;emit('ready')}
    if(an.length)an[0].finished.then(function(){done('pin animation finished')},function(){done('pin animation removed by the game (240ms timer)')});
    else{t.tl.t_ready=t.tl.t_operable;t.readyMethod='no pin animation: busy=false time';emit('ready')}
    emit('operable');
  };
  H.printAccepted=function(){var t=H.trial;if(!t||t.tl.t_print!=null)return;t.tl.t_print=rel(t);t.gameTimeUsedS=Math.round((tMax-tLeft)*1000)/1000;t._accepted=true};
  H.graded=function(g){var t=H.trial;if(!t)return;t.grade=g;t.outcome=GRADES[g][0];t.tl.t_grade=rel(t)};
  H.judgeShown=function(){var t=H.trial;if(!t||t.tl.t_judge!=null)return;t.tl.t_judge=rel(t);emit('judge')};
  H.miss=function(total,most){
    var t=H.trial;if(!t)return;t.outcome='ミス';t.missOff={total:total,most:most};t.tl.t_judge=rel(t);
    // ゲームでは MISS_BUSY_MS 後に同じ紙がまた操作できる。それを見届けてから試行を終える
    setTimeout(function(){if(H.trial!==t)return;t.tl.t_nextReadyWouldBe=rel(t);t.nextReadyMethod='measured: same sheet operable again (busy='+(!!busy)+')';H.finish()},MISS_BUSY_MS+30);
  };
  H.timeout=function(){var t=H.trial;if(!t)return;t.outcome='時間切れ';t.tl.t_judge=rel(t);t.gameTimeUsedS=Math.round(tMax*1000)/1000};
  H.slide=function(){var t=H.trial;if(t&&t.tl.t_slide==null)t.tl.t_slide=rel(t)};
  // 次の紙を作ろうとした: 計測版では作らずに試行を終える
  H.nextCalled=function(){
    var t=H.trial;if(!t){return}
    t.tl.t_nextCall=rel(t);t.tl.t_nextReadyWouldBe=Math.round((t.tl.t_nextCall+PIN_MS)*10)/10;
    t.nextReadyMethod='estimate: next newSheet() call + '+PIN_MS+'ms entry animation (excludes art decode time)';
    H.finish();
  };
  H.finish=function(outcome){
    var t=H.trial;if(!t)return;if(outcome&&!t.outcome)t.outcome=outcome;
    t.tl.t_end=rel(t);restore();H.on=false;H.trial=null;H.issued=false;
    home();if(H.listener)try{H.listener('end',t)}catch(e){}
  };
  window.__hx={
    start:function(seed,n){
      if(!artReady||H.on)return null;
      H.trial={seed:seed,n:n,t0:performance.now(),epochStart:Date.now(),rareOff:false,tl:{},puzzle:null,conditions:null};
      H.on=true;H.issued=false;start();
      if(!running||!H.trial){H.on=false;H.trial=null;return null}
      return H.trial;
    },
    abort:function(){if(H.trial)H.finish('中断')},
    active:function(){return H.trial},
    artReady:function(){return !!artReady},
    snap:function(){return {running:running,busy:busy,revealing:revealing,skip:!!skipReveal,now:performance.now(),guardUntil:guardUntil,screenUntil:screenUntil,spinning:spinning,helps:helps,v:cur?cur.v.slice():null,ax:cur?cur.ax.map(function(a){return a.t}):null,plates:cur?cur.ax.map(function(a){return a.p}):null,reducedMotion:!!reducedMotion}},
    wouldSend:function(){return H.wouldSend.slice()},
    listen:function(f){H.listener=f}
  };
})();
