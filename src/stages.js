'use strict';

// ===== 共通設定・便利関数 =====
const W = 480; // ゲーム画面の幅(内部座標)
const H = 720; // ゲーム画面の高さ(内部座標)

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

// ===== ステージ定義(難易度はここの数値で調整します) =====
// duration    : 雑魚敵が出てくる秒数
// spawnEvery  : 雑魚敵の出現間隔(秒)。小さいほど多い
// speed / hp  : 敵の速さ・耐久の倍率
// bulletSpeed : 敵弾の速さ
// fireChance  : 雑魚敵が弾を撃つ確率(0〜1)
// shootEvery  : 射撃型エイリアンの発射間隔(秒)
// types       : 出現する敵の種類(同じものを複数書くと出やすくなる)
// boss        : null / 'mid'(中ボス) / 'big'(大ボス)
const STAGES = [
  {
    name: '月面軌道',
    tip: 'SPACEで水を発射! 左右に振って炭酸をためよう',
    duration: 32, spawnEvery: 1.25, speed: 1.0, hp: 1.0,
    bulletSpeed: 150, fireChance: 0.0, shootEvery: 2.2,
    types: ['straight', 'straight', 'zigzag'],
    boss: null,
    sky: ['#060a24', '#11194a'], planet: { color: '#c9c9d6', x: 380, r: 70 },
  },
  {
    name: '小惑星帯',
    tip: '紫の射撃型エイリアンに注意!',
    duration: 38, spawnEvery: 1.05, speed: 1.12, hp: 1.2,
    bulletSpeed: 165, fireChance: 0.15, shootEvery: 2.0,
    types: ['straight', 'zigzag', 'formation', 'shooter'],
    boss: null,
    sky: ['#0d0a26', '#2a1a4a'], planet: { color: '#c48a5a', x: 90, r: 55 },
  },
  {
    name: '星雲基地',
    tip: '中ボス出現! 炭酸バースト(B)で弾を消せる!',
    duration: 28, spawnEvery: 0.95, speed: 1.22, hp: 1.4,
    bulletSpeed: 180, fireChance: 0.25, shootEvery: 1.8,
    types: ['straight', 'zigzag', 'formation', 'shooter'],
    boss: 'mid',
    sky: ['#140726', '#3d1250'], planet: { color: '#7ad1ff', x: 360, r: 90 },
  },
  {
    name: '赤色巨星',
    tip: '敵の数も弾も増えてきた。落ち着いて!',
    duration: 45, spawnEvery: 0.78, speed: 1.35, hp: 1.7,
    bulletSpeed: 195, fireChance: 0.35, shootEvery: 1.6,
    types: ['straight', 'zigzag', 'formation', 'formation', 'shooter', 'shooter'],
    boss: null,
    sky: ['#1a0610', '#4a1020'], planet: { color: '#ff7a3a', x: 120, r: 110 },
  },
  {
    name: 'エイリアン母星',
    tip: '最終決戦! 大ボスを倒して宇宙を救え!',
    duration: 32, spawnEvery: 0.72, speed: 1.5, hp: 2.0,
    bulletSpeed: 210, fireChance: 0.45, shootEvery: 1.4,
    types: ['straight', 'zigzag', 'formation', 'shooter', 'shooter'],
    boss: 'big',
    sky: ['#12020e', '#3a0a2e'], planet: { color: '#7dff8a', x: 380, r: 120 },
  },
];
