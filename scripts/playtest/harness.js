/* ねこ版画 計測版(人が遊ぶ時間を測るための画面)。scripts/playtest/build.cjs が生成するコピーにだけ入る。
   記録はこのページのメモリの中だけ。外へ出すのは「結果をコピー」「JSONを書き出し」を押したときだけ。
   この画面は正解を表示しない・自動で合わせない。 */
(function(){
  'use strict';
  var META=/*__HX_META__*/null;
  var HX=window.__hx;
  if(!HX||!META)return;
  var trials=[],seen={},active=null,lastStart=null,collapsed=false,clearArmed=0,pointerTypes={};
  function $(id){return document.getElementById(id)}
  function el(tag,attrs,text){var e=document.createElement(tag);if(attrs)for(var k in attrs)if(Object.prototype.hasOwnProperty.call(attrs,k))e.setAttribute(k,attrs[k]);if(text!==undefined)e.textContent=text;return e}
  function rnd6(){var a=new Uint32Array(1);try{crypto.getRandomValues(a)}catch(e){a[0]=Math.floor(Math.random()*4294967295)}return 1+(a[0]%999999)}
  function r1(x){return x==null?null:Math.round(x*10)/10}
  function sub(a,b){return a==null||b==null?null:r1(a-b)}
  function sec(ms){return ms==null?'—':(ms/1000).toFixed(2)}
  function label(n){return '挑戦中 '+(n+1)+'枚目（刷り済み n='+n+'）'}
  function kindOf(seed,n){var k=seen[seed+'|'+n]||0;return k===0?{kind:'初見',attempt:1}:{kind:'反復',attempt:k+1}}
  function kindText(k){return k.kind==='初見'?'初見':'反復 '+k.attempt+'回目'}
  function rel(t){return r1(performance.now()-t.t0)}
  function guardLog(){return (window.__hxGuardLog||[]).slice()}

  /* ---------- 画面 ---------- */
  var css='#hxPanel{position:fixed;inset:0;z-index:60;overflow:auto;-webkit-overflow-scrolling:touch;background:rgba(35,38,45,.97);color:#f5efde;font:13px/1.45 system-ui,sans-serif;padding:10px 16px 24px;box-sizing:border-box}'+
    '#hxPanel *{box-sizing:border-box}#hxPanel h2{font-size:15px;margin:0 0 4px}#hxPanel .hxMeta{font-size:11px;opacity:.75;word-break:break-all}'+
    '#hxPanel fieldset{min-width:0;border:1px solid rgba(245,239,222,.25);border-radius:8px;margin:8px 0;padding:8px}#hxPanel legend{font-size:12px;opacity:.85;padding:0 4px}'+
    '#hxPanel label{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0}#hxPanel input{font:inherit;padding:6px;border-radius:6px;border:1px solid #888;background:#fff;color:#23262d;min-width:0}'+
    '#hxPanel input[type=number]{width:7em}#hxPanel input[type=text]{flex:1;min-width:8em}'+
    '#hxPanel button{font:inherit;font-weight:700;padding:8px 10px;border-radius:8px;border:0;background:#f5efde;color:#23262d;margin:3px 4px 3px 0;min-height:36px}'+
    '#hxPanel button.hxGo{background:#d78479;color:#fff}#hxPanel button:disabled{opacity:.4}'+
    '#hxPanel .hxRow{display:flex;flex-wrap:wrap;align-items:center}#hxPanel .hxNote{font-size:11px;opacity:.8;margin:4px 0}'+
    '#hxPanel .hxWrap{overflow-x:auto;max-width:100%}#hxPanel table{border-collapse:collapse;font-size:11px;white-space:nowrap}#hxPanel td,#hxPanel th{border:1px solid rgba(245,239,222,.2);padding:2px 5px;text-align:right}#hxPanel th{text-align:center}'+
    '#hxPill{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 8px);padding:2px 4px 2px 8px;border-radius:0 0 8px 8px;background:rgba(35,38,45,.8);color:#f5efde;font:11px/1.3 system-ui,sans-serif;white-space:nowrap}'+
    '#hxPill[hidden],#hxPanel[hidden]{display:none}#hxPill button{font:inherit;font-weight:700;padding:3px 8px;border-radius:6px;border:0;background:#f5efde;color:#23262d}#hxPill span{overflow:hidden;text-overflow:ellipsis}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  var panel=el('div',{id:'hxPanel',role:'dialog','aria-label':'計測パネル'});
  panel.appendChild(el('h2',null,'ねこ版画 計測版（人の試遊を測るための画面）'));
  panel.appendChild(el('div',{'class':'hxMeta',id:'hxMeta'},'元のコミット '+META.commit+(META.indexDirty?'（index.html に未コミットの変更あり）':'')+' ／ index.html sha256 '+META.indexSha256.slice(0,16)+'… ／ 計測版 v'+META.version));
  panel.appendChild(el('div',{'class':'hxNote',id:'hxIso'},''));
  var fs1=el('fieldset');fs1.appendChild(el('legend',null,'問題'));
  var lab=el('label');lab.appendChild(el('span',null,'挑戦する紙'));var inN=el('input',{type:'number',id:'hxSheet',min:'1',max:'300',step:'1',value:'45',inputmode:'numeric'});lab.appendChild(inN);lab.appendChild(el('span',null,'枚目'));
  var b45=el('button',{type:'button',id:'hx45'},'45');var b60=el('button',{type:'button',id:'hx60'},'60');lab.appendChild(b45);lab.appendChild(b60);fs1.appendChild(lab);
  fs1.appendChild(el('div',{id:'hxNText'},''));
  var lab2=el('label');lab2.appendChild(el('span',null,'種(seed)'));var inS=el('input',{type:'number',id:'hxSeed',min:'1',max:'999999',step:'1',value:String(rnd6()),inputmode:'numeric'});lab2.appendChild(inS);fs1.appendChild(lab2);
  var lab3=el('label');lab3.appendChild(el('span',null,'記録する人'));var inL=el('input',{type:'text',id:'hxTester',maxlength:'40',placeholder:'例: A（このページの中だけ）',autocomplete:'off'});lab3.appendChild(inL);fs1.appendChild(lab3);
  fs1.appendChild(el('div',{id:'hxKind'},''));
  var row=el('div',{'class':'hxRow'});
  var bStart=el('button',{type:'button',id:'hxStart','class':'hxGo',disabled:'disabled'},'この問題で開始');
  var bSame=el('button',{type:'button',id:'hxSame',disabled:'disabled'},'同じ問題をもう一度');
  var bNew=el('button',{type:'button',id:'hxNew',disabled:'disabled'},'別の問題');
  row.appendChild(bStart);row.appendChild(bSame);row.appendChild(bNew);fs1.appendChild(row);
  fs1.appendChild(el('div',{'class':'hxNote',id:'hxReady'},'絵を準備しています…'));
  panel.appendChild(fs1);
  var fs2=el('fieldset');fs2.appendChild(el('legend',null,'記録（このページのメモリだけ。閉じると消えます）'));
  fs2.appendChild(el('div',{'class':'hxNote'},'区間A「表示→最初の入力」は純粋な「考える時間」ではありません。区間B「最初の入力→最後の入力」も純粋な「操作の時間」ではありません。どちらにも、見て判断することと手を動かすことが混ざっています。'));
  var w1=el('div',{'class':'hxWrap'});w1.appendChild(el('table',{id:'hxTable'}));fs2.appendChild(w1);
  fs2.appendChild(el('div',{'class':'hxNote'},'まとめ（枚目・初見/反復ごと、中央値）'));
  var w2=el('div',{'class':'hxWrap'});w2.appendChild(el('table',{id:'hxSummary'}));fs2.appendChild(w2);
  var row2=el('div',{'class':'hxRow'});
  var bCopy=el('button',{type:'button',id:'hxCopy'},'結果をコピー');var bJson=el('button',{type:'button',id:'hxJson'},'JSONを書き出し');var bClear=el('button',{type:'button',id:'hxClear'},'記録を消す');
  row2.appendChild(bCopy);row2.appendChild(bJson);row2.appendChild(bClear);fs2.appendChild(row2);
  fs2.appendChild(el('div',{'class':'hxNote',id:'hxMsg',role:'status'},''));
  panel.appendChild(fs2);
  var bFold=el('button',{type:'button',id:'hxFold'},'パネルを畳む');panel.appendChild(bFold);
  panel.appendChild(el('div',{'class':'hxNote'},'これは計測用のコピーです。通信・保存・ランキング送信はしません。自動のテスト(スモーク)は人の計測ではありません。'));
  var pill=el('div',{id:'hxPill',hidden:'hidden'});var pillText=el('span',{id:'hxPillText'},'');var pillBtn=el('button',{type:'button',id:'hxPillBtn'},'');pill.appendChild(pillText);pill.appendChild(pillBtn);
  document.body.appendChild(panel);document.body.appendChild(pill);

  function sheetN(){var s=Math.max(1,Math.min(300,Math.round(+inN.value||45)));return s-1}
  function seedV(){var s=Math.round(+inS.value);if(!(s>=1&&s<=999999)){s=rnd6();inS.value=String(s)}return s}
  function refresh(){
    var n=sheetN();$('hxNText').textContent='→ '+(n+1)+'枚目に挑戦（刷り済み n='+n+'）';
    $('hxKind').textContent='この問題の試行: '+kindText(kindOf(seedV(),n));
    var ok=HX.artReady()&&!active;bStart.disabled=!ok;bNew.disabled=!ok;bSame.disabled=!ok||!lastStart;
    $('hxReady').textContent=HX.artReady()?'':'絵を準備しています…';
    var g=guardLog(),ws=HX.wouldSend();
    $('hxIso').textContent='保存の試み '+g.length+'件（すべて止めました） ／ ランキング送信の試み '+ws.length+'件（送っていません）';
  }
  inN.addEventListener('input',refresh);inS.addEventListener('input',refresh);
  b45.addEventListener('click',function(){inN.value='45';refresh()});
  b60.addEventListener('click',function(){inN.value='60';refresh()});
  function showPanel(){panel.hidden=false;pill.hidden=true;collapsed=false;refresh();render()}
  function fold(){panel.hidden=true;pill.hidden=false;collapsed=true;pillText.textContent='計測版';pillBtn.textContent='パネルを開く'}
  bFold.addEventListener('click',fold);
  pillBtn.addEventListener('click',function(){if(active){HX.abort()}else showPanel()});

  /* ---------- 試行 ---------- */
  function begin(seed,n){
    if(active||!HX.artReady())return;
    var k=kindOf(seed,n);
    var t=HX.start(seed,n);if(!t)return;
    seen[seed+'|'+n]=(seen[seed+'|'+n]||0)+1;lastStart={seed:seed,n:n};
    t.kind=k.kind;t.attempt=k.attempt;t.tester=inL.value||'';t.inputs=[];t.printTaps=[];t.helpTaps=[];t.otherTaps=[];t.pointerTypes={};
    active={t:t,press:{}};
    panel.hidden=true;pill.hidden=false;pillText.textContent=label(n)+' ／ 種 '+seed;pillBtn.textContent='中断';
  }
  bStart.addEventListener('click',function(){begin(seedV(),sheetN())});
  bSame.addEventListener('click',function(){if(!lastStart)return;inS.value=String(lastStart.seed);inN.value=String(lastStart.n+1);begin(lastStart.seed,lastStart.n)});
  bNew.addEventListener('click',function(){inS.value=String(rnd6());begin(seedV(),sheetN())});

  HX.listen(function(type,t){if(type==='end')finish(t)});

  function knobIndex(target){
    var cell=target&&target.closest?target.closest('.kn'):null,box=$('knobs');if(!cell||!box||cell.parentNode!==box)return -1;
    return Array.prototype.indexOf.call(box.children,cell);
  }
  function seenType(e){if(e.pointerType){pointerTypes[e.pointerType]=1;if(active)active.t.pointerTypes[e.pointerType]=1}}
  function before(t,x){return t.tl.t_print==null||x<=t.tl.t_print}
  function markInput(t,tDown,tUp){
    if(tDown!=null&&before(t,tDown)&&t.tl.t_firstInput==null)t.tl.t_firstInput=tDown;
    if(tUp!=null&&before(t,tUp))t.tl.t_lastInput=tUp;
  }
  document.addEventListener('pointerdown',function(e){
    if(!active)return;seenType(e);var t=active.t,j=knobIndex(e.target);
    if(j<0){var s0=HX.snap();if(e.target&&e.target.closest&&e.target.closest('#paper')&&s0.revealing)t.otherTaps.push({t:rel(t),what:'paper-during-reveal',pointerType:e.pointerType});return}
    var s=HX.snap(),dial=e.target.closest('.kn').firstChild,r=dial.getBoundingClientRect();
    var p={j:j,id:e.pointerId,axis:s.ax?s.ax[j]:null,plate:s.plates?s.plates[j]:null,pointerType:e.pointerType||'',tDown:rel(t),v0:s.v?s.v[j]:null,
      accepted:!!(s.running&&!s.busy&&s.v&&s.now>=s.screenUntil),cx:r.left+r.width/2,cy:r.top+r.height/2,a:null,acc:0};
    active.press[e.pointerId]=p;
    if(p.accepted)markInput(t,p.tDown,null);
  },true);
  document.addEventListener('pointermove',function(e){
    if(!active)return;var p=active.press[e.pointerId];if(!p)return;
    var dx=e.clientX-p.cx,dy=e.clientY-p.cy;if(dx*dx+dy*dy<144){p.a=null;return}
    var a=Math.atan2(dy,dx)*180/Math.PI;if(p.a===null){p.a=a;return}
    var d=a-p.a;if(d>180)d-=360;if(d<-180)d+=360;p.a=a;p.acc+=d;
  },true);
  function upCapture(e){if(!active)return;var p=active.press[e.pointerId];if(p)p.spinBefore=HX.snap().spinning}
  function upBubble(e){
    if(!active)return;var p=active.press[e.pointerId];if(!p)return;delete active.press[e.pointerId];
    var t=active.t,s=HX.snap(),tUp=rel(t),dur=r1(tUp-p.tDown),moved=Math.abs(p.acc)>7,fling=s.spinning>(p.spinBefore||0);
    var cls=e.type==='pointercancel'?'cancel':moved?(fling?'fling':'drag'):(dur>=500?'long-press':'tap');
    var rec={knob:p.j,axis:p.axis,plate:p.plate,pointerType:p.pointerType,tDown:p.tDown,tUp:tUp,pressMs:dur,angleDeg:r1(p.acc),steps:(s.v&&p.v0!=null)?s.v[p.j]-p.v0:null,kind:cls,accepted:p.accepted};
    t.inputs.push(rec);
    if(p.accepted)markInput(t,null,tUp);
    if(fling){var v0=p.v0,j=p.j,polls=0;(function poll(){if(!active||active.t!==t)return;var q=HX.snap();if(q.spinning>(p.spinBefore||0)&&polls++<80){setTimeout(poll,50);return}rec.stepsAfterSettle=q.v?q.v[j]-v0:null;rec.tSettle=rel(t);if(before(t,rec.tSettle))t.tl.t_lastSettle=rec.tSettle})()}
  }
  document.addEventListener('pointerup',upCapture,true);document.addEventListener('pointercancel',upCapture,true);
  document.addEventListener('pointerup',upBubble,false);document.addEventListener('pointercancel',upBubble,false);
  // 「刷る」: 受け流された押下も残す
  var printPending=null,helpPending=null;
  document.addEventListener('click',function(e){
    if(!active)return;var t=active.t,s=HX.snap();
    if(e.target&&e.target.closest&&e.target.closest('#bPrint'))printPending={t:rel(t),hadPrint:t.tl.t_print!=null,guarded:s.now<s.guardUntil,busy:s.busy,running:s.running,skip:s.skip};
    if(e.target&&e.target.closest&&e.target.closest('#bHelp'))helpPending={t:rel(t),helps:s.helps,guarded:s.now<s.guardUntil,busy:s.busy};
  },true);
  document.addEventListener('click',function(){
    var t=active?active.t:null;
    if(printPending){var p=printPending;printPending=null;if(t){
      var acc=!p.hadPrint&&t.tl.t_print!=null; // この押下で刷れたか
      var reason=acc?null:!p.running?'not-running':p.skip?'reveal-skip':p.busy?'busy':p.guarded?'tap-guard':p.hadPrint?'after-print':'other';
      t.printTaps.push({t:p.t,accepted:acc,ignored:!acc,reason:reason});
    }}
    if(helpPending&&t){var h=helpPending;helpPending=null;var s=HX.snap(),used=s.helps<h.helps;t.helpTaps.push({t:h.t,used:used,ignored:!used,reason:used?null:h.busy?'busy':h.guarded?'tap-guard':h.helps<=0?'none-left':'other'});if(used)markInput(t,h.t,h.t)}
  },false);

  function intervals(tl){
    return {A_show_to_firstInput:sub(tl.t_firstInput,tl.t_ready),B_firstInput_to_lastInput:sub(tl.t_lastInput,tl.t_firstInput),C_lastInput_to_print:sub(tl.t_print,tl.t_lastInput),D_print_to_judge:sub(tl.t_judge,tl.t_print),E_judge_to_nextReady:sub(tl.t_nextReadyWouldBe,tl.t_judge)};
  }
  function finish(t){
    if(!active||active.t!==t)return;active=null;
    var p=t.puzzle||{},c=t.conditions||{};
    var rec={
      harnessVersion:META.version,sourceCommit:META.commit,indexSha256:META.indexSha256,indexDirty:META.indexDirty,builtAt:META.builtAt,
      kindOfData:'human playtest (unless the tester says otherwise)',
      trialNo:trials.length+1,tester:t.tester,kind:t.kind,attempt:t.attempt,
      seed:t.seed,n:t.n,sheetNo:t.n+1,display:label(t.n),epochStart:t.epochStart,
      workId:p.workId,workName:p.workName,flip:p.flip,tier:p.tier,axes:p.axes,M:p.M,linkCount:p.linkCount,stepsPerKnob:p.stepsPerKnob,stepsTotal:p.stepsTotal,puzzleKey:p.key,
      best:p.best,tMax:p.tMax,tMaxBase:p.tMaxBase,dM:p.dM,dU:p.dU,
      carry:c.lives!=null?c.carry:null,lastCarry:c.lastCarry,lives:c.lives,fever:c.fever,feverGauge:c.feverGauge,streak:c.streak,helpsAtStart:c.helpsAtStart,
      tapGuardMs:c.tapGuardMs,knobScreenGuardCleared:c.knobScreenGuardCleared,waitTouch:{active:!!c.waitTouchAtReady,wouldHaveBeen:!!c.waitTouchWouldBe},
      rare:{mode:c.rareMode,rare:!!p.rare,kind:p.rareKind||0},
      env:{viewportW:window.innerWidth,viewportH:window.innerHeight,dpr:window.devicePixelRatio||1,ua:navigator.userAgent,reducedMotion:HX.snap().reducedMotion,pointerTypes:Object.keys(t.pointerTypes)},
      outcome:t.outcome||'中断',grade:t.grade==null?null:t.grade,gameTimeUsedS:t.gameTimeUsedS==null?null:t.gameTimeUsedS,
      timeline:{t_operable:t.tl.t_operable,t_ready:t.tl.t_ready,t_firstInput:t.tl.t_firstInput,t_lastInput:t.tl.t_lastInput,t_lastSettle:t.tl.t_lastSettle,t_print:t.tl.t_print,t_grade:t.tl.t_grade,t_judge:t.tl.t_judge,t_slide:t.tl.t_slide,t_nextCall:t.tl.t_nextCall,t_nextReadyWouldBe:t.tl.t_nextReadyWouldBe,t_end:t.tl.t_end},
      readyMethod:t.readyMethod||null,nextReadyMethod:t.nextReadyMethod||null,
      inputBeforeReady:t.tl.t_firstInput!=null&&t.tl.t_ready!=null&&t.tl.t_firstInput<t.tl.t_ready,
      intervals:intervals(t.tl),
      inputs:t.inputs,printTaps:t.printTaps,helpTaps:t.helpTaps,otherTaps:t.otherTaps,missOff:t.missOff||null,
      isolation:{storageAttempts:guardLog().length,wouldHaveSentGameOver:HX.wouldSend().length}
    };
    for(var k in rec.timeline)if(rec.timeline[k]===undefined)rec.timeline[k]=null;
    trials.push(rec);
    showPanel();
  }

  /* ---------- 表 ---------- */
  function median(a){a=a.filter(function(x){return x!=null}).sort(function(x,y){return x-y});if(!a.length)return null;var m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2}
  function fillTable(tb,head,rows){
    tb.textContent='';var tr=el('tr');head.forEach(function(h){tr.appendChild(el('th',null,h))});tb.appendChild(tr);
    rows.forEach(function(r){var tr=el('tr');r.forEach(function(c){tr.appendChild(el('td',null,c==null?'—':String(c)))});tb.appendChild(tr)});
  }
  function render(){
    fillTable($('hxTable'),['#','枚目(n)','種','種別','結果','A 表示→最初','B 最初→最後','C 最後→刷る','D 刷る→判定','演出待ち','使った秒/制限','入力','刷る押下(無視)'],
      trials.map(function(r){var iv=r.intervals,ign=r.printTaps.filter(function(p){return p.ignored}).length;
        return [r.trialNo,r.sheetNo+'('+r.n+')',r.seed,r.kind==='初見'?'初見':'反復'+r.attempt,r.outcome,sec(iv.A_show_to_firstInput),sec(iv.B_firstInput_to_lastInput),sec(iv.C_lastInput_to_print),sec(iv.D_print_to_judge),sec(iv.E_judge_to_nextReady),
          (r.gameTimeUsedS==null?'—':r.gameTimeUsedS.toFixed(1))+'/'+(r.tMax==null?'—':r.tMax.toFixed(1)),r.inputs.filter(function(x){return x.accepted}).length,r.printTaps.length+'('+ign+')']}));
    var groups={},order=[];
    trials.forEach(function(r){var k=r.sheetNo+'|'+r.kind;if(!groups[k]){groups[k]=[];order.push(k)}groups[k].push(r)});
    fillTable($('hxSummary'),['枚目','種別','回数','刷れた','A','B','C','使った秒'],order.map(function(k){var g=groups[k],ok=g.filter(function(r){return r.grade!=null}).length;
      return [g[0].sheetNo+'(n='+g[0].n+')',g[0].kind,g.length,ok,sec(median(g.map(function(r){return r.intervals.A_show_to_firstInput}))),sec(median(g.map(function(r){return r.intervals.B_firstInput_to_lastInput}))),sec(median(g.map(function(r){return r.intervals.C_lastInput_to_print}))),
        (function(m){return m==null?'—':m.toFixed(1)})(median(g.map(function(r){return r.gameTimeUsedS})))]}));
  }

  /* ---------- 書き出し(押したときだけ) ---------- */
  function exportObj(){
    return {format:'neko-hanga-playtest/1',note:'Measurements of human play in the playtest harness copy. Automated smoke tests are not human measurements.',
      harnessVersion:META.version,sourceCommit:META.commit,indexSha256:META.indexSha256,indexDirty:META.indexDirty,builtAt:META.builtAt,exportedAt:new Date().toISOString(),
      isolation:{storageAttempts:guardLog(),wouldHaveSentGameOver:HX.wouldSend()},trials:trials};
  }
  function msg(s){$('hxMsg').textContent=s}
  bCopy.addEventListener('click',function(){
    var text=JSON.stringify(exportObj(),null,1);
    function fallback(){var ta=el('textarea');ta.value=text;ta.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(ta);msg(ok?'コピーしました（'+trials.length+'件）':'コピーできませんでした。「JSONを書き出し」を使ってください')}
    try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){msg('コピーしました（'+trials.length+'件）')},fallback);return}}catch(e){}
    fallback();
  });
  bJson.addEventListener('click',function(){
    var text=JSON.stringify(exportObj(),null,1),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:'neko-playtest-'+META.commit+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'});
    document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},10000);msg('書き出しました（'+trials.length+'件）');
  });
  bClear.addEventListener('click',function(){
    var now=Date.now();
    if(now-clearArmed>4000){clearArmed=now;bClear.textContent='もう一度押すと消えます';setTimeout(function(){if(Date.now()-clearArmed>=3900)bClear.textContent='記録を消す'},4000);return}
    clearArmed=0;bClear.textContent='記録を消す';trials.length=0;seen={};lastStart=null;render();refresh();msg('記録を消しました（メモリの中だけ）');
  });

  (function wait(){refresh();if(!HX.artReady())setTimeout(wait,200)})();
  render();
  window.__hxUi={trials:function(){return trials},exportObj:exportObj};
})();
