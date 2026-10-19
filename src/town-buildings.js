// Distinct town buildings and landmarks. Store names stay on the map.
import * as THREE from 'three';
import { MAT, PAL, Shape, barrelShape, cactusShape, crateShape, meshOf, wagonShape } from './models.js';
import { GROUPS } from './physics.js';
import { RIVER_MAX_X, RIVER_MIN_X, riverCenter, riverTangent, riverWidth } from './terrain.js';

export const STORES = [
  { id: 'guns', label: 'Guns & Ammo', kind: 'guns', side: -1, z: -18, color: 0x6f392c },
  { id: 'doctor', label: 'Doctor Finch', kind: 'doctor', side: 1, z: -18, color: 0xd4c9ab },
  { id: 'sheriff', label: 'Sheriff', kind: 'sheriff', side: -1, z: -6, color: 0x756348 },
  { id: 'maps', label: 'Maps & Trails', kind: 'maps', side: 1, z: -6, color: 0x426c68 },
  { id: 'clothes', label: 'Clothier', kind: 'clothes', side: -1, z: 6, color: 0x815b72 },
  { id: 'saloon', label: 'The Last Drop', kind: 'saloon', side: 1, z: 6, color: 0x9b4d36 },
  { id: 'stable', label: 'Livery Stable', kind: 'stable', side: -1, z: 18, color: 0x8d7547 },
];

function window(s, x, y, z, color = 0x49666a) {
  s.box(1.52, 1.67, 0.13, PAL.woodDark, x, y, z);
  s.box(1.22, 1.37, 0.17, color, x, y, z + 0.09);
  s.box(0.07, 1.38, 0.2, PAL.woodLight, x, y, z + 0.14);
  s.box(1.24, 0.07, 0.2, PAL.woodLight, x, y, z + 0.14);
  s.box(1.7, 0.15, 0.34, PAL.woodLight, x, y - 0.82, z + 0.14, -0.08);
  for (const side of [-1, 1]) {
    s.box(0.32, 1.48, 0.12, PAL.wood, x + side * 0.94, y, z + 0.08, 0, side * 0.08);
    for (let u = -0.5; u <= 0.5; u += 0.25) s.box(0.25, 0.055, 0.15, PAL.woodLight, x + side * 0.94, y + u, z + 0.16, 0, side * 0.08);
  }
}

function porch(s, width, depth = 2.15, high = 3.1) {
  s.box(width + 0.5, 0.16, depth, PAL.plank, 0, 0.11, 4.5);
  for (let x = -width / 2; x <= width / 2; x += 0.72) s.box(0.045, 0.025, depth - 0.08, PAL.woodDark, x, 0.205, 4.5);
  s.box(width + 0.8, 0.2, depth + 0.32, PAL.woodDark, 0, high, 4.45, -0.08);
  s.box(width + 0.55, 0.12, depth + 0.08, PAL.woodLight, 0, high + 0.14, 4.42, -0.08);
  for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) {
    s.cyl(0.12, 0.16, high, 8, PAL.woodLight, x, high / 2, 5.45);
    s.box(0.65, 0.11, 0.13, PAL.wood, x - Math.sign(x) * 0.27, high - 0.38, 5.45, 0, 0, Math.sign(x) * 0.6);
  }
  for (let i = 0; i < 2; i++) s.box(width * (0.45 - i * 0.08), 0.11, 0.46, i ? PAL.woodDark : PAL.plank, 0, 0.05 + i * 0.08, 5.78 + i * 0.38);
}

function door(s, color = PAL.woodDark, double = false) {
  const xs = double ? [-0.52, 0.52] : [0];
  for (const x of xs) {
    s.box(double ? 0.88 : 1.15, 2.45, 0.13, color, x, 1.24, 3.68);
    s.box(double ? 0.64 : 0.88, 1.78, 0.16, PAL.wood, x, 1.1, 3.77);
    for (const y of [0.45, 1.1, 1.75]) s.box(double ? 0.65 : 0.88, 0.06, 0.19, PAL.woodLight, x, y, 3.88);
    s.box(0.08, 0.08, 0.17, PAL.brass, x + (double ? x < 0 ? 0.25 : -0.25 : 0.33), 1.12, 3.88);
  }
}

