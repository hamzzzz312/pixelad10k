import * as THREE from 'three';
import './style.css';
import { BLOCKS, HOTBAR } from './blocks.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Net, randomCode } from './net.js';
import { createAvatar } from './avatar.js';
import { hash2 } from './noise.js';

const $ = (id) => document.getElementById(id);

/* ---------------------------------- scene --------------------------------- */

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const SKY = '#8ed4ff';
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 30, 58);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 620);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight('#eaf8ff', '#7d8a6a', 0.55));
const sun = new THREE.DirectionalLight('#fff4cf', 0.7);
sun.position.set(70, 130, 45);
scene.add(sun);

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.65 })
);
highlight.visible = false;
scene.add(highlight);

/* ---------------------------------- state --------------------------------- */

const dom = {
  menu: $('menu'),
  pause: $('pause'),
  name: $('nameInput'),
  code: $('codeInput'),
  hostBtn: $('hostBtn'),
  joinBtn: $('joinBtn'),
  soloBtn: $('soloBtn'),
  resumeBtn: $('resumeBtn'),
  quitBtn: $('quitBtn'),
  menuStatus: $('menuStatus'),
  pauseInfo: $('pauseInfo'),
  roomBadge: $('roomBadge'),
  roomCode: $('roomCode'),
  copyBtn: $('copyBtn'),
  playerCount: $('playerCount'),
  hotbar: $('hotbar'),
  crosshair: $('crosshair'),
  toast: $('toast'),
  hud: $('hud'),
};

let game = null; // { world, player, net, remote, selected, seed, isHost }
let running = false;
let paused = true;
let pointerLocked = false;
let fallbackLook = false;
let dragging = false;
let dragMoved = 0;
let sendTimer = 0;
let uiTimer = 0;
let toastTimer = 0;
let myName = 'Pemain';

const input = { forward: false, back: false, left: false, right: false, jump: false, shift: false };

/* --------------------------------- helpers -------------------------------- */

function toast(text, ms = 2400) {
  dom.toast.textContent = text;
  dom.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), ms);
}

function setStatus(text) {
  dom.menuStatus.textContent = text || '';
}

function resetInput() {
  for (const k of Object.keys(input)) input[k] = false;
}

function randomSeed() {
  return (Math.random() * 2147483647) | 0 || 1337;
}

function readName() {
  const raw = dom.name.value.trim();
  myName = raw ? raw.slice(0, 12) : 'Pemain';
  try {
    localStorage.setItem('bloxcraft-name', myName);
  } catch {
    /* ignore */
  }
  return myName;
}

function disableMenu(disabled) {
  dom.hostBtn.disabled = disabled;
  dom.joinBtn.disabled = disabled;
  dom.soloBtn.disabled = disabled;
}

/* ----------------------------------- game --------------------------------- */

function buildHotbar() {
  dom.hotbar.innerHTML = '';
  HOTBAR.forEach((id, i) => {
    const block = BLOCKS[id];
    const slot = document.createElement('div');
    slot.className = 'slot' + (game && game.selected === id ? ' active' : '');
    slot.dataset.id = String(id);
    slot.innerHTML =
      `<b>${i + 1}</b><span class="swatch" style="background:${block.color}"></span><small>${block.name}</small>`;
    slot.addEventListener('click', () => selectBlock(id));
    dom.hotbar.appendChild(slot);
  });
}

function selectBlock(id) {
  if (!game) return;
  game.selected = id;
  for (const slot of dom.hotbar.children) slot.classList.toggle('active', Number(slot.dataset.id) === id);
}

// Cari titik spawn yang enak: tanah datar, bukan puncak, dan bebas pohon.
function findSpawn(world) {
  const hasTreeNear = (x, z) => {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (hash2(x + dx, z + dz, world.seed + 1013) > 0.984) return true;
      }
    }
    return false;
  };

  let best = { x: 0.5, z: 0.5 };
  let bestScore = Infinity;

  for (let z = -36; z <= 36; z += 3) {
    for (let x = -36; x <= 36; x += 3) {
      const h = world.heightAt(x, z);
      if (h < 22 || h > 38) continue;
      const flat = Math.max(
        Math.abs(h - world.heightAt(x + 1, z)),
        Math.abs(h - world.heightAt(x - 1, z)),
        Math.abs(h - world.heightAt(x, z + 1)),
        Math.abs(h - world.heightAt(x, z - 1))
      );
      if (flat > 1 || hasTreeNear(x, z)) continue;
      const score = flat * 8 + Math.abs(h - 27) * 0.5 + Math.hypot(x, z) * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = { x: x + 0.5, z: z + 0.5 };
      }
    }
  }
  return best;
}

