#!/usr/bin/env node
// 後半の制限時間・判定ルールの「式だけ」の計測(ブラウザは使わない)。
// - 定数と純粋な関数(cfg / sheetTime / TIME_FIT / bestTime など)は index.html の本文から正規表現で抜き出し、vm の中で評価する(手で写さない)。
// - 紙の生成(axes / M / sol)も newSheet の該当行を抜き出して vm で評価する。比較のため手で写した版も持ち、同じ乱数で一致するか確かめる。
// - 制限時間・締め切り・判定・得点・フィーバー・持ち越し・回復・取り返しの式も、該当の文を抜き出して評価する。
//   分岐(時間切れ/ミス/ラストチャンス/復活)の流れだけは手で写した(下の playRun を参照)。
// - プレイヤーは「モデル」: 完了時間 T = k × bestTime × 対数正規ノイズ、ミス確率 p_miss。人のデータではない。
// 使い方: node scripts/measure/sim.cjs   (オプション: --seeds 2000 --runs 2000 --quick)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OLD_REF = '027575c';
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf('--' + name); return i >= 0 ? +args[i + 1] : def; }
const QUICK = args.includes('--quick');
const SEEDS = arg('seeds', QUICK ? 300 : 2000);   // 1枚ごとの集計: n ごとの紙の数
const RUNS = arg('runs', QUICK ? 300 : 2000);     // 通しの集計: k ごとのプレイ数
const CAP = 120;
const NS = [6, 7, 11, 12, 17, 18, 24, 25, 26, 30, 35, 44, 45, 59, 60];
const KS = [[0.7, '速い'], [1.0, '基準'], [1.4, '遅い'], [2.0, 'とても遅い']];
const SIGMAS = [0.25, 0.4];
const P_MISS = 0.05;

// ---------------- 乱数 ----------------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function normal(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

