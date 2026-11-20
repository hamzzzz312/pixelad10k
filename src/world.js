import * as THREE from 'three';
import { makeAtlas, tileUV } from './atlas.js';
import { BLOCKS } from './blocks.js';
import { makeNoise, hash2 } from './noise.js';

export const CHUNK = 16;
export const HEIGHT = 64;

const SAND_LEVEL = 22;
const SNOW_LEVEL = 44;
const TREES_CHANCE = 0.984;

// corner: urutan selalu kiri-bawah, kanan-bawah, kanan-atas, kiri-atas
// dilihat dari luar kubus, jadi winding CCW dan UV standar.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.82 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.74 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.63 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.9 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.68 },
];

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    this.mesh = null;
    this.dirty = false;
  }
}

const idxOf = (x, y, z) => (y * CHUNK + z) * CHUNK + x;

export class World {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.seed = seed | 0;
    this.noise = makeNoise(this.seed);
    this.chunks = new Map();
    this.overrides = new Map(); // "cx,cz" -> Map(index -> blockId)
    this.queue = [];
    this.queued = new Set();
    this.radius = 4;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.material = new THREE.MeshLambertMaterial({
      map: makeAtlas(),
      vertexColors: true,
    });
  }

  /* -------------------- terrain -------------------- */

  heightAt(wx, wz) {
    const n = this.noise;
    const base = n.fbm(wx * 0.0125, wz * 0.0125, 4);
    const hills = Math.pow(n.fbm(wx * 0.0055, wz * 0.0055, 3), 1.9);
    const detail = n.fbm(wx * 0.06, wz * 0.06, 2);
    const h = 15 + base * 15 + hills * 26 + detail * 2.5;
    return Math.max(1, Math.min(HEIGHT - 6, Math.floor(h)));
  }

  surfaceY(wx, wz) {
    return this.heightAt(wx, wz) + 1;
  }

  key(cx, cz) {
    return cx + ',' + cz;
  }

  getChunk(cx, cz) {
    const k = this.key(cx, cz);
    let chunk = this.chunks.get(k);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generateChunk(chunk);
      this.chunks.set(k, chunk);
      chunk.dirty = true;
    }
    return chunk;
  }

  generateChunk(chunk) {
    const bx = chunk.cx * CHUNK;
    const bz = chunk.cz * CHUNK;
    const blocks = chunk.blocks;

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = bx + x;
        const wz = bz + z;
        const h = this.heightAt(wx, wz);
        for (let y = 0; y <= h; y++) {
          let id = 3;
          if (y === h) {
            id = h >= SNOW_LEVEL ? 10 : h <= SAND_LEVEL ? 4 : 1;
          } else if (y > h - 4) {
            id = h >= SNOW_LEVEL ? 3 : h <= SAND_LEVEL ? 4 : 2;
          }
          blocks[idxOf(x, y, z)] = id;
        }
      }
    }

    // Pohon: margin 3 blok supaya daun yang menyeberang batas chunk tetap utuh.
    for (let z = -3; z < CHUNK + 3; z++) {
      for (let x = -3; x < CHUNK + 3; x++) {
        const wx = bx + x;
        const wz = bz + z;
        const h = this.heightAt(wx, wz);
        if (h <= SAND_LEVEL + 1 || h >= SNOW_LEVEL - 2) continue;
        if (hash2(wx, wz, this.seed + 1013) <= TREES_CHANCE) continue;

        const trunk = 4 + Math.floor(hash2(wx, wz, this.seed + 7) * 3);
        for (let i = 1; i <= trunk; i++) this.setLocal(chunk, x, h + i, z, 5);
        const top = h + trunk;
        for (let dy = -1; dy <= 2; dy++) {
          const r = dy <= 0 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && dy > 0) continue;
              if (dx === 0 && dz === 0 && dy < 1) continue;
              this.setLocal(chunk, x + dx, top + dy, z + dz, 6, true);
            }
          }
        }
      }
    }

    // Terapkan hasil edit pemain (kalau chunk ini pernah diubah).
    const ov = this.overrides.get(this.key(chunk.cx, chunk.cz));
    if (ov) {
      for (const [index, id] of ov) blocks[index] = id;
    }
  }

  setLocal(chunk, lx, ly, lz, id, onlyIfAir = false) {
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || ly < 0 || ly >= HEIGHT) return;
    const i = idxOf(lx, ly, lz);
    if (onlyIfAir && chunk.blocks[i] !== 0) return;
    chunk.blocks[i] = id;
  }

  /* -------------------- akses blok -------------------- */

  getBlock(x, y, z) {
    if (y < 0) return 3; // dunia di bawah y=0 dianggap batu solid
    if (y >= HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const chunk = this.getChunk(cx, cz);
    return chunk.blocks[idxOf(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  isSolidAt(x, y, z) {
    return this.getBlock(x, y, z) !== 0;
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const chunk = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    const i = idxOf(lx, y, lz);
    if (chunk.blocks[i] === id) return;
    chunk.blocks[i] = id;

    const ck = this.key(cx, cz);
    if (!this.overrides.has(ck)) this.overrides.set(ck, new Map());
    this.overrides.get(ck).set(i, id);

    chunk.dirty = true;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  getEdits() {
    const out = [];
    for (const [ck, map] of this.overrides) {
      const [cx, cz] = ck.split(',').map(Number);
      for (const [index, id] of map) {
        const y = index >> 8;
        const rem = index & 255;
        out.push({ x: cx * CHUNK + (rem & 15), y, z: cz * CHUNK + (rem >> 4), i: id });
      }
    }
    return out;
  }

  forEachSolidBox(minX, minY, minZ, maxX, maxY, maxZ, cb) {
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.getBlock(x, y, z) !== 0) cb(x, y, z);
        }
      }
    }
  }

  /* -------------------- meshing -------------------- */

  rebuild(chunk) {
    chunk.dirty = false;
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const bx = chunk.cx * CHUNK;
    const bz = chunk.cz * CHUNK;
    const blocks = chunk.blocks;

    // Fast path: cek tetangga di dalam chunk tanpa konversi koordinat/world lookup.
    const neighbor = (nx, ny, nz) => {
      if (ny < 0) return 3;
      if (ny >= HEIGHT) return 0;
      const lx = nx - bx;
      const lz = nz - bz;
      if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK) return blocks[idxOf(lx, ny, lz)];
      return this.getBlock(nx, ny, nz);
    };

    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = blocks[idxOf(x, y, z)];
          if (!id) continue;
          const def = BLOCKS[id];
          if (!def) continue;
          const wx = bx + x;
          const wz = bz + z;
          const tint = 0.95 + hash2(wx * 3 + y, wz * 7 - y, 91) * 0.1;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = wx + face.n[0];
            const ny = y + face.n[1];
            const nz = wz + face.n[2];
            if (ny < 0) continue;
            if (neighbor(nx, ny, nz) !== 0) continue;

            const tile = face.n[1] === 1 ? def.top : face.n[1] === -1 ? def.bottom : def.side;
            const [u0, v0, u1, v1] = tileUV(tile);
            const start = positions.length / 3;
            const shade = face.shade * tint;

            for (let k = 0; k < 4; k++) {
              const corner = face.c[k];
              positions.push(wx + corner[0], y + corner[1], wz + corner[2]);
              normals.push(face.n[0], face.n[1], face.n[2]);
            }
            uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
            for (let k = 0; k < 4; k++) colors.push(shade, shade, shade);
            indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          }
        }
      }
    }

    if (positions.length === 0) {
      if (chunk.mesh) {
        this.group.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh = null;
      }
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    if (chunk.mesh) {
      chunk.mesh.geometry.dispose();
      chunk.mesh.geometry = geo;
    } else {
      chunk.mesh = new THREE.Mesh(geo, this.material);
      chunk.mesh.frustumCulled = true;
      this.group.add(chunk.mesh);
    }
  }

  /* -------------------- streaming chunk -------------------- */

  preload(pos, radius = 2) {
    const pcx = Math.floor(pos.x / CHUNK);
    const pcz = Math.floor(pos.z / CHUNK);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chunk = this.getChunk(pcx + dx, pcz + dz);
        this.rebuild(chunk);
      }
    }
  }

  update(pos) {
    const pcx = Math.floor(pos.x / CHUNK);
    const pcz = Math.floor(pos.z / CHUNK);
    const R = this.radius;

    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        const k = this.key(pcx + dx, pcz + dz);
        if (this.chunks.has(k) || this.queued.has(k)) continue;
        this.queued.add(k);
        this.queue.push({ cx: pcx + dx, cz: pcz + dz, d: dx * dx + dz * dz });
      }
    }

    this.queue.sort((a, b) => a.d - b.d);

    let budget = 2;
    while (budget > 0 && this.queue.length) {
      const job = this.queue.shift();
      const k = this.key(job.cx, job.cz);
      this.queued.delete(k);
      if (this.chunks.has(k)) continue;
      const chunk = this.getChunk(job.cx, job.cz);
      this.rebuild(chunk);
      budget--;
    }

    // Penting: ambil snapshot dulu. rebuild() bisa memicu generate chunk tetangga
    // yang langsung masuk ke this.chunks; iterasi langsung akan menular tanpa batas.
    const dirty = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty) continue;
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > (R + 1) * (R + 1)) continue;
      dirty.push(chunk);
    }
    for (const chunk of dirty) this.rebuild(chunk);

    const limit = (R + 2) * (R + 2);
    const drop = [];
    for (const [k, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > limit) drop.push(k);
    }
    for (const k of drop) {
      const chunk = this.chunks.get(k);
      if (chunk.mesh) {
        this.group.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
      }
      this.chunks.delete(k);
    }
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) chunk.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.material.map?.dispose();
    this.material.dispose();
    this.scene.remove(this.group);
  }
}
