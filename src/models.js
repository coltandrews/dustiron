// Code-built low-poly models. Every shape is vertex-colored and shares one
// flat-shaded material, so a whole camp renders in very few draw calls.
import * as THREE from 'three';

export const PAL = {
  sand: 0xd9a96b, sandDark: 0xc4925a, sandLight: 0xe6bd82, dirt: 0xa8754a,
  rock: 0xa06c4e, rockDark: 0x7c5040, rockLight: 0xb98563, cliff: 0xa9673f,
  wood: 0x8c5a34, woodDark: 0x5c3a22, woodLight: 0xb27c48, plank: 0x9e6b3d,
  iron: 0x34302d, brass: 0xd6a54a, red: 0xa8322a, tnt: 0xb8352a, black: 0x221b18,
  canvas: 0xe4cfa6, canvasDark: 0xc4ad85, cactus: 0x6c8a46, cactusDark: 0x536f38,
  skin: 0xe0a47b, skinDark: 0xb07a55, bone: 0xeadfc6, water: 0x56707c,
  fire: 0xffb24a, ember: 0xff6a24, smoke: 0x6d625a,
  pShirt: 0x3e6189, pVest: 0x6b4128, pHat: 0xc9a273, pPants: 0x3b3f50, boots: 0x3a2518,
  bShirtA: 0x7c3a2e, bShirtB: 0x5d5b3a, bShirtC: 0x4b4a52, bHat: 0x2e2420, poncho: 0x9a6a3a,
  scarf: 0xc0452f, bandanaA: 0xa8322a, bandanaB: 0x26201d,
};

export const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function hash3(x, y, z) {
  const h = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Collects colored, transformed parts and merges them into one geometry. */
export class Shape {
  constructor() { this.parts = []; }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }

  cyl(rt, rb, h, seg, color, x, y, z, rx, ry, rz) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz);
  }

  cone(r, h, seg, color, x, y, z, rx, ry, rz) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rx, ry, rz); }

  rock(r, color, x, y, z, sy = 0.7, jitter = 0.28, seed = 1, ry = 0) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const k = 1 + (hash3(px + seed, py, pz) - 0.5) * 2 * jitter;
      pos.setXYZ(i, px * k, py * k, pz * k);
    }
    g.computeVertexNormals();
    return this.add(g, color, x, y, z, 0, ry, 0, 1, sy, 1);
  }

  build() { return mergeGeometries(this.parts); }
}

