'use strict';

// ===== 画面の準備 =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const burstBtn = document.getElementById('burstBtn');
const shootBtn = document.getElementById('shootBtn');
const FONT = '"Hiragino Kaku Gothic ProN","Meiryo","Yu Gothic",sans-serif';

function resize() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ===== 効果音(Web Audio で簡単な音を作る) =====
let actx = null;
function initAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
const SFX = {
  // [開始周波数, 長さ, 波形, 音量, 終わりの周波数の倍率]
  boom:   [140, 0.22, 'sawtooth', 0.06, 0.3],
  burst:  [180, 0.45, 'sawtooth', 0.10, 3.0],
  ready:  [880, 0.18, 'sine', 0.08, 1.6],
  hurt:   [200, 0.35, 'triangle', 0.14, 0.3],
  phase:  [320, 0.6, 'square', 0.06, 0.5],
  clear:  [660, 0.5, 'sine', 0.10, 1.5],
  big:    [80, 0.9, 'sawtooth', 0.12, 0.2],
  select: [600, 0.08, 'square', 0.04, 1.3],
  step:   [320, 0.07, 'triangle', 0.06, 1.6],
  deny:   [160, 0.15, 'square', 0.05, 0.8],
};
function sfx(name) {
  if (!actx || !SFX[name]) return;
  try {
    const [f, d, type, v, mul] = SFX[name];
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f * mul), t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  } catch (e) { /* 音が出せない環境では無視 */ }
}

// ===== セーブデータ(クリア状況と各ステージのベストスコア) =====
const SAVE_KEY = 'petbottle_save_v1';
function loadSave() {
  const empty = { cleared: STAGES.map(() => false), best: STAGES.map(() => 0) };
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (d && Array.isArray(d.cleared) && Array.isArray(d.best)) {
      return {
        cleared: STAGES.map((_, i) => !!d.cleared[i]),
        best: STAGES.map((_, i) => Number(d.best[i]) || 0),
      };
    }
  } catch (e) { /* 読めなければ新規 */ }
  return empty;
}
const save = loadSave();
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できなくても続行 */ }
}
// 行けるマスの最大番号(0=ホーム, 1〜5=ステージ)。前のステージをクリアすると次が開く
function unlockedNode() {
  let n = 1;
  for (let i = 0; i < STAGES.length - 1; i++) {
    if (save.cleared[i]) n = i + 2; else break;
  }
  return n;
}
function clearedCount() { return save.cleared.filter(Boolean).length; }

// ===== 入力(キーボード + タッチ/マウス) =====
const input = {
  left: false, right: false, up: false, down: false, // 押しっぱなし
  keyShoot: false, touchShoot: false,                // ショット(押している間)
  nav: { left: false, right: false, up: false, down: false }, // 押した瞬間(メニュー・マップ用)
  burstPressed: false, confirmPressed: false, backPressed: false, pausePressed: false,
  tap: null, // タップ/クリックした位置(ゲーム内座標)
  pointer: { active: false, id: null, x: 0, y: 0, ox: 0, oy: 0 },
  touchMode: false,
};
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
};

window.addEventListener('keydown', (e) => {
  initAudio();
  const k = KEYMAP[e.code];
  if (k) {
    input[k] = true;
    if (!e.repeat) input.nav[k] = true;
    e.preventDefault();
  }
  if (e.code === 'Space') {
    input.keyShoot = true;
    if (!e.repeat) input.confirmPressed = true;
    e.preventDefault();
  }
  if (e.repeat) return;
  if (e.code === 'Enter') input.confirmPressed = true;
  if (e.code === 'KeyB') input.burstPressed = true;
  if (e.code === 'KeyP') input.pausePressed = true;
  if (e.code === 'Escape') { input.pausePressed = true; input.backPressed = true; }
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
  if (e.code === 'Space') input.keyShoot = false;
});
window.addEventListener('blur', () => {
  input.left = input.right = input.up = input.down = false;
  input.keyShoot = input.touchShoot = false;
  input.pointer.active = false;
  if (game.state === 'play' && !game.paused) pauseGame(); // 別の画面に切り替えたら自動で一時停止
});

function toGamePos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

// 一時停止ボタン(画面上部中央)
const PAUSE_BTN = { x: W / 2, y: 26, r: 20 };

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  e.preventDefault();
  if (e.pointerType === 'touch' && !input.touchMode) {
    input.touchMode = true;
    document.body.classList.add('touch');
  }
  const p = toGamePos(e);
  const playing = game.state === 'play' && !game.paused;
  if (playing && dist2(p.x, p.y, PAUSE_BTN.x, PAUSE_BTN.y) < (PAUSE_BTN.r + 8) ** 2) {
    input.pausePressed = true;
    return;
  }
  if (!playing) { input.tap = p; return; }
  // プレイ中はドラッグで移動
  const ptr = input.pointer;
  ptr.active = true;
  ptr.id = e.pointerId;
  ptr.x = p.x; ptr.y = p.y;
  ptr.ox = game.player.x - p.x;
  ptr.oy = game.player.y - p.y;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 非対応でも続行 */ }
});
canvas.addEventListener('pointermove', (e) => {
  const ptr = input.pointer;
  if (!ptr.active || ptr.id !== e.pointerId) return;
  const p = toGamePos(e);
  ptr.x = p.x; ptr.y = p.y;
});
function endPointer(e) {
  if (input.pointer.id === e.pointerId) input.pointer.active = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// スマホ用ボタン
shootBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  input.touchShoot = true;
  shootBtn.classList.add('on');
  try { shootBtn.setPointerCapture(e.pointerId); } catch (err) { /* 非対応でも続行 */ }
});
function shootOff() { input.touchShoot = false; shootBtn.classList.remove('on'); }
shootBtn.addEventListener('pointerup', shootOff);
shootBtn.addEventListener('pointercancel', shootOff);
burstBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  input.burstPressed = true;
});

