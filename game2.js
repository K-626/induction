/* =========================================================
   帰納法でGo! v2  —  game2.js
   =========================================================
   ゲームロジック全体 + DOMレンダリング
   ========================================================= */

// ── Constants ───────────────────────────────────────────────
const NUM_TERMS = 10;
const BASE_SEQ  = Array.from({ length: NUM_TERMS }, (_, i) => i + 1); // [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const MAX_VAL   = 1e9;

/** 深度ごとのタイムアタック目標問題数 */
function getTargetQuestions(depth) {
  switch (depth) {
    case 2: return 5;
    case 3: return 3;
    case 4: return 1;
    case 5: return 1;
    default: return 5;
  }
}

// Precomputed factorials 0! .. 12!
const FACT_TABLE = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600];

// ── LocalStorage Best Time Management ────────────────────────

function getBestTime(depth) {
  try {
    const v = localStorage.getItem(`kinou_best_d${depth}`);
    return v !== null ? parseInt(v, 10) : null;
  } catch (e) {
    return null;
  }
}

function saveBestTime(depth, timeInSec) {
  try {
    const cur = getBestTime(depth);
    if (cur === null || timeInSec < cur) {
      localStorage.setItem(`kinou_best_d${depth}`, String(timeInSec));
      return true;
    }
  } catch (e) {}
  return false;
}

// ── Puzzle Code Sharing Utility ──────────────────────────────

