// Cutaway interiors keep the room in view while the player walks inside it.
import * as THREE from 'three';
import { PAL, Shape, makeCharacter, meshOf } from './models.js';
import { addRollPivot, animateCharacter, showGun, turnToward } from './character.js';
import { GROUPS } from './physics.js';

const ROOM_X = 176;
const ROOM_Z = [-165, -110, -55, 0, 55, 110, 165];

function roomShell(game, root, center, color) {
  const s = new Shape();
  s.box(18.5, 0.18, 14.5, PAL.plank, center.x, 0.09, center.z);
  for (let x = -8.5; x <= 8.5; x += 0.8) s.box(0.035, 0.025, 14.1, x % 1.6 < 0.2 ? PAL.woodLight : PAL.woodDark, center.x + x, 0.195, center.z);
  s.box(18.5, 4.8, 0.3, color, center.x, 2.4, center.z - 7.1);
  s.box(0.3, 4.8, 14.5, color, center.x - 9.1, 2.4, center.z);
  s.box(0.3, 4.8, 14.5, color, center.x + 9.1, 2.4, center.z);
  // Baseboards, wall beams, and a large rug make the room feel built by hand.
  s.box(18, 0.2, 0.18, PAL.woodDark, center.x, 0.28, center.z - 6.88);
  for (const x of [-8.7, -4.4, 0, 4.4, 8.7]) s.box(0.13, 4.6, 0.16, PAL.woodDark, center.x + x, 2.35, center.z - 6.88);
  for (const x of [-8.7, 8.7]) for (const z of [-5.7, -2.8, 0, 2.8, 5.7]) s.box(0.17, 4.55, 0.13, PAL.woodDark, center.x + x, 2.35, center.z + z);
  for (const side of [-1, 1]) s.box(0.2, 0.16, 13.8, PAL.woodLight, center.x + side * 8.86, 1.25, center.z);
  for (const x of [-5.8, 5.8]) {
    s.box(2.5, 1.75, 0.12, PAL.woodDark, center.x + x, 2.6, center.z - 6.86);
    s.box(2.16, 1.42, 0.16, 0x3f6268, center.x + x, 2.6, center.z - 6.74);
    s.box(0.07, 1.42, 0.18, PAL.woodLight, center.x + x, 2.6, center.z - 6.63);
    s.box(2.16, 0.07, 0.18, PAL.woodLight, center.x + x, 2.6, center.z - 6.63);
  }
  s.box(7, 0.04, 4.5, 0x8a4938, center.x, 0.2, center.z + 0.5);
  root.add(meshOf(s));
  game.physics.fixedBox(center.x, 2.4, center.z - 7.1, 9.25, 2.4, 0.15, 0, GROUPS.world);
  game.physics.fixedBox(center.x - 9.1, 2.4, center.z, 0.15, 2.4, 7.25, 0, GROUPS.world);
  game.physics.fixedBox(center.x + 9.1, 2.4, center.z, 0.15, 2.4, 7.25, 0, GROUPS.world);
}

function counter(game, root, center, width = 8, z = -3.2, color = PAL.wood) {
  const s = new Shape();
  s.box(width, 1.05, 0.9, color, center.x, 0.53, center.z + z);
  s.box(width + 0.25, 0.14, 1.1, PAL.woodDark, center.x, 1.1, center.z + z);
  for (let x = -width / 2 + 0.4; x < width / 2; x += 1.1) {
    s.box(0.08, 0.8, 0.96, PAL.woodDark, center.x + x, 0.52, center.z + z);
    s.box(0.7, 0.055, 0.97, PAL.woodLight, center.x + x + 0.38, 0.55, center.z + z);
  }
  s.cyl(0.06, 0.06, width - 0.35, 8, PAL.brass, center.x, 0.28, center.z + z + 0.58, 0, 0, Math.PI / 2);
  root.add(meshOf(s));
  game.physics.fixedBox(center.x, 0.6, center.z + z, width / 2, 0.6, 0.5, 0, GROUPS.world);
}

function chair(shape, x, z, yaw = 0, color = PAL.wood) {
  shape.box(0.8, 0.13, 0.8, color, x, 0.62, z, 0, yaw);
  for (const u of [-0.29, 0.29]) {
    shape.cyl(0.055, 0.075, 1.5, 7, PAL.woodDark, x + Math.cos(yaw) * u, 1.15, z - Math.cos(yaw) * 0.36 - Math.sin(yaw) * u);
    shape.cyl(0.05, 0.07, 0.68, 7, PAL.woodDark, x + Math.cos(yaw) * u, 0.32, z + Math.cos(yaw) * 0.3 - Math.sin(yaw) * u);
  }
  for (const y of [0.92, 1.2, 1.47]) shape.box(0.72, 0.1, 0.1, y === 1.2 ? color : PAL.woodLight, x, y, z - Math.cos(yaw) * 0.36, 0, yaw);
}