function frontBoards(s, width, height, z, trim = PAL.woodLight) {
  for (let y = 0.42; y < height; y += 0.52) s.box(width - 0.3, 0.035, 0.08, y % 1.04 < 0.2 ? trim : PAL.woodDark, 0, y, z + 0.04);
  for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) s.box(0.24, height, 0.22, trim, x, height / 2, z + 0.11);
}

function gableRoof(s, width, depth, eave, rise, color) {
  const angle = Math.atan2(rise, depth / 2);
  const slopeDepth = Math.hypot(depth / 2, rise) + 0.45;
  for (const side of [-1, 1]) {
    s.box(width + 0.8, 0.22, slopeDepth, color, 0, eave + rise / 2, side * depth / 4, side * angle);
    for (let x = -width / 2; x <= width / 2; x += 0.65) s.box(0.035, 0.235, slopeDepth - 0.08, PAL.woodDark, x, eave + rise / 2 + 0.02, side * depth / 4, side * angle);
  }
  s.cyl(0.12, 0.12, width + 1, 6, PAL.woodLight, 0, eave + rise + 0.05, 0, 0, 0, Math.PI / 2);
}

function lantern(s, x, y, z) {
  s.box(0.08, 0.65, 0.08, PAL.iron, x, y + 0.36, z);
  s.cyl(0.22, 0.28, 0.12, 8, PAL.iron, x, y, z);
  s.cyl(0.17, 0.17, 0.38, 8, 0xe7b85b, x, y - 0.18, z);
  s.cone(0.3, 0.2, 8, PAL.iron, x, y - 0.47, z, Math.PI);
}

function gunsmith(s) {
  s.box(8.4, 3.7, 7.2, 0x6f392c, 0, 1.85, 0);
  frontBoards(s, 8.4, 3.7, 3.62, 0x9a5d3d);
  gableRoof(s, 8.4, 7.2, 3.65, 1.25, 0x4a3830);
  s.box(1.05, 1.7, 1.05, PAL.rockDark, -3, 4.45, -1.5);
  s.box(1.24, 0.22, 1.24, PAL.iron, -3, 5.3, -1.5);
  s.box(8.65, 0.85, 0.25, 0x5a3029, 0, 4.18, 3.62);
  door(s); window(s, -2.45, 2, 3.68); window(s, 2.45, 2, 3.68);
  for (const x of [-3.2, 3.2]) for (const y of [1.45, 2.55]) s.box(1.25, 0.08, 0.18, PAL.iron, x, y, 3.88);
  porch(s, 8.4);
  s.box(1.7, 0.15, 0.7, PAL.woodDark, -2.7, 0.6, 5);
  lantern(s, 1.25, 2.65, 3.98);
}

function doctor(s) {
  s.box(7.7, 4.3, 6.8, 0xd4c9ab, 0, 2.15, 0);
  frontBoards(s, 7.7, 4.3, 3.42, 0xe4d7b9);
  gableRoof(s, 7.7, 6.8, 4.25, 1.5, 0x8c5a47);
  for (let x = -3.5; x <= 3.5; x += 1) s.box(0.04, 4.1, 0.08, 0xc0b28f, x, 2.05, 3.44);
  door(s, 0x86a5a0); window(s, -2.25, 2.1, 3.48, 0x668d8c); window(s, 2.25, 2.1, 3.48, 0x668d8c);
  porch(s, 7.7, 2, 3);
  // A small medical cross identifies the office without a text sign.
  s.box(0.3, 1.25, 0.18, 0xa63e32, 0, 4.95, 3.58);
  s.box(1.25, 0.3, 0.18, 0xa63e32, 0, 4.95, 3.58);
  for (const x of [-2.7, 2.7]) { s.box(0.55, 0.45, 0.55, PAL.wood, x, 0.3, 4.8); s.cone(0.35, 0.7, 6, PAL.cactus, x, 0.85, 4.8); }
}