function createGame(seed) {
  if (game?.world) {
    for (const rp of game.remote.values()) scene.remove(rp.group);
    game.world.dispose();
  }

  const world = new World(scene, seed);
  const player = new Player(camera, world);

  const spot = findSpawn(world);
  player.pos.set(spot.x, 40, spot.z);
  world.preload(player.pos, 2);
  player.spawn(spot.x, spot.z);
  player.syncCamera();

  game = { world, player, net: null, remote: new Map(), selected: 1, seed, isHost: false };

  running = true;
  dom.menu.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  buildHotbar();
  updatePlayerCount();

  // Tetap tampilkan layar "Siap Main" sampai mouse benar-benar terkunci
  // (sebagian browser/iframe menolak pointer lock).
  setPaused(true);
  requestLock();
}

function requestLock() {
  if (pointerLocked || fallbackLook) {
    setPaused(false);
    return;
  }
  try {
    const req = canvas.requestPointerLock?.({ unadjustedMovement: false });
    if (req && typeof req.then === 'function') req.catch(() => enableFallback());
  } catch {
    enableFallback();
    return;
  }
  setTimeout(() => {
    if (!pointerLocked) enableFallback();
  }, 700);
}

function enableFallback() {
  if (pointerLocked || fallbackLook || !running) return;
  fallbackLook = true;
  setPaused(false);
  toast('Mouse bebas: tahan klik kiri lalu geser untuk melihat sekeliling', 4200);
}

function setPaused(value) {
  paused = value;
  dom.pause.classList.toggle('hidden', !value);
  dom.crosshair.classList.toggle('hidden', value || !running);
  if (value) resetInput();
}

/* ---------------------------------- mabar --------------------------------- */

function snapshot() {
  const players = [];
  if (game) {
    players.push({
      id: game.net?.selfId ?? 'host',
      name: myName,
      x: game.player.pos.x,
      y: game.player.pos.y,
      z: game.player.pos.z,
      yaw: game.player.yaw,
    });
    for (const [id, rp] of game.remote) {
      players.push({ id, name: rp.name, x: rp.target.x, y: rp.target.y, z: rp.target.z, yaw: rp.yaw });
    }
  }
  return {
    seed: game?.seed ?? 1337,
    edits: game?.world.getEdits() ?? [],
    players,
  };
}

function wireNet(net) {
  game.net = net;

  net.on('state', (id, data) => {
    if (!id || id === net.selfId) return;
    upsertRemote(id, data);
  });

  net.on('edit', (msg) => {
    if (!game || !msg) return;
    game.world.setBlock(msg.x, msg.y, msg.z, msg.i);
  });

  net.on('leave', (id) => {
    const rp = game?.remote.get(id);
    if (!rp) return;
    scene.remove(rp.group);
    game.remote.delete(id);
    toast(`${rp.name} keluar dari dunia`);
    updatePlayerCount();
  });

  net.on('join', (id, name) => {
    if (!game || id === net.selfId) return;
    toast(`${name || 'Pemain'} bergabung!`);
  });

  net.on('closed', () => {
    toast('Host keluar. Sekarang kamu main sendiri.', 4000);
    game.net = null;
    dom.roomBadge.classList.add('hidden');
  });

  net.on('error', (err) => console.warn('[net]', err));
}

function upsertRemote(id, data) {
  if (!game) return;
  let rp = game.remote.get(id);
  if (!rp) {
    const avatar = createAvatar(id, data.name || 'Pemain');
    scene.add(avatar.group);
    rp = {
      group: avatar.group,
      name: data.name || 'Pemain',
      target: new THREE.Vector3(data.x, data.y, data.z),
      yaw: data.yaw || 0,
    };
    rp.group.position.copy(rp.target);
    game.remote.set(id, rp);
    updatePlayerCount();
  }
  rp.target.set(data.x, data.y, data.z);
  rp.yaw = data.yaw || 0;
}

