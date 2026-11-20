import * as THREE from 'three';

// Tekstur atlas dibuat langsung lewat canvas: gaya blok plastik Roblox
// (warna cerah, bevel tipis, dan "stud" bulat di permukaan atas).

export const TILE = 32;
export const COLS = 4;
export const ROWS = 4;

export const T = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  logSide: 5,
  logTop: 6,
  leaves: 7,
  plank: 8,
  brick: 9,
  cobble: 10,
  snow: 11,
  gold: 12,
  obsidian: 13,
};

function tilePos(index) {
  return { x: (index % COLS) * TILE, y: Math.floor(index / COLS) * TILE };
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, x, y, amount, seed) {
  const rand = rng(seed);
  for (let i = 0; i < TILE * 3; i++) {
    const px = x + Math.floor(rand() * TILE);
    const py = y + Math.floor(rand() * TILE);
    const a = (rand() - 0.5) * amount * 2;
    ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${(-a).toFixed(3)})`;
    ctx.fillRect(px, py, 2, 2);
  }
}

function bevel(ctx, x, y, light = 0.22) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(255,255,255,${light})`;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + TILE - 1);
  ctx.lineTo(x + 1, y + 1);
  ctx.lineTo(x + TILE - 1, y + 1);
  ctx.stroke();

  ctx.strokeStyle = `rgba(0,0,0,${light})`;
  ctx.beginPath();
  ctx.moveTo(x + TILE - 1, y + 1);
  ctx.lineTo(x + TILE - 1, y + TILE - 1);
  ctx.lineTo(x + 1, y + TILE - 1);
  ctx.stroke();
}

function studs(ctx, x, y, color) {
  const offsets = [0.28, 0.72];
  for (const ox of offsets) {
    for (const oy of offsets) {
      const cx = x + ox * TILE;
      const cy = y + oy * TILE;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.115, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 1, cy - 1, TILE * 0.052, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
    }
  }
}

function base(ctx, index, color, seed, amount = 0.16) {
  const { x, y } = tilePos(index);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE, TILE);
  speckle(ctx, x, y, amount, seed);
  return { x, y };
}

function paintTiles(ctx) {
  // 0 — rumput atas
  let t = base(ctx, T.grassTop, '#63c74d', 11);
  studs(ctx, t.x, t.y, '#7bdd62');
  bevel(ctx, t.x, t.y, 0.16);

  // 1 — sisi rumput (tanah + pita hijau di atas)
  t = base(ctx, T.grassSide, '#9b6b43', 21, 0.2);
  ctx.fillStyle = '#5cbf46';
  ctx.fillRect(t.x, t.y, TILE, 10);
  const rand = rng(77);
  for (let i = 0; i < 12; i++) {
    const px = t.x + Math.floor(rand() * TILE);
    const h = 3 + Math.floor(rand() * 5);
    ctx.fillRect(px, t.y + 10, 3, h);
  }
  bevel(ctx, t.x, t.y, 0.18);

  // 2 — tanah
  t = base(ctx, T.dirt, '#9b6b43', 31, 0.24);
  bevel(ctx, t.x, t.y, 0.14);

  // 3 — batu
  t = base(ctx, T.stone, '#9aa0a6', 41, 0.2);
  speckle(ctx, t.x, t.y, 0.3, 42);
  bevel(ctx, t.x, t.y, 0.2);

  // 4 — pasir
  t = base(ctx, T.sand, '#f2e2b0', 51, 0.1);
  studs(ctx, t.x, t.y, '#f8ecc4');
  bevel(ctx, t.x, t.y, 0.18);

  // 5 — sisi kayu
  t = base(ctx, T.logSide, '#8a5a2b', 61, 0.14);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (const px of [6, 14, 24]) ctx.fillRect(t.x + px, t.y, 4, TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (const px of [10, 20, 27]) ctx.fillRect(t.x + px, t.y, 2, TILE);
  bevel(ctx, t.x, t.y, 0.16);

  // 6 — atas kayu (lingkaran tahun)
  t = base(ctx, T.logTop, '#c99a5b', 71, 0.1);
  for (let r = 13; r > 2; r -= 4) {
    ctx.beginPath();
    ctx.arc(t.x + TILE / 2, t.y + TILE / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = r % 8 === 5 ? 'rgba(90,58,20,0.5)' : 'rgba(120,80,30,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  bevel(ctx, t.x, t.y, 0.16);

  // 7 — daun
  t = base(ctx, T.leaves, '#4fb45c', 81, 0.26);
  const lr = rng(88);
  for (let i = 0; i < 26; i++) {
    const px = t.x + Math.floor(lr() * (TILE - 4));
    const py = t.y + Math.floor(lr() * (TILE - 4));
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(px, py, 4, 4);
  }
  bevel(ctx, t.x, t.y, 0.12);

  // 8 — papan
  t = base(ctx, T.plank, '#c99a5b', 91, 0.1);
  ctx.fillStyle = 'rgba(90,58,20,0.35)';
  for (let i = 0; i < 4; i++) ctx.fillRect(t.x, t.y + i * 8 + 7, TILE, 1);
  studs(ctx, t.x, t.y, '#d8ab6b');
  bevel(ctx, t.x, t.y, 0.16);

  // 9 — bata
  t = base(ctx, T.brick, '#c94b3f', 101, 0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(t.x, t.y + 10, TILE, 2);
  ctx.fillRect(t.x, t.y + 21, TILE, 2);
  ctx.fillRect(t.x + 9, t.y, 2, 10);
  ctx.fillRect(t.x + 22, t.y + 12, 2, 9);
  ctx.fillRect(t.x + 5, t.y + 23, 2, 9);
  bevel(ctx, t.x, t.y, 0.12);

  // 10 — batu kasar
  t = base(ctx, T.cobble, '#878d93', 111, 0.1);
  const cr = rng(112);
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const px = t.x + 4 + cr() * (TILE - 12);
    const py = t.y + 4 + cr() * (TILE - 12);
    const s = 5 + cr() * 7;
    ctx.fillStyle = `rgba(${120 + Math.floor(cr() * 60)},${125 + Math.floor(cr() * 55)},${130 + Math.floor(cr() * 50)},1)`;
    ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeRect(px, py, s, s);
  }
  bevel(ctx, t.x, t.y, 0.2);

  // 11 — salju
  t = base(ctx, T.snow, '#eef7ff', 121, 0.08);
  studs(ctx, t.x, t.y, '#ffffff');
  bevel(ctx, t.x, t.y, 0.1);

  // 12 — emas (blok bonus)
  t = base(ctx, T.gold, '#f0c020', 131, 0.14);
  studs(ctx, t.x, t.y, '#ffd94a');
  bevel(ctx, t.x, t.y, 0.22);

  // 13 — obsidian
  t = base(ctx, T.obsidian, '#3a2f4a', 141, 0.2);
  speckle(ctx, t.x, t.y, 0.35, 142);
  bevel(ctx, t.x, t.y, 0.12);
}

export function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  paintTiles(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Kembalikan [u0, v0, u1, v1] untuk satu petak atlas (v sudah dibalik karena
// kanvas berorientasi atas-bawah sedangkan UV Three.js bawah-atas).
export function tileUV(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const u0 = col / COLS;
  const u1 = (col + 1) / COLS;
  const v1 = 1 - row / ROWS;
  const v0 = 1 - (row + 1) / ROWS;
  return [u0, v0, u1, v1];
}
