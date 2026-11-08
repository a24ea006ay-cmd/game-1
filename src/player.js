'use strict';

// ===== 赤いペットボトルの描画 =====
// water: 中の水の量(0〜1、HPを表す) / fizz: 炭酸ゲージ(0〜100)
function drawBottle(ctx, water, fizz, time, flame) {
  const bw = 13;      // 胴の半分の幅
  const bottom = 28;  // 底の位置
  ctx.save();

  // 推進の炎
  if (flame) {
    const fl = 10 + Math.sin(time * 40) * 4;
    const fg = ctx.createLinearGradient(0, bottom, 0, bottom + fl + 6);
    fg.addColorStop(0, 'rgba(255,230,120,0.95)');
    fg.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-7, bottom);
    ctx.lineTo(0, bottom + fl + 6);
    ctx.lineTo(7, bottom);
    ctx.closePath();
    ctx.fill();
  }

  // ボトルの形
  const body = new Path2D();
  body.moveTo(-5, -24);
  body.lineTo(-5, -20);
  body.quadraticCurveTo(-bw, -17, -bw, -8);
  body.lineTo(-bw, bottom - 5);
  body.quadraticCurveTo(-bw, bottom, -bw + 5, bottom);
  body.lineTo(bw - 5, bottom);
  body.quadraticCurveTo(bw, bottom, bw, bottom - 5);
  body.lineTo(bw, -8);
  body.quadraticCurveTo(bw, -17, 5, -20);
  body.lineTo(5, -24);
  body.closePath();

  const g = ctx.createLinearGradient(-bw, 0, bw, 0);
  g.addColorStop(0, '#ff6b6b');
  g.addColorStop(0.5, '#e8102a');
  g.addColorStop(1, '#9e0016');
  ctx.fillStyle = g;
  ctx.fill(body);

  // 中の水(HP)と炭酸の泡
  ctx.save();
  ctx.clip(body);
  const topY = -20;
  const level = bottom - (bottom - topY) * clamp(water, 0, 1);
  ctx.fillStyle = 'rgba(110,0,18,0.4)';
  ctx.beginPath();
  ctx.moveTo(-bw, bottom + 2);
  for (let x = -bw; x <= bw; x += 2) {
    ctx.lineTo(x, level + Math.sin(time * 6 + x * 0.5) * 1.5);
  }
  ctx.lineTo(bw, bottom + 2);
  ctx.closePath();
  ctx.fill();
  // 水面のライン
  ctx.strokeStyle = 'rgba(255,215,220,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = -bw; x <= bw; x += 2) {
    const yy = level + Math.sin(time * 6 + x * 0.5) * 1.5;
    if (x === -bw) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  ctx.stroke();

  const n = Math.floor(fizz / 10);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const depth = Math.max(1, bottom - level);
  for (let i = 0; i < n; i++) {
    const bx = Math.sin(i * 12.9898) * (bw - 4);
    const by = bottom - ((time * 30 + i * 13) % depth);
    ctx.beginPath();
    ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ラベル
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-bw, 2, bw * 2, 9);
  ctx.fillStyle = '#e8102a';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SODA', 0, 6.8);

  // 光の反射
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-bw + 4, -6);
  ctx.lineTo(-bw + 4, bottom - 8);
  ctx.stroke();

  // 輪郭
  ctx.strokeStyle = '#ffd3d8';
  ctx.lineWidth = 1.2;
  ctx.stroke(body);

  // キャップ
  ctx.fillStyle = '#7a0010';
  ctx.fillRect(-6.5, -31, 13, 8);
  ctx.fillStyle = '#c4001e';
  ctx.fillRect(-6.5, -31, 13, 2.5);

  ctx.restore();
}

// ===== 自機(ペットボトル) =====
class Player {
  constructor() {
    this.maxHp = 3;
    this.hp = this.maxHp;
    this.reset();
  }

