'use strict';

// ===== 弾の発射ヘルパー =====
function aimAngle(x, y, tx, ty) { return Math.atan2(ty - y, tx - x); }

function shootBullet(game, x, y, angle, speed, color, r) {
  game.enemyBullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: r || 5,
    color: color || '#ff5ad1',
  });
}

// 扇形に n 発
function fan(game, x, y, baseAngle, n, spread, speed, color) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? baseAngle : baseAngle - spread / 2 + spread * i / (n - 1);
    shootBullet(game, x, y, a, speed, color);
  }
}

// 全方位に n 発
function ring(game, x, y, n, speed, offset, color) {
  for (let i = 0; i < n; i++) {
    shootBullet(game, x, y, offset + i * Math.PI * 2 / n, speed, color);
  }
}

// ===== 雑魚エイリアン =====
const ENEMY_BASE = {
  straight:  { hp: 2, r: 16, spd: 130, score: 100, color: '#5dff7a' }, // まっすぐ降りてくる
  zigzag:    { hp: 3, r: 16, spd: 105, score: 150, color: '#59e6ff' }, // くねくね動く
  formation: { hp: 2, r: 14, spd: 150, score: 120, color: '#ffe15a' }, // V字の編隊
  shooter:   { hp: 7, r: 21, spd: 95,  score: 300, color: '#d38bff' }, // 止まって狙い撃ち
};

class Enemy {
  constructor(type, x, y, st, phase) {
    const base = ENEMY_BASE[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.st = st;
    this.hp = Math.ceil(base.hp * st.hp);
    this.r = base.r;
    this.spd = base.spd * st.speed;
    this.score = base.score;
    this.color = base.color;
    this.phase = phase || 0;
    this.t = 0;
    this.hit = 0;
    this.dead = false;
    this.stopY = rand(110, 260); // 射撃型が止まる高さ
    this.stay = 0;
    this.fireCd = type === 'shooter' ? 1.0 : rand(0.6, 1.8);
  }

  update(dt, game) {
    this.t += dt;
    this.hit = Math.max(0, this.hit - dt);

    switch (this.type) {
      case 'straight':
        this.y += this.spd * dt;
        break;
      case 'zigzag':
        this.y += this.spd * dt * 0.8;
        this.x = this.baseX + Math.sin(this.t * 3 + this.phase) * 70;
        break;
      case 'formation':
        this.y += this.spd * dt;
        this.x = this.baseX + Math.sin(this.t * 2 + this.phase) * 50;
        break;
      case 'shooter':
        if (this.y < this.stopY && this.stay === 0) {
          this.y += this.spd * dt;
        } else if (this.stay < 5) {
          this.stay += dt;
          this.x += Math.sin(this.t * 1.5) * 40 * dt;
        } else {
          this.y += this.spd * dt; // しばらくしたら去っていく
        }
        break;
    }

    // 射撃
    this.fireCd -= dt;
    if (this.fireCd <= 0 && this.y > 0 && this.y < H * 0.7) {
      const p = game.player;
      const a = aimAngle(this.x, this.y, p.x, p.y);
      if (this.type === 'shooter') {
        fan(game, this.x, this.y + 14, a, 3, 0.35, this.st.bulletSpeed, '#d38bff');
        this.fireCd = this.st.shootEvery;
      } else {
        if (Math.random() < this.st.fireChance) shootBullet(game, this.x, this.y, a, this.st.bulletSpeed);
        this.fireCd = rand(1.5, 2.5);
      }
    }

    if (this.y > H + 50 || this.x < -80 || this.x > W + 80) this.dead = true;
  }

  draw(ctx, time) {
    const r = this.r;
    const c = this.hit > 0 ? '#ffffff' : this.color;
    ctx.save();
    ctx.translate(this.x, this.y);

    // 触角
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.6); ctx.lineTo(-r * 0.7, -r * 1.1);
    ctx.moveTo(r * 0.4, -r * 0.6); ctx.lineTo(r * 0.7, -r * 1.1);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 0.7, -r * 1.1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.7, -r * 1.1, 3, 0, Math.PI * 2); ctx.fill();

    // 足
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.5, r * 0.55);
      ctx.lineTo(i * r * 0.65 + Math.sin(time * 10 + i) * 3, r * 1.05);
      ctx.stroke();
    }

    // 体
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 射撃型の砲口
    if (this.type === 'shooter') {
      ctx.fillStyle = '#4a2a6a';
      ctx.beginPath();
      ctx.arc(0, r * 0.45, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    // 目
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.12, r * 0.22, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.35, -r * 0.12, r * 0.22, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.2, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }
}

