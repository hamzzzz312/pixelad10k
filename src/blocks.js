import { T } from './atlas.js';

export const AIR = 0;

export const BLOCKS = {
  1: { name: 'Rumput', top: T.grassTop, side: T.grassSide, bottom: T.dirt, color: '#63c74d' },
  2: { name: 'Tanah', top: T.dirt, side: T.dirt, bottom: T.dirt, color: '#9b6b43' },
  3: { name: 'Batu', top: T.stone, side: T.stone, bottom: T.stone, color: '#9aa0a6' },
  4: { name: 'Pasir', top: T.sand, side: T.sand, bottom: T.sand, color: '#f2e2b0' },
  5: { name: 'Kayu', top: T.logTop, side: T.logSide, bottom: T.logTop, color: '#8a5a2b' },
  6: { name: 'Daun', top: T.leaves, side: T.leaves, bottom: T.leaves, color: '#3f9e4d' },
  7: { name: 'Papan', top: T.plank, side: T.plank, bottom: T.plank, color: '#c99a5b' },
  8: { name: 'Bata', top: T.brick, side: T.brick, bottom: T.brick, color: '#c94b3f' },
  9: { name: 'Kasar', top: T.cobble, side: T.cobble, bottom: T.cobble, color: '#878d93' },
  10: { name: 'Salju', top: T.snow, side: T.snow, bottom: T.snow, color: '#eef7ff' },
};

// Blok yang bisa dipilih di hotbar (tombol 1-9).
export const HOTBAR = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function isSolid(id) {
  return id !== AIR;
}

export function blockName(id) {
  return BLOCKS[id]?.name ?? '?';
}