function updateRemote(dt) {
  if (!game) return;
  const k = 1 - Math.exp(-12 * dt);
  for (const rp of game.remote.values()) {
    rp.group.position.lerp(rp.target, k);
    const target = rp.yaw;
    let delta = target - rp.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    rp.group.rotation.y += delta * k;
  }
}

function updatePlayerCount() {
  const count = 1 + (game?.remote.size || 0);
  dom.playerCount.textContent = `${count} pemain`;
}

function showRoom(code) {
  dom.roomBadge.classList.remove('hidden');
  dom.roomCode.textContent = code;
  dom.pauseInfo.innerHTML = `Kode room: <b style="color:#ffe066">${code}</b><br><small>Bagikan kode ini ke teman kamu</small>`;
}

function netTick(dt) {
  if (!game?.net || paused) return;
  sendTimer += dt;
  if (sendTimer < 0.1) return;
  sendTimer = 0;
  const p = game.player;
  game.net.sendState({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw });
}

/* --------------------------------- aksi blok ------------------------------- */

function breakBlock() {
  if (!game) return;
  const hit = game.player.raycast(6);
  if (!hit || hit.y <= 0) return;
  if (game.world.getBlock(hit.x, hit.y, hit.z) === 0) return;
  game.world.setBlock(hit.x, hit.y, hit.z, 0);
  game.net?.sendEdit(hit.x, hit.y, hit.z, 0);
}

function placeBlock() {
  if (!game) return;
  const hit = game.player.raycast(6);
  if (!hit) return;
  const x = hit.x + hit.nx;
  const y = hit.y + hit.ny;
  const z = hit.z + hit.nz;
  if (y < 0 || y >= 64) return;
  if (game.world.getBlock(x, y, z) !== 0) return;
  if (game.player.intersectsBlock(x, y, z)) return;
  game.world.setBlock(x, y, z, game.selected);
  game.net?.sendEdit(x, y, z, game.selected);
}

function updateHighlight() {
  if (!game || paused) {
    highlight.visible = false;
    return;
  }
  const hit = game.player.raycast(6);
  if (!hit) {
    highlight.visible = false;
    return;
  }
  highlight.visible = true;
  highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
}

/* ----------------------------------- alur --------------------------------- */

async function startSolo() {
  readName();
  disableMenu(true);
  setStatus('Membangun dunia...');
  await new Promise((r) => setTimeout(r, 30));
  createGame(randomSeed());
  setStatus('');
  disableMenu(false);
}

async function startHost() {
  readName();
  disableMenu(true);
  setStatus('Membuat room...');

  const code = randomCode();
  const net = new Net();
  try {
    await net.host({ code, name: myName, getSnapshot: snapshot });
  } catch (err) {
    setStatus(err.message || 'Gagal membuat room.');
    net.destroy();
    disableMenu(false);
    return;
  }

  setStatus('Membangun dunia...');
  createGame(randomSeed());
  game.isHost = true;
  wireNet(net);
  showRoom(code);
  setStatus('');
  disableMenu(false);
  toast('Room dibuat! Bagikan kodenya ke teman kamu', 4000);
}

async function startJoin() {
  const code = dom.code.value.trim().toUpperCase();
  if (code.length < 4) {
    setStatus('Kode room minimal 4 karakter.');
    dom.code.focus();
    return;
  }

  readName();
  disableMenu(true);
  setStatus('Menyambung ke room...');

  const net = new Net();
  let joined = false;

  try {
    const init = await net.join({ code, name: myName });

    setStatus('Memuat dunia teman kamu...');
    await new Promise((r) => setTimeout(r, 30));

    createGame(init.seed || 1337);
    game.isHost = false;
    for (const edit of init.edits || []) game.world.setBlock(edit.x, edit.y, edit.z, edit.i);
    wireNet(net);

    for (const p of init.players || []) {
      if (p.id !== net.selfId) upsertRemote(p.id, p);
    }
    updatePlayerCount();

    dom.roomBadge.classList.remove('hidden');
    dom.roomCode.textContent = code;
    dom.pauseInfo.innerHTML = `Room: <b style="color:#ffe066">${code}</b>`;

    setStatus('');
    toast(`Tersambung ke room ${code}`);
    joined = true;
  } catch (err) {
    net.destroy();
    setStatus(err?.message || 'Gagal bergabung ke room. Coba lagi.');
    dom.code.focus();
  } finally {
    // Apa pun hasilnya, menu tidak boleh tetap terkunci.
    disableMenu(false);
    if (!joined && !dom.menuStatus.textContent) setStatus('Gagal bergabung ke room. Coba lagi.');
  }
}

