// Distinct town buildings and landmarks. Store names stay on the map.
import * as THREE from 'three';
import { MAT, PAL, Shape, barrelShape, cactusShape, crateShape, meshOf, wagonShape } from './models.js';
import { GROUPS } from './physics.js';

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
  s.box(1.3, 1.45, 0.12, PAL.canvas, x, y, z);
  s.box(1.08, 1.23, 0.15, color, x, y, z + 0.08);
  s.box(0.06, 1.25, 0.18, PAL.woodLight, x, y, z + 0.13);
  s.box(1.1, 0.06, 0.18, PAL.woodLight, x, y, z + 0.13);
}

function porch(s, width, depth = 2.15, high = 3.1) {
  s.box(width + 0.4, 0.12, depth, PAL.plank, 0, 0.07, 4.5);
  s.box(width + 0.7, 0.16, depth + 0.2, PAL.woodDark, 0, high, 4.5, -0.08);
  for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) s.box(0.17, high, 0.17, PAL.woodLight, x, high / 2, 5.45);
}

function door(s, color = PAL.woodDark, double = false) {
  const xs = double ? [-0.52, 0.52] : [0];
  for (const x of xs) {
    s.box(double ? 0.88 : 1.15, 2.45, 0.13, color, x, 1.24, 3.68);
    s.box(double ? 0.64 : 0.88, 1.78, 0.16, PAL.wood, x, 1.1, 3.77);
    s.box(0.08, 0.08, 0.17, PAL.brass, x + (double ? x < 0 ? 0.25 : -0.25 : 0.33), 1.12, 3.88);
  }
}

function gunsmith(s) {
  s.box(8.4, 3.7, 7.2, 0x6f392c, 0, 1.85, 0);
  s.box(8.9, 0.3, 7.7, PAL.iron, 0, 3.82, 0);
  s.box(1.05, 1.7, 1.05, PAL.rockDark, -3, 4.45, -1.5);
  s.box(8.65, 0.85, 0.25, 0x5a3029, 0, 4.18, 3.62);
  door(s); window(s, -2.45, 2, 3.68); window(s, 2.45, 2, 3.68);
  for (const x of [-3.2, 3.2]) for (const y of [1.45, 2.55]) s.box(1.25, 0.08, 0.18, PAL.iron, x, y, 3.88);
  porch(s, 8.4);
  s.box(1.7, 0.15, 0.7, PAL.woodDark, -2.7, 0.6, 5);
}

function doctor(s) {
  s.box(7.7, 4.3, 6.8, 0xd4c9ab, 0, 2.15, 0);
  s.box(8.2, 0.22, 7.3, 0xb68762, 0, 4.38, 0);
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
  s.box(8.4, 0.25, 7.45, PAL.woodDark, 0, 4.12, 0);
  s.box(8.15, 1.4, 0.25, 0x68563d, 0, 4.55, 3.52);
  door(s, 0x4e3828); window(s, -2.35, 2, 3.56, 0x46575a);
  window(s, 2.35, 2, 3.56, 0x46575a);
  for (const x of [1.9, 2.35, 2.8]) s.box(0.08, 1.4, 0.2, PAL.iron, x, 2, 3.75);
  porch(s, 8, 2.2, 3.15);
  s.cyl(0.48, 0.6, 0.45, 6, PAL.brass, 0, 5.55, 3.55);
  s.cone(0.4, 0.35, 6, PAL.brass, 0, 5.95, 3.55);
}

function mapShop(s) {
  s.box(6.6, 4.7, 6.6, 0x426c68, 0, 2.35, 0);
  s.cone(5.05, 2.2, 4, 0x374c4c, 0, 5.75, 0, 0, Math.PI / 4);
  s.cyl(0.32, 0.38, 2, 8, PAL.brass, -2.1, 6.8, -1.5);
  door(s, 0x314a49); window(s, -1.9, 2.2, 3.36, 0x6f9c9c); window(s, 1.9, 2.2, 3.36, 0x6f9c9c);
  porch(s, 6.6, 2, 3.1);
  for (const x of [-2.5, 2.5]) { s.cyl(0.17, 0.17, 1.15, 10, PAL.canvas, x, 1, 4.75, 0, 0, Math.PI / 2); s.cyl(0.21, 0.21, 0.05, 10, PAL.woodDark, x - 0.58, 1, 4.75, 0, 0, Math.PI / 2); }
}

function clothier(s) {
  s.box(8, 5, 6.8, 0x815b72, 0, 2.5, 0);
  s.cone(5.35, 2.1, 4, 0x60465b, 0, 6, 0, 0, Math.PI / 4);
  door(s, 0x5e3f54); window(s, -2.35, 2.15, 3.45, 0x7fa1a0); window(s, 2.35, 2.15, 3.45, 0x7fa1a0);
  porch(s, 8, 2.25, 3.2);
  for (let i = -4; i <= 4; i++) s.box(0.9, 0.08, 2.1, i % 2 ? 0xc58c74 : PAL.canvas, i, 3.28, 4.55, -0.12);
  s.box(2.1, 0.16, 0.6, PAL.woodDark, -2.35, 0.55, 5);
}