function sheriff(s) {
  s.box(8, 4, 7, 0x756348, 0, 2, 0);
  frontBoards(s, 8, 4, 3.52, 0x9b8662);
  gableRoof(s, 8, 7, 3.95, 1.25, 0x46382d);
  s.box(8.15, 1.4, 0.25, 0x68563d, 0, 4.55, 3.52);
  door(s, 0x4e3828); window(s, -2.35, 2, 3.56, 0x46575a);
  window(s, 2.35, 2, 3.56, 0x46575a);
  for (const x of [1.9, 2.35, 2.8]) s.box(0.08, 1.4, 0.2, PAL.iron, x, 2, 3.75);
  porch(s, 8, 2.2, 3.15);
  s.cyl(0.48, 0.6, 0.45, 6, PAL.brass, 0, 5.55, 3.55);
  s.cone(0.4, 0.35, 6, PAL.brass, 0, 5.95, 3.55);
  lantern(s, -1.1, 2.7, 3.9);
}

function mapShop(s) {
  s.box(6.6, 4.7, 6.6, 0x426c68, 0, 2.35, 0);
  frontBoards(s, 6.6, 4.7, 3.32, 0x5b8580);
  s.cone(5.05, 2.2, 4, 0x374c4c, 0, 5.75, 0, 0, Math.PI / 4);
  s.cyl(0.32, 0.38, 2, 8, PAL.brass, -2.1, 6.8, -1.5);
  door(s, 0x314a49); window(s, -1.9, 2.2, 3.36, 0x6f9c9c); window(s, 1.9, 2.2, 3.36, 0x6f9c9c);
  porch(s, 6.6, 2, 3.1);
  for (const x of [-2.5, 2.5]) { s.cyl(0.17, 0.17, 1.15, 10, PAL.canvas, x, 1, 4.75, 0, 0, Math.PI / 2); s.cyl(0.21, 0.21, 0.05, 10, PAL.woodDark, x - 0.58, 1, 4.75, 0, 0, Math.PI / 2); }
}

function clothier(s) {
  s.box(8, 5, 6.8, 0x815b72, 0, 2.5, 0);
  frontBoards(s, 8, 5, 3.42, 0xa37c93);
  s.cone(5.35, 2.1, 4, 0x60465b, 0, 6, 0, 0, Math.PI / 4);
  door(s, 0x5e3f54); window(s, -2.35, 2.15, 3.45, 0x7fa1a0); window(s, 2.35, 2.15, 3.45, 0x7fa1a0);
  porch(s, 8, 2.25, 3.2);
  for (let i = -4; i <= 4; i++) s.box(0.9, 0.08, 2.1, i % 2 ? 0xc58c74 : PAL.canvas, i, 3.28, 4.55, -0.12);
  s.box(2.1, 0.16, 0.6, PAL.woodDark, -2.35, 0.55, 5);
}