// ===== ボス =====
class Boss {
  constructor(kind, st) {
    this.kind = kind;
    this.big = kind === 'big';
    this.st = st;
    this.maxHp = this.big ? 700 : 280;
    this.hp = this.maxHp;
    this.r = this.big ? 62 : 46;
    this.x = W / 2;
    this.y = -130;
    this.targetY = this.big ? 150 : 130;
    this.t = 0;
    this.spin = 0;
    this.hit = 0;
    this.entering = true;
    this.dead = false;
    this.phaseNow = 1;
    this.maxPhase = this.big ? 3 : 2;
    this.score = this.big ? 30000 : 10000;
    this.name = this.big ? '大ボス ギガ・ゼノクイーン' : '中ボス ゼノ・ソーサー';
    this.resetTimers();
  }

  resetTimers() { this.timers = { a: 1.0, b: 1.8, c: 2.6, d: 3.4 }; }

  get phase() {
    const r = this.hp / this.maxHp;
    if (this.big) return r > 2 / 3 ? 1 : r > 1 / 3 ? 2 : 3;
    return r > 0.5 ? 1 : 2;
  }

  damage(v) {
    if (this.entering || this.dead) return;
    this.hp -= v;
    this.hit = 0.06;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  update(dt, game) {
    this.t += dt;
    this.hit = Math.max(0, this.hit - dt);

    if (this.entering) {
      this.y += 90 * dt;
      if (this.y >= this.targetY) { this.y = this.targetY; this.entering = false; this.t = 0; }
      return;
    }

    const ph = this.phase;
    if (ph !== this.phaseNow) {
      this.phaseNow = ph;
      this.resetTimers();
      game.onBossPhase(ph);
    }

    // 左右にゆらゆら移動(段階が上がるほど速い)
    const amp = W / 2 - this.r - 20;
    this.x = W / 2 + Math.sin(this.t * (0.45 + ph * 0.15)) * amp;
    this.y = this.targetY + Math.sin(this.t * 1.3) * 18;

    const sp = this.st.bulletSpeed;
    const p = game.player;
    const aim = aimAngle(this.x, this.y, p.x, p.y);
    const T = this.timers;
    for (const k in T) T[k] -= dt;

    if (!this.big) {
      // --- 中ボス ---
      if (ph === 1) {
        if (T.a <= 0) { fan(game, this.x, this.y + 30, aim, 5, 0.6, sp); T.a = 1.1; }
        if (T.b <= 0) { ring(game, this.x, this.y, 12, sp * 0.7, this.t, '#ffa04d'); T.b = 2.6; }
      } else {
        if (T.a <= 0) {
          this.spin += 0.35;
          for (let k = 0; k < 2; k++) shootBullet(game, this.x, this.y, this.spin + k * Math.PI, sp * 0.8, '#ffa04d');
          T.a = 0.1;
        }
        if (T.b <= 0) { fan(game, this.x, this.y + 30, aim, 7, 0.9, sp * 1.05); T.b = 1.7; }
      }
    } else {
      // --- 大ボス ---
      if (ph === 1) {
        if (T.a <= 0) { fan(game, this.x, this.y + 40, aim, 7, 0.8, sp); T.a = 1.0; }
        if (T.b <= 0) { ring(game, this.x, this.y, 20, sp * 0.65, this.t, '#7dff8a'); T.b = 2.2; }
      } else if (ph === 2) {
        if (T.a <= 0) {
          this.spin += 0.27;
          for (let k = 0; k < 3; k++) shootBullet(game, this.x, this.y, this.spin + k * Math.PI * 2 / 3, sp * 0.75, '#b98bff');
          T.a = 0.1;
        }
        if (T.b <= 0) { fan(game, this.x, this.y + 40, aim, 3, 0.2, sp * 1.3, '#ff5ad1'); T.b = 1.3; }
        if (T.c <= 0) { ring(game, this.x, this.y, 16, sp * 0.6, -this.t, '#7dff8a'); T.c = 3.0; }
      } else {
        if (T.a <= 0) {
          this.spin += 0.31;
          for (let k = 0; k < 2; k++) {
            shootBullet(game, this.x, this.y, this.spin + k * Math.PI, sp * 0.75, '#ff3b5c');
            shootBullet(game, this.x, this.y, -this.spin + k * Math.PI, sp * 0.75, '#ffa04d');
          }
          T.a = 0.12;
        }
        if (T.b <= 0) { ring(game, this.x, this.y, 24, sp * 0.55, this.t, '#ff5ad1'); T.b = 2.0; }
        if (T.c <= 0) {
          // 手下のエイリアンを呼ぶ
          game.enemies.push(new Enemy('zigzag', clamp(this.x - 60, 40, W - 40), this.y + 40, this.st, 0));
          game.enemies.push(new Enemy('zigzag', clamp(this.x + 60, 40, W - 40), this.y + 40, this.st, Math.PI));
          T.c = 4.5;
        }
        if (T.d <= 0) { fan(game, this.x, this.y + 40, aim, 5, 0.5, sp * 1.1); T.d = 1.5; }
      }
    }
  }

  draw(ctx, time, game) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.big) this.drawBig(ctx, time, game);
    else this.drawMid(ctx, time);
    ctx.restore();
  }

  // 中ボス: 円盤(UFO)
  drawMid(ctx, time) {
    const r = this.r;
    const ph = this.phaseNow;

    // ドーム
    ctx.fillStyle = 'rgba(150,255,200,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.2, r * 0.55, r * 0.55, 0, Math.PI, 0);
    ctx.fill();
    // 中のエイリアン
    ctx.fillStyle = this.hit > 0 ? '#fff' : '#5dff7a';
    ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.4, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.4, 3, 5, 0, 0, Math.PI * 2); ctx.fill();

    // 円盤の本体
    ctx.fillStyle = this.hit > 0 ? '#ffffff' : ph === 1 ? '#8a7cff' : '#ff5a6e';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2f7a';
    ctx.beginPath(); ctx.ellipse(0, r * 0.14, r * 1.0, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();

    // 点滅ライト
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = (i + Math.floor(time * 6)) % 2 ? '#ffe15a' : '#ff5ad1';
      ctx.beginPath();
      ctx.arc(-r + i * r / 3, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 大ボス: 巨大エイリアンの女王
  drawBig(ctx, time, game) {
    const r = this.r;
    const ph = this.phaseNow;
    const bodyColor = ['#3fbf6a', '#9b4dff', '#ff3b5c'][ph - 1];

    // 触手
    ctx.strokeStyle = this.hit > 0 ? '#ffffff' : bodyColor;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x0 = (i - 2.5) * r * 0.35;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x0, r * 0.5);
      for (let s = 1; s <= 6; s++) {
        const yy = r * 0.5 + s * r * 0.18;
        const xx = x0 + Math.sin(time * 3 + i + s * 0.8) * 8 * (s / 6);
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    // 頭
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r * 1.2);
    g.addColorStop(0, this.hit > 0 ? '#ffffff' : '#ffffff55');
    g.addColorStop(0.3, this.hit > 0 ? '#ffffff' : bodyColor);
    g.addColorStop(1, '#10051a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();

    // 王冠
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.8);
    ctx.lineTo(-r * 0.35, -r * 1.25);
    ctx.lineTo(-r * 0.15, -r * 0.9);
    ctx.lineTo(0, -r * 1.35);
    ctx.lineTo(r * 0.15, -r * 0.9);
    ctx.lineTo(r * 0.35, -r * 1.25);
    ctx.lineTo(r * 0.5, -r * 0.8);
    ctx.closePath();
    ctx.fill();

    // 3つの目(プレイヤーを見る)
    const p = game.player;
    const eyes = [[-r * 0.45, -r * 0.15, r * 0.2], [0, -r * 0.35, r * 0.28], [r * 0.45, -r * 0.15, r * 0.2]];
    for (const [ex, ey, er] of eyes) {
      ctx.fillStyle = '#ffef8a';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
      const a = Math.atan2(p.y - (this.y + ey), p.x - (this.x + ex));
      ctx.fillStyle = '#1a0010';
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * er * 0.4, ey + Math.sin(a) * er * 0.4, er * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // 口
    ctx.fillStyle = '#1a0010';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.4, r * 0.45, r * 0.18 + Math.sin(time * 4) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.15 - 4, r * 0.28);
      ctx.lineTo(i * r * 0.15 + 4, r * 0.28);
      ctx.lineTo(i * r * 0.15, r * 0.38);
      ctx.closePath();
      ctx.fill();
    }
  }
}