function encodePuzzleCode(sol) {
  try {
    const json = JSON.stringify(sol);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch (e) {
    return '';
  }
}

function decodePuzzleCode(codeStr) {
  try {
    let base64 = codeStr.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const json = decodeURIComponent(escape(atob(base64)));
    const sol = JSON.parse(json);
    if (Array.isArray(sol) && sol.length >= 2 && sol.length <= 5) {
      return sol;
    }
  } catch (e) {}
  return null;
}

function buildPuzzleFromSol(sol) {
  let seq = [...BASE_SEQ];
  for (const op of sol) {
    seq = applyFwd(seq, op);
    if (!isValidFwdSeq(seq)) return null;
  }
  return { puzzle: seq, sol };
}

// ── Utilities ────────────────────────────────────────────────

function snap(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x;
  const r = Math.round(x);
  return Math.abs(x - r) < 1e-9 ? r : x;
}

function isNat(x) {
  const v = snap(x);
  return v !== null && Number.isFinite(v) && Number.isInteger(v) && v >= 1;
}

function isAllNat(seq) {
  return Array.isArray(seq) && seq.length === NUM_TERMS && seq.every(isNat);
}

/** 最下段が元の自然数列 n (1, 2, 3... 10) に一致しているか判別 */
function isBaseSeq(seq) {
  if (!seq || seq.length !== NUM_TERMS) return false;
  return seq.every((v, i) => snap(v) === BASE_SEQ[i]);
}

function fmt(x) {
  if (x === null || x === undefined) return '—';
  const v = snap(x);
  if (!Number.isFinite(v)) return '∞';
  if (Math.abs(v) >= 1e8) return v.toExponential(1);
  if (Number.isInteger(v)) {
    const s = String(Math.abs(v));
    const sep = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return v < 0 ? '−' + sep : sep;
  }
  return v.toFixed(2);
}

function invFact(v) {
  const i = FACT_TABLE.indexOf(v);
  return i >= 0 ? i : null;
}

function calcDiffSeq(seq) {
  if (!seq || seq.length < 2) return null;
  const diffs = [];
  for (let i = 0; i < seq.length - 1; i++) {
    diffs.push(snap(seq[i + 1] - seq[i]));
  }
  return diffs;
}

function evalOpnd(opnd, index) {
  const n = index + 1; // 1-indexed
  if (opnd === null || opnd === undefined) return null;
  if (typeof opnd === 'number') return opnd;
  if (typeof opnd === 'string') {
    switch (opnd) {
      case 'n':  return n;
      case 'n2': return n * n;
      case 'n3': return n * n * n;
      case 'n4': return n * n * n * n;
      case '2n': return Math.pow(2, n);
      case '3n': return Math.pow(3, n);
      case '4n': return Math.pow(4, n);
      case 'n!': return n <= 12 ? FACT_TABLE[n] : null;
      default:   return null;
    }
  }
  if (typeof opnd === 'object' && opnd.c && opnd.v) {
    const base = evalOpnd(opnd.v, index);
    return base !== null ? opnd.c * base : null;
  }
  return null;
}

function opndLabel(opnd) {
  if (opnd === null || opnd === undefined) return '';
  if (typeof opnd === 'number') return String(opnd);
  if (typeof opnd === 'string') {
    switch (opnd) {
      case 'n':  return 'ｎ';
      case 'n2': return 'ｎ²';
      case 'n3': return 'ｎ³';
      case 'n4': return 'ｎ⁴';
      case '2n': return '2ⁿ';
      case '3n': return '3ⁿ';
      case '4n': return '4ⁿ';
      case 'n!': return 'ｎ!';
      default:   return String(opnd);
    }
  }
  if (typeof opnd === 'object' && opnd.c && opnd.v) {
    const vStr = opndLabel(opnd.v);
    return `${opnd.c}${vStr}`;
  }
  return String(opnd);
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isFactOp(op) {
  if (!op) return false;
  if (op.type === 'F') return true;
  if (op.type === 'A') {
    if (op.c === 'n!') return true;
    if (typeof op.c === 'object' && op.c.v === 'n!') return true;
  }
  return false;
}

// ── Forward operations ───────────────────────────────────────

function applyFwd(seq, op) {
  return seq.map((v, i) => {
    switch (op.type) {
      case 'A': {
        const val = evalOpnd(op.c, i);
        if (val === null) return null;
        switch (op.o) {
          case '+': return v + val;
          case '-': return v - val;
          case '*': return v * val;
          case '/': return val !== 0 && v % val === 0 ? v / val : null;
        }
        return null;
      }
      case 'P': return Math.pow(v, op.e);
      case 'E': return Math.pow(op.b, v);
      case 'F': return (Number.isInteger(v) && v >= 0 && v <= 12) ? FACT_TABLE[v] : null;
      default:  return null;
    }
  }).map(snap);
}

function isValidFwdSeq(seq) {
  return seq && seq.every(v => Number.isInteger(v) && v >= 1 && v <= MAX_VAL);
}

function fwdCandidates(seq) {
  const ops = [];
  const mx = Math.max(...seq);

  const baseOpnds = [
    1, 2, 3, 4, 5, 6, 7, 8, 9,
    'n', 'n2', 'n3', 'n4',
    '2n', '3n', '4n', 'n!'
  ];

  for (let c = 2; c <= 9; c++) {
    baseOpnds.push({ c, v: 'n' });
    baseOpnds.push({ c, v: 'n2' });
    if (c <= 4) {
      baseOpnds.push({ c, v: 'n3' });
      baseOpnds.push({ c, v: 'n4' });
    }
  }

  for (const c of baseOpnds) {
    const vals = seq.map((_, i) => evalOpnd(c, i));
    if (vals.some(v => v === null || v <= 0 || v > MAX_VAL)) continue;

    const maxVal = Math.max(...vals);

    if (mx + maxVal <= MAX_VAL) ops.push({ type:'A', o:'+', c });
    if (seq.every((v, i) => v > vals[i])) ops.push({ type:'A', o:'-', c });
    if (c !== 1 && mx * maxVal <= MAX_VAL) ops.push({ type:'A', o:'*', c });
    if (c !== 1 && seq.every((v, i) => v % vals[i] === 0)) ops.push({ type:'A', o:'/', c });
  }

  for (const e of [2, 3, 4])
    if (Math.pow(mx, e) <= MAX_VAL) ops.push({ type:'P', e });

  for (const b of [2, 3, 4])
    if (mx <= 20 && Math.pow(b, mx) <= MAX_VAL) ops.push({ type:'E', b });

  if (mx <= 10 && FACT_TABLE[mx] <= MAX_VAL) ops.push({ type:'F' });

  return ops;
}

// ── Puzzle generation ────────────────────────────────────────

function genPuzzle(depth) {
  const SPECIAL = new Set(['P', 'E', 'F']);

  for (let attempt = 0; attempt < 1000; attempt++) {
    let seq = [...BASE_SEQ];
    const ops = [];
    let hasSpecial = false;

    for (let d = 0; d < depth; d++) {
      let pool = fwdCandidates(seq);
      if (pool.length === 0) break;

      const factCount = ops.filter(isFactOp).length;
      if (factCount >= 2) {
        pool = pool.filter(op => !isFactOp(op));
      }
      if (pool.length === 0) break;

      if (!hasSpecial && attempt < 500 && d < depth - 1) {
        const sp = pool.filter(o => SPECIAL.has(o.type));
        if (sp.length > 0 && Math.random() < 0.6) pool = sp;
      }

      const perm = shuffled(pool);
      let chosen = null;

      for (const op of perm) {
        const ns = applyFwd(seq, op);
        if (isValidFwdSeq(ns)) {
          chosen = op;
          seq = ns;
          break;
        }
      }

      if (!chosen) break;
      ops.push(chosen);
      if (SPECIAL.has(chosen.type)) hasSpecial = true;
    }

    if (ops.length === depth) {
      return { puzzle: seq, sol: ops };
    }
  }

  return fallbackPuzzle(depth);
}

function fallbackPuzzle(depth) {
  const defaults = [
    { type:'A', o:'*', c:2 },
    { type:'A', o:'+', c:'n' },
    { type:'P', e:2    },
    { type:'A', o:'*', c:3 },
    { type:'A', o:'+', c:1 },
  ];
  let seq = [...BASE_SEQ];
  const ops = [];
  for (let d = 0; d < depth; d++) {
    const op = defaults[d % defaults.length];
    const ns = applyFwd(seq, op);
    if (isValidFwdSeq(ns)) { ops.push(op); seq = ns; }
    else {
      const safe = { type:'A', o:'+', c:1 };
      ops.push(safe);
      seq = applyFwd(seq, safe);
    }
  }
  return { puzzle: seq, sol: ops };
}

// ── Reverse operations ───────────────────────────────────────

function applyRev(seq, op) {
  return seq.map((v, i) => {
    switch (op.type) {
      case 'A': {
        const val = evalOpnd(op.c, i);
        if (val === null) return null;
        if ((op.o === '*' || op.o === '/') && val === 0) return null;
        switch (op.o) {
          case '+': return v + val;
          case '-': return v - val;
          case '*': return v * val;
          case '/': return v / val;
        }
        return null;
      }
      case 'R': return snap(Math.pow(v, 1 / op.n));
      case 'L': return v > 0 ? snap(Math.log(v) / Math.log(op.b)) : null;
      case 'IF': return invFact(v);
      default: return null;
    }
  });
}

function revLabel(op) {
  if (!op) return '？';
  if (op.type === 'A') {
    const sym = {'+':'+', '-':'−', '*':'×', '/':'÷'}[op.o];
    return sym + ' ' + opndLabel(op.c);
  }
  if (op.type === 'R') return ['','','√','∛','⁴√'][op.n] || `${op.n}√`;
  if (op.type === 'L') {
    const sub = ['','','₂','₃','₄'][op.b] || String(op.b);
    return `log${sub}`;
  }
  if (op.type === 'IF') return '逆階乗';
  return '？';
}

// ── Game state ───────────────────────────────────────────────

const G = {
  scr:         'start',
  mode:        'endless',
  depth:       3,
  puzzle:      [],
  sol:         [],
  ops:         [],
  seqs:        [],
  slot:        0,
  kb:          'idle',
  arithOp:     null,
  arithConst:  null,
  errs:        [],
  cleared:     false,
  solvedCount: 0,
  timeElapsed: 0,
  lapStart:    0,
  lastLapTime: 0,
  timerId:     null,
  taFailed:    false,
  isNewRecord: false,
  showDiff:    false,
  isCustomCode:false,
};

function stopTimer() {
  if (G.timerId) {
    clearInterval(G.timerId);
    G.timerId = null;
  }
}

function startTimer() {
  stopTimer();
  G.timerId = setInterval(() => {
    if (G.scr !== 'game' || G.mode !== 'timeattack') {
      stopTimer();
      return;
    }
    G.timeElapsed++;
    updateHeaderTimer();
  }, 1000);
}

function startNewSession(mode, depth) {
  stopTimer();
  G.mode         = mode;
  G.depth        = depth;
  G.solvedCount  = 0;
  G.timeElapsed  = 0;
  G.lastLapTime  = 0;
  G.taFailed     = false;
  G.isNewRecord  = false;
  G.isCustomCode = false;

  if (G.mode === 'timeattack') {
    startTimer();
  }

  nextPuzzle();
}

function startCustomPuzzle(codeStr) {
  const sol = decodePuzzleCode(codeStr);
  if (!sol) {
    alert('❌ 無効な問題コードです。正しいコードを入力してください。');
    return;
  }
  const built = buildPuzzleFromSol(sol);
  if (!built) {
    alert('❌ 問題の復元に失敗しました。');
    return;
  }

  stopTimer();
  G.scr          = 'game';
  G.mode         = 'endless';
  G.depth        = sol.length;
  G.puzzle       = built.puzzle;
  G.sol          = built.sol;
  G.ops          = Array(G.depth).fill(null);
  G.seqs         = [built.puzzle, ...Array(G.depth).fill(null)];
  G.slot         = 0;
  G.kb           = 'idle';
  G.arithOp      = null;
  G.arithConst   = null;
  G.errs         = Array(G.depth).fill(false);
  G.cleared      = false;
  G.showDiff     = false;
  G.isCustomCode = true;
  G.solvedCount  = 0;
  render();
}

function nextPuzzle() {
  G.scr        = 'game';
  G.isCustomCode = false;
  const { puzzle, sol } = genPuzzle(G.depth);
  G.puzzle     = puzzle;
  G.sol        = sol;
  G.ops        = Array(G.depth).fill(null);
  G.seqs       = [puzzle, ...Array(G.depth).fill(null)];
  G.slot       = 0;
  G.kb         = 'idle';
  G.arithOp    = null;
  G.arithConst = null;
  G.errs       = Array(G.depth).fill(false);
  G.cleared    = false;
  G.showDiff   = false;
  G.lapStart   = G.timeElapsed;
  render();
}

function activateSlot(s) {
  if (!G.seqs[s]) return;
  G.slot       = s;
  G.kb         = 'idle';
  G.arithOp    = null;
  G.arithConst = null;
  render();
}

function clearSlot(s) {
  const targetSlot = s !== undefined ? s : G.slot;
  if (targetSlot === null) return;
  
  G.ops[targetSlot] = null;
  for (let k = targetSlot + 1; k <= G.depth; k++) {
    G.seqs[k]    = null;
    if (k < G.depth) G.ops[k] = null;
  }
  
  G.slot       = targetSlot;
  G.kb         = 'idle';
  G.arithOp    = null;
  G.arithConst = null;
  G.cleared    = false;
  render();
}

function triggerError(s) {
  G.errs[s] = true;
  render();
  setTimeout(() => { G.errs[s] = false; render(); }, 700);
}

function applyAndCommit(op) {
  const s = G.slot;
  if (s === null || !G.seqs[s]) return false;

  const rawResult = applyRev(G.seqs[s], op);
  const result    = rawResult.map(snap);

  if (!isAllNat(result)) {
    triggerError(s);
    return false;
  }

  G.ops[s]      = op;
  G.seqs[s + 1] = result;

  for (let k = s + 2; k <= G.depth; k++) {
    G.seqs[k]     = null;
    G.ops[k - 1]  = null;
  }

  G.kb         = 'idle';
  G.arithOp    = null;
  G.arithConst = null;

  // 💡 【修正】すべての操作が埋まり、かつ最下段の数列が「自然数列 n (1..10)」に完全一致している場合のみクリア！
  if (G.ops.every(o => o !== null) && isBaseSeq(G.seqs[G.depth])) {
    G.cleared = true;
    G.solvedCount++;
    G.lastLapTime = G.timeElapsed - G.lapStart;

    const targetQ = getTargetQuestions(G.depth);
    if (G.mode === 'timeattack' && G.solvedCount >= targetQ) {
      stopTimer();
      G.isNewRecord = saveBestTime(G.depth, G.timeElapsed);

      setTimeout(() => {
        G.taFailed = false;
        G.scr = 'result';
        render();
      }, 900);
      return true;
    }

    render();
    return true;
  }

  const next = G.ops.findIndex((o, i) => o === null && i > s);
  if (next >= 0) G.slot = next;

  render();
  return true;
}

function previewCalc(op) {
  const s = G.slot;
  if (s === null || !G.seqs[s]) return;

  const rawResult = applyRev(G.seqs[s], op);
  const result    = rawResult.map(snap);

  if (isAllNat(result)) {
    G.seqs[s + 1] = result;
  } else {
    G.seqs[s + 1] = null;
  }
  render();
}

function handleKb(key) {
  const s = G.slot;
  if (s === null) return;

  if (key === 'clear') {
    clearSlot(s);
    return;
  }

  if (key === 'commit') {
    if (G.kb === 'arith' && G.arithOp && G.arithConst !== null) {
      applyAndCommit({ type: 'A', o: G.arithOp, c: G.arithConst });
    }
    return;
  }

  if (!G.seqs[s]) return;

  if (['IF', 'R2', 'R3', 'R4', 'L2', 'L3', 'L4'].includes(key)) {
    const specOp = {
      'IF': { type: 'IF' },
      'R2': { type: 'R', n: 2 },
      'R3': { type: 'R', n: 3 },
      'R4': { type: 'R', n: 4 },
      'L2': { type: 'L', b: 2 },
      'L3': { type: 'L', b: 3 },
      'L4': { type: 'L', b: 4 },
    }[key];
    applyAndCommit(specOp);
    return;
  }

  if (['+', '-', '*', '/'].includes(key)) {
    if (G.kb === 'arith' && G.arithOp && G.arithConst !== null) {
      applyAndCommit({ type: 'A', o: G.arithOp, c: G.arithConst });
    }

    if (G.kb === 'arith' && G.arithOp === key && G.arithConst === null) {
      G.kb = 'idle'; G.arithOp = null; G.arithConst = null;
    } else {
      G.kb = 'arith'; G.arithOp = key; G.arithConst = null;
    }
    render(); return;
  }

  if (G.kb === 'arith' && G.arithOp) {
    if (typeof key === 'string' && ['n', 'n2', 'n3', 'n4', '2n', '3n', '4n', 'n!'].includes(key)) {
      let finalOpnd;
      if (G.arithConst !== null) {
        finalOpnd = { c: G.arithConst, v: key };
      } else {
        finalOpnd = key;
      }
      applyAndCommit({ type: 'A', o: G.arithOp, c: finalOpnd });
      return;
    }

    const num = typeof key === 'number' ? key : (typeof key === 'string' && /^[1-9]$/.test(key) ? parseInt(key, 10) : NaN);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      if (G.arithConst === num) {
        applyAndCommit({ type: 'A', o: G.arithOp, c: num });
        return;
      }
      G.arithConst = num;
      previewCalc({ type: 'A', o: G.arithOp, c: num });
      return;
    }
  }
}

function fmtTime(sec) {
  if (sec === null || sec === undefined) return '−−:−−';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateHeaderTimer() {
  const timerEl = document.getElementById('headerTimer');
  if (timerEl) {
    timerEl.textContent = fmtTime(G.timeElapsed);
  }
}

function showHint() {
  const revOps = G.sol.slice().reverse();
  const lines  = revOps.map((op, i) => {
    const label = {
      'A': () => {
        const sym = {'+':'+', '-':'−', '*':'×', '/':'÷'}[op.o];
        return sym + ' ' + opndLabel(op.c);
      },
      'P': () => `^${op.e} の逆 → √${op.e}（${op.e}乗根）`,
      'E': () => `${op.b}^x の逆 → log${['','','₂','₃','₄'][op.b]}`,
      'F': () => 'x! の逆 → 逆階乗',
    }[op.type];
    return `${i + 1}: ${label ? label() : '?'}`;
  }).join('\n');

  if (G.mode === 'timeattack') {
    const ok = confirm('⚠️ タイムアタック失敗となりますが、本当に答えを見ますか？');
    if (!ok) return;

    stopTimer();
    G.taFailed = true;
    G.scr = 'result';
    render();
  } else {
    alert(`💡 正解の逆操作列:\n${lines}`);
  }
}

function copyPuzzleCode() {
  const code = encodePuzzleCode(G.sol);
  if (!code) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      alert(`📋 問題コードをコピーしました！\n\n【コード】 ${code}`);
    }).catch(() => promptCopy(code));
  } else {
    promptCopy(code);
  }
}