function clearPressed() {
  input.burstPressed = false;
  input.confirmPressed = false;
  input.backPressed = false;
  input.pausePressed = false;
  input.nav.left = input.nav.right = input.nav.up = input.nav.down = false;
  input.tap = null;
}

// ===== ゲーム全体の状態 =====
const game = {
  state: 'title', // title / map / intro / play / clear / gameover / ending
  stateTime: 0,
  time: 0,
  paused: false,
  stageIndex: 0,
  score: 0,
  player: new Player(),
  enemies: [],
  playerShots: [],
  bursts: [],
  enemyBullets: [],
  particles: [],
  boss: null,
  bossSpawned: false,
  stageTime: 0,
  spawnTimer: 0,
  warning: 0,
  clearTimer: -1,
  clearBonus: 0,
  firstClear: false,
  newBest: false,
  shakeAmt: 0,
  flash: 0,
  banner: null,

  get stage() { return STAGES[this.stageIndex]; },

  shake(v) { this.shakeAmt = Math.max(this.shakeAmt, v); },

  addScore(v) { this.score += v; },

  fireBurst(x, y) {
    this.bursts.push({ x, y, vy: -760, r: 24, t: 0, hits: new Set(), hitBoss: false });
    this.shake(6);
    this.spawnBubbles(x, y, 18);
    sfx('burst');
  },

  onBossPhase(ph) {
    this.banner = { text: 'PHASE ' + ph, sub: 'ボスが怒った!', t: 1.6 };
    for (const b of this.enemyBullets) b.dead = true;
    this.flash = 0.6;
    this.shake(12);
    sfx('phase');
  },

  // --- エフェクト ---
  spawnExplosion(x, y, color, n) {
    for (let i = 0; i < (n || 16); i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 260);
      this.particles.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, r: rand(2, 4), color });
    }
  },
  spawnBubbles(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ type: 'bubble', x: x + rand(-10, 10), y: y + rand(-6, 6), vx: rand(-60, 60), vy: rand(-140, -30), life: rand(0.4, 0.9), max: 0.9, r: rand(2, 5), color: '#ffffff' });
    }
  },
  spawnSplash(x, y) {
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2), s = rand(80, 240);
      this.particles.push({ type: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.4, 0.8), max: 0.8, r: rand(2, 4), color: '#ff8a96' });
    }
  },
};

// ===== 星空 =====
const stars = [];
for (let i = 0; i < 130; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 0.8 + 0.2 });

// ===== メニュー(一時停止・クリア・ゲームオーバーで共通) =====
let menu = null; // { items: [{label, action}], index, y, rects }
function openMenu(items, y) { menu = { items, index: 0, y, rects: [] }; }
function runMenuItem(i) {
  const item = menu.items[i];
  menu = null;
  sfx('select');
  item.action();
}
function updateMenu() {
  if (!menu) return;
  const n = menu.items.length;
  if (input.nav.up) { menu.index = (menu.index + n - 1) % n; sfx('select'); }
  if (input.nav.down) { menu.index = (menu.index + 1) % n; sfx('select'); }
  if (input.tap) {
    const p = input.tap;
    for (let i = 0; i < menu.rects.length; i++) {
      const r = menu.rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { runMenuItem(i); return; }
    }
  }
  if (input.confirmPressed) runMenuItem(menu.index);
}

// ===== 画面の切り替え =====
function setState(s) {
  game.state = s;
  game.stateTime = 0;
}

function clearWorld() {
  game.enemies = [];
  game.playerShots = [];
  game.bursts = [];
  game.enemyBullets = [];
  game.boss = null;
  game.banner = null;
}

function toTitle() {
  menu = null;
  game.paused = false;
  clearWorld();
  setState('title');
}

// ワールドマップ(ホーム)へ
function goMap(revealNext) {
  menu = null;
  game.paused = false;
  clearWorld();
  game.particles = [];
  input.pointer.active = false;
  shootOff();
  map.walking = false;
  map.target = map.node;
  map.reveal = 0;
  map.revealNode = 0;
  if (revealNext && map.node + 1 < MAP_NODES.length) {
    map.reveal = MAP_REVEAL_TIME;
    map.revealNode = map.node + 1;
  }
  setState('map');
}

function startStage(idx) {
  menu = null;
  game.paused = false;
  game.stageIndex = idx;
  map.node = map.target = idx + 1; // マップに戻ったときの位置
  clearWorld();
  game.particles = [];
  game.score = 0;
  game.bossSpawned = false;
  game.stageTime = 0;
  game.spawnTimer = 1.5;
  game.warning = 0;
  game.clearTimer = -1;
  game.player.hp = game.player.maxHp; // 各ステージは満タンから
  game.player.reset();
  setState('intro');
}