  // 位置などを初期化(HPはそのまま)
  reset() {
    this.x = W / 2;
    this.y = H - 110;
    this.r = 6;          // 当たり判定(中心の白い点)
    this.inv = 1.5;      // 無敵時間
    this.fizz = 0;       // 炭酸ゲージ 0〜100
    this.fireCd = 0;
    this.lastDir = 0;    // 直前の左右の向き
    this.travel = 0;     // 同じ向きに動いた距離
    this.sinceRev = 9;   // 前回の切り返しからの時間
    this.tilt = 0;
    this.shakeFx = 0;
  }

  addFizz(v) {
    const before = this.fizz;
    this.fizz = Math.min(100, this.fizz + v);
    if (before < 100 && this.fizz >= 100) sfx('ready');
  }

  update(dt, input, game) {
    const prevX = this.x;
    const speed = 300;

    if (input.pointer.active) {
      // タッチ/マウスのドラッグ: 指の位置へ追従(指との距離は保つ)
      const tx = input.pointer.x + input.pointer.ox;
      const ty = input.pointer.y + input.pointer.oy;
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const step = 1000 * dt;
      if (d <= step) { this.x = tx; this.y = ty; }
      else { this.x += dx / d * step; this.y += dy / d * step; }
    } else {
      let mx = 0, my = 0;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (input.up) my -= 1;
      if (input.down) my += 1;
      if (mx && my) { mx *= 0.7071; my *= 0.7071; }
      this.x += mx * speed * dt;
      this.y += my * speed * dt;
    }
    this.x = clamp(this.x, 18, W - 18);
    this.y = clamp(this.y, 50, H - 50);

    // --- 「振って炭酸チャージ」: 左右の切り返しを検知 ---
    const moved = this.x - prevX;
    this.sinceRev += dt;
    if (Math.abs(moved) > 0.3) {
      const dir = Math.sign(moved);
      if (this.lastDir !== 0 && dir !== this.lastDir) {
        if (this.travel >= 8 && this.sinceRev < 0.5) {
          this.addFizz(9);
          this.shakeFx = 0.25;
          game.spawnBubbles(this.x, this.y - 10, 3);
        }
        this.travel = 0;
        this.sinceRev = 0;
      }
      this.lastDir = dir;
      this.travel += Math.abs(moved);
    }

    const targetTilt = dt > 0 ? clamp((moved / dt) * 0.0015, -0.45, 0.45) : 0;
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 12);
    this.shakeFx = Math.max(0, this.shakeFx - dt);
    this.inv = Math.max(0, this.inv - dt);

    // 通常ショット(水滴): SPACE / ショットボタンを押している間だけ連射
    this.fireCd -= dt;
    if ((input.keyShoot || input.touchShoot) && this.fireCd <= 0) {
      game.playerShots.push({ x: this.x - 5, y: this.y - 32, vy: -640, r: 4 });
      game.playerShots.push({ x: this.x + 5, y: this.y - 32, vy: -640, r: 4 });
      this.fireCd = 0.13;
    }

    // 炭酸バースト(ゲージ満タン時)
    if (input.burstPressed && this.fizz >= 100) {
      game.fireBurst(this.x, this.y - 34);
      this.fizz = 0;
    }
  }

  // 被弾。ダメージを受けたら true
  hurt(game) {
    if (this.inv > 0) return false;
    this.hp -= 1;
    this.inv = 1.6;
    game.shake(9);
    game.spawnSplash(this.x, this.y);
    sfx('hurt');
    return true;
  }

  draw(ctx, time) {
    ctx.save();
    if (this.inv > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.translate(this.x, this.y);

    // 炭酸MAXのオーラ
    if (this.fizz >= 100) {
      ctx.strokeStyle = `rgba(255,240,150,${0.5 + Math.sin(time * 10) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 36 + Math.sin(time * 10) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    const wobble = this.shakeFx > 0 ? Math.sin(time * 80) * 0.18 : 0;
    ctx.rotate(this.tilt + wobble);
    drawBottle(ctx, this.hp / this.maxHp, this.fizz, time, true);
    ctx.restore();

    // 当たり判定の目印
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