function promptCopy(code) {
  prompt('📋 問題コードをコピーしてください:', code);
}

// ── Rendering ────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  switch (G.scr) {
    case 'start':  app.innerHTML = htmlStart();  break;
    case 'game':   app.innerHTML = htmlGame();   break;
    case 'result': app.innerHTML = htmlResult(); break;
  }
}

function htmlStart() {
  const depths = [2, 3, 4, 5];
  const depthDescs = {
    2: 'かんたん (2段)',
    3: 'ふつう (3段)',
    4: 'むずかしい (4段)',
    5: 'エキスパート (5段)',
  };

  const bestSec = getBestTime(G.depth);
  const bestText = fmtTime(bestSec);
  const taTarget = getTargetQuestions(G.depth);

  return `
<div class="screen start-scr">
  <div class="title-block">
    <h1 class="game-title">
      <span class="t-kinou">帰納法で</span><span class="t-go">Go</span><span class="t-bang">!</span>
    </h1>
    <p class="game-sub">INDUCTIVE REASONING PUZZLE</p>
  </div>

  <div class="start-card">
    <div class="goal-explain-box">
      🎯 <strong>ゲームの目的:</strong> 数列に逆操作を重ね、最下段を<strong>元の自然数列 ｎ (1, 2, 3…10)</strong> に戻せばクリア！
    </div>

    <div class="mode-section">
      <div class="section-label">🎮 モードを選択</div>
      <div class="mode-row">
        <button
          class="mode-btn${G.mode === 'endless' ? ' sel' : ''}"
          onclick="G.mode='endless';render()"
        >
          <span class="m-icon">♾️</span>
          <span class="m-title">エンドレス</span>
          <span class="m-desc">マイペースにパズルを解く</span>
        </button>
        <button
          class="mode-btn${G.mode === 'timeattack' ? ' sel' : ''}"
          onclick="G.mode='timeattack';render()"
        >
          <span class="m-icon">⏱️</span>
          <span class="m-title">タイムアタック</span>
          <span class="m-desc">全 ${taTarget} 問のタイムを競う！</span>
        </button>
      </div>
    </div>

    <div class="depth-section">
      <div class="section-label">🎚 深度を選択（操作回数）</div>
      <div class="depth-row">
        ${depths.map(d => `
          <button
            class="d-btn${G.depth === d ? ' sel' : ''}"
            onclick="G.depth=${d};render()"
          >${d}</button>
        `).join('')}
      </div>
      <div style="text-align:center;font-size:0.85rem;color:var(--navy-soft);margin-top:8px;font-weight:bold">
        ${depthDescs[G.depth]} ${G.mode === 'timeattack' ? `(全 ${taTarget} 問)` : ''}
      </div>
      <div class="best-time-banner">
        <span class="best-time-lbl">🏆 深度 ${G.depth} の自己ベスト:</span>
        <span class="best-time-val">${bestText}</span>
      </div>
    </div>

    <button class="play-btn" onclick="startNewSession(G.mode, G.depth)">
      ゲームスタート！
    </button>

    <div class="share-code-section">
      <div class="section-label" style="margin-bottom:6px">📥 問題コードを入力して挑戦</div>
      <div class="share-input-row">
        <input type="text" id="shareCodeInput" class="share-input" placeholder="共有コードを貼り付け..." />
        <button class="share-play-btn" onclick="startCustomPuzzle(document.getElementById('shareCodeInput').value)">挑戦！</button>
      </div>
    </div>
  </div>
</div>`;
}