function pauseGame() {
  game.paused = true;
  input.pointer.active = false;
  shootOff();
  openMenu([
    { label: 'つづける', action: resumeGame },
    { label: 'やり直す', action: () => startStage(game.stageIndex) },
    { label: 'マップへ戻る', action: () => goMap(false) },
  ], H / 2 - 20);
}
function resumeGame() {
  game.paused = false;
  menu = null;
}

function stageClear() {
  const i = game.stageIndex;
  const p = game.player;
  game.clearBonus = p.hp * 1000;
  game.addScore(game.clearBonus);
  game.firstClear = !save.cleared[i];
  game.newBest = game.score > save.best[i];
  save.cleared[i] = true;
  if (game.newBest) save.best[i] = game.score;
  writeSave();
  sfx('clear');
  shootOff();

  if (i >= STAGES.length - 1) {
    setState('ending');
    return;
  }
  setState('clear');
  const reveal = game.firstClear;
  openMenu([
    { label: '次のステージへ', action: () => startStage(i + 1) },
    { label: 'マップへ戻る', action: () => goMap(reveal) },
  ], H / 2 + 50);
}

function gameOver() {
  setState('gameover');
  game.player.hp = 0;
  game.shake(16);
  shootOff();
  openMenu([
    { label: 'もう一度', action: () => startStage(game.stageIndex) },
    { label: 'マップへ戻る', action: () => goMap(false) },
  ], H / 2 + 20);
}

// ===== ワールドマップ =====
// 0 = ホーム基地、1〜5 = ステージ
const MAP_NODES = [
  { x: 80, y: 500 },
  { x: 215, y: 455 },
  { x: 385, y: 390 },
  { x: 250, y: 305 },
  { x: 95, y: 220 },
  { x: 290, y: 135 },
];
const MAP_REVEAL_TIME = 1.2;
const MAP_BTN = { x: 318, y: 620, w: 130, h: 52 };
const map = { node: 0, target: 0, from: 0, to: 0, walking: false, walkT: 0, reveal: 0, revealNode: 0, msg: null };

function mapNodeAt(p) {
  for (let i = 0; i < MAP_NODES.length; i++) {
    const n = MAP_NODES[i];
    if (dist2(p.x, p.y, n.x, n.y) < 42 * 42) return i;
  }
  return -1;
}

function enterNode() {
  if (map.node === 0) { sfx('select'); toTitle(); return; }
  sfx('select');
  startStage(map.node - 1);
}

function updateMap(dt) {
  const maxN = unlockedNode();
  if (map.reveal > 0) map.reveal = Math.max(0, map.reveal - dt);
  if (map.msg) { map.msg.t -= dt; if (map.msg.t <= 0) map.msg = null; }

  if (map.walking) {
    map.walkT += dt / 0.3;
    if (map.walkT >= 1) {
      map.walking = false;
      map.node = map.to;
      sfx('step');
    }
    if (input.backPressed) toTitle();
    return;
  }

  // キーで移動(→↑ で先へ、←↓ で戻る)
  if (input.nav.right || input.nav.up) {
    if (map.node + 1 <= maxN) map.target = map.node + 1;
    else if (map.node + 1 < MAP_NODES.length) { map.msg = { text: '前のステージをクリアすると進めるよ', t: 1.6 }; sfx('deny'); }
  }
  if (input.nav.left || input.nav.down) map.target = Math.max(0, map.node - 1);

  // タップで移動・出撃
  if (input.tap) {
    const p = input.tap;
    const inBtn = p.x >= MAP_BTN.x && p.x <= MAP_BTN.x + MAP_BTN.w && p.y >= MAP_BTN.y && p.y <= MAP_BTN.y + MAP_BTN.h;
    const i = mapNodeAt(p);
    if (inBtn) { enterNode(); return; }
    if (i >= 0) {
      if (i > maxN) { map.msg = { text: 'まだ行けない! 前のステージをクリアしよう', t: 1.6 }; sfx('deny'); }
      else if (i === map.node) { enterNode(); return; }
      else map.target = i;
    }
  }

  if (map.target !== map.node) {
    map.from = map.node;
    map.to = map.node + Math.sign(map.target - map.node);
    map.walkT = 0;
    map.walking = true;
    return;
  }

  if (input.confirmPressed) { enterNode(); return; }
  if (input.backPressed) toTitle();
}

function mapPlayerPos() {
  if (!map.walking) {
    const n = MAP_NODES[map.node];
    return { x: n.x, y: n.y, hop: 0 };
  }
  const a = MAP_NODES[map.from], b = MAP_NODES[map.to];
  const t = clamp(map.walkT, 0, 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, hop: Math.sin(t * Math.PI) * 16 };
}

// ===== 雑魚の出現 =====
function spawnWave(st) {
  const type = pick(st.types);
  if (type === 'formation') {
    const bx = rand(110, W - 110);
    const ph = rand(0, Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      game.enemies.push(new Enemy('formation', bx + (i - 2) * 36, -20 - Math.abs(i - 2) * 26, st, ph));
    }
  } else if (type === 'shooter') {
    game.enemies.push(new Enemy('shooter', rand(50, W - 50), -30, st));
  } else if (type === 'zigzag') {
    const n = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) game.enemies.push(new Enemy('zigzag', rand(90, W - 90), -30 - i * 50, st, rand(0, 6)));
  } else {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) game.enemies.push(new Enemy('straight', rand(30, W - 30), -30 - i * 40, st));
  }
}

