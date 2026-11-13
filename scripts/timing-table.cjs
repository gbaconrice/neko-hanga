// 制限時間と判定の締め切りの、変更前後の比較表を作る(モンテカルロ)。
// 紙の作り方(cfg / sheetTime / newSheet のつまみ・連動・正解の作り方)は index.html と同じものを写してある。
// 使い方: node scripts/timing-table.cjs [サンプル数]  → Markdownの表を標準出力に出す
const N=+process.argv[2]||2000;
const TIME_START=46,TIME_STEP=1.1,TIME_MIN=20;
function sheetTime(c,n){return n<3?c.time:Math.max(c.min||TIME_MIN,Math.min(c.time,TIME_START-n*TIME_STEP))}
function cfg(n){
  if(n<3) return {tier:0,mov:1,rot:0,scl:0,links:0,u:2.6,range:4,time:40};
  if(n<7) return {tier:1,mov:2,rot:0,scl:0,links:0,u:2.2,range:4,time:45};
  if(n<12)return {tier:2,mov:2,rot:1,scl:0,links:0,u:1.9,range:5,time:45};
  if(n<18)return {tier:3,mov:2,rot:2,scl:0,links:1,u:1.6,range:5,time:42,min:32};
  if(n<25)return {tier:4,mov:2,rot:1,scl:1,links:2,u:1.5,range:5,time:42,min:34};
  return {tier:5,mov:2,rot:1,scl:1,links:Math.min(5,3+((n-25)/6|0)),u:Math.max(1,1.5-(n-25)*.03),range:6,time:Math.max(24,40-(n-25)*.8),min:Math.max(TIME_MIN,32-(n-25)*.6)};
}
function rnd(n){return Math.floor(Math.random()*n)}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=rnd(i+1),t=a[i];a[i]=a[j];a[j]=t}return a}
function sheet(c){
  var mov=shuffle([0,1,2]).slice(0,c.mov),ax=[];
  mov.forEach(function(p,k){ax.push({p:p,t:'x'},{p:p,t:'y'});if(k<c.rot)ax.push({p:p,t:'r'});if(k>=c.mov-c.scl)ax.push({p:p,t:'s'})});
  var n=ax.length,M=ax.map(function(_,i){return ax.map(function(_,j){return i===j?1:0})});
  var L=c.links,guard=0;
  while(L>0&&guard++<60){var j=1+rnd(n-1),i2=rnd(j);if(!M[i2][j]){M[i2][j]=Math.random()<.5?1:-1;L--}}
  var sol=ax.map(function(){return (1+rnd(c.range))*(Math.random()<.5?1:-1)});
  return {ax:ax,M:M,sol:sol};
}
// ここから下は index.html の新しい定数・式と同じ
var OP_LOOK=1.2,OP_KNOB={x:.9,y:.9,r:1.3,s:1.5},OP_STEP=.15,OP_LINK=1.5,OP_PRINT=.4;
var GRADE_FIT=[[2.0,1.0],[1.3,.5]],GRADE_FIT_TIER=2;
var TIME_PAD=4;
function TIME_FIT(n){return n<35?3:Math.max(2.2,3-(n-35)*.8/25)}
function bestTime(c){
  var t=OP_LOOK+OP_PRINT,i,j;
  for(j=0;j<c.ax.length;j++)t+=OP_KNOB[c.ax[j].t]+Math.abs(c.sol[j])*OP_STEP;
  for(i=0;i<c.M.length;i++)for(j=0;j<c.M.length;j++)if(i!==j&&c.M[i][j])t+=OP_LINK;
  return t;
}
function windows(c,n,best){
  var base=Math.max(sheetTime(c,n),TIME_FIT(n)*best+TIME_PAD),dU=.45*base,dM=.2*base;
  if(c.tier>=GRADE_FIT_TIER){dU=Math.min(base,Math.max(dU,GRADE_FIT[0][0]*best+GRADE_FIT[0][1]));dM=Math.min(dU,Math.max(dM,GRADE_FIT[1][0]*best+GRADE_FIT[1][1]))}
  return {base:base,dU:dU,dM:dM};
}
const ns=[0,3,6,7,11,12,17,18,24,25,30,35,45,60];
const f=x=>x.toFixed(1),avg=a=>a.reduce((p,q)=>p+q,0)/a.length;
const rows=['| n | つまみ | 最速(平均) | 制限時間 旧→新 | めろめろ 旧→新 | めろめろ÷最速 旧→新 | うっとり 旧→新 | うっとり÷最速 旧→新 | 旧でめろめろ不可能な紙 |','|---|---|---|---|---|---|---|---|---|'];
for(const n of ns){
  const c=cfg(n),old=sheetTime(c,n),B=[],T=[],DM=[],DU=[];let imp=0,knobs=0;
  for(let k=0;k<N;k++){const s=sheet(c),b=bestTime(s),w=windows(c,n,b);knobs=s.ax.length;B.push(b);T.push(w.base);DM.push(w.dM);DU.push(w.dU);if(.2*old<b)imp++}
  const b=avg(B);
  rows.push(`| ${n} | ${knobs} | ${f(b)}秒 | ${f(old)}→${f(avg(T))}秒 | ${f(.2*old)}→${f(avg(DM))}秒 | ${(.2*old/b).toFixed(2)}→${(avg(DM)/b).toFixed(2)} | ${f(.45*old)}→${f(avg(DU))}秒 | ${(.45*old/b).toFixed(2)}→${(avg(DU)/b).toFixed(2)} | ${Math.round(imp/N*100)}% |`);
}
console.log(rows.join('\n'));