function htmlGame() {
  const nLabels = `
<div style="display:flex;align-items:center;gap:6px;padding:4px 8px 0;">
  <div class="row-label-empty"></div>
  <div class="chips-wrap">
    <div class="n-labels">
      ${BASE_SEQ.map(n => `<span class="n-lbl">n=${n}</span>`).join('')}
    </div>
  </div>
</div>`;

  const rows = [];
  
  rows.push(htmlPuzzleRow(G.puzzle));

  if (G.showDiff) {
    const diffs = calcDiffSeq(G.puzzle);
    rows.push(htmlDiffRow(diffs));
  }

  for (let s = 0; s < G.depth; s++) {
    const hasInput = !!G.seqs[s];
    const isActive = G.slot === s;
    const isSet    = !!G.ops[s];
    const hasErr   = G.errs[s];

    rows.push(htmlOpArrow(s, G.ops[s], isActive, isSet, hasErr, hasInput));

    const rowSeq   = G.seqs[s + 1];
    // 💡 最下段のラベルに「目標: ｎ (1..10)」を明記
    const rowLabel = s === G.depth - 1 ? 'ゴール\n(ｎにする)' : `中間${s + 1}`;
    const rowClass = rowSeq ? 'fade-in' : 'dim-row';
    const chipClass = rowSeq ? (isBaseSeq(rowSeq) ? 'nat' : 'not-base-chip') : 'unknown';
    rows.push(htmlSeqRow(rowSeq, rowLabel, rowClass, chipClass));
  }

  const targetQ = getTargetQuestions(G.depth);

  let clearBanner = '';
  if (G.cleared) {
    const isTaDone = G.mode === 'timeattack' && G.solvedCount >= targetQ;
    const lapInfo  = G.mode === 'timeattack' ? ` (ラップ: ${G.lastLapTime}秒)` : '';
    const descText = isTaDone ? `全${targetQ}問クリア！リザルトへ移動中…` : `全 ${G.solvedCount} 問クリア`;

    clearBanner = `
<div class="clear-banner fade-in">
  <div class="clear-banner-inner">
    <div>
      <span class="clear-badge">正解！ 🎉${lapInfo}</span>
      <span class="clear-desc">${descText}</span>
    </div>
    ${!isTaDone && !G.isCustomCode ? `<button class="next-btn" onclick="nextPuzzle()">次の問題へ →</button>` : ''}
    ${G.isCustomCode ? `<button class="next-btn" onclick="G.scr='start';render()">← メニューへ</button>` : ''}
  </div>
</div>`;
  }

  const bestSec = getBestTime(G.depth);
  const bestStr = bestSec !== null ? fmtTime(bestSec) : '−−:−−';

  let headerMeta;
  if (G.mode === 'timeattack') {
    headerMeta = `
<div class="game-info timeattack-info">
  <span class="timer-chip">⏱️ <span id="headerTimer">${fmtTime(G.timeElapsed)}</span></span>
  <span class="best-header-chip" title="深度${G.depth}の自己ベスト">🏆 ${bestStr}</span>
  <span>問: <strong>${G.solvedCount} / ${targetQ}</strong></span>
</div>`;
  } else if (G.isCustomCode) {
    headerMeta = `<div class="game-info">🎯 <strong>共有問題プレイ中</strong></div>`;
  } else {
    headerMeta = `<div class="game-info">クリア数: <strong>${G.solvedCount}</strong> 問</div>`;
  }

  const hintBtnTitle = G.mode === 'timeattack' ? 'ヒントを見るとタイムアタック失敗となります' : 'ヒントを表示';

  return `
<div class="screen game-scr">
  <div class="game-header">
    <button class="back-btn" onclick="stopTimer();G.scr='start';render()">← メニュー</button>
    ${headerMeta}
    <div style="display:flex;gap:6px;align-items:center">
      <button class="share-copy-btn" onclick="copyPuzzleCode()" title="この問題をコードで共有">🔗 共有</button>
      <button class="hint-btn${G.mode === 'timeattack' ? ' ta-hint-btn' : ''}" onclick="showHint()" title="${hintBtnTitle}">💡</button>
    </div>
  </div>

  ${clearBanner}

  <div class="seq-area" id="seqArea">
    ${nLabels}
    ${rows.join('\n')}
  </div>

  <div class="keyboard">
    ${htmlKeyboard()}
  </div>
</div>`;
}