function shelf(shape, x, z, color, items = PAL.brass) {
  shape.box(3.8, 3.2, 0.35, PAL.woodDark, x, 1.6, z);
  for (const y of [0.5, 1.45, 2.4, 3.15]) shape.box(4, 0.12, 0.75, PAL.woodLight, x, y, z + 0.18);
  for (let row = 0; row < 3; row++) for (let i = -1; i <= 1; i++) {
    const px = x + i * 0.9, py = 0.78 + row * 0.95;
    if ((row + i) % 2) {
      shape.cyl(0.16, 0.2, 0.5, 8, row % 2 ? color : items, px, py, z + 0.46);
      shape.cyl(0.07, 0.07, 0.18, 7, PAL.brass, px, py + 0.32, z + 0.46);
    } else shape.box(0.48, 0.5, 0.42, row % 2 ? color : items, px, py, z + 0.45, 0, 0.08 * i);
  }
}

function wallLantern(shape, x, y, z) {
  shape.box(0.08, 0.7, 0.08, PAL.iron, x, y + 0.3, z);
  shape.cyl(0.2, 0.25, 0.12, 8, PAL.iron, x, y, z + 0.08);
  shape.cyl(0.15, 0.15, 0.36, 8, 0xe6ae54, x, y - 0.18, z + 0.08);
  shape.cone(0.27, 0.18, 8, PAL.iron, x, y - 0.45, z + 0.08, Math.PI);
}

function horse(shape, x, z) {
  const coat = 0x704631, dark = 0x3d2b23, mane = 0x2a211c;
  shape.add(new THREE.SphereGeometry(1, 10, 6), coat, x, 1.55, z, 0, 0, 0, 1.55, 0.74, 0.68);
  shape.add(new THREE.SphereGeometry(1, 9, 6), coat, x, 2.18, z + 0.75, -0.3, 0, 0, 0.52, 0.9, 0.46);
  shape.add(new THREE.SphereGeometry(1, 9, 6), coat, x, 2.78, z + 1.18, 0, 0, 0, 0.48, 0.52, 0.42);
  shape.add(new THREE.SphereGeometry(1, 8, 5), dark, x, 2.62, z + 1.55, 0, 0, 0, 0.4, 0.28, 0.52);
  for (const side of [-1, 1]) {
    shape.cone(0.15, 0.55, 6, coat, x + side * 0.2, 3.24, z + 1.06, side * 0.08, 0, side * 0.16);
    for (const dz of [-0.38, 0.36]) {
      shape.cyl(0.12, 0.18, 1.35, 7, coat, x + side * 0.92, 0.74, z + dz);
      shape.box(0.3, 0.18, 0.42, dark, x + side * 0.92, 0.1, z + dz + 0.06);
    }
  }
  shape.box(0.16, 1.25, 0.18, mane, x, 2.45, z + 0.4, -0.42);
  shape.cone(0.25, 1.2, 7, mane, x, 1.52, z - 1.15, -1.0);
  shape.box(1.45, 0.22, 1.0, mane, x, 1.95, z - 0.02);
  shape.box(1.3, 0.12, 1.25, 0x9a6337, x, 2.08, z - 0.02);
  shape.cyl(0.06, 0.06, 1.55, 7, PAL.brass, x, 1.5, z + 0.58, 0, 0, Math.PI / 2);
}

function gunsInterior(game, room) {
  counter(game, room.root, room.center, 8.5, -2.8, 0x70402b);
  const s = new Shape();
  shelf(s, room.center.x - 5.7, room.center.z - 6.4, PAL.red, PAL.iron);
  shelf(s, room.center.x + 5.7, room.center.z - 6.4, PAL.wood, PAL.brass);
  for (const x of [-3, -1.5, 0, 1.5, 3]) {
    s.box(0.08, 0.08, 2.2, PAL.iron, room.center.x + x, 3.6, room.center.z - 6.65, 0, 0, Math.PI / 2);
    s.box(0.18, 0.16, 0.7, PAL.wood, room.center.x + x - 0.7, 3.6, room.center.z - 6.5, 0, 0, Math.PI / 2);
  }
  s.box(1.3, 1.3, 1.3, PAL.plank, room.center.x - 6.7, 0.78, room.center.z + 3.5);
  wallLantern(s, room.center.x, 3.45, room.center.z - 6.6);
  for (const x of [-6.9, -5.7, 5.7, 6.9]) s.cyl(0.22, 0.25, 0.72, 8, PAL.iron, room.center.x + x, 0.58, room.center.z - 5.8);
  room.root.add(meshOf(s));
}

