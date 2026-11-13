/* 計測版だけに入る見張り(ゲームのスクリプトより前に動く)。
   端末への保存・外への送信を「しない」ようにし、試みがあれば回数だけメモリに残す。 */
(function(){
  var log=[];
  window.__hxGuardLog=log;
  function rec(kind,detail){
    try{log.push({kind:kind,detail:String(detail===undefined?'':detail).slice(0,60),t:Math.round(performance.now())})}catch(e){}
  }
  // Storage(ローカル・セッションとも)への書き込みは何もせず、記録だけする
  try{
    var SP=window.Storage&&Storage.prototype;
    if(SP){
      SP.setItem=function(k){rec('Storage.setItem',k)};
      SP.removeItem=function(k){rec('Storage.removeItem',k)};
      SP.clear=function(){rec('Storage.clear','')};
    }
  }catch(e){}
  // cookie は読めば空、書いても保存しない
  try{
    Object.defineProperty(document,'cookie',{configurable:true,get:function(){return ''},set:function(v){rec('document.cookie',String(v).split('=')[0])}});
  }catch(e){}
  // IndexedDB は開かせない
  try{
    if(window.IDBFactory){
      IDBFactory.prototype.open=function(n){rec('IDB.open',n);throw new Error('playtest harness: IndexedDB is disabled')};
      IDBFactory.prototype.deleteDatabase=function(n){rec('IDB.deleteDatabase',n);throw new Error('playtest harness: IndexedDB is disabled')};
    }
  }catch(e){}
  // 送信系(CSPでも止まるが、試みを数える)
  try{if(navigator.sendBeacon)navigator.sendBeacon=function(u){rec('sendBeacon',u);return false}}catch(e){}
})();