/* ---------------------------------- input --------------------------------- */

const KEY_MAP = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (running && !paused) {
      if (pointerLocked) document.exitPointerLock();
      setPaused(true);
    }
    return;
  }

  if (KEY_MAP[e.code]) {
    input[KEY_MAP[e.code]] = true;
    if (e.code === 'Space') e.preventDefault();
  }

  if (!running || paused) return;

  if (e.code === 'KeyF') {
    game.player.flying = !game.player.flying;
    toast(game.player.flying ? 'Mode terbang: aktif' : 'Mode terbang: mati');
  }
  if (e.code === 'KeyR') {
    game.player.spawn(game.player.pos.x, game.player.pos.z);
    toast('Respawn');
  }
  if (/^Digit[1-9]$/.test(e.code)) {
    const index = Number(e.code.slice(5)) - 1;
    const id = HOTBAR[index];
    if (id) selectBlock(id);
  }
});

window.addEventListener('keyup', (e) => {
  if (KEY_MAP[e.code]) input[KEY_MAP[e.code]] = false;
});

window.addEventListener('blur', resetInput);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (!pointerLocked && !fallbackLook) {
    requestLock();
    return;
  }
  if (paused) {
    setPaused(false);
    return;
  }
  if (e.button === 0) {
    dragging = true;
    dragMoved = 0;
  } else if (e.button === 2) {
    placeBlock();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  const wasDragging = dragging;
  dragging = false;
  if (!running || paused || !wasDragging) return;
  if (!pointerLocked && dragMoved > 6) return; // geser = lihat sekeliling, bukan hancurkan
  breakBlock();
});

window.addEventListener('mousemove', (e) => {
  if (!running || paused || !game) return;
  const canLook = pointerLocked || (fallbackLook && dragging);
  if (!canLook) return;
  const dx = e.movementX || 0;
  const dy = e.movementY || 0;
  if (!pointerLocked) dragMoved += Math.abs(dx) + Math.abs(dy);
  game.player.look(dx, dy);
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (!running || paused) return;
    e.preventDefault();
    const index = HOTBAR.indexOf(game.selected);
    const next = (index + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
    selectBlock(HOTBAR[next]);
  },
  { passive: false }
);

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) {
    fallbackLook = false;
    setPaused(false);
  } else if (running && !fallbackLook) {
    setPaused(true);
  }
});

document.addEventListener('pointerlockerror', () => enableFallback());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------------------------- menu UI -------------------------------- */

try {
  const saved = localStorage.getItem('bloxcraft-name');
  if (saved) dom.name.value = saved;
} catch {
  /* ignore */
}

dom.hostBtn.addEventListener('click', startHost);
dom.soloBtn.addEventListener('click', startSolo);
dom.joinBtn.addEventListener('click', startJoin);
dom.code.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startJoin();
});
dom.name.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') dom.code.focus();
});

dom.resumeBtn.addEventListener('click', () => {
  setPaused(false);
  requestLock();
});

dom.quitBtn.addEventListener('click', () => {
  game?.net?.destroy();
  window.location.reload();
});

dom.copyBtn.addEventListener('click', async () => {
  const code = dom.roomCode.textContent;
  try {
    await navigator.clipboard.writeText(code);
    toast('Kode room disalin!');
  } catch {
    toast(`Kode room: ${code}`);
  }
});

/* ----------------------------------- loop --------------------------------- */

let last = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;

  if (running && game) {
    if (!paused) game.player.update(dt, input);
    game.world.update(game.player.pos);
    updateRemote(dt);
    updateHighlight();
    netTick(dt);

    uiTimer += dt;
    if (uiTimer > 0.5) {
      uiTimer = 0;
      updatePlayerCount();
    }
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(tick);
