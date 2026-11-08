'use strict';

// ===== 画面の準備 =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const burstBtn = document.getElementById('burstBtn');
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
  boom:  [140, 0.22, 'sawtooth', 0.06, 0.3],
  burst: [180, 0.45, 'sawtooth', 0.10, 3.0],
  ready: [880, 0.18, 'sine', 0.08, 1.6],
  hurt:  [200, 0.35, 'triangle', 0.14, 0.3],
  phase: [320, 0.6, 'square', 0.06, 0.5],
  clear: [660, 0.5, 'sine', 0.10, 1.5],
  big:   [80, 0.9, 'sawtooth', 0.12, 0.2],
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

// ===== ハイスコア保存 =====
function loadHi() {
  try { return parseInt(localStorage.getItem('petbottle_hi') || '0', 10) || 0; } catch (e) { return 0; }
}
function saveHi(v) {
  try { localStorage.setItem('petbottle_hi', String(v)); } catch (e) { /* 保存できなくても続行 */ }
}

// ===== 入力(キーボード + タッチ/マウス) =====
const input = {
  left: false, right: false, up: false, down: false,
  burstPressed: false, confirmPressed: false, titlePressed: false, pausePressed: false,
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
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.code === 'Space') {
    if (!e.repeat) { input.burstPressed = true; input.confirmPressed = true; }
    e.preventDefault();
  }
  if (e.code === 'Enter' && !e.repeat) input.confirmPressed = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) input.pausePressed = true;
  if (e.code === 'KeyT' && !e.repeat) input.titlePressed = true;
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
});
window.addEventListener('blur', () => {
  input.left = input.right = input.up = input.down = false;
  input.pointer.active = false;
});

function toGamePos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  e.preventDefault();
  if (e.pointerType === 'touch' && !input.touchMode) {
    input.touchMode = true;
    document.body.classList.add('touch');
  }
  if (game.state !== 'play' || game.paused) { input.confirmPressed = true; return; }
  const p = toGamePos(e);
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

burstBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  initAudio();
  input.burstPressed = true;
  if (game.state !== 'play' || game.paused) input.confirmPressed = true;
});

function clearPressed() {
  input.burstPressed = false;
  input.confirmPressed = false;
  input.titlePressed = false;
  input.pausePressed = false;
}

// ===== ゲーム全体の状態 =====
const game = {
  state: 'title', // title / intro / play / clear / gameover / allclear
  stateTime: 0,
  time: 0,
  paused: false,
  stageIndex: 0,
  score: 0,
  stageStartScore: 0,
  hiScore: loadHi(),
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
  healed: false,
  shakeAmt: 0,
  flash: 0,
  banner: null,

  get stage() { return STAGES[this.stageIndex]; },

  shake(v) { this.shakeAmt = Math.max(this.shakeAmt, v); },

  addScore(v) {
    this.score += v;
    if (this.score > this.hiScore) this.hiScore = this.score;
  },

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

// ===== 星空の背景 =====
const stars = [];
for (let i = 0; i < 130; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 0.8 + 0.2 });

// ===== 状態の切り替え =====
function toTitle() {
  game.state = 'title';
  game.stateTime = 0;
  saveHi(game.hiScore);
  clearWorld();
}

function clearWorld() {
  game.enemies = [];
  game.playerShots = [];
  game.bursts = [];
  game.enemyBullets = [];
  game.boss = null;
}

function startGame() {
  game.score = 0;
  game.stageIndex = 0;
  game.player.hp = game.player.maxHp;
  startStage();
}

function startStage() {
  clearWorld();
  game.particles = [];
  game.bossSpawned = false;
  game.stageTime = 0;
  game.spawnTimer = 1.5;
  game.warning = 0;
  game.clearTimer = -1;
  game.stageStartScore = game.score;
  game.player.reset();
  game.state = 'intro';
  game.stateTime = 0;
}

function retryStage() {
  game.score = game.stageStartScore;
  game.player.hp = game.player.maxHp;
  startStage();
}

function stageClear() {
  const p = game.player;
  game.clearBonus = p.hp * 1000;
  game.addScore(game.clearBonus);
  saveHi(game.hiScore);
  sfx('clear');
  game.stateTime = 0;
  if (game.stageIndex >= STAGES.length - 1) {
    game.state = 'allclear';
  } else {
    game.state = 'clear';
    game.healed = p.hp < p.maxHp;
    p.hp = Math.min(p.maxHp, p.hp + 1); // 水分補給
  }
}