// ===== ダメージ処理 =====
function damageEnemy(e, v) {
  if (e.dead) return;
  e.hp -= v;
  e.hit = 0.06;
  if (e.hp <= 0) {
    e.dead = true;
    game.addScore(e.score);
    game.spawnExplosion(e.x, e.y, e.color, 14);
    game.player.addFizz(3); // 倒すと炭酸が少したまる
    sfx('boom');
  }
}

function hitBoss(v) {
  const b = game.boss;
  if (!b || b.dead) return;
  b.damage(v);
  if (b.dead) bossDefeated(b);
}

function bossDefeated(b) {
  game.addScore(b.score);
  for (let i = 0; i < 6; i++) {
    game.spawnExplosion(b.x + rand(-b.r, b.r), b.y + rand(-b.r * 0.6, b.r * 0.6), pick(['#ffe15a', '#ff5ad1', '#ffffff', '#ff7a3a']), 24);
  }
  for (const eb of game.enemyBullets) eb.dead = true;
  for (const e of game.enemies) damageEnemy(e, 9999);
  game.boss = null;
  game.clearTimer = 2.5;
  game.shake(22);
  game.flash = 1;
  sfx('big');
}

function playerHit() {
  const p = game.player;
  if (!p.hurt(game)) return;
  // 被弾した直後は周りの弾を消す(連続被弾を防ぐ)
  for (const eb of game.enemyBullets) {
    if (dist2(eb.x, eb.y, p.x, p.y) < 110 * 110) eb.dead = true;
  }
  if (p.hp <= 0) gameOver();
}

// ===== 当たり判定 =====
function collisions() {
  const p = game.player;

  // 自機の水滴ショット
  for (const s of game.playerShots) {
    if (s.dead) continue;
    for (const e of game.enemies) {
      if (e.dead) continue;
      if (dist2(s.x, s.y, e.x, e.y) < (e.r + s.r) ** 2) { s.dead = true; damageEnemy(e, 1); break; }
    }
    const b = game.boss;
    if (!s.dead && b && !b.entering && dist2(s.x, s.y, b.x, b.y) < (b.r + s.r) ** 2) {
      s.dead = true;
      hitBoss(1);
      if (Math.random() < 0.3) game.spawnBubbles(s.x, s.y, 1);
    }
  }

  // 炭酸バースト: 貫通 + 弾消し + ボスに大ダメージ
  for (const bu of game.bursts) {
    for (const e of game.enemies) {
      if (e.dead || bu.hits.has(e)) continue;
      if (dist2(bu.x, bu.y, e.x, e.y) < (e.r + bu.r) ** 2) { bu.hits.add(e); damageEnemy(e, 15); }
    }
    const b = game.boss;
    if (b && !b.entering && !bu.hitBoss && dist2(bu.x, bu.y, b.x, b.y) < (b.r + bu.r) ** 2) {
      bu.hitBoss = true;
      game.spawnExplosion(bu.x, bu.y, '#ffffff', 26);
      game.shake(12);
      hitBoss(40);
    }
    for (const eb of game.enemyBullets) {
      if (!eb.dead && dist2(eb.x, eb.y, bu.x, bu.y) < (bu.r + 34) ** 2) {
        eb.dead = true;
        game.addScore(10);
        game.spawnBubbles(eb.x, eb.y, 1);
      }
    }
  }

  if (game.state !== 'play') return;

  // 敵弾 → 自機
  if (p.inv <= 0) {
    for (const eb of game.enemyBullets) {
      if (!eb.dead && dist2(eb.x, eb.y, p.x, p.y) < (eb.r + p.r) ** 2) { eb.dead = true; playerHit(); break; }
    }
  }
  // 敵の体当たり → 自機
  if (p.inv <= 0 && game.state === 'play') {
    for (const e of game.enemies) {
      if (!e.dead && dist2(e.x, e.y, p.x, p.y) < (e.r * 0.75 + p.r) ** 2) { damageEnemy(e, 5); playerHit(); break; }
    }
  }
  // ボスの体当たり → 自機
  const b = game.boss;
  if (p.inv <= 0 && game.state === 'play' && b && !b.entering && dist2(b.x, b.y, p.x, p.y) < (b.r * 0.8 + p.r) ** 2) {
    playerHit();
  }
}