function saloon(s) {
  s.box(9.6, 6.8, 7.2, 0x9b4d36, 0, 3.4, 0);
  frontBoards(s, 9.6, 6.8, 3.62, 0xb36b4c);
  s.box(10, 0.25, 7.7, PAL.woodDark, 0, 6.92, 0);
  s.box(9.85, 1.4, 0.3, 0x7c392c, 0, 7.55, 3.62);
  door(s, 0x5c2f25, true);
  for (const x of [-3.2, 3.2]) { window(s, x, 2.1, 3.67, 0x596c6d); window(s, x, 5.25, 3.67, 0x596c6d); }
  s.box(10, 0.15, 2.2, PAL.plank, 0, 3.55, 4.5);
  for (let x = -4.6; x <= 4.6; x += 1.15) s.box(0.12, 1.15, 0.12, PAL.woodDark, x, 4.1, 5.45);
  s.box(10, 0.13, 0.13, PAL.woodLight, 0, 4.65, 5.45);
  for (const x of [-3.9, -2.6, 2.6, 3.9]) s.box(0.09, 1.0, 0.09, PAL.woodLight, x, 4.05, 5.44);
  lantern(s, -1.45, 2.8, 3.98); lantern(s, 1.45, 2.8, 3.98);
  porch(s, 9.6, 2.3, 6.55);
}

function stable(s) {
  s.box(9.8, 0.35, 7.6, PAL.dirt, 0, 0.18, 0);
  s.box(0.4, 4.7, 7.2, PAL.woodDark, -4.7, 2.35, 0);
  s.box(0.4, 4.7, 7.2, PAL.woodDark, 4.7, 2.35, 0);
  s.box(9.8, 4.7, 0.4, PAL.woodDark, 0, 2.35, -3.4);
  for (let y = 0.5; y < 4.7; y += 0.65) s.box(9.3, 0.06, 0.08, PAL.woodLight, 0, y, -3.18);
  s.cone(7.2, 3.1, 4, 0x6c5136, 0, 5.6, 0, 0, Math.PI / 4);
  for (const x of [-3.5, 0, 3.5]) {
    s.box(0.25, 4.5, 0.25, PAL.woodLight, x, 2.25, 3.3);
    s.box(2.6, 1, 0.16, PAL.wood, x, 0.55, 3.4);
  }
  for (const x of [-2.3, 2.3]) s.box(0.2, 2, 6, PAL.wood, x, 1, 0);
  s.box(9.6, 0.15, 1.9, PAL.plank, 0, 0.09, 4.4);
  for (const x of [-4.3, 4.3]) lantern(s, x, 3.2, 3.4);
}

const builders = { guns: gunsmith, doctor, sheriff, maps: mapShop, clothes: clothier, saloon, stable };

function makeBuilding(game, group, spec) {
  const x = spec.side * 13, ry = -spec.side * Math.PI / 2, object = new THREE.Group(), shape = new Shape();
  builders[spec.kind](shape);
  object.position.set(x, 0, spec.z); object.rotation.y = ry;
  object.add(meshOf(shape)); group.add(object);
  const height = spec.kind === 'saloon' ? 6.8 : 4.8;
  game.physics.fixedBox(x, height / 2, spec.z, 4.8, height / 2, 3.5, ry, GROUPS.world);
  return { ...spec, x: spec.side * 8.55, z: spec.z, outsideX: spec.side * 7.1, outsideZ: spec.z };
}

function rearDoor(s, z, double = false) {
  const xs = double ? [-0.58, 0.58] : [0];
  for (const x of xs) {
    s.box(double ? 1.02 : 1.3, 2.55, 0.16, PAL.woodDark, x, 1.28, z);
    for (const y of [0.48, 1.22, 1.98]) s.box(double ? 0.82 : 1.08, 0.08, 0.19, PAL.woodLight, x, y, z + 0.1);
    s.cyl(0.07, 0.07, 0.08, 6, PAL.brass, x + (double ? (x < 0 ? 0.3 : -0.3) : 0.42), 1.25, z + 0.16, Math.PI / 2);
  }
}

