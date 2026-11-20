import * as THREE from 'three';

export const HALF_W = 0.3;
export const BODY_H = 1.8;
export const EYE_H = 1.62;

const GRAVITY = 30;
const JUMP_VELOCITY = 9.6;
const EPS = 1e-3;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Amanatides & Woo voxel traversal.
export function raycastVoxel(world, origin, dir, maxDist = 6) {
  let ix = Math.floor(origin.x);
  let iy = Math.floor(origin.y);
  let iz = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  const tDeltaX = stepX ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = stepX ? Math.abs(((stepX > 0 ? ix + 1 : ix) - origin.x) / dir.x) : Infinity;
  let tMaxY = stepY ? Math.abs(((stepY > 0 ? iy + 1 : iy) - origin.y) / dir.y) : Infinity;
  let tMaxZ = stepZ ? Math.abs(((stepZ > 0 ? iz + 1 : iz) - origin.z) / dir.z) : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  for (let i = 0; i < 512; i++) {
    if (world.getBlock(ix, iy, iz) !== 0) return { x: ix, y: iy, z: iz, nx, ny, nz };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      ix += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      iy += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      iz += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (t > maxDist) break;
  }
  return null;
}

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(0.5, 40, 0.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.15;
    this.onGround = false;
    this.flying = false;
  }

  spawn(x, z) {
    this.pos.set(x, this.world.surfaceY(x, z) + 0.2, z);
    this.vel.set(0, 0, 0);
  }

  look(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -1.55, 1.55);
  }

  update(dt, input) {
    const sprinting = input.shift && !this.flying;
    const speed = this.flying ? (input.shift ? 22 : 12) : sprinting ? 8.6 : 5.4;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    let wishX = 0;
    let wishZ = 0;
    if (fwd || strafe) {
      wishX = -sin * fwd + cos * strafe;
      wishZ = -cos * fwd - sin * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
    }

    const accel = this.flying ? 12 : this.onGround ? 18 : 6;
    const blend = 1 - Math.exp(-accel * dt);
    this.vel.x += (wishX * speed - this.vel.x) * blend;
    this.vel.z += (wishZ * speed - this.vel.z) * blend;

    if (input.jump && this.onGround && !this.flying) {
      this.vel.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    if (this.flying) {
      const targetY = ((input.jump ? 1 : 0) - (input.shift ? 1 : 0)) * 11;
      this.vel.y += (targetY - this.vel.y) * blend;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -60) this.vel.y = -60;
    }

    this.onGround = false;

    const dx = this.vel.x * dt;
    const dy = this.vel.y * dt;
    const dz = this.vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
    const sdt = 1 / steps;

    for (let i = 0; i < steps; i++) {
      this.moveAxis('x', dx * sdt);
      this.moveAxis('z', dz * sdt);
      this.moveAxis('y', dy * sdt);
    }

    if (this.pos.y < -24) this.spawn(this.pos.x, this.pos.z);
    if (this.onGround) this.flying = false;

    this.syncCamera();
  }

  moveAxis(axis, amount) {
    if (!amount) return;
    this.pos[axis] += amount;

    const minX = this.pos.x - HALF_W + EPS;
    const maxX = this.pos.x + HALF_W - EPS;
    const minY = this.pos.y + EPS;
    const maxY = this.pos.y + BODY_H - EPS;
    const minZ = this.pos.z - HALF_W + EPS;
    const maxZ = this.pos.z + HALF_W - EPS;

    const hits = [];
    this.world.forEachSolidBox(minX, minY, minZ, maxX, maxY, maxZ, (x, y, z) => hits.push([x, y, z]));
    if (!hits.length) return;

    if (axis === 'x') {
      let target = amount > 0 ? Infinity : -Infinity;
      for (const h of hits) target = amount > 0 ? Math.min(target, h[0] - HALF_W - EPS) : Math.max(target, h[0] + 1 + HALF_W + EPS);
      this.pos.x = target;
      this.vel.x = 0;
    } else if (axis === 'z') {
      let target = amount > 0 ? Infinity : -Infinity;
      for (const h of hits) target = amount > 0 ? Math.min(target, h[2] - HALF_W - EPS) : Math.max(target, h[2] + 1 + HALF_W + EPS);
      this.pos.z = target;
      this.vel.z = 0;
    } else if (amount > 0) {
      let target = Infinity;
      for (const h of hits) target = Math.min(target, h[1] - BODY_H - EPS);
      this.pos.y = target;
      this.vel.y = 0;
    } else {
      let target = -Infinity;
      for (const h of hits) target = Math.max(target, h[1] + 1 + EPS);
      this.pos.y = target;
      this.vel.y = 0;
      this.onGround = true;
    }
  }

  syncCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE_H, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  getEyePosition() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE_H, this.pos.z);
  }

  getForward() {
    return new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
  }

  raycast(maxDist = 6) {
    return raycastVoxel(this.world, this.getEyePosition(), this.getForward(), maxDist);
  }

  intersectsBlock(x, y, z) {
    return (
      this.pos.x + HALF_W > x &&
      this.pos.x - HALF_W < x + 1 &&
      this.pos.y + BODY_H > y &&
      this.pos.y < y + 1 &&
      this.pos.z + HALF_W > z &&
      this.pos.z - HALF_W < z + 1
    );
  }
}