export function mergeGeometries(parts) {
  let count = 0;
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export function meshOf(shape, material = MAT.solid, cast = true, receive = true) {
  const mesh = new THREE.Mesh(shape instanceof Shape ? shape.build() : shape, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// ---------- Characters ----------

export const LOOKS = {
  player: { shirt: PAL.pShirt, vest: PAL.pVest, hat: PAL.pHat, band: PAL.woodDark, pants: PAL.pPants, scarf: PAL.scarf },
  gunman: { shirt: PAL.bShirtA, vest: PAL.woodDark, hat: PAL.bHat, band: PAL.brass, pants: PAL.bShirtC, bandana: PAL.bandanaA },
  rusher: { shirt: PAL.bShirtB, vest: PAL.poncho, hat: PAL.woodDark, band: PAL.red, pants: PAL.woodDark, bandana: PAL.bandanaB, poncho: true },
  sharpshooter: { shirt: PAL.bShirtC, vest: PAL.black, hat: PAL.black, band: PAL.bone, pants: PAL.black, bandana: PAL.bandanaB, tall: true },
  leader: { shirt: 0x6a2a24, vest: 0x1e1814, hat: 0x2a1e18, band: PAL.brass, pants: 0x2a2624, scarf: 0xb9a06a, tall: true },
  scout: { shirt: 0xb58e58, vest: 0x5a4a32, hat: 0x8a7a5a, band: PAL.woodDark, pants: 0x4a4740, bandana: 0x5d6b3a },
};

const ARM_PITCH = 0.45;
export const GUN_REACH = { revolver: 0.76, heavy: 0.82, repeater: 1.02, shotgun: 0.98, rifle: 1.08 };
export const GUN_KINDS = ['revolver', 'heavy', 'repeater', 'shotgun', 'rifle'];

function gunShape(kind) {
  const s = new Shape();
  if (kind === 'revolver') {
    s.box(0.06, 0.07, 0.3, PAL.iron, 0, 0.05, 0.6);
    s.box(0.1, 0.1, 0.11, PAL.iron, 0, 0.05, 0.47);
    s.box(0.07, 0.14, 0.08, PAL.woodDark, 0, -0.03, 0.43, 0.4);
  } else if (kind === 'heavy') {
    s.box(0.07, 0.08, 0.38, PAL.iron, 0, 0.05, 0.64);
    s.box(0.12, 0.12, 0.13, PAL.iron, 0, 0.05, 0.47);
    s.box(0.08, 0.16, 0.09, 0x3d2418, 0, -0.04, 0.42, 0.45);
    s.box(0.03, 0.04, 0.08, PAL.brass, 0, 0.12, 0.8);
  } else if (kind === 'repeater') {
    s.box(0.05, 0.06, 0.66, PAL.iron, 0, 0.07, 0.7);
    s.box(0.05, 0.03, 0.5, PAL.iron, 0, 0.02, 0.66);
    s.box(0.08, 0.1, 0.16, PAL.brass, 0, 0.03, 0.4);
    s.box(0.08, 0.1, 0.36, 0x9a5a34, 0, 0.0, 0.22);
    s.box(0.03, 0.08, 0.12, PAL.iron, 0, -0.07, 0.42);
  } else if (kind === 'shotgun') {
    s.box(0.1, 0.07, 0.62, PAL.iron, 0, 0.06, 0.66);
    s.box(0.09, 0.1, 0.34, PAL.wood, 0, 0.0, 0.33);
  } else {
    s.box(0.05, 0.06, 0.72, PAL.iron, 0, 0.06, 0.72);
    s.box(0.08, 0.1, 0.42, PAL.woodLight, 0, 0.0, 0.32);
    s.box(0.05, 0.05, 0.16, PAL.brass, 0, 0.12, 0.5);
  }
  return s;
}

/** Builds a character. Forward is +Z; feet at y=0. */
export function makeCharacter(look) {
  const material = MAT.solid.clone();
  material.emissive = new THREE.Color(0xffffff);
  material.emissiveIntensity = 0;
  const tall = look.tall ? 1.04 : 1;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mk = (shape) => { const m = meshOf(shape, material); return m; };

  // Legs pivot at the hip; each shin hangs from a knee so sitting and walking bend naturally.
  const legs = [], knees = [], thighs = [], shins = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.82 * tall, 0);
    const thigh = new Shape();
    thigh.box(0.17, 0.42 * tall, 0.2, look.pants, 0, -0.2 * tall, 0);
    const thighMesh = mk(thigh);
    pivot.add(thighMesh);
    const knee = new THREE.Group();
    knee.position.y = -0.4 * tall;
    const shin = new Shape();
    shin.box(0.16, 0.32 * tall, 0.19, look.pants, 0, -0.16 * tall, 0);
    shin.box(0.19, 0.14, 0.28, PAL.boots, 0, -0.42 * tall + 0.07, 0.03);
    shin.box(0.2, 0.035, 0.31, PAL.black, 0, -0.42 * tall + 0.018, 0.035);
    const shinMesh = mk(shin);
    knee.add(shinMesh);
    pivot.add(knee);
    body.add(pivot);
    legs.push(pivot);
    knees.push(knee);
    thighs.push(thighMesh);
    shins.push(shinMesh);
  }

  const torso = new Shape();
  torso.box(0.46, 0.13, 0.27, PAL.woodDark, 0, 0.86 * tall, 0);
  torso.box(0.07, 0.07, 0.02, PAL.brass, 0, 0.86 * tall, 0.14);
  torso.box(0.46, 0.5, 0.27, look.shirt, 0, 1.17 * tall, 0);
  torso.box(0.48, 0.44, 0.285, look.vest, 0, 1.15 * tall, -0.005);
  torso.box(0.14, 0.42, 0.02, look.shirt, 0, 1.16 * tall, 0.143);
  if (look.poncho) {
    torso.cone(0.48, 0.52, 4, look.vest, 0, 1.2 * tall, 0, 0, Math.PI / 4);
  }
  if (look.scarf) torso.box(0.3, 0.09, 0.3, look.scarf, 0, 1.43 * tall, 0);
  // Left arm hangs.
  torso.box(0.13, 0.5, 0.15, look.shirt, -0.31, 1.13 * tall, 0.02, 0.15, 0, 0.12);
  torso.box(0.11, 0.11, 0.12, PAL.skin, -0.34, 0.85 * tall, 0.06);
  // Head and hat.
  torso.box(0.26, 0.27, 0.26, PAL.skin, 0, 1.6 * tall, 0);
  torso.box(0.27, 0.05, 0.05, PAL.skinDark, 0, 1.63 * tall, 0.12);
  if (look.bandana) torso.box(0.28, 0.12, 0.28, look.bandana, 0, 1.52 * tall, 0.005);
  torso.cyl(0.34, 0.34, 0.04, 10, look.hat, 0, 1.75 * tall, 0);
  for (const side of [-1, 1]) torso.box(0.09, 0.035, 0.42, look.hat, side * 0.31, 1.79 * tall, 0, 0, 0, side * 0.55);
  torso.cyl(0.15, 0.18, 0.2, 8, look.hat, 0, 1.86 * tall, 0);
  torso.box(0.05, 0.04, 0.22, PAL.black, 0, 1.965 * tall, 0);
  torso.cyl(0.185, 0.185, 0.045, 8, look.band, 0, 1.78 * tall, 0);
  const torsoMesh = mk(torso);
  body.add(torsoMesh);

  // Gun arm pivots at the right shoulder.
  const arm = new THREE.Group();
  arm.position.set(0.29, 1.34 * tall, 0);
  arm.rotation.x = ARM_PITCH;
  const armShape = new Shape();
  armShape.box(0.13, 0.13, 0.44, look.shirt, 0, 0, 0.2);
  armShape.box(0.11, 0.12, 0.12, PAL.skin, 0, 0, 0.44);
  arm.add(mk(armShape));
  const guns = {};
  for (const kind of GUN_KINDS) {
    const g = mk(gunShape(kind));
    g.visible = kind === 'revolver';
    arm.add(g);
    guns[kind] = g;
  }
  body.add(arm);

  return { root, body, legs, knees, thighs, shins, torso: torsoMesh, arm, guns, material, tall };
}

/** Muzzle position in character-local space (x right, z forward). */
export function muzzleLocal(gunKind, tall = 1) {
  const reach = GUN_REACH[gunKind] ?? 0.76;
  return {
    x: 0.29,
    y: 1.34 * tall - Math.sin(ARM_PITCH) * reach + 0.05,
    z: Math.cos(ARM_PITCH) * reach,
  };
}

// ---------- Props ----------

export function crateShape(size = 1.1) {
  const s = new Shape();
  const h = size / 2, t = 0.1;
  s.box(size * 0.96, size * 0.96, size * 0.96, PAL.plank, 0, 0, 0);
  for (const x of [-h + t / 2, h - t / 2]) for (const z of [-h + t / 2, h - t / 2]) s.box(t, size, t, PAL.woodDark, x, 0, z);
  for (const y of [-h + t / 2, h - t / 2]) {
    s.box(size, t, t, PAL.woodDark, 0, y, -h + t / 2);
    s.box(size, t, t, PAL.woodDark, 0, y, h - t / 2);
    s.box(t, t, size, PAL.woodDark, -h + t / 2, y, 0);
    s.box(t, t, size, PAL.woodDark, h - t / 2, y, 0);
  }
  s.box(size * 1.3, 0.08, 0.02, PAL.woodDark, 0, 0, h, 0, 0, Math.PI / 4);
  return s;
}

export function barrelShape(r = 0.42, h = 1.15, body = PAL.wood, hoop = PAL.iron, band = null) {
  const s = new Shape();
  s.cyl(r, r * 0.86, h / 2, 10, body, 0, -h / 4, 0);
  s.cyl(r * 0.86, r, h / 2, 10, body, 0, h / 4, 0);
  for (const y of [-h * 0.38, 0, h * 0.38]) s.cyl(r * 1.03, r * 1.03, 0.05, 10, hoop, 0, y, 0);
  s.cyl(r * 0.8, r * 0.8, 0.02, 10, PAL.woodDark, 0, h / 2, 0);
  if (band) s.cyl(r * 1.04, r * 1.04, 0.16, 10, band, 0, h * 0.18, 0);
  return s;
}

export function fenceShape(len = 2.2) {
  const s = new Shape();
  for (const x of [-len / 2 + 0.07, len / 2 - 0.07]) s.box(0.14, 1.15, 0.14, PAL.woodDark, x, 0.575, 0);
  s.box(len, 0.12, 0.07, PAL.woodLight, 0, 0.45, 0, 0, 0, 0.02);
  s.box(len, 0.12, 0.07, PAL.woodLight, 0, 1.0, 0, 0, 0, -0.03);
  return s;
}

export function wagonShape() {
  const s = new Shape();
  s.box(2.0, 0.18, 3.2, PAL.woodDark, 0, 0.72, 0);
  s.box(2.0, 0.5, 0.1, PAL.wood, 0, 1.05, 1.55);
  s.box(2.0, 0.5, 0.1, PAL.wood, 0, 1.05, -1.55);
  s.box(0.1, 0.5, 3.2, PAL.wood, 0.95, 1.05, 0);
  s.box(0.1, 0.5, 3.2, PAL.wood, -0.95, 1.05, 0);
  for (const x of [-1.08, 1.08]) for (const z of [-1.05, 1.05]) {
    s.cyl(0.55, 0.55, 0.1, 12, PAL.woodDark, x, 0.55, z, 0, 0, Math.PI / 2);
    s.cyl(0.14, 0.14, 0.14, 6, PAL.iron, x, 0.55, z, 0, 0, Math.PI / 2);
  }
  s.add(new THREE.CylinderGeometry(1.02, 1.02, 2.7, 10, 1, true, -Math.PI / 2, Math.PI), PAL.canvas, 0, 1.25, 0, -Math.PI / 2, 0, 0);
  s.box(0.08, 0.08, 1.6, PAL.woodDark, 0, 0.62, 2.3);
  return s;
}

export function tentShape() {
  const s = new Shape();
  s.cone(1.85, 2.3, 4, PAL.canvas, 0, 1.15, 0, 0, Math.PI / 4);
  s.add(new THREE.ConeGeometry(0.5, 1.2, 3), PAL.canvasDark, 0, 0.6, 1.06, -0.48, 0, 0);
  s.cyl(0.05, 0.05, 2.6, 4, PAL.woodDark, 0, 1.3, 0);
  return s;
}

export function cactusShape(h = 2.2, seed = 0) {
  const s = new Shape();
  s.cyl(0.2, 0.24, h, 8, PAL.cactus, 0, h / 2, 0);
  s.cone(0.2, 0.18, 8, PAL.cactus, 0, h + 0.09, 0);
  const side = seed % 2 ? 1 : -1;
  s.cyl(0.12, 0.12, 0.45, 6, PAL.cactusDark, side * 0.32, h * 0.5, 0, 0, 0, Math.PI / 2);
  s.cyl(0.13, 0.13, 0.75, 6, PAL.cactus, side * 0.52, h * 0.5 + 0.33, 0);
  if (seed % 3 === 0) {
    s.cyl(0.11, 0.11, 0.35, 6, PAL.cactusDark, -side * 0.28, h * 0.65, 0, 0, 0, Math.PI / 2);
    s.cyl(0.11, 0.11, 0.5, 6, PAL.cactus, -side * 0.44, h * 0.65 + 0.2, 0);
  }
  return s;
}

export function campfireShape(s = new Shape()) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.rock(0.17, PAL.rockDark, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, 0.6, 0.25, i);
  }
  s.box(1.0, 0.13, 0.13, PAL.woodDark, 0, 0.1, 0, 0, 0.5, 0);
  s.box(1.0, 0.13, 0.13, PAL.woodDark, 0, 0.16, 0, 0, -0.6, 0);
  s.box(0.9, 0.12, 0.12, PAL.black, 0, 0.12, 0, 0, 1.5, 0);
  return s;
}

export function flameShape() {
  const s = new Shape();
  s.cone(0.32, 0.8, 5, PAL.ember, 0, 0.45, 0);
  s.cone(0.2, 0.62, 5, PAL.fire, 0.08, 0.42, 0.05, 0, 0.6, 0);
  s.cone(0.14, 0.42, 4, 0xffe08a, -0.06, 0.35, -0.04);
  return s;
}

export function fragmentShape(kind) {
  const s = new Shape();
  if (kind === 'plank') s.box(0.9, 0.1, 0.24, PAL.plank);
  else if (kind === 'stave') s.box(0.16, 1.0, 0.07, PAL.wood);
  else if (kind === 'rail') s.box(1.0, 0.11, 0.07, PAL.woodLight);
  else if (kind === 'redStave') s.box(0.16, 1.0, 0.07, PAL.tnt);
  else s.box(0.2, 0.2, 0.2, PAL.woodDark);
  return s;
}

export const FRAGMENT_HALF = {
  plank: [0.45, 0.05, 0.12], stave: [0.08, 0.5, 0.035], rail: [0.5, 0.055, 0.035],
  redStave: [0.08, 0.5, 0.035], chunk: [0.1, 0.1, 0.1],
};