function saloon(s) {
  s.box(9.6, 6.8, 7.2, 0x9b4d36, 0, 3.4, 0);
  s.box(10, 0.25, 7.7, PAL.woodDark, 0, 6.92, 0);
  s.box(9.85, 1.4, 0.3, 0x7c392c, 0, 7.55, 3.62);
  door(s, 0x5c2f25, true);
  for (const x of [-3.2, 3.2]) { window(s, x, 2.1, 3.67, 0x596c6d); window(s, x, 5.25, 3.67, 0x596c6d); }
  s.box(10, 0.15, 2.2, PAL.plank, 0, 3.55, 4.5);
  for (let x = -4.6; x <= 4.6; x += 1.15) s.box(0.12, 1.15, 0.12, PAL.woodDark, x, 4.1, 5.45);
  s.box(10, 0.13, 0.13, PAL.woodLight, 0, 4.65, 5.45);
  porch(s, 9.6, 2.3, 6.55);
}

function stable(s) {
  s.box(9.8, 0.35, 7.6, PAL.dirt, 0, 0.18, 0);
  s.box(0.4, 4.7, 7.2, PAL.woodDark, -4.7, 2.35, 0);
  s.box(0.4, 4.7, 7.2, PAL.woodDark, 4.7, 2.35, 0);
  s.box(9.8, 4.7, 0.4, PAL.woodDark, 0, 2.35, -3.4);
  s.cone(7.2, 3.1, 4, 0x6c5136, 0, 5.6, 0, 0, Math.PI / 4);
  for (const x of [-3.5, 0, 3.5]) {
    s.box(0.25, 4.5, 0.25, PAL.woodLight, x, 2.25, 3.3);
    s.box(2.6, 1, 0.16, PAL.wood, x, 0.55, 3.4);
  }
  for (const x of [-2.3, 2.3]) s.box(0.2, 2, 6, PAL.wood, x, 1, 0);
  s.box(9.6, 0.15, 1.9, PAL.plank, 0, 0.09, 4.4);
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

function river(game, group) {
  const s = new Shape();
  s.box(150, 0.08, 10, PAL.water, 0, 0.01, 30);
  for (let x = -72; x <= 72; x += 4) {
    if (Math.abs(x) < 6) continue;
    s.rock(1.5, x % 8 ? PAL.rock : PAL.rockLight, x, 0.3, 24.5, 0.45, 0.2, x + 80);
    s.rock(1.4, x % 8 ? PAL.rockLight : PAL.rock, x + 1, 0.28, 35.5, 0.42, 0.2, x + 120);
  }
  // The bridge has separate planks, posts, and rails.
  for (let z = 23.5; z <= 36.5; z += 0.7) s.box(7.2, 0.18, 0.58, z % 1.4 < 0.3 ? PAL.woodLight : PAL.plank, 0, 0.42, z);
  for (const x of [-3.35, 3.35]) {
    s.box(0.22, 0.3, 14, PAL.woodDark, x, 0.28, 30);
    s.box(0.14, 1.1, 14, PAL.woodLight, x, 1.05, 30);
    for (let z = 24; z <= 36; z += 2) s.box(0.2, 1.4, 0.2, PAL.woodDark, x, 0.7, z);
  }
  for (const x of [-5.5, 5.5, -9, 9]) {
    s.cyl(0.1, 0.13, 1.7, 6, PAL.cactusDark, x, 0.85, 23.3);
    s.cone(0.14, 0.35, 6, 0x829d56, x, 1.85, 23.3);
  }
  group.add(meshOf(s, MAT.solid, false));
  game.physics.fixedBox(-39.3, 1, 30, 35.7, 1, 5, 0, GROUPS.world);
  game.physics.fixedBox(39.3, 1, 30, 35.7, 1, 5, 0, GROUPS.world);
}

function streetDetails(game, group) {
  const s = new Shape();
  // Water tower, telegraph poles, shade trees, and desert plants give a readable skyline.
  for (const x of [-3.5, 3.5]) for (const z of [-24, -12, 0, 12, 21]) {
    s.box(0.14, 3.6, 0.14, PAL.woodDark, x, 1.8, z);
    s.box(1, 0.12, 0.12, PAL.woodLight, x, 3.35, z);
    for (const u of [-0.35, 0.35]) s.cyl(0.08, 0.08, 0.16, 6, PAL.iron, x + u, 3.5, z);
  }
  s.cyl(2.2, 2.05, 3.1, 12, PAL.wood, 20, 7.2, 18);
  for (const x of [18.2, 21.8]) for (const z of [16.2, 19.8]) s.box(0.26, 7, 0.26, PAL.woodDark, x, 3.5, z);
  s.cone(2.4, 1.2, 12, PAL.iron, 20, 9.35, 18);
  for (const x of [-22, -18, 18, 22]) {
    const cactus = cactusShape(1.8 + Math.abs(x % 3), x + 40);
    for (const part of cactus.parts) s.parts.push(part);
    const count = cactus.parts.length;
    for (let i = s.parts.length - count; i < s.parts.length; i++) s.parts[i].translate(x, 0, x < 0 ? 24 : -25);
  }
  group.add(meshOf(s));
  const wagon = meshOf(wagonShape()); wagon.position.set(22, 0, -10); wagon.rotation.y = -0.35; group.add(wagon);
  const crate = meshOf(crateShape(0.9)); crate.position.set(-7.4, 0.45, -20); group.add(crate);
  const barrel = meshOf(barrelShape()); barrel.position.set(7.4, 0.58, 8); group.add(barrel);
}

export function buildTown(game, group) {
  const sites = STORES.map((spec) => makeBuilding(game, group, spec));
  river(game, group);
  streetDetails(game, group);
  return sites;
}