function htmlPuzzleRow(puzzle) {
  const chips = puzzle.map((v, i) => `<span class="chip puzzle-chip" title="n=${i+1}">${fmt(v)}</span>`).join('');
  const diffBtnText = G.showDiff ? '📊 階差を隠す' : '📊 階差';

  return `
<div class="seq-row puzzle-row">
  <div class="row-label puzzle-lbl-wrap">
    <span>出題</span>
    <button class="diff-toggle-btn${G.showDiff ? ' active' : ''}" onclick="G.showDiff=!G.showDiff;render()">${diffBtnText}</button>
  </div>
  <div class="chips-wrap">
    <div class="chips">${chips}</div>
  </div>
</div>`;
}

function htmlDiffRow(diffs) {
  if (!diffs) return '';
  const chips = diffs.map((v, i) => `<span class="chip diff-chip" title="b_${i+1}=a_${i+2}-a_${i+1}">${fmt(v)}</span>`).join('');

  return `
<div class="seq-row diff-row fade-in">
  <div class="row-label diff-lbl">階差 bₙ</div>
  <div class="chips-wrap">
    <div class="chips diff-chips">${chips}</div>
  </div>
</div>`;
}

function htmlResult() {
  const targetQ = getTargetQuestions(G.depth);

  if (G.taFailed) {
    const revOps = G.sol.slice().reverse();
    const solLines = revOps.map((op, i) => {
      const label = {
        'A': () => {
          const sym = {'+':'+', '-':'−', '*':'×', '/':'÷'}[op.o];
          return sym + ' ' + opndLabel(op.c);
        },
        'P': () => `√${op.e}`,
        'E': () => `log${['','','₂','₃','₄'][op.b]}`,
        'F': () => '逆階乗',
      }[op.type];
      return `${i + 1}. ${label ? label() : '?'}`;
    }).join(' &ensp; ');

    return `
<div class="screen win-scr">
  <div class="result-title-card">
    <div class="timeup-stamp failed-stamp">FAILED... ❌</div>
    <p class="win-sub" style="color:var(--red-deep)">ヒントを閲覧したためタイムアタック失敗！</p>
  </div>

  <div class="win-ops-card" style="border-color:var(--red-deep)">
    <div class="result-grid">
      <div class="res-item" style="border-color:var(--red-deep);background:var(--red-light)">
        <div class="res-lbl" style="color:var(--red-deep)">失敗までの経過時間</div>
        <div class="res-val">${fmtTime(G.timeElapsed)}</div>
      </div>
      <div class="res-item">
        <div class="res-lbl">正解していた問題数</div>
        <div class="res-val">${G.solvedCount} / ${targetQ} <span class="res-unit">問</span></div>
      </div>
    </div>
    <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--navy-soft);font-size:0.85rem;text-align:left">
      <div style="font-weight:bold;color:var(--navy);margin-bottom:4px">💡 正解だった逆操作列:</div>
      <div style="font-family:var(--font-display);color:var(--navy-soft)">${solLines}</div>
    </div>
  </div>

  <div class="win-btns">
    <button class="play-btn" onclick="startNewSession('timeattack', G.depth)">
      ⏱️ リベンジする
    </button>
    <button class="back-btn2" onclick="G.scr='start';render()">
      ← スタート画面へ戻る
    </button>
  </div>
</div>`;
  }

  const avgTime = G.solvedCount > 0 ? (G.timeElapsed / G.solvedCount).toFixed(1) : '0.0';
  const newRecBadge = G.isNewRecord ? `<div class="new-record-badge">🎉 自己ベスト達成！</div>` : '';

  return `
<div class="screen win-scr">
  <div class="result-title-card">
    <div class="timeup-stamp">🏆 TIME ATTACK!</div>
    <p class="win-sub">${targetQ}問タイムアタック達成！（深度 ${G.depth}）</p>
    ${newRecBadge}
  </div>

  <div class="win-ops-card">
    <div class="result-grid">
      <div class="res-item main-res">
        <div class="res-lbl">合計タイム</div>
        <div class="res-val time-val">${fmtTime(G.timeElapsed)}</div>
      </div>
      <div class="res-item">
        <div class="res-lbl">達成問題数</div>
        <div class="res-val">${targetQ} / ${targetQ} <span class="res-unit">問</span></div>
      </div>
      <div class="res-item">
        <div class="res-lbl">平均クリアタイム</div>
        <div class="res-val">${avgTime} <span class="res-unit">秒/問</span></div>
      </div>
    </div>
  </div>

  <div class="win-btns">
    <button class="play-btn" onclick="startNewSession('timeattack', G.depth)">
      ⏱️ もう一度タイムアタック
    </button>
    <button class="back-btn2" onclick="G.scr='start';render()">
      ← スタート画面へ戻る
    </button>
  </div>
</div>`;
}