// ===== 更新 =====
function updatePlay(dt) {
  const st = game.stage;
  const p = game.player;
  game.stageTime += dt;
  p.update(dt, input, game);

  // 雑魚の出現 → 全滅したらボス or クリア
  if (game.stageTime < st.duration) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnWave(st);
      game.spawnTimer = st.spawnEvery * rand(0.7, 1.3);
    }
  } else if (!game.bossSpawned && game.enemies.length === 0 && game.clearTimer < 0) {
    if (st.boss) {
      game.bossSpawned = true;
      game.warning = 3;
      sfx('phase');
    } else {
      game.clearTimer = 1.0;
    }
  }
  if (game.warning > 0) {
    game.warning -= dt;
    if (game.warning <= 0) game.boss = new Boss(st.boss, st);
  }

  // 弾・敵を動かす
  for (const s of game.playerShots) { s.y += s.vy * dt; if (s.y < -20) s.dead = true; }
  for (const bu of game.bursts) {
    bu.y += bu.vy * dt;
    bu.t += dt;
    if (Math.random() < 0.8) game.spawnBubbles(bu.x, bu.y + 20, 1);
    if (bu.y < -80) bu.dead = true;
  }
  for (const e of game.enemies) e.update(dt, game);
  if (game.boss) game.boss.update(dt, game);
  for (const eb of game.enemyBullets) {
    eb.x += eb.vx * dt;
    eb.y += eb.vy * dt;
    if (eb.x < -30 || eb.x > W + 30 || eb.y < -30 || eb.y > H + 30) eb.dead = true;
  }

  collisions();

  game.playerShots = game.playerShots.filter((o) => !o.dead);
  game.bursts = game.bursts.filter((o) => !o.dead);
  game.enemies = game.enemies.filter((o) => !o.dead);
  game.enemyBullets = game.enemyBullets.filter((o) => !o.dead);

  if (game.state === 'play' && game.clearTimer >= 0) {
    game.clearTimer -= dt;
    if (game.clearTimer <= 0) { game.clearTimer = -1; stageClear(); }
  }
}

function updateParticles(dt) {
  for (const pt of game.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.type === 'spark') { pt.vx *= 0.94; pt.vy *= 0.94; }
    else if (pt.type === 'bubble') { pt.vy -= 30 * dt; }
    else { pt.vy += 400 * dt; }
    pt.life -= dt;
  }
  game.particles = game.particles.filter((pt) => pt.life > 0);
}

let lastPlaying = false;
function syncButtons() {
  const playing = game.state === 'play' && !game.paused;
  if (playing !== lastPlaying) {
    document.body.classList.toggle('playing', playing);
    lastPlaying = playing;
  }
}