function doctorInterior(game, room) {
  counter(game, room.root, room.center, 6, -3.6, 0xc7b898);
  const s = new Shape();
  shelf(s, room.center.x + 5.8, room.center.z - 6.4, 0x537c73, PAL.canvas);
  s.box(4.4, 0.85, 2.1, PAL.canvas, room.center.x - 4.8, 0.55, room.center.z - 1);
  s.box(4.4, 0.15, 2.1, 0xe7ddc8, room.center.x - 4.8, 1.02, room.center.z - 1);
  s.box(0.25, 1.3, 0.25, PAL.woodDark, room.center.x - 6.5, 0.65, room.center.z - 1.8);
  for (let i = 0; i < 4; i++) s.cyl(0.18, 0.2, 0.55, 8, i % 2 ? 0x587c5d : PAL.brass, room.center.x - 1.5 + i * 0.7, 1.5, room.center.z - 6.65);
  wallLantern(s, room.center.x - 3.4, 3.45, room.center.z - 6.6);
  for (let i = 0; i < 3; i++) s.add(new THREE.SphereGeometry(0.22, 7, 5), i % 2 ? 0x8d3941 : 0xe1d0a5, room.center.x + 2.3 + i * 0.45, 1.38, room.center.z - 3.3, 0, 0, 0, 1, 0.7, 1);
  room.root.add(meshOf(s));
}

function sheriffInterior(game, room) {
  counter(game, room.root, room.center, 5.5, -2.7, 0x66523b);
  const s = new Shape();
  s.box(4.5, 3.9, 3.4, 0x3d3732, room.center.x - 6.5, 1.95, room.center.z - 4.9);
  for (const x of [-8.2, -7.35, -6.5, -5.65, -4.8]) s.box(0.12, 3.8, 0.15, PAL.iron, x, 1.9, room.center.z - 3.18);
  s.box(3.7, 0.14, 1, PAL.wood, room.center.x + 4.8, 0.72, room.center.z + 1.7);
  for (const x of [3.4, 6.2]) s.box(0.12, 0.72, 0.7, PAL.woodDark, room.center.x + x, 0.36, room.center.z + 1.7);
  s.box(1.6, 0.08, 1.15, PAL.canvas, room.center.x + 1.2, 1.18, room.center.z - 2.7);
  wallLantern(s, room.center.x, 3.5, room.center.z - 6.6);
  s.cyl(0.42, 0.5, 0.18, 8, PAL.brass, room.center.x + 5.9, 1.05, room.center.z + 1.7);
  s.cone(0.34, 0.32, 8, PAL.brass, room.center.x + 5.9, 1.3, room.center.z + 1.7);
  room.root.add(meshOf(s));
}

function mapsInterior(game, room) {
  counter(game, room.root, room.center, 7, -3, 0x315553);
  const s = new Shape();
  for (const x of [-6, -3, 0, 3, 6]) {
    s.cyl(0.2, 0.2, 2.4, 10, PAL.canvas, room.center.x + x, 1.2, room.center.z - 6.5, 0, 0, Math.PI / 2);
    s.cyl(0.24, 0.24, 0.06, 10, PAL.woodDark, room.center.x + x - 1.2, 1.2, room.center.z - 6.5, 0, 0, Math.PI / 2);
  }
  const tableX = room.center.x - 3.6, tableZ = room.center.z + 1.5;
  s.box(6.1, 0.2, 4.25, PAL.woodDark, tableX, 0.92, tableZ, 0, 0.3);
  s.box(5.75, 0.11, 3.9, PAL.canvas, tableX, 1.08, tableZ, 0, 0.3);
  for (const dx of [-2.55, 2.55]) for (const dz of [-1.65, 1.65]) s.cyl(0.11, 0.16, 0.9, 7, PAL.wood, tableX + dx, 0.46, tableZ + dz);
  for (let i = -2; i <= 2; i++) s.box(0.045, 0.035, 3.25, i ? PAL.wood : PAL.red, tableX + i * 0.92, 1.15, tableZ, 0, 0.3);
  for (const dz of [-1.45, 1.45]) s.cyl(0.12, 0.12, 5.35, 10, PAL.woodLight, tableX - Math.sin(0.3) * dz, 1.18, tableZ + Math.cos(0.3) * dz, 0, 0, Math.PI / 2 + 0.3);
  s.cyl(0.32, 0.32, 0.08, 14, PAL.brass, tableX + 1.6, 1.22, tableZ - 0.7);
  s.cone(0.22, 0.32, 4, PAL.red, tableX + 1.6, 1.28, tableZ - 0.7, 0, Math.PI / 4);
  wallLantern(s, room.center.x + 3.6, 3.45, room.center.z - 6.6);
  s.cyl(0.52, 0.52, 0.18, 12, PAL.brass, room.center.x + 5.6, 1.3, room.center.z - 3.1, Math.PI / 2);
  s.cyl(0.06, 0.06, 2.4, 8, PAL.iron, room.center.x + 5.6, 1.3, room.center.z - 2.0, Math.PI / 2);
  room.root.add(meshOf(s));
}