function htmlSeqRow(seq, label, extraClass, chipClass) {
  const chips = seq
    ? seq.map((v, i) => `<span class="chip ${chipClass}" title="n=${i+1}">${fmt(v)}</span>`).join('')
    : Array(NUM_TERMS).fill(`<span class="chip unknown">？</span>`).join('');

  return `
<div class="seq-row ${extraClass || ''}">
  <div class="row-label" style="white-space:pre-line">${label}</div>
  <div class="chips-wrap">
    <div class="chips">${chips}</div>
  </div>
</div>`;
}

function htmlOpArrow(slot, op, isActive, isSet, hasErr, hasInput) {
  const classes = [
    'op-arrow',
    isActive  ? 'op-active'   : '',
    isSet     ? 'op-set'      : '',
    hasErr    ? 'op-error'    : '',
    !hasInput ? 'op-disabled' : '',
  ].filter(Boolean).join(' ');

  const clickAttr = hasInput
    ? `onclick="activateSlot(${slot})"`
    : '';

  let label;
  if (isSet) {
    label = revLabel(op);
  } else if (isActive && G.kb === 'arith' && G.arithOp) {
    const sym = {'+':'+', '-':'−', '*':'×', '/':'÷'}[G.arithOp];
    if (G.arithConst !== null) {
      label = `${sym} ${G.arithConst}…`;
    } else {
      label = `${sym} ？`;
    }
  } else {
    label = hasInput ? '操作を入力' : '—';
  }

  const delBtn = isSet
    ? `<button class="slot-del-btn" onclick="event.stopPropagation();clearSlot(${slot})" title="操作を消去">✕</button>`
    : '';

  const hint = !isSet && hasInput && !isActive
    ? `<span class="tap-hint">↓ タップ</span>`
    : '';

  return `
<div class="${classes}" ${clickAttr}>
  <span class="op-lbl">${label}</span>
  <span class="arr-icon">↓</span>
  ${hint}
  ${delBtn}
</div>`;
}