function update(dt) {
  game.time += dt;

  // 一時停止中は時間を止めてメニューだけ動かす
  if (game.state === 'play' && game.paused) {
    if (input.pausePressed) resumeGame();
    else updateMenu();
    clearPressed();
    syncButtons();
    return;
  }

  const scroll = game.state === 'play' ? 1 : 0.4;
  for (const s of stars) {
    s.y += (30 + s.z * 140) * dt * scroll;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  }

  game.stateTime += dt;
  switch (game.state) {
    case 'title':
      if (input.confirmPressed || input.tap) { sfx('select'); goMap(false); }
      break;
    case 'map':
      updateMap(dt);
      break;
    case 'intro':
      if (game.stateTime > 2.4 || ((input.confirmPressed || input.tap) && game.stateTime > 0.4)) setState('play');
      break;
    case 'play':
      if (input.pausePressed) pauseGame();
      else updatePlay(dt);
      break;
    case 'clear':
    case 'gameover':
      if (game.stateTime > 0.8) updateMenu();
      break;
    case 'ending':
      if (game.stateTime > 2.0 && (input.confirmPressed || input.tap)) goMap(false);
      break;
  }

  updateParticles(dt);
  game.shakeAmt = Math.max(0, game.shakeAmt - dt * 30);
  game.flash = Math.max(0, game.flash - dt * 2);
  if (game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
  clearPressed();
  syncButtons();
}

// ===== 描画の部品 =====
function text(str, x, y, size, color, align) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStar(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function dim(a) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(streak) {
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.z * 0.7})`;
    ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2 + (streak ? s.z * 3 : 0));
  }
}

function drawStageBg(st, scrollTime) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, st.sky[0]);
  g.addColorStop(1, st.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 惑星(ゆっくり流れる)
  const pl = st.planet;
  const py = (scrollTime * 6) % (H + 400) - 200;
  const pg = ctx.createRadialGradient(pl.x - pl.r * 0.3, py - pl.r * 0.3, pl.r * 0.1, pl.x, py, pl.r);
  pg.addColorStop(0, pl.color);
  pg.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(pl.x, py, pl.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  drawStars(game.state === 'play' && !game.paused);
}

function drawMenu() {
  if (!menu) return;
  const bw = 250, bh = 44, gap = 56;
  menu.rects = [];
  menu.items.forEach((item, i) => {
    const x = (W - bw) / 2, y = menu.y + i * gap;
    const sel = i === menu.index;
    roundRect(x, y, bw, bh, 12);
    ctx.fillStyle = sel ? '#e8102a' : 'rgba(20,20,50,0.85)';
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.strokeStyle = sel ? '#ffd3d8' : 'rgba(255,255,255,0.4)';
    ctx.stroke();
    text((sel ? '▶ ' : '') + item.label, W / 2, y + bh / 2, 18, '#ffffff');
    menu.rects.push({ x, y, w: bw, h: bh });
  });
  text('↑↓: 選ぶ  SPACE / Enter / タップ: 決定', W / 2, menu.y + menu.items.length * gap + 6, 12, 'rgba(255,255,255,0.7)');
}

// ===== タイトル =====
function drawTitle() {
  const t = game.time;
  ctx.save();
  ctx.translate(W / 2, 250 + Math.sin(t * 2) * 8);
  ctx.rotate(Math.sin(t * 6) * 0.15);
  ctx.scale(2.6, 2.6);
  drawBottle(ctx, 0.8, 60 + Math.sin(t) * 40, t, true);
  ctx.restore();

  text('ペットボトル', W / 2, 90, 40, '#ff3b4f');
  text('ギャラクシー', W / 2, 138, 40, '#ffffff');

  const lines = [
    '移動: 矢印キー / WASD (スマホはドラッグ)',
    'ショット: SPACE を押している間 発射',
    '左右にすばやく振ると 炭酸ゲージ がたまる',
    '満タンで B → 炭酸バースト!',
    '(貫通・敵弾を消す・ボスに大ダメージ)',
    '一時停止: P / Esc / 画面上の ⏸',
  ];
  lines.forEach((l, i) => text(l, W / 2, 410 + i * 26, 14, '#e8e8ff'));

  if (Math.floor(t * 2) % 2 === 0) text('SPACE / タップでスタート', W / 2, 590, 20, '#fff7b0');
  text(`クリア ${clearedCount()} / ${STAGES.length}`, W / 2, 650, 14, '#ffd34d');
}

// ===== ワールドマップの描画 =====
function drawHomeBase(x, y, t) {
  // 地面
  ctx.fillStyle = '#2a3a6a';
  ctx.beginPath(); ctx.ellipse(x, y + 10, 40, 14, 0, 0, Math.PI * 2); ctx.fill();
  // ドーム
  const g = ctx.createLinearGradient(x - 26, y - 30, x + 26, y);
  g.addColorStop(0, 'rgba(180,230,255,0.9)');
  g.addColorStop(1, 'rgba(60,120,200,0.9)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y + 6, 26, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#dff4ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  // アンテナ
  ctx.beginPath(); ctx.moveTo(x + 12, y - 16); ctx.lineTo(x + 20, y - 34); ctx.stroke();
  ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff3b4f' : '#ffe15a';
  ctx.beginPath(); ctx.arc(x + 20, y - 34, 3.5, 0, Math.PI * 2); ctx.fill();
  text('HOME', x, y + 36, 13, '#bde6ff');
}

function drawMap() {
  const t = game.time;
  const maxN = unlockedNode();

  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0420');
  g.addColorStop(1, '#06203a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawStars(false);

  // 道
  ctx.lineCap = 'round';
  for (let i = 0; i < MAP_NODES.length - 1; i++) {
    const a = MAP_NODES[i], b = MAP_NODES[i + 1];
    const open = i + 1 <= maxN;
    let prog = 1;
    if (open && map.reveal > 0 && i + 1 === map.revealNode) prog = clamp(1 - map.reveal / MAP_REVEAL_TIME, 0, 1);
    ctx.setLineDash([2, 12]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (open) {
      ctx.strokeStyle = '#ffe15a';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * prog, a.y + (b.y - a.y) * prog); ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // マス(惑星)
  MAP_NODES.forEach((n, i) => {
    if (i === 0) { drawHomeBase(n.x, n.y, t); return; }
    const st = STAGES[i - 1];
    const revealing = map.reveal > 0 && i === map.revealNode;
    const locked = i > maxN || revealing;
    const r = st.boss === 'big' ? 34 : st.boss === 'mid' ? 30 : 24;

    // 選べるマスは光る
    if (!locked) {
      ctx.fillStyle = `rgba(255,240,150,${0.12 + Math.sin(t * 3 + i) * 0.06})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2); ctx.fill();
    }
    const pg = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, r * 0.1, n.x, n.y, r);
    pg.addColorStop(0, locked ? '#777788' : '#ffffff');
    pg.addColorStop(0.35, locked ? '#555566' : st.planet.color);
    pg.addColorStop(1, locked ? '#222230' : '#1a1030');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = locked ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)';
    ctx.stroke();

    text(locked ? '?' : String(i), n.x, n.y, r * 0.9, locked ? '#aaaaaa' : '#ffffff');
    if (st.boss) text(st.boss === 'big' ? '大ボス' : '中ボス', n.x, n.y - r - 10, 12, locked ? '#888' : '#ff5a6e');
    text(st.name, n.x, n.y + r + 14, 12, locked ? '#777' : '#e8e8ff');
    if (save.cleared[i - 1]) drawStar(n.x + r * 0.8, n.y - r * 0.75, 9, '#ffe15a');
  });

  // 新しく道が開いた演出
  if (map.reveal > 0) {
    const n = MAP_NODES[map.revealNode];
    text('NEW!', n.x, n.y - 52 - (1 - map.reveal / MAP_REVEAL_TIME) * 10, 18, '#fff7b0');
  } else if (map.revealNode && map.revealNode <= maxN && game.stateTime < MAP_REVEAL_TIME + 1.5) {
    const n = MAP_NODES[map.revealNode];
    if (Math.floor(t * 4) % 2 === 0) text('NEW!', n.x, n.y - 62, 18, '#fff7b0');
  }

  // ペットボトル(プレイヤー)
  const pos = mapPlayerPos();
  ctx.save();
  ctx.translate(pos.x, pos.y - 30 - pos.hop + Math.sin(t * 3) * 2);
  ctx.rotate(map.walking ? Math.sin(t * 25) * 0.2 : Math.sin(t * 2) * 0.06);
  ctx.scale(0.85, 0.85);
  drawBottle(ctx, 1, 30, t, false);
  ctx.restore();

  // 上の見出し
  text('ワールドマップ', W / 2, 30, 24, '#ffffff');
  text(`クリア ${clearedCount()} / ${STAGES.length}`, W / 2, 58, 14, '#ffe15a');

  // 下の情報パネル
  roundRect(16, 560, W - 32, 146, 16);
  ctx.fillStyle = 'rgba(10,10,35,0.88)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();

  const showNode = map.walking ? map.to : map.node;
  if (showNode === 0) {
    text('ホーム基地', 34, 590, 20, '#bde6ff', 'left');
    text('ここから冒険に出発しよう', 34, 622, 14, '#e8e8ff', 'left');
    text('→ キーで ステージ1 へ', 34, 648, 14, '#e8e8ff', 'left');
  } else {
    const st = STAGES[showNode - 1];
    text(`STAGE ${showNode}  ${st.name}`, 34, 590, 20, '#ffffff', 'left');
    const bossTxt = st.boss === 'big' ? '大ボス出現' : st.boss === 'mid' ? '中ボス出現' : '通常ステージ';
    text(bossTxt, 34, 620, 14, st.boss ? '#ff5a6e' : '#bde6ff', 'left');
    if (save.cleared[showNode - 1]) {
      drawStar(42, 648, 8, '#ffe15a');
      text(`クリア済み  BEST ${save.best[showNode - 1]}`, 56, 648, 14, '#ffe15a', 'left');
    } else {
      text('未クリア', 34, 648, 14, '#aaaaaa', 'left');
    }
  }

  // 出撃ボタン
  const b = MAP_BTN;
  roundRect(b.x, b.y, b.w, b.h, 12);
  ctx.fillStyle = showNode === 0 ? '#3a5a9a' : '#e8102a';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  text(showNode === 0 ? 'タイトルへ' : '出撃!', b.x + b.w / 2, b.y + b.h / 2, showNode === 0 ? 16 : 20, '#ffffff');

  text('←→: 移動   SPACE: 決定   Esc: タイトル', W / 2, 690, 12, 'rgba(255,255,255,0.65)');

  if (map.msg) {
    roundRect(40, 500 - 100, W - 80, 40, 10);
    ctx.fillStyle = 'rgba(120,0,20,0.9)';
    ctx.fill();
    text(map.msg.text, W / 2, 420, 14, '#ffffff');
  }
}