function clothesInterior(game, room) {
  counter(game, room.root, room.center, 7.5, -3.2, 0x704f66);
  const s = new Shape();
  shelf(s, room.center.x - 5.6, room.center.z - 6.4, 0x9e5b58, 0x4d6d72);
  shelf(s, room.center.x + 5.6, room.center.z - 6.4, 0xc49362, 0x765077);
  for (const x of [-5, 0, 5]) {
    s.cyl(0.09, 0.09, 2.3, 8, PAL.woodDark, room.center.x + x, 1.15, room.center.z + 2.4);
    s.cone(0.72, 1.5, 6, x ? 0x4f7370 : 0x9a5b63, room.center.x + x, 1.9, room.center.z + 2.4);
    s.cyl(0.28, 0.28, 0.08, 8, PAL.wood, room.center.x + x, 2.75, room.center.z + 2.4);
  }
  wallLantern(s, room.center.x, 3.45, room.center.z - 6.6);
  for (const x of [-6.2, 6.2]) {
    s.cyl(0.36, 0.36, 0.12, 10, PAL.woodDark, room.center.x + x, 0.28, room.center.z + 3.2);
    s.add(new THREE.SphereGeometry(0.38, 8, 5), x < 0 ? 0xb56a61 : 0x517f78, room.center.x + x, 0.58, room.center.z + 3.2, 0, 0, 0, 1.2, 0.7, 1);
  }
  room.root.add(meshOf(s));
}

function saloonInterior(game, room) {
  counter(game, room.root, room.center, 12, -4.5, 0x6c3429);
  const s = new Shape();
  shelf(s, room.center.x, room.center.z - 6.5, 0x4f7a62, PAL.brass);
  // Blackjack table and four working chairs.
  s.cyl(2.2, 2.2, 0.22, 16, 0x285a44, room.center.x, 0.88, room.center.z + 1.1);
  s.cyl(1.25, 1.55, 0.8, 10, PAL.woodDark, room.center.x, 0.42, room.center.z + 1.1);
  for (const [dx, dz, yaw] of [[-3.1, 0, Math.PI / 2], [3.1, 0, -Math.PI / 2], [-1.5, 2.7, Math.PI], [1.5, 2.7, Math.PI]]) {
    chair(s, room.center.x + dx, room.center.z + 1.1 + dz, yaw);
    room.points.push({ id: `saloon-seat-${dx}-${dz}`, label: 'Sit down', kind: 'seat', x: room.center.x + dx, z: room.center.z + 1.1 + dz, yaw });
  }
  // Piano and pot-belly stove.
  s.box(3.1, 1.65, 1.05, 0x342622, room.center.x - 6.8, 0.83, room.center.z - 2);
  s.box(3.25, 0.22, 1.18, 0x241a18, room.center.x - 6.8, 1.67, room.center.z - 2);
  s.box(2.8, 1.25, 0.12, 0x493026, room.center.x - 6.8, 2.15, room.center.z - 2.46);
  s.box(2.35, 0.5, 0.1, 0x2b201d, room.center.x - 6.8, 2.25, room.center.z - 2.38);
  for (let i = 0; i < 9; i++) s.box(0.25, 0.08, 0.65, i % 2 ? PAL.black : PAL.bone, room.center.x - 7.8 + i * 0.27, 1.25, room.center.z - 1.35);
  s.cyl(0.65, 0.75, 1.25, 10, PAL.iron, room.center.x + 6.7, 0.7, room.center.z - 1.5);
  s.cyl(0.18, 0.18, 2.4, 8, PAL.iron, room.center.x + 6.7, 2.45, room.center.z - 1.5);
  wallLantern(s, room.center.x - 3.8, 3.45, room.center.z - 6.6);
  wallLantern(s, room.center.x + 3.8, 3.45, room.center.z - 6.6);
  for (let i = -5; i <= 5; i++) {
    const h = 0.36 + Math.abs(i % 3) * 0.08;
    s.cyl(0.08, 0.11, h, 7, i % 2 ? 0x6f925e : 0xc4904b, room.center.x + i * 0.43, 1.34 + h / 2, room.center.z - 5.0);
    s.cyl(0.04, 0.04, 0.14, 6, PAL.brass, room.center.x + i * 0.43, 1.42 + h, room.center.z - 5.0);
  }
  room.root.add(meshOf(s));
  room.points.push({ id: 'blackjack', label: 'Play blackjack', kind: 'blackjack', x: room.center.x, z: room.center.z + 3.25 });
}