function rearBuilding(game, group, spec) {
  const s = new Shape(), front = spec.depth / 2 + 0.02;
  s.box(spec.width, spec.height, spec.depth, spec.color, 0, spec.height / 2, 0);
  for (let y = 0.4; y < spec.height; y += 0.5) s.box(spec.width - 0.25, 0.035, 0.08,
    Math.round(y * 10) % 2 ? PAL.woodDark : spec.trim, 0, y, front + 0.03);
  for (const x of [-spec.width / 2 + 0.12, spec.width / 2 - 0.12]) s.box(0.24, spec.height, 0.2, spec.trim, x, spec.height / 2, front + 0.1);

  if (spec.type === 'hotel') {
    rearDoor(s, front + 0.1, true);
    for (const y of [2.2, 4.9]) for (const x of [-3.1, 3.1]) window(s, x, y, front + 0.12, 0x4f6a6e);
    s.box(spec.width + 0.4, 0.2, 1.65, PAL.plank, 0, 3.45, front + 0.55);
    for (let x = -4.4; x <= 4.4; x += 0.8) s.box(0.09, 0.9, 0.09, PAL.woodDark, x, 3.9, front + 1.25);
    s.box(spec.width + 0.4, 0.12, 0.12, PAL.woodLight, 0, 4.32, front + 1.25);
    s.box(spec.width + 0.5, 1.05, 0.3, 0x725039, 0, spec.height + 0.42, front);
    for (const x of [-4.5, 4.5]) s.box(0.3, 1.55, 0.3, spec.trim, x, spec.height + 0.3, front);
  } else if (spec.type === 'chapel') {
    rearDoor(s, front + 0.1, true);
    for (const x of [-2.05, 2.05]) window(s, x, 2.35, front + 0.12, 0x638287);
    gableRoof(s, spec.width, spec.depth, spec.height - 0.05, 1.75, spec.roof);
    s.box(1.75, 2.1, 1.75, spec.trim, 0, spec.height + 1.25, -0.7);
    s.cone(1.4, 1.8, 4, spec.roof, 0, spec.height + 3.15, -0.7, 0, Math.PI / 4);
    s.cyl(0.38, 0.46, 0.5, 8, PAL.brass, 0, spec.height + 1.35, front + 0.25);
  } else if (spec.type === 'forge') {
    gableRoof(s, spec.width, spec.depth, spec.height - 0.05, 1.4, spec.roof);
    s.box(4.1, 3.0, 0.18, 0x2d2723, 1.45, 1.5, front + 0.12);
    s.box(1.45, 2.6, 0.16, PAL.woodDark, -2.75, 1.3, front + 0.12);
    s.box(1.65, 2.7, 1.65, PAL.rockDark, -2.6, spec.height + 0.4, -1.2);
    s.box(1.9, 0.22, 1.9, PAL.iron, -2.6, spec.height + 1.72, -1.2);
    s.box(spec.width + 0.4, 0.16, 2.1, PAL.plank, 0, 0.1, front + 0.8);
  } else {
    rearDoor(s, front + 0.1, spec.type === 'freight');
    const windowX = spec.type === 'freight' ? [-3.3, 3.3] : [-1.9, 1.9];
    for (const x of windowX) window(s, x, 2, front + 0.12, 0x526a6b);
    gableRoof(s, spec.width, spec.depth, spec.height - 0.05, spec.type === 'freight' ? 1.45 : 1.15, spec.roof);
    if (spec.type === 'cabin') {
      s.box(spec.width + 0.35, 0.14, 1.5, PAL.plank, 0, 0.09, front + 0.58);
      for (const x of [-spec.width / 2 + 0.28, spec.width / 2 - 0.28]) s.cyl(0.1, 0.13, 2.7, 7, PAL.woodLight, x, 1.35, front + 1.22);
    }
  }
  if (spec.type !== 'hotel' && spec.type !== 'forge') {
    const chimneyX = spec.type === 'chapel' ? 2.3 : -spec.width * 0.3;
    s.box(0.75, 1.55, 0.75, PAL.rockDark, chimneyX, spec.height + 0.6, -spec.depth * 0.22);
    s.box(0.9, 0.16, 0.9, PAL.iron, chimneyX, spec.height + 1.4, -spec.depth * 0.22);
  }
  const object = new THREE.Group();
  object.position.set(spec.x, 0, spec.z); object.rotation.y = spec.ry;
  object.add(meshOf(s)); group.add(object);
  game.physics.fixedBox(spec.x, spec.height / 2, spec.z, spec.width / 2, spec.height / 2, spec.depth / 2, spec.ry, GROUPS.world);
}

