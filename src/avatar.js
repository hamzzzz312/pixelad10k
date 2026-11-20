import * as THREE from 'three';

// Karakter blok ala Roblox (R6): kepala kotak, badan, dua tangan, dua kaki.

const SKINS = ['#5fc9ff', '#7ce06a', '#ffb74d', '#ef6c8a', '#b39ddb', '#4dd0e1', '#ffd54f', '#a1887f'];

function pickColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return SKINS[h % SKINS.length];
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return '#' + c.getHexString();
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  const name = (text || 'Pemain').slice(0, 14);
  ctx.font = 'bold 42px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const w = Math.min(300, ctx.measureText(name).width + 44);
  ctx.fillStyle = 'rgba(16, 26, 40, 0.72)';
  ctx.beginPath();
  ctx.roundRect((320 - w) / 2, 12, w, 56, 16);
  ctx.fill();

  ctx.fillStyle = '#ffe066';
  ctx.fillText(name, 160, 41);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sprite.scale.set(2, 0.5, 1);
  return sprite;
}

export function createAvatar(id, name) {
  const group = new THREE.Group();
  const skin = pickColor(id);
  const pants = shade(skin, -0.28);
  const sleeve = shade(skin, -0.12);

  const box = (w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // kaki
  box(0.32, 0.7, 0.32, pants, -0.18, 0.35, 0);
  box(0.32, 0.7, 0.32, pants, 0.18, 0.35, 0);

  // badan
  box(0.76, 0.65, 0.42, skin, 0, 1.025, 0);

  // tangan
  box(0.24, 0.65, 0.3, sleeve, -0.5, 1.025, 0);
  box(0.24, 0.65, 0.3, sleeve, 0.5, 1.025, 0);

  // kepala + muka
  box(0.46, 0.46, 0.46, '#f7d774', 0, 1.58, 0);
  box(0.07, 0.09, 0.03, '#2b2b2b', -0.1, 1.63, 0.235);
  box(0.07, 0.09, 0.03, '#2b2b2b', 0.1, 1.63, 0.235);
  box(0.2, 0.04, 0.03, '#2b2b2b', 0, 1.5, 0.235);

  const label = makeLabel(name);
  label.position.set(0, 2.15, 0);
  group.add(label);

  return { group, label };
}