function gameOver() {
  game.state = 'gameover';
  game.stateTime = 0;
  game.player.hp = 0;
  game.shake(16);
  saveHi(game.hiScore);
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

function update(dt) {
  game.time += dt;
  const scroll = game.state === 'play' ? 1 : 0.4;
  for (const s of stars) {
    s.y += (30 + s.z * 140) * dt * scroll;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  }

  if (input.pausePressed && game.state === 'play') game.paused = !game.paused;
  if (game.paused) {
    if (input.confirmPressed) game.paused = false;
    clearPressed();
    return;
  }

  game.stateTime += dt;
  switch (game.state) {
    case 'title':
      if (input.confirmPressed) startGame();
      break;
    case 'intro':
      if (game.stateTime > 2.4 || (input.confirmPressed && game.stateTime > 0.4)) {
        game.state = 'play';
        game.stateTime = 0;
      }
      break;
    case 'play':
      updatePlay(dt);
      break;
    case 'clear':
      if (game.stateTime > 1.0 && input.confirmPressed) { game.stageIndex++; startStage(); }
      break;
    case 'gameover':
      if (game.stateTime > 1.0) {
        if (input.titlePressed) toTitle();
        else if (input.confirmPressed) retryStage();
      }
      break;
    case 'allclear':
      if (game.stateTime > 2.0 && input.confirmPressed) toTitle();
      break;
  }

  updateParticles(dt);
  game.shakeAmt = Math.max(0, game.shakeAmt - dt * 30);
  game.flash = Math.max(0, game.flash - dt * 2);
  if (game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
  clearPressed();
}

// ===== 描画 =====
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

function drawBackground() {
  const st = game.state === 'title' ? STAGES[0] : game.stage;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, st.sky[0]);
  g.addColorStop(1, st.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 惑星(ゆっくり流れる)
  const pl = st.planet;
  const py = ((game.state === 'title' ? game.time : game.stageTime) * 6) % (H + 400) - 200;
  const pg = ctx.createRadialGradient(pl.x - pl.r * 0.3, py - pl.r * 0.3, pl.r * 0.1, pl.x, py, pl.r);
  pg.addColorStop(0, pl.color);
  pg.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(pl.x, py, pl.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.z * 0.7})`;
    ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2 + (game.state === 'play' ? s.z * 3 : 0));
  }
}

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
  if (game.player.hp > 0 && game.state !== 'allclear') game.player.draw(ctx, t);

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
  text(`HI ${game.hiScore}`, 14, 42, 12, '#ffd34d', 'left');
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
      text(input.touchMode ? '炭酸MAX! ボタンで発射!' : '炭酸MAX! SPACEで発射!', gx + gw + 10, gy + gh / 2, 13, '#fff7b0', 'left');
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
    // 段階の区切り線
    for (let i = 1; i < b.maxPhase; i++) {
      const x = bx + bw * i / b.maxPhase;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + 8); ctx.stroke();
    }
  }
}

function dim(a) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(0, 0, W, H);
}

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
    'ショット: 自動で水を発射',
    '左右にすばやく振ると 炭酸ゲージ がたまる',
    '満タンで SPACE → 炭酸バースト!',
    '(貫通・敵弾を消す・ボスに大ダメージ)',
    'P: 一時停止',
  ];
  lines.forEach((l, i) => text(l, W / 2, 410 + i * 26, 14, '#e8e8ff'));

  if (Math.floor(t * 2) % 2 === 0) text('SPACE / タップでスタート', W / 2, 590, 20, '#fff7b0');
  text(`HI SCORE ${game.hiScore}`, W / 2, 650, 14, '#ffd34d');
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

  if (game.warning > 0 && game.state === 'play') {
    if (Math.floor(t * 4) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,0,40,0.25)';
      ctx.fillRect(0, H / 2 - 60, W, 120);
      text('WARNING!!', W / 2, H / 2 - 18, 44, '#ff3b4f');
      text(st.boss === 'big' ? '巨大エイリアンの女王が接近中' : '大型エイリアン円盤が接近中', W / 2, H / 2 + 26, 16, '#ffffff');
    }
  }

  if (game.banner && game.state === 'play') {
    text(game.banner.text, W / 2, H / 2 - 20, 36, '#ff5a6e');
    text(game.banner.sub, W / 2, H / 2 + 18, 16, '#ffffff');
  }

  if (game.state === 'clear') {
    dim(0.5);
    text('STAGE CLEAR!', W / 2, H / 2 - 70, 40, '#fff7b0');
    text(`残り水分ボーナス +${game.clearBonus}`, W / 2, H / 2 - 15, 18, '#ffffff');
    if (game.healed) text('水分補給! HP +1', W / 2, H / 2 + 18, 16, '#ff8a96');
    if (game.stateTime > 1.0 && Math.floor(t * 2) % 2 === 0) text('SPACE / タップで次のステージへ', W / 2, H / 2 + 70, 16, '#e8e8ff');
  }

  if (game.state === 'gameover') {
    dim(0.6);
    text('GAME OVER', W / 2, H / 2 - 60, 44, '#ff3b4f');
    text('ボトルが空っぽになった…', W / 2, H / 2 - 14, 16, '#ffffff');
    if (game.stateTime > 1.0) {
      text('SPACE / タップ: このステージから再挑戦', W / 2, H / 2 + 36, 15, '#fff7b0');
      text('T: タイトルへ', W / 2, H / 2 + 64, 14, '#e8e8ff');
    }
  }

  if (game.state === 'allclear') {
    dim(0.55);
    text('ALL CLEAR!!', W / 2, H / 2 - 90, 46, '#fff7b0');
    text('宇宙の平和は赤いペットボトルが守った!', W / 2, H / 2 - 40, 16, '#ffffff');
    text(`SCORE ${game.score}`, W / 2, H / 2 + 6, 24, '#ffffff');
    text(`HI SCORE ${game.hiScore}`, W / 2, H / 2 + 40, 16, '#ffd34d');
    if (game.stateTime > 2.0 && Math.floor(t * 2) % 2 === 0) text('SPACE / タップでタイトルへ', W / 2, H / 2 + 96, 16, '#e8e8ff');
  }

  if (game.paused) {
    dim(0.5);
    text('PAUSE', W / 2, H / 2 - 20, 40, '#ffffff');
    text('P / タップで再開', W / 2, H / 2 + 24, 16, '#e8e8ff');
  }

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${game.flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function render() {
  ctx.save();
  if (game.shakeAmt > 0) ctx.translate(rand(-game.shakeAmt, game.shakeAmt), rand(-game.shakeAmt, game.shakeAmt));
  drawBackground();
  if (game.state === 'title') drawTitle();
  else drawWorld();
  ctx.restore();

  if (game.state !== 'title') drawHUD();
  drawOverlays();
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