function backstreetBuildings(game, group) {
  const buildings = [
    { type: 'forge', x: -25, z: -19, ry: Math.PI / 2, width: 8.2, depth: 7, height: 3.8, color: 0x73513a, trim: 0x9d7148, roof: 0x443832 },
    { type: 'cabin', x: -26, z: 1, ry: Math.PI / 2 + 0.04, width: 6.6, depth: 6.2, height: 3.7, color: 0x806342, trim: 0xae8250, roof: 0x51402f },
    { type: 'freight', x: -25, z: 20, ry: Math.PI / 2 - 0.03, width: 9.4, depth: 7.6, height: 4.2, color: 0x6b533d, trim: 0x9d7951, roof: 0x453b35 },
    { type: 'hotel', x: 25, z: -18, ry: -Math.PI / 2 - 0.03, width: 10, depth: 7.4, height: 6.4, color: 0x926243, trim: 0xc08b58, roof: 0x594034 },
    { type: 'chapel', x: 27, z: 2, ry: -Math.PI / 2 + 0.04, width: 6.8, depth: 8.2, height: 4.7, color: 0xb8a477, trim: 0xd5c294, roof: 0x5b4a3b },
    { type: 'cabin', x: 25, z: 20, ry: -Math.PI / 2, width: 6.5, depth: 6, height: 3.6, color: 0x725841, trim: 0xa57a4c, roof: 0x48372c },
  ];
  for (const building of buildings) rearBuilding(game, group, building);
}