// ===== ステージ中の描画 =====
function drawWorld() {
  const t = game.time;

  for (const e of game.enemies) e.draw(ctx, t);
  if (game.boss) game.boss.draw(ctx, t, game);

  // 水滴ショット
  ctx.fillStyle = '#9fe8ff';
  for (const s of game.playerShots) {
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r * 0.7, s.r * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 炭酸バースト(キャップが飛ぶ)
  for (const bu of game.bursts) {
    ctx.save();
    ctx.translate(bu.x, bu.y);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, bu.r + 12, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(bu.t * 20);
    ctx.fillStyle = '#c4001e';
    ctx.fillRect(-bu.r * 0.7, -bu.r * 0.45, bu.r * 1.4, bu.r * 0.9);
    ctx.strokeStyle = '#ffd3d8';
    ctx.lineWidth = 2;
    ctx.strokeRect(-bu.r * 0.7, -bu.r * 0.45, bu.r * 1.4, bu.r * 0.9);
    ctx.restore();
  }

  // 自機
  if (game.player.hp > 0 && game.state !== 'ending') game.player.draw(ctx, t);

  // 敵弾
  for (const eb of game.enemyBullets) {
    ctx.fillStyle = eb.color;
    ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  // パーティクル
  for (const pt of game.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    if (pt.type === 'bubble') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const p = game.player;
  text(`SCORE ${game.score}`, 14, 20, 16, '#ffffff', 'left');
  text(`BEST ${save.best[game.stageIndex]}`, 14, 42, 12, '#ffd34d', 'left');
  text(`STAGE ${game.stageIndex + 1}/${STAGES.length}`, W - 14, 20, 16, '#ffffff', 'right');

  // HP(水のしずく)
  for (let i = 0; i < p.maxHp; i++) {
    const x = W - 22 - i * 22, y = 46;
    ctx.fillStyle = i < p.hp ? '#ff3b4f' : 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.quadraticCurveTo(x + 8, y + 1, x, y + 7);
    ctx.quadraticCurveTo(x - 8, y + 1, x, y - 9);
    ctx.fill();
  }

  // 一時停止ボタン
  if (game.state === 'play' && !game.paused) {
    const b = PAUSE_BTN;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b.x - 7, b.y - 8, 5, 16);
    ctx.fillRect(b.x + 2, b.y - 8, 5, 16);
  }

  // 炭酸ゲージ
  const gx = 14, gy = H - 34, gw = 200, gh = 14;
  text('炭酸', gx, gy - 14, 12, '#ffffff', 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(gx, gy, gw, gh);
  const full = p.fizz >= 100;
  const fg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  fg.addColorStop(0, '#ff8a96');
  fg.addColorStop(1, full ? '#fff7b0' : '#ffd3d8');
  ctx.fillStyle = fg;
  ctx.fillRect(gx, gy, gw * p.fizz / 100, gh);
  ctx.strokeStyle = full ? '#fff7b0' : '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, gw, gh);
  if (full) {
    if (Math.floor(game.time * 4) % 2 === 0) {
      text(input.touchMode ? '炭酸MAX! ボタンで発射!' : '炭酸MAX! B で発射!', gx + gw + 10, gy + gh / 2, 13, '#fff7b0', 'left');
    }
  } else {
    text('← 左右に振ってチャージ →', gx + gw + 10, gy + gh / 2, 11, 'rgba(255,255,255,0.65)', 'left');
  }

  // ボスの体力
  const b = game.boss;
  if (b) {
    const bw = 300, bx = (W - bw) / 2, by = 70;
    text(b.name, W / 2, by - 10, 13, '#ffe15a');
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = b.big ? '#ff3b5c' : '#b98bff';
    ctx.fillRect(bx, by, bw * b.hp / b.maxHp, 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, 8);
    for (let i = 1; i < b.maxPhase; i++) {
      const x = bx + bw * i / b.maxPhase;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + 8); ctx.stroke();
    }
  }
}

function drawOverlays() {
  const st = game.stage;
  const t = game.time;

  if (game.state === 'intro') {
    dim(0.35);
    text(`STAGE ${game.stageIndex + 1}`, W / 2, H / 2 - 50, 44, '#ffffff');
    text(st.name, W / 2, H / 2, 24, '#ffe15a');
    if (st.boss) text(st.boss === 'big' ? '最終ステージ - 大ボス出現' : '中ボス出現ステージ', W / 2, H / 2 + 38, 16, '#ff5a6e');
    text(st.tip, W / 2, H / 2 + 74, 14, '#e8e8ff');
  }

  if (game.warning > 0 && game.state === 'play' && !game.paused) {
    if (Math.floor(t * 4) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,0,40,0.25)';
      ctx.fillRect(0, H / 2 - 60, W, 120);
      text('WARNING!!', W / 2, H / 2 - 18, 44, '#ff3b4f');
      text(st.boss === 'big' ? '巨大エイリアンの女王が接近中' : '大型エイリアン円盤が接近中', W / 2, H / 2 + 26, 16, '#ffffff');
    }
  }

  if (game.banner && game.state === 'play' && !game.paused) {
    text(game.banner.text, W / 2, H / 2 - 20, 36, '#ff5a6e');
    text(game.banner.sub, W / 2, H / 2 + 18, 16, '#ffffff');
  }

  if (game.state === 'clear') {
    dim(0.55);
    text('STAGE CLEAR!', W / 2, H / 2 - 110, 40, '#fff7b0');
    text(`SCORE ${game.score}`, W / 2, H / 2 - 60, 22, '#ffffff');
    text(`(残り水分ボーナス +${game.clearBonus})`, W / 2, H / 2 - 32, 14, '#e8e8ff');
    if (game.newBest) text('ベストスコア更新!', W / 2, H / 2 - 6, 16, '#ffd34d');
    if (game.firstClear) text(`STAGE ${game.stageIndex + 2} への道が開いた!`, W / 2, H / 2 + 20, 15, '#ff8a96');
  }

  if (game.state === 'gameover') {
    dim(0.6);
    text('GAME OVER', W / 2, H / 2 - 80, 44, '#ff3b4f');
    text('ボトルが空っぽになった…', W / 2, H / 2 - 34, 16, '#ffffff');
  }

  if (game.state === 'ending') {
    dim(0.55);
    text('ALL CLEAR!!', W / 2, H / 2 - 90, 46, '#fff7b0');
    text('宇宙の平和は赤いペットボトルが守った!', W / 2, H / 2 - 40, 16, '#ffffff');
    text(`SCORE ${game.score}`, W / 2, H / 2 + 6, 24, '#ffffff');
    if (game.newBest) text('ベストスコア更新!', W / 2, H / 2 + 40, 16, '#ffd34d');
    if (game.stateTime > 2.0 && Math.floor(t * 2) % 2 === 0) text('SPACE / タップでマップへ', W / 2, H / 2 + 96, 16, '#e8e8ff');
  }

  if (game.paused) {
    dim(0.55);
    text('PAUSE', W / 2, H / 2 - 80, 40, '#ffffff');
  }

  if ((game.state === 'clear' || game.state === 'gameover') && game.stateTime <= 0.8) return;
  drawMenu();
}

function render() {
  if (game.state === 'title') {
    drawStageBg(STAGES[0], game.time);
    drawTitle();
  } else if (game.state === 'map') {
    drawMap();
  } else {
    ctx.save();
    if (game.shakeAmt > 0 && !game.paused) ctx.translate(rand(-game.shakeAmt, game.shakeAmt), rand(-game.shakeAmt, game.shakeAmt));
    drawStageBg(game.stage, game.stageTime);
    drawWorld();
    ctx.restore();
    drawHUD();
    drawOverlays();
  }

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${game.flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== メインループ =====
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 1 / 30) dt = 1 / 30; // 処理落ち時の暴走を防ぐ
  if (dt < 0) dt = 0;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