function stableInterior(game, room) {
  const s = new Shape();
  for (const x of [-5.8, 0, 5.8]) {
    s.box(5.2, 1.1, 0.18, PAL.wood, room.center.x + x, 0.58, room.center.z - 3.3);
    for (const dx of [-2.5, 2.5]) s.box(0.22, 3.5, 0.22, PAL.woodDark, room.center.x + x + dx, 1.75, room.center.z - 3.3);
  }
  horse(s, room.center.x, room.center.z - 5);
  for (let i = 0; i < 12; i++) s.box(0.04, 0.04, 1.7, 0xc3a65a, room.center.x - 6.5 + (i % 4) * 0.25, 0.45 + Math.floor(i / 4) * 0.1, room.center.z + 2.7, 0, i * 0.1);
  for (const x of [-6.2, 6.2]) {
    s.cyl(0.52, 0.52, 0.9, 10, 0xbd9149, room.center.x + x, 0.52, room.center.z - 4.8, 0, 0, Math.PI / 2);
    s.cyl(0.54, 0.54, 0.05, 10, 0x795b2e, room.center.x + x - 0.44, 0.52, room.center.z - 4.8, 0, 0, Math.PI / 2);
  }
  wallLantern(s, room.center.x, 3.45, room.center.z - 6.6);
  room.root.add(meshOf(s));
  counter(game, room.root, room.center, 4.5, 0.2, PAL.wood);
}

const detailBuilders = { guns: gunsInterior, doctor: doctorInterior, sheriff: sheriffInterior, maps: mapsInterior, clothes: clothesInterior, saloon: saloonInterior, stable: stableInterior };

const names = { guns: 'Otis Vale', doctor: 'Doctor Finch', sheriff: 'Sheriff Boone', maps: 'Elias Ward', clothes: 'Lena Pike', saloon: 'Mae Sullivan', stable: 'Tom Reed' };
const shirts = { guns: 0x6f3a2d, doctor: 0x56776f, sheriff: 0x746039, maps: 0x426c68, clothes: 0x855c75, saloon: 0x9b4d36, stable: 0x7e6a42 };

function shopkeeper(room, spec) {
  const look = { shirt: shirts[spec.kind], vest: PAL.woodDark, hat: 0xb49366, band: PAL.woodDark, pants: 0x494844 };
  const model = addRollPivot(makeCharacter(look));
  showGun(model, null); model.arm.rotation.x = 1.1;
  const keeperZ = spec.kind === 'stable' ? room.center.z - 0.75 : room.center.z - 4.2;
  const npc = { id: `${spec.id}-keeper`, name: names[spec.kind], label: names[spec.kind], kind: spec.kind,
    x: room.center.x, z: keeperZ, yaw: 0, model, animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
  model.root.position.set(npc.x, 0, npc.z); room.root.add(model.root);
  room.points.push(npc);
  room.npcs.push(npc);
}

export function buildInteriors(game, parent, sites) {
  const rooms = new Map();
  sites.forEach((spec, index) => {
    const root = new THREE.Group(), center = { x: ROOM_X, z: ROOM_Z[index] };
    root.visible = false; parent.add(root);
    const room = { id: spec.id, label: spec.label, center, root, points: [], npcs: [], site: spec };
    roomShell(game, root, center, spec.color);
    detailBuilders[spec.kind](game, room);
    shopkeeper(room, spec);
    rooms.set(spec.id, room);
  });
  return rooms;
}

export function updateInteriorNpcs(room, player, dt) {
  if (!room) return;
  for (const npc of room.npcs) {
    if (player && Math.hypot(player.x - npc.x, player.z - npc.z) < 4) {
      npc.yaw = turnToward(npc.yaw, Math.atan2(player.x - npc.x, player.z - npc.z), dt * 4);
    }
    npc.model.root.rotation.y = npc.yaw;
    npc.animation.dt = dt;
    animateCharacter(npc.model, npc.animation);
    npc.model.arm.rotation.x = 1.1;
  }
}