// ---------------- 抜き出し ----------------
function lines(src) { return src.split('\n'); }
function constLine(src, name) {
  const re = new RegExp('^var [^\\n]*\\b' + name + '=', 'm'), m = src.match(re);
  if (!m) return null;
  const i = m.index; return src.slice(i, src.indexOf('\n', i));
}
function braceBlock(src, start) { // start は '{' か '[' の位置。対応する閉じ括弧まで
  const open = src[start], close = open === '{' ? '}' : ']'; let d = 0;
  for (let i = start; i < src.length; i++) { if (src[i] === open) d++; else if (src[i] === close) { d--; if (d === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced');
}
function funcText(src, name) {
  const i = src.search(new RegExp('\\nfunction ' + name + '\\(')); if (i < 0) return null;
  const b = src.indexOf('{', i); return src.slice(i + 1, b) + braceBlock(src, b);
}
function must(v, what) { if (v == null) throw new Error('抜き出せませんでした: ' + what); return v; }
function grab(src, re, what) { const m = src.match(re); return must(m && m[1], what); }

const CONSTS = ['LIVES', 'HEAL_EVERY', 'RARE_ONE_IN', 'BASE_PT', 'GRADES', 'LAST_TIME', 'FEVER_NEED', 'CARRY_RATE', 'MILESTONE', 'TIME_START', 'OP_LOOK', 'GRADE_FIT', 'GRADE_FIT_TIER', 'TIME_PAD'];
const FUNCS = ['sheetTime', 'TIME_FIT', 'bestTime', 'cfg', 'rnd', 'shuffle'];

function extract(src, label) {
  const ex = { label, consts: [], funcs: [], snippets: {} };
  for (const c of CONSTS) { const l = constLine(src, c); if (l) ex.consts.push(l); }
  ex.consts = [...new Set(ex.consts)];
  for (const f of FUNCS) { const t = funcText(src, f); if (t) ex.funcs.push(t); }
  const spAt = src.indexOf('var SP=['); ex.SP = braceBlock(src, spAt + 7);
  const ns = must(funcText(src, 'newSheet'), 'newSheet');
  const S = ex.snippets;
  S.lastCfg = grab(ns, /if\(lastMode\)c=(\{[^}]*\})/, 'ラストチャンスの紙');
  S.gen = ns.slice(must(ns.indexOf('var mov=shuffle') + 1 || null, 'gen start') - 1, ns.indexOf('\n', ns.indexOf('var sol=')));
  if (S.gen.indexOf('var mov=shuffle') !== 0) throw new Error('gen');
  if (ns.includes('cur.tMaxBase=')) { // 新ルール: 制限時間〜締め切りの4行
    const a = ns.indexOf('cur.tMaxBase='), b = ns.indexOf('var bar=');
    S.timing = ns.slice(a, b).trim(); S.rules = 'new';
  } else {
    S.timing = grab(ns, /(tMax=tLeft=lastMode\?LAST_TIME:[^;]*;carry=0;)/, '旧ルールの制限時間'); S.rules = 'old';
  }
  const vr = must(funcText(src, 'variant'), 'variant');
  S.rare = grab(vr, /if\(sp===undefined\)sp=([^;]+);/, '特色の抽選');
  const op = must(funcText(src, 'onPrint'), 'onPrint');
  S.frac = grab(op, /,frac=(.*?),revive=/, 'frac');
  const g = op.match(/var ((?:spent=[^,]+,)?)grade=([^,]+),back=/); must(g, 'grade');
  S.gradePre = g[1] ? 'var ' + g[1].replace(/,$/, '') + ';' : ''; S.grade = g[2];
  S.comeback = grab(op, /(if\(comeback\)\{if\(grade>=1&&!revive\)\{streak=comeback\+1;back=true\}comeback=0\})/, '取り返し');
  S.mult = grab(op, /var mult=([^;]+);/, 'mult');
  S.mile = grab(op, /var mile=([^,]+),helpUp/, 'mile');
  S.pts = grab(op, /var pts=([^;]+);/, 'pts');
  S.fever = grab(op, /(if\(fv\)\{pts=Math\.round\(pts\*FEVER_MULT\);[^\n]*\n\s*else if\(\+\+feverGauge>=FEVER_NEED\)\{[^}]*\})/, 'fever');
  S.revive = grab(op, /(if\(revive\)\{lastMode=false;lives=0;)/, 'revive');
  S.carry = grab(op, /(carry=Math\.min\(CARRY_MAX,[^;]+\);)/, 'carry');
  S.heal = grab(op, /(if\(revive\)lives=1;\s*else if\(streak%HEAL_EVERY===0&&lives<LIVES\)\{lives\+\+;heal=true\})/, 'heal');
  S.miss = grab(op, /(comeback=!lastMode&&streak>=2\?streak:0;\s*lives=lastMode\?0:lives-1;streak=0;carry=0;fever=0;feverGauge=0;)/, 'ミス');
  const to = must(funcText(src, 'onTimeout'), 'onTimeout');
  S.timeout = grab(to, /(comeback=!lastMode&&streak>=2\?streak:0;\s*lives=lastMode\?0:lives-1;streak=0;carry=0;fever=0;feverGauge=0;)/, '時間切れ');
  S.startLast = grab(must(funcText(src, 'startLast'), 'startLast'), /(lastUsed=true;lastMode=true;fever=0;feverGauge=0;carry=0;comeback=0;)/, 'startLast');
  S.canLast = grab(must(funcText(src, 'canLast'), 'canLast'), /return ([^}]+)\}/, 'canLast').replace(/running&&/, '');
  return ex;
}

// vm の中で、抜き出したコードを評価する。overrides で定数を差し替えられる(感度分析用)。
// 抜き出した定数・関数は1つの関数の中に並べて評価する(vm のグローバル変数は遅いので、ローカル変数にする)。
function makeGame(ex, overrides) {
  const S = ex.snippets, ctx = {};
  vm.createContext(ctx);
  const names = (ex.consts.join(';').match(/\b[A-Z][A-Z0-9_]*(?==)/g) || []).concat(['SP']);
  const ov = overrides ? Object.keys(overrides).map(k => k + '=__ov[' + JSON.stringify(k) + '];').join('') : '';
  const fn = (params, body) => 'function(' + params + '){' + body + '}';
  const code = '(function(__ov){var __R=null;var Math=Object.create(globalThis.Math);Math.random=function(){return __R()};\n' +
    ex.consts.join('\n') + '\nvar SP=' + ex.SP + ';\n' + ov + '\n' + ex.funcs.join('\n') + '\nreturn {' +
    'setRand:function(r){__R=r},' +
    'consts:function(){return {' + [...new Set(names)].map(n => n + ':' + n).join(',') + '}},' +
    'cfg:cfg,bestTime:' + (ex.funcs.some(f => f.startsWith('function bestTime')) ? 'bestTime' : 'null') + ',' +
    'lastCfg:' + fn('c', 'return ' + S.lastCfg) + ',' +
    'gen:' + fn('c', S.gen + '\nreturn {ax:ax,M:M,sol:sol};') + ',' +
    'rare:' + fn('n', 'return ' + S.rare) + ',' +
    'timing:' + fn('c,prints,cur,lastMode,carry', 'var tMax,tLeft;' + S.timing + '\nreturn {tMax:tMax,dU:cur.dU,dM:cur.dM};') + ',' +
    'grade:' + fn('tMax,tLeft,cur,frac', S.gradePre + 'return ' + S.grade) + ',' +
    'frac:' + fn('tLeft,tMax', 'return ' + S.frac) + ',' +
    // 状態 st を with で包み、抜き出した文をそのまま実行する
    'succ:' + fn('st', 'with(st){' + S.comeback + '\nmult=' + S.mult + ';mile=' + S.mile + ';pts=' + S.pts + ';\n' + S.fever + '\n' + S.revive + '}\n' + S.carry + '\n' + S.heal + '}') + ',' +
    'miss:' + fn('st', 'with(st){' + S.miss + '}') + ',' +
    'timeout:' + fn('st', 'with(st){' + S.timeout + '}') + ',' +
    'startLast:' + fn('st', 'with(st){' + S.startLast + '}') + ',' +
    'canLast:' + fn('st', 'with(st){return ' + S.canLast + '}') + '}})';
  const G = vm.runInContext(code, ctx, { filename: ex.label })(overrides || {});
  G.ctx = G.consts(); G.rules = S.rules; G.code = code;
  return G;
}

// 手で写した紙の生成(自己確認用)。newSheet の次の行を写したもの:
//   var mov=shuffle([0,1,2]).slice(0,c.mov),ax=[];
//   mov.forEach(function(p,k){ax.push({p:p,t:'x'},{p:p,t:'y'});if(k<c.rot)ax.push({p:p,t:'r'});if(k>=c.mov-c.scl)ax.push({p:p,t:'s'})});
//   var n=ax.length,M=ax.map(function(_,i){return ax.map(function(_,j){return i===j?1:0})});
//   var L=c.links,guard=0;
//   while(L>0&&guard++<60){var j=1+rnd(n-1),i2=rnd(j);if(!M[i2][j]){M[i2][j]=Math.random()<.5?1:-1;L--}}
//   var sol=ax.map(function(){return (1+rnd(c.range))*(Math.random()<.5?1:-1)});
function mirrorGen(c, R) {
  const rnd = n => Math.floor(R() * n);
  const a = [0, 1, 2]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
  const mov = a.slice(0, c.mov), ax = [];
  mov.forEach((p, k) => { ax.push({ p, t: 'x' }, { p, t: 'y' }); if (k < c.rot) ax.push({ p, t: 'r' }); if (k >= c.mov - c.scl) ax.push({ p, t: 's' }); });
  const n = ax.length, M = ax.map((_, i) => ax.map((_, j) => i === j ? 1 : 0));
  let L = c.links, guard = 0;
  while (L > 0 && guard++ < 60) { const j = 1 + rnd(n - 1), i2 = rnd(j); if (!M[i2][j]) { M[i2][j] = R() < .5 ? 1 : -1; L--; } }
  const sol = ax.map(() => (1 + rnd(c.range)) * (R() < .5 ? 1 : -1));
  return { ax, M, sol };
}

// ---------------- 1枚の紙 ----------------
function sheetSeed(n, s) { return (n * 100003 + s) | 0; }
function makeSheet(G, c, seed) { G.setRand(mulberry32(seed)); return G.gen(c); }

// 持ち越しなし(carry=0)、ミスなしで、その紙だけを判定する
function judgeOne(G, n, sheet, best, T) {
  const c = G.cfg(n), cur = { ax: sheet.ax, M: sheet.M, sol: sheet.sol, tier: c.tier, best };
  const tm = G.timing(c, n, cur, false, 0);
  const tLeft = tm.tMax - T;
  if (tLeft <= 0) return { tm, grade: -1, frac: 0, tp: 0, pts: 0 };
  const frac = G.frac(tLeft, tm.tMax), grade = G.grade(tm.tMax, tLeft, cur, frac);
  const ctx = G.ctx, tp = Math.round(ctx.TIME_PT * frac);
  return { tm, grade, frac, tp, pts: ctx.BASE_PT + c.tier * ctx.TIER_PT + tp };
}
// 旧ルールにも dM/dU 相当を出す(割合から): 締め切り = (1-割合)×tMax
function deadlines(G, tm) { if (G.rules === 'new') return tm; const g = G.ctx.GRADES; return { tMax: tm.tMax, dU: (1 - g[1][1]) * tm.tMax, dM: (1 - g[2][1]) * tm.tMax }; }

function perSheet(Gnew, Gold, Gplayer, sigma, ns) {
  const out = [];
  for (const n of ns) {
    const c = Gnew.cfg(n);
    const acc = {};
    for (const [k] of KS) for (const r of ['new', 'old']) acc[k + r] = { n: 0, best: 0, tMax: 0, dM: 0, dU: 0, g: [0, 0, 0, 0], tp: 0, tpN: 0, pts: 0 };
    for (let s = 1; s <= SEEDS; s++) {
      const seed = sheetSeed(n, s), sheet = makeSheet(Gnew, c, seed);
      const z = normal(mulberry32(seed ^ 0x5bd1e995));
      const bestP = Gplayer.bestTime({ ax: sheet.ax, M: sheet.M, sol: sheet.sol });
      for (const [k] of KS) {
        const T = k * bestP * Math.exp(sigma * z);
        for (const [r, G] of [['new', Gnew], ['old', Gold]]) {
          const best = G.bestTime ? G.bestTime({ ax: sheet.ax, M: sheet.M, sol: sheet.sol }) : bestP;
          const j = judgeOne(G, n, sheet, best, T), d = deadlines(G, j.tm), a = acc[k + r];
          a.n++; a.best += bestP; a.tMax += d.tMax; a.dM += d.dM; a.dU += d.dU; a.g[j.grade + 1]++; a.pts += j.pts;
          if (j.grade >= 0) { a.tp += j.tp; a.tpN++; }
        }
      }
    }
    for (const [k] of KS) for (const r of ['new', 'old']) {
      const a = acc[k + r];
      out.push({ n, sheetNo: n + 1, tier: c.tier, k, rules: r, sigma, best: a.best / a.n, tMax: a.tMax / a.n, dM: a.dM / a.n, dU: a.dU / a.n,
        mero: a.g[3] / a.n, utto: a.g[2] / a.n, goro: a.g[1] / a.n, timeout: a.g[0] / a.n, timePts: a.tpN ? a.tp / a.tpN : 0, sheetPts: a.pts / a.n });
    }
  }
  return out;
}

// ---------------- 通しのプレイ ----------------
// 分岐は onPrint / onTimeout / startLast / gameOver の流れを手で写したもの:
//  成功(offs が全部0)→ succ(取り返し→倍率→記念→得点→フィーバー→復活→持ち越し→回復)→ 次の紙
//  ミス(ずれたまま刷る)→ miss の文 → lives>0 なら同じ紙を続ける(時間は進んだまま)/ 0 なら canLast ? startLast : 終了
//  時間切れ → timeout の文 → lives>0 なら次の紙 / 0 なら canLast ? startLast : 終了
// 1枚目の「触るまで時間が止まる」(waitTouch)、おたすけ、演出中の待ち時間は数えない
function playRun(G, Gplayer, k, sigma, runSeed) {
  const sheetR = mulberry32(1000003 + runSeed * 7919), pr = mulberry32(2000003 + runSeed * 104729);
  G.setRand(sheetR);
  const st = { prints: 0, lives: G.ctx.LIVES, streak: 0, score: 0, carry: 0, fever: 0, feverGauge: 0, comeback: 0, lastMode: false, lastUsed: false, running: true,
    grade: 0, revive: false, fv: false, back: false, mult: 1, mile: false, pts: 0, va: { sp: 0 }, cur: null, frac: 0, tLeft: 0, heal: false, feverStart: false };
  const grades = [0, 0, 0]; let timeouts = 0, misses = 0, lastChances = 0, revives = 0;
  while (st.prints < CAP) {
    let c = G.cfg(st.prints); if (st.lastMode) c = G.lastCfg(c);
    G.setRand(sheetR);
    const sp = G.rare(st.prints);
    const sh = G.gen(c);
    const cur = { ax: sh.ax, M: sh.M, sol: sh.sol, tier: c.tier };
    cur.best = G.bestTime ? G.bestTime(cur) : Gplayer.bestTime(cur);
    const tm = G.timing(c, st.prints, cur, st.lastMode, st.carry); st.carry = 0;
    cur.dU = tm.dU; cur.dM = tm.dM;
    const T = k * Gplayer.bestTime(cur) * Math.exp(sigma * normal(pr));
    let over = false;
    if (pr() < P_MISS && pr() * T < tm.tMax) { // ミスは T の途中(一様)で1回だけ起きる
      misses++; G.miss(st);
      if (st.lives <= 0) { if (G.canLast(st)) { G.startLast(st); lastChances++; continue; } over = true; }
    }
    if (over) break;
    const tLeft = tm.tMax - T;
    if (tLeft <= 0) {
      timeouts++; G.timeout(st);
      if (st.lives > 0) continue;
      if (G.canLast(st)) { G.startLast(st); lastChances++; continue; }
      break;
    }
    st.tLeft = tLeft; st.tMax = tm.tMax; st.cur = cur; st.va = { sp };
    st.frac = G.frac(tLeft, tm.tMax); st.grade = G.grade(tm.tMax, tLeft, cur, st.frac);
    st.revive = st.lastMode; st.fv = st.fever > 0; st.heal = false; st.back = false; st.feverStart = false;
    st.prints++; st.streak++;
    G.succ(st);
    if (st.revive) revives++;
    st.score += st.pts; grades[st.grade]++;
  }
  return { prints: st.prints, score: st.score, grades, timeouts, misses, lastChances, revives, cap: st.prints >= CAP };
}
function q(a, p) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function runStats(G, Gp, k, sigma, base) {
  const P = [], Sc = []; let cap = 0, g = [0, 0, 0], tot = 0;
  for (let r = 1; r <= RUNS; r++) { const o = playRun(G, Gp, k, sigma, r + (base || 0)); P.push(o.prints); Sc.push(o.score); if (o.cap) cap++; g = g.map((v, i) => v + o.grades[i]); tot += o.prints; }
  return { medSheets: q(P, .5), p90Sheets: q(P, .9), capShare: cap / RUNS, medScore: q(Sc, .5), p90Score: q(Sc, .9), meanScore: Sc.reduce((a, b) => a + b, 0) / RUNS, meroShare: g[2] / Math.max(1, tot) };
}

// ---------------- 実行 ----------------
const t0 = Date.now();
const srcNew = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcOld = cp.execSync('git show ' + OLD_REF + ':index.html', { cwd: ROOT, maxBuffer: 1 << 26 }).toString('utf8');
const headRef = cp.execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const exNew = extract(srcNew, 'index.html@' + headRef), exOld = extract(srcOld, 'index.html@' + OLD_REF);
const Gnew = makeGame(exNew), Gold = makeGame(exOld);
const Gplayer = Gnew; // プレイヤーの操作量は、元の(いまの)OP_* 定数の bestTime で決まる。旧ルールにも同じ人をあてる

// 自己確認: 抜き出した生成コードと、手で写した生成が同じ乱数で一致するか
let genChecked = 0, genMismatch = 0;
for (const n of [0, 3, 7, 12, 18, 25, 37, 44, 59, 60, 80]) {
  const c = Gnew.cfg(n);
  for (let s = 1; s <= 500; s++) {
    const a = makeSheet(Gnew, c, sheetSeed(n, s)), b = mirrorGen(c, mulberry32(sheetSeed(n, s)));
    genChecked++; if (JSON.stringify(a) !== JSON.stringify(b)) genMismatch++;
  }
}
const sameGenOldNew = exNew.snippets.gen === exOld.snippets.gen;
const sameCfgOldNew = funcText(srcNew, 'cfg') === funcText(srcOld, 'cfg');

const per = [];
for (const sg of SIGMAS) per.push(...perSheet(Gnew, Gold, Gplayer, sg, NS));

const runs = [];
for (const sg of SIGMAS) for (const [k, kn] of KS) {
  const a = runStats(Gnew, Gplayer, k, sg), b = runStats(Gold, Gplayer, k, sg);
  runs.push({ sigma: sg, k, kn, new: a, old: b, ratioMedScore: a.medScore / b.medScore, ratioMeanScore: a.meanScore / b.meanScore });
}

// 感度: OP_* を1つずつ ±30%。プレイヤーは元の定数のまま(k=1.0, σ=0.25)
const sens = [];
const ctx0 = Gnew.ctx;
const variants = [['基準', null]];
for (const f of [0.7, 1.3]) {
  variants.push(['OP_LOOK×' + f, { OP_LOOK: ctx0.OP_LOOK * f }]);
  const kn = {}; for (const key in ctx0.OP_KNOB) kn[key] = ctx0.OP_KNOB[key] * f;
  variants.push(['OP_KNOB×' + f, { OP_KNOB: kn }]);
  variants.push(['OP_STEP×' + f, { OP_STEP: ctx0.OP_STEP * f }]);
  variants.push(['OP_LINK×' + f, { OP_LINK: ctx0.OP_LINK * f }]);
  variants.push(['OP_PRINT×' + f, { OP_PRINT: ctx0.OP_PRINT * f }]);
}
const SENS_NS = [44, 45, 59, 60];
for (const [name, ov] of variants) {
  const G = makeGame(exNew, ov);
  const ps = perSheet(G, Gold, Gplayer, 0.25, SENS_NS).filter(r => r.rules === 'new' && r.k === 1.0);
  const rs = runStats(G, Gplayer, 1.0, 0.25), rs2 = runStats(G, Gplayer, 2.0, 0.25);
  sens.push({ variant: name, k2: { medSheets: rs2.medSheets, p90Sheets: rs2.p90Sheets, medScore: rs2.medScore }, mero: Object.fromEntries(ps.map(r => [r.n, r.mero])), timeout: Object.fromEntries(ps.map(r => [r.n, r.timeout])), tMax: Object.fromEntries(ps.map(r => [r.n, r.tMax])), medSheets: rs.medSheets, p90Sheets: rs.p90Sheets, capShare: rs.capShare, medScore: rs.medScore });
}

const result = {
  generatedBy: 'node scripts/measure/sim.cjs' + (args.length ? ' ' + args.join(' ') : ''),
  newRef: headRef, oldRef: OLD_REF,
  conditions: { SEEDS, RUNS, CAP, NS, KS: KS.map(x => x[0]), SIGMAS, P_MISS, noise: 'T = k*bestTime*exp(sigma*z), z~N(0,1) (median 1)' },
  selfCheck: { genChecked, genMismatch, sameGenOldNew, sameCfgOldNew },
  extracted: { new: exNew, old: exOld },
  perSheet: per, runs, sensitivity: sens,
};

// ---------------- 書き出し ----------------
const OUT = path.join(ROOT, 'docs', 'measure');
fs.mkdirSync(OUT, { recursive: true });
const pc = x => (x * 100).toFixed(1) + '%', f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), lab = n => 'n=' + n + '（' + (n + 1) + '枚目）';
let md = '<!-- node scripts/measure/sim.cjs が自動で書き出す表。手で直さない -->\n# sim の表（自動生成）\n\n';
md += `新ルール: ${headRef} / 旧ルール: ${OLD_REF} / 紙 ${SEEDS} 枚×n / 通し ${RUNS} 回×k / 上限 ${CAP} 枚 / p_miss=${P_MISS} （同じ条件なら毎回同じ値になる）\n\n`;
md += `自己確認: 抜き出した生成コード と 手で写した生成 の一致 ${genChecked - genMismatch}/${genChecked}、生成コードの新旧同一=${sameGenOldNew}、cfg の新旧同一=${sameCfgOldNew}\n\n`;
for (const sg of SIGMAS) {
  md += `## 1枚ごと（持ち越しなし・ミスなし・倍率なし） σ=${sg}\n\n`;
  md += '| n（何枚目） | k | ルール | 最速 | 制限 | めろ締切 | うっとり締切 | めろめろ | うっとり | ごろごろ | 時間切れ | はやさ点(成功平均) | 1枚の点(時間切れ=0) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of per.filter(r => r.sigma === sg)) md += `| ${lab(r.n)} | ${r.k} | ${r.rules === 'new' ? '新' : '旧'} | ${f1(r.best)} | ${f1(r.tMax)} | ${f1(r.dM)} | ${f1(r.dU)} | ${pc(r.mero)} | ${pc(r.utto)} | ${pc(r.goro)} | ${pc(r.timeout)} | ${f1(r.timePts)} | ${f1(r.sheetPts)} |\n`;
  md += '\n';
}
md += '## 通しのプレイ\n\n| σ | k | ルール | 枚数 中央 | 枚数 p90 | 上限到達 | 得点 中央 | 得点 p90 | 得点 平均 | めろめろ率(成功中) |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of runs) for (const [nm, s] of [['新', r.new], ['旧', r.old]]) md += `| ${r.sigma} | ${r.k} | ${nm} | ${s.medSheets} | ${s.p90Sheets} | ${pc(s.capShare)} | ${s.medScore} | ${s.p90Score} | ${Math.round(s.meanScore)} | ${pc(s.meroShare)} |\n`;
md += '\n| σ | k | 得点中央 新/旧 | 得点平均 新/旧 |\n|---|---|---|---|\n';
for (const r of runs) md += `| ${r.sigma} | ${r.k} | ${f2(r.ratioMedScore)} | ${f2(r.ratioMeanScore)} |\n`;
md += '\n## 感度（OP_* を1つずつ ±30%、人は元の定数で k=1.0, σ=0.25。右2列だけ k=2.0）\n\n| 変更 | ' + SENS_NS.map(n => 'めろめろ ' + lab(n)).join(' | ') + ' | ' + SENS_NS.map(n => '時間切れ ' + lab(n)).join(' | ') + ' | 枚数 中央 | 枚数 p90 | 上限到達 | k=2.0 枚数 中央 | k=2.0 枚数 p90 |\n|' + '---|'.repeat(6 + SENS_NS.length * 2) + '\n';
for (const s of sens) md += `| ${s.variant} | ${SENS_NS.map(n => pc(s.mero[n])).join(' | ')} | ${SENS_NS.map(n => pc(s.timeout[n])).join(' | ')} | ${s.medSheets} | ${s.p90Sheets} | ${pc(s.capShare)} | ${s.k2.medSheets} | ${s.k2.p90Sheets} |\n`;
if (!QUICK) {
  fs.writeFileSync(path.join(OUT, 'sim-tables.md'), md);
  fs.writeFileSync(path.join(OUT, 'sim-results.json'), JSON.stringify(result, null, 1));
}
process.stdout.write(md);
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s` + (QUICK ? ' (quick: ファイルは書き出していません)' : ''));