function htmlKeyboard() {
  const kbActive  = G.slot !== null && !!G.seqs[G.slot];
  const inArith   = G.kb === 'arith';
  const numActive = inArith ? ' num-active' : '';

  let statusHtml;
  if (G.slot === null) {
    statusHtml = '↑ 操作をセットする矢印欄（↓）を選択してください';
  } else if (!G.seqs[G.slot]) {
    statusHtml = '上の操作欄を先に確定させてください';
  } else if (inArith) {
    const sym = {'+':'+', '-':'−', '*':'×', '/':'÷'}[G.arithOp];
    if (G.arithConst !== null) {
      statusHtml = `演算子 <span class="op-sel-indicator">${sym} ${G.arithConst}</span> → [確定] を押すか [ｎ], [ｎ²] と合成`;
    } else {
      statusHtml = `演算子 <span class="op-sel-indicator">${sym}</span> 選択中 → [1〜9], [ｎ], [2ⁿ] など対象を選択`;
    }
  } else {
    const setOp = G.ops[G.slot];
    statusHtml = setOp 
      ? `【操作 ${G.slot + 1}】 セット中: <strong>${revLabel(setOp)}</strong>`
      : `【操作 ${G.slot + 1}】 演算子、乗根、対数、逆階乗を選んでください`;
  }

  const dis = kbActive ? '' : ' disabled';
  const okDis = kbActive && inArith && G.arithConst !== null ? '' : ' disabled';

  const arithBtns = [
    ['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']
  ].map(([key, sym]) => {
    const sel = inArith && G.arithOp === key ? ' kb-sel' : '';
    return `<button class="kb-btn arith${sel}" onclick="handleKb('${key}')"${dis}>${sym}</button>`;
  }).join('');

  const numBtns = [1,2,3,4,5,6,7,8,9].map(n => {
    const sel = inArith && G.arithConst === n ? ' const-sel' : '';
    return `<button class="kb-btn num${numActive}${sel}" onclick="handleKb(${n})"${dis}>${n}</button>`;
  }).join('');

  const opndBtns = [
    { key:'n',  lbl:'ｎ',  cls:'n-btn' },
    { key:'n2', lbl:'ｎ²', cls:'n-btn' },
    { key:'n3', lbl:'ｎ³', cls:'n-btn' },
    { key:'n4', lbl:'ｎ⁴', cls:'n-btn' },
    { key:'2n', lbl:'2ⁿ', cls:'exp-btn' },
    { key:'3n', lbl:'3ⁿ', cls:'exp-btn' },
    { key:'4n', lbl:'4ⁿ', cls:'exp-btn' },
    { key:'n!', lbl:'ｎ!', cls:'fact-opnd-btn' },
  ].map(({ key, lbl, cls }) =>
    `<button class="kb-btn num ${cls}${numActive}" onclick="handleKb('${key}')"${dis}>${lbl}</button>`
  ).join('');

  return `
<div class="kb-wrap">
  <div class="kb-status ${kbActive ? 'active-hint' : ''}">${statusHtml}</div>
  <div class="kb-sections">
    <div class="kb-row">
      ${arithBtns}
      <button class="kb-btn clr" onclick="handleKb('clear')"${dis}>消去</button>
      <button class="kb-btn ok-btn" onclick="handleKb('commit')"${okDis}>確定</button>
    </div>
    
    <div class="kb-row">
      ${opndBtns}
    </div>

    <div class="kb-row">
      ${numBtns}
    </div>

    <div class="kb-row">
      <button class="kb-btn spec"     onclick="handleKb('R2')"${dis} title="平方根 (x^2の逆)">√</button>
      <button class="kb-btn spec"     onclick="handleKb('R3')"${dis} title="立方根 (x^3の逆)">∛</button>
      <button class="kb-btn spec"     onclick="handleKb('R4')"${dis} title="4乗根 (x^4の逆)">⁴√</button>
      <button class="kb-btn spec log" onclick="handleKb('L2')"${dis} title="底2の対数 (2^xの逆)">log₂</button>
      <button class="kb-btn spec log" onclick="handleKb('L3')"${dis} title="底3の対数 (3^xの逆)">log₃</button>
      <button class="kb-btn spec log" onclick="handleKb('L4')"${dis} title="底4の対数 (4^xの逆)">log₄</button>
      <button class="kb-btn spec fact" onclick="handleKb('IF')"${dis} title="逆階乗 (x!の逆)">逆階乗</button>
    </div>
  </div>
</div>`;
}

window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  if (codeParam) {
    startCustomPuzzle(codeParam);
  } else {
    render();
  }
});