function river(game, group) {
  const strip = (extraWidth, y, colors) => {
    const positions = [], normals = [], vertexColors = [], steps = 42;
    const shades = colors.map((color) => new THREE.Color(color));
    for (let i = 0; i < steps; i++) {
      const x0 = RIVER_MIN_X + (RIVER_MAX_X - RIVER_MIN_X) * i / steps;
      const x1 = RIVER_MIN_X + (RIVER_MAX_X - RIVER_MIN_X) * (i + 1) / steps;
      const z0 = riverCenter(x0), z1 = riverCenter(x1);
      const w0 = riverWidth(x0) / 2 + extraWidth, w1 = riverWidth(x1) / 2 + extraWidth;
      positions.push(x0, y, z0 - w0, x1, y, z1 + w1, x1, y, z1 - w1,
        x0, y, z0 - w0, x0, y, z0 + w0, x1, y, z1 + w1);
      const color = shades[i % shades.length];
      for (let j = 0; j < 6; j++) {
        normals.push(0, 1, 0);
        vertexColors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    geometry.computeBoundingSphere();
    return meshOf(geometry, MAT.solid, false);
  };
  group.add(strip(1.8, 0.018, [PAL.dirt, PAL.rockLight]), strip(0, 0.04, [PAL.water, 0x66818a, 0x587783]));

  const s = new Shape();
  for (let x = RIVER_MIN_X + 2; x <= RIVER_MAX_X - 2; x += 4) {
    if (Math.abs(x) < 7) continue;
    const z = riverCenter(x), width = riverWidth(x), wave = Math.sin(x * 1.73);
    for (const side of [-1, 1]) {
      const r = 0.85 + (wave * side + 1) * 0.28;
      s.rock(r, side > 0 ? PAL.rock : PAL.rockLight, x + side * 0.45, 0.22, z + side * (width / 2 + 0.7), 0.42, 0.22, Math.round(x + side * 190));
      if (Math.abs(x) > 18 && Math.round(x / 4) % 3 === 0) {
        s.cyl(0.08, 0.12, 0.75, 6, PAL.cactusDark, x - side * 0.4, 0.38, z + side * (width / 2 + 1.6));
        s.cone(0.11, 0.24, 6, 0x829d56, x - side * 0.4, 0.87, z + side * (width / 2 + 1.6));
      }
    }
  }

  // Rock walls hide the creek ends and give each bend a clear silhouette.
  for (const side of [-1, 1]) {
    const x = side < 0 ? RIVER_MIN_X : RIVER_MAX_X, z = riverCenter(x);
    s.rock(5.8, PAL.cliff, x, 3.1, z, 1.05, 0.22, 310 + side);
    s.rock(3.5, PAL.rockLight, x - side * 2.2, 4.8, z - side * 1.4, 0.85, 0.2, 410 + side);
    game.physics.fixedCylinder(x, 2.6, z, 2.6, 4.4, GROUPS.world);
  }
  group.add(meshOf(s, MAT.solid, false));

  // The bridge follows the calm center of the river.
  const bridgeShape = new Shape();
  for (let z = -6.5; z <= 6.5; z += 0.7) bridgeShape.box(7.2, 0.18, 0.58, Math.round(z * 10) % 14 ? PAL.woodLight : PAL.plank, 0, 0.42, z);
  for (const x of [-3.35, 3.35]) {
    bridgeShape.box(0.22, 0.3, 14, PAL.woodDark, x, 0.28, 0);
    bridgeShape.box(0.14, 1.1, 14, PAL.woodLight, x, 1.05, 0);
    for (let z = -6; z <= 6; z += 2) bridgeShape.box(0.2, 1.4, 0.2, PAL.woodDark, x, 0.7, z);
  }
  for (const x of [-5.5, 5.5, -9, 9]) {
    bridgeShape.cyl(0.1, 0.13, 1.7, 6, PAL.cactusDark, x, 0.85, -7.2);
    bridgeShape.cone(0.14, 0.35, 6, 0x829d56, x, 1.85, -7.2);
  }
  const bridge = meshOf(bridgeShape);
  bridge.position.set(0, 0, riverCenter(0));
  bridge.rotation.y = -riverTangent(0);
  group.add(bridge);

  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const x0 = RIVER_MIN_X + (RIVER_MAX_X - RIVER_MIN_X) * i / steps;
    const x1 = RIVER_MIN_X + (RIVER_MAX_X - RIVER_MIN_X) * (i + 1) / steps;
    const x = (x0 + x1) / 2;
    if (Math.abs(x) < 4) continue;
    const z0 = riverCenter(x0), z1 = riverCenter(x1), z = (z0 + z1) / 2;
    const length = Math.hypot(x1 - x0, z1 - z0) + 0.3;
    game.physics.fixedBox(x, 1, z, riverWidth(x) / 2, 1, length / 2, Math.atan2(x1 - x0, z1 - z0), GROUPS.world);
  }
}

function streetDetails(game, group) {
  const s = new Shape();
  // One telegraph line leads through town and keeps the center of the street open.
  const poleX = -5.8, poleZ = [-28, -14, 0, 14, 25];
  for (const z of poleZ) {
    s.box(0.16, 4.1, 0.16, PAL.woodDark, poleX, 2.05, z);
    s.box(1.25, 0.13, 0.13, PAL.woodLight, poleX, 3.72, z);
    for (const u of [-0.45, 0.45]) s.cyl(0.08, 0.08, 0.18, 6, PAL.iron, poleX + u, 3.88, z);
  }
  for (let i = 0; i < poleZ.length - 1; i++) {
    const z = (poleZ[i] + poleZ[i + 1]) / 2, length = poleZ[i + 1] - poleZ[i];
    for (const x of [poleX - 0.45, poleX + 0.45]) s.cyl(0.025, 0.025, length, 5, PAL.iron, x, 3.84, z, Math.PI / 2);
  }
  // The water tower and storage sit in the back lot by the livery.
  s.cyl(2.2, 2.05, 3.1, 12, PAL.wood, -32, 7.2, 18);
  for (const x of [-33.8, -30.2]) for (const z of [16.2, 19.8]) s.box(0.26, 7, 0.26, PAL.woodDark, x, 3.5, z);
  s.cone(2.4, 1.2, 12, PAL.iron, -32, 9.35, 18);
  for (const x of [-35, -30, 31, 35]) {
    const cactus = cactusShape(1.8 + Math.abs(x % 3), x + 40);
    for (const part of cactus.parts) s.parts.push(part);
    const count = cactus.parts.length;
    for (let i = s.parts.length - count; i < s.parts.length; i++) s.parts[i].translate(x, 0, x < 0 ? -29 : 27);
  }
  // Hitching rails stay at the porch edge and leave each door clear.
  for (const x of [-7, 7]) for (const z of [-20.2, -8.2, 3.8, 15.8]) {
    s.cyl(0.11, 0.15, 1.25, 7, PAL.woodDark, x, 0.62, z - 1.6);
    s.cyl(0.11, 0.15, 1.25, 7, PAL.woodDark, x, 0.62, z + 1.6);
    s.cyl(0.1, 0.1, 3.4, 7, PAL.woodLight, x, 0.93, z, Math.PI / 2);
  }
  s.box(2.8, 0.72, 1.15, PAL.woodDark, -7.1, 0.38, 12.3);
  s.box(2.3, 0.5, 0.78, PAL.water, -7.1, 0.56, 12.3);
  for (const x of [-20.4, -19.2]) {
    s.cyl(0.58, 0.58, 1.1, 10, 0xc19a4e, x, 0.6, 15.2, 0, 0, Math.PI / 2);
    s.cyl(0.6, 0.6, 0.05, 10, 0x856530, x - 0.54, 0.6, 15.2, 0, 0, Math.PI / 2);
  }
  for (const [x, z, ry] of [[-20.5, -23, 0.2], [-21.4, -22.1, -0.35], [20.5, 23, 0.5]]) {
    s.add(new THREE.SphereGeometry(0.55, 7, 5), PAL.canvasDark, x, 0.48, z, 0, ry, 0, 0.8, 1.15, 0.65);
    s.cyl(0.12, 0.04, 0.25, 5, PAL.woodDark, x, 1.08, z);
  }
  // Small fenced yards join the front and back rows.
  for (const side of [-1, 1]) {
    const x = side * 19;
    for (const z of [-25, -12, 1, 14, 25]) s.box(0.16, 1.15, 0.16, PAL.woodDark, x, 0.58, z);
    for (const z of [-18.5, -5.5, 7.5, 19.5]) {
      s.box(0.1, 0.12, 11.5, PAL.woodLight, x, 0.45, z, 0.03 * side, 0, 0);
      s.box(0.1, 0.12, 11.5, PAL.woodLight, x, 0.95, z, -0.025 * side, 0, 0);
    }
  }
  group.add(meshOf(s));
  const wagon = meshOf(wagonShape()); wagon.position.set(20.5, 0, -27); wagon.rotation.y = -0.52; group.add(wagon);
  for (const [x, z, size] of [[-20.5, -15, 1], [-21.6, -15.4, 0.75], [20.2, -13.5, 0.9]]) {
    const crate = meshOf(crateShape(size)); crate.position.set(x, size / 2, z); crate.rotation.y = x * 0.07; group.add(crate);
  }
  for (const [x, z] of [[-20.5, -17], [20.5, 15], [21.3, 15.5]]) {
    const barrel = meshOf(barrelShape()); barrel.position.set(x, 0.58, z); group.add(barrel);
  }
}

export function buildTown(game, group) {
  const sites = STORES.map((spec) => makeBuilding(game, group, spec));
  backstreetBuildings(game, group);
  river(game, group);
  streetDetails(game, group);
  return sites;
}
