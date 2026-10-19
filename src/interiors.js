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
  s.box(5.8, 0.04, 3.5, 0x8a4938, center.x, 0.2, center.z + 0.7);
  for (const x of [-2.82, 2.82]) s.box(0.08, 0.025, 3.3, 0xc18a54, center.x + x, 0.23, center.z + 0.7);
  for (const z of [-0.98, 2.38]) s.box(5.7, 0.025, 0.08, 0xc18a54, center.x, 0.23, center.z + z);
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
  const point = (lx, lz) => ({
    x: x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
    z: z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
  });
  shape.box(0.82, 0.13, 0.72, color, x, 0.62, z, 0, yaw);
  for (const lx of [-0.29, 0.29]) {
    const back = point(lx, -0.3), front = point(lx, 0.27);
    shape.cyl(0.055, 0.075, 1.5, 7, PAL.woodDark, back.x, 1.15, back.z);
    shape.cyl(0.05, 0.07, 0.68, 7, PAL.woodDark, front.x, 0.32, front.z);
  }
  const back = point(0, -0.31);
  for (const y of [0.92, 1.2, 1.47]) shape.box(0.68, 0.1, 0.09, y === 1.2 ? color : PAL.woodLight, back.x, y, back.z, 0, yaw);
}

function localPoint(x, z, lx, lz, yaw) {
  return { x: x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: z - Math.sin(yaw) * lx + Math.cos(yaw) * lz };
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
  shape.add(new THREE.SphereGeometry(1, 10, 6), coat, x, 1.55, z, 0, 0, 0, 0.68, 0.74, 1.5);
  shape.add(new THREE.SphereGeometry(1, 9, 6), coat, x, 2.12, z + 1.02, -0.36, 0, 0, 0.48, 0.82, 0.5);
  shape.add(new THREE.SphereGeometry(1, 9, 6), coat, x, 2.65, z + 1.52, -0.18, 0, 0, 0.45, 0.44, 0.62);
  shape.add(new THREE.SphereGeometry(1, 8, 5), dark, x, 2.54, z + 1.92, 0, 0, 0, 0.38, 0.25, 0.42);
  for (const side of [-1, 1]) {
    shape.cone(0.14, 0.5, 6, coat, x + side * 0.2, 3.13, z + 1.48, side * 0.08, 0, side * 0.16);
    for (const dz of [-0.85, 0.82]) {
      shape.cyl(0.11, 0.16, 1.35, 7, coat, x + side * 0.38, 0.74, z + dz);
      shape.box(0.25, 0.18, 0.38, dark, x + side * 0.38, 0.1, z + dz + 0.06);
    }
  }
  shape.box(0.15, 1.2, 0.18, mane, x, 2.36, z + 0.68, -0.5);
  shape.cone(0.22, 1.25, 7, mane, x, 1.5, z - 1.65, -0.92);
  shape.box(1.18, 0.2, 0.9, mane, x, 1.95, z - 0.05);
  shape.box(1.08, 0.12, 1.15, 0x9a6337, x, 2.08, z - 0.05);
  shape.cyl(0.055, 0.055, 1.2, 7, PAL.brass, x, 1.55, z + 0.48, 0, 0, Math.PI / 2);
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
  const crateX = room.center.x - 6.7, crateZ = room.center.z + 3.5;
  s.box(1.3, 1.3, 1.3, PAL.plank, crateX, 0.72, crateZ);
  for (const dx of [-0.57, 0.57]) for (const dz of [-0.57, 0.57]) s.box(0.13, 1.42, 0.13, PAL.woodDark, crateX + dx, 0.72, crateZ + dz);
  for (const y of [0.12, 1.32]) {
    s.box(1.4, 0.13, 0.13, PAL.woodDark, crateX, y, crateZ + 0.59);
    s.box(0.13, 0.13, 1.4, PAL.woodDark, crateX - 0.59, y, crateZ);
  }
  s.box(1.55, 0.11, 0.12, PAL.woodDark, crateX, 0.72, crateZ + 0.67, 0, 0, Math.PI / 4);
  wallLantern(s, room.center.x, 3.45, room.center.z - 6.6);
  for (const x of [-6.9, -5.7, 5.7, 6.9]) s.cyl(0.22, 0.25, 0.72, 8, PAL.iron, room.center.x + x, 0.58, room.center.z - 5.8);
  room.root.add(meshOf(s));
}

function doctorInterior(game, room) {
  counter(game, room.root, room.center, 6, -3.6, 0xc7b898);
  const s = new Shape();
  shelf(s, room.center.x + 5.8, room.center.z - 6.4, 0x537c73, PAL.canvas);
  const bedX = room.center.x - 5.5, bedZ = room.center.z + 0.25;
  s.box(2.2, 0.18, 4.5, PAL.woodDark, bedX, 0.72, bedZ);
  s.box(1.92, 0.28, 4.15, 0xd8ccb2, bedX, 0.91, bedZ);
  s.box(1.55, 0.22, 0.88, 0xeee2c8, bedX, 1.13, bedZ - 1.5);
  for (const dx of [-0.86, 0.86]) for (const dz of [-1.9, 1.9]) s.cyl(0.1, 0.14, 0.72, 7, PAL.wood, bedX + dx, 0.36, bedZ + dz);
  s.box(2.35, 1.35, 0.18, PAL.woodDark, bedX, 1.02, bedZ - 2.18);
  const basinX = room.center.x + 5.8, basinZ = room.center.z + 2.7;
  s.box(1.65, 0.14, 1.25, PAL.wood, basinX, 0.74, basinZ);
  for (const dx of [-0.66, 0.66]) for (const dz of [-0.46, 0.46]) s.cyl(0.07, 0.09, 0.7, 7, PAL.woodDark, basinX + dx, 0.36, basinZ + dz);
  s.add(new THREE.TorusGeometry(0.48, 0.09, 6, 12), PAL.canvas, basinX, 0.92, basinZ, Math.PI / 2);
  s.cyl(0.39, 0.39, 0.04, 12, 0x668d8c, basinX, 0.9, basinZ);
  s.box(0.75, 0.85, 0.08, PAL.woodDark, basinX, 1.18, basinZ - 0.56);
  s.box(0.55, 0.62, 0.06, 0x8aa3a1, basinX, 1.2, basinZ - 0.61);
  for (let i = 0; i < 4; i++) s.cyl(0.18, 0.2, 0.55, 8, i % 2 ? 0x587c5d : PAL.brass, room.center.x - 1.5 + i * 0.7, 1.5, room.center.z - 6.65);
  wallLantern(s, room.center.x - 3.4, 3.45, room.center.z - 6.6);
  for (let i = 0; i < 3; i++) s.add(new THREE.SphereGeometry(0.22, 7, 5), i % 2 ? 0x8d3941 : 0xe1d0a5, room.center.x + 2.3 + i * 0.45, 1.38, room.center.z - 3.3, 0, 0, 0, 1, 0.7, 1);
  room.root.add(meshOf(s));
  game.physics.fixedBox(bedX, 0.75, bedZ, 1.12, 0.75, 2.28, 0, GROUPS.world);
}

function sheriffInterior(game, room) {
  counter(game, room.root, room.center, 5.5, -2.7, 0x66523b);
  const s = new Shape();
  const cellFront = room.center.z - 3.18, cellSide = room.center.x - 4.3;
  s.box(4.45, 0.08, 3.4, 0x514037, room.center.x - 6.5, 0.23, room.center.z - 4.9);
  for (const dx of [-8.2, -7.35, -6.5, -5.65, -4.8]) s.box(0.12, 3.8, 0.15, PAL.iron, room.center.x + dx, 1.9, cellFront);
  for (const dz of [-6.45, -5.65, -4.85, -4.05, -3.25]) s.box(0.15, 3.8, 0.12, PAL.iron, cellSide, 1.9, room.center.z + dz);
  s.box(4.5, 0.14, 0.18, PAL.iron, room.center.x - 6.5, 0.42, cellFront);
  s.box(4.5, 0.14, 0.18, PAL.iron, room.center.x - 6.5, 3.68, cellFront);
  s.box(0.18, 0.14, 3.45, PAL.iron, cellSide, 3.68, room.center.z - 4.9);
  s.box(2.7, 0.16, 1.05, PAL.woodDark, room.center.x - 6.55, 0.48, room.center.z - 5.45);
  s.box(2.45, 0.18, 0.85, PAL.canvasDark, room.center.x - 6.55, 0.65, room.center.z - 5.45);
  s.box(3.9, 0.18, 1.35, PAL.wood, room.center.x + 4.8, 0.78, room.center.z + 1.7);
  s.box(3.55, 0.55, 1.08, 0x66523b, room.center.x + 4.8, 0.48, room.center.z + 1.7);
  for (const x of [3.4, 6.2]) s.box(0.12, 0.72, 0.7, PAL.woodDark, room.center.x + x, 0.36, room.center.z + 1.7);
  s.box(1.6, 0.08, 1.15, PAL.canvas, room.center.x + 1.2, 1.18, room.center.z - 2.7);
  wallLantern(s, room.center.x, 3.5, room.center.z - 6.6);
  s.cyl(0.42, 0.5, 0.18, 8, PAL.brass, room.center.x + 5.9, 1.05, room.center.z + 1.7);
  s.cone(0.34, 0.32, 8, PAL.brass, room.center.x + 5.9, 1.3, room.center.z + 1.7);
  room.root.add(meshOf(s));
  game.physics.fixedBox(room.center.x - 6.5, 1.9, cellFront, 2.25, 1.9, 0.12, 0, GROUPS.world);
  game.physics.fixedBox(cellSide, 1.9, room.center.z - 4.9, 0.12, 1.9, 1.72, 0, GROUPS.world);
  game.physics.fixedBox(room.center.x + 4.8, 0.8, room.center.z + 1.7, 2, 0.8, 0.72, 0, GROUPS.world);
}

function mapsInterior(game, room) {
  counter(game, room.root, room.center, 7, -3, 0x315553);
  const s = new Shape();
  for (const x of [-6, -3, 0, 3, 6]) {
    s.cyl(0.2, 0.2, 2.4, 10, PAL.canvas, room.center.x + x, 1.2, room.center.z - 6.5, 0, 0, Math.PI / 2);
    s.cyl(0.24, 0.24, 0.06, 10, PAL.woodDark, room.center.x + x - 1.2, 1.2, room.center.z - 6.5, 0, 0, Math.PI / 2);
  }
  const tableX = room.center.x - 2.8, tableZ = room.center.z + 1.05, tableYaw = 0;
  s.box(5.2, 0.2, 2.8, PAL.woodDark, tableX, 0.92, tableZ);
  s.box(4.88, 0.11, 2.5, 0xd8c18c, tableX, 1.08, tableZ);
  for (const dx of [-2.15, 2.15]) for (const dz of [-1, 1]) {
    const leg = localPoint(tableX, tableZ, dx, dz, tableYaw);
    s.cyl(0.11, 0.16, 0.9, 7, PAL.wood, leg.x, 0.46, leg.z);
  }
  for (let i = -2; i <= 2; i++) {
    const line = localPoint(tableX, tableZ, i * 0.86, 0, tableYaw);
    s.box(0.045, 0.035, 2.15, i ? PAL.wood : PAL.red, line.x, 1.15, line.z);
  }
  for (const dz of [-0.92, 0.92]) {
    const rail = localPoint(tableX, tableZ, 0, dz, tableYaw);
    s.cyl(0.1, 0.1, 4.35, 10, PAL.woodLight, rail.x, 1.18, rail.z, 0, 0, Math.PI / 2);
  }
  s.cyl(0.32, 0.32, 0.08, 14, PAL.brass, tableX + 1.6, 1.22, tableZ - 0.7);
  s.cone(0.22, 0.32, 4, PAL.red, tableX + 1.6, 1.28, tableZ - 0.7, 0, Math.PI / 4);
  wallLantern(s, room.center.x + 3.6, 3.45, room.center.z - 6.6);
  s.cyl(0.52, 0.52, 0.18, 12, PAL.brass, room.center.x + 5.6, 1.3, room.center.z - 3.1, Math.PI / 2);
  s.cyl(0.06, 0.06, 2.4, 8, PAL.iron, room.center.x + 5.6, 1.3, room.center.z - 2.0, Math.PI / 2);
  room.root.add(meshOf(s));
  game.physics.fixedBox(tableX, 0.9, tableZ, 2.65, 0.9, 1.45, 0, GROUPS.world);
}

function clothesInterior(game, room) {
  counter(game, room.root, room.center, 7.5, -3.2, 0x704f66);
  const s = new Shape();
  shelf(s, room.center.x - 5.6, room.center.z - 6.4, 0x9e5b58, 0x4d6d72);
  shelf(s, room.center.x + 5.6, room.center.z - 6.4, 0xc49362, 0x765077);
  for (const [x, z, color] of [[-6.6, 1.2, 0x4f7370], [6.6, 1.2, 0x9a5b63], [-6.6, 4.1, 0xb98255]]) {
    s.cyl(0.09, 0.09, 2.3, 8, PAL.woodDark, room.center.x + x, 1.15, room.center.z + z);
    s.cone(0.72, 1.5, 6, color, room.center.x + x, 1.9, room.center.z + z);
    s.cyl(0.28, 0.28, 0.08, 8, PAL.wood, room.center.x + x, 2.75, room.center.z + z);
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
  const tableX = room.center.x, tableZ = room.center.z + 1.1;
  // A low-poly card table with a wood rail, felt inset, chips, cards, and four legs.
  s.cyl(2.42, 2.42, 0.18, 12, PAL.woodDark, tableX, 0.84, tableZ);
  s.cyl(2.18, 2.18, 0.09, 12, 0x285a44, tableX, 0.96, tableZ);
  s.add(new THREE.TorusGeometry(2.28, 0.13, 6, 12), PAL.woodLight, tableX, 1.01, tableZ, Math.PI / 2);
  for (const [dx, dz] of [[-1.05, -0.82], [1.05, -0.82], [-1.05, 0.82], [1.05, 0.82]]) {
    s.cyl(0.18, 0.25, 0.82, 7, PAL.woodDark, tableX + dx, 0.42, tableZ + dz);
    s.box(0.55, 0.12, 0.12, PAL.brass, tableX + dx * 0.65, 0.35, tableZ + dz * 0.65, 0, Math.atan2(dx, dz));
  }
  for (const [x, z, color, count] of [[-0.55, -0.5, PAL.red, 3], [0.55, -0.5, PAL.brass, 2], [-0.8, 0.48, 0x4d6d72, 2]]) {
    for (let i = 0; i < count; i++) s.cyl(0.13, 0.13, 0.055, 10, color, tableX + x, 1.07 + i * 0.056, tableZ + z);
  }
  for (const [x, z, yaw] of [[-0.22, -0.85, -0.08], [0.22, -0.78, 0.12], [-0.3, 0.72, 0.08], [0.24, 0.8, -0.1]]) {
    s.box(0.34, 0.025, 0.48, PAL.bone, tableX + x, 1.075, tableZ + z, 0, yaw);
    s.box(0.22, 0.015, 0.32, x < 0 ? PAL.red : PAL.black, tableX + x, 1.093, tableZ + z, 0, yaw);
  }
  s.box(1.3, 0.07, 0.46, PAL.woodDark, tableX, 1.075, tableZ - 1.18);
  for (let i = -2; i <= 2; i++) s.cyl(0.09, 0.09, 0.06, 8, i % 2 ? PAL.red : PAL.brass, tableX + i * 0.2, 1.145, tableZ - 1.18);

  const chairs = [[-3.1, 0, Math.PI / 2, true], [3.1, 0, -Math.PI / 2, true], [-1.5, 2.7, Math.PI, false], [1.5, 2.7, Math.PI, false]];
  for (const [dx, dz, yaw, occupied] of chairs) {
    const x = tableX + dx, z = tableZ + dz;
    chair(s, x, z, yaw);
    if (occupied) saloonPatron(room, x, z, yaw, dx < 0 ? 'Ada Crow' : 'Wes Mercer', dx < 0);
    else room.points.push({ id: `saloon-seat-${dx}-${dz}`, label: 'Sit down', kind: 'seat', x, z, yaw });
  }

  // Upright piano against the side wall, with a stool and visible keys.
  const pianoX = room.center.x - 8.38, pianoZ = room.center.z - 2.1;
  s.box(3.35, 1.48, 0.78, 0x342622, pianoX, 0.76, pianoZ, 0, Math.PI / 2);
  s.box(3.3, 1.72, 0.42, 0x493026, pianoX - 0.19, 1.72, pianoZ, 0, Math.PI / 2);
  s.box(3.5, 0.2, 0.72, 0x241a18, pianoX + 0.2, 1.62, pianoZ, 0, Math.PI / 2);
  s.box(2.62, 0.7, 0.08, 0x2b201d, pianoX + 0.23, 2.05, pianoZ, 0, Math.PI / 2);
  s.box(2.24, 0.42, 0.06, 0x5d3928, pianoX + 0.28, 2.05, pianoZ, 0, Math.PI / 2);
  for (let i = 0; i < 11; i++) {
    const z = pianoZ - 1.32 + i * 0.264;
    s.box(0.23, 0.075, 0.58, PAL.bone, pianoX + 0.46, 1.52, z, 0, Math.PI / 2);
    if ([0, 1, 3, 4, 6, 8, 9].includes(i)) s.box(0.13, 0.1, 0.36, PAL.black, pianoX + 0.5, 1.6, z + 0.105, 0, Math.PI / 2);
  }
  for (const z of [pianoZ - 1.28, pianoZ + 1.28]) s.box(0.22, 1.42, 0.22, PAL.woodDark, pianoX + 0.38, 0.73, z);
  s.box(0.46, 0.08, 0.16, PAL.brass, pianoX + 0.56, 0.23, pianoZ, 0, Math.PI / 2);
  s.cyl(0.62, 0.62, 0.16, 10, PAL.woodLight, room.center.x - 6.7, 0.7, pianoZ);
  for (const z of [pianoZ - 0.32, pianoZ + 0.32]) s.cyl(0.08, 0.11, 0.65, 7, PAL.woodDark, room.center.x - 6.7, 0.34, z);

  // Pot-belly stove.
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
  room.points.push({ id: 'blackjack', label: 'Blackjack', kind: 'blackjack', x: room.center.x, z: room.center.z + 3.25 });
}

function saloonPatron(room, x, z, yaw, name, blueShirt) {
  const look = { shirt: blueShirt ? 0x486a73 : 0x8b5338, vest: blueShirt ? 0x6b442d : 0x4b3b31,
    hat: blueShirt ? 0x9a7447 : 0x3e3028, band: PAL.brass, pants: blueShirt ? 0x3c4448 : 0x514338 };
  const model = addRollPivot(makeCharacter(look));
  showGun(model, null);
  const mug = new Shape();
  mug.cyl(0.12, 0.14, 0.24, 8, PAL.brass, 0.34, 1.08, 0.48);
  mug.cyl(0.105, 0.105, 0.03, 8, 0xb8652f, 0.34, 1.195, 0.48);
  mug.add(new THREE.TorusGeometry(0.12, 0.035, 5, 8), PAL.brass, 0.45, 1.08, 0.48);
  model.root.add(meshOf(mug));
  const npc = { id: `saloon-patron-${name.toLowerCase().replace(/\s+/g, '-')}`, name, x, z, yaw, seated: true, model,
    animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
  model.root.position.set(x, 0, z);
  room.root.add(model.root);
  room.npcs.push(npc);
}

function stableInterior(game, room) {
  const s = new Shape();
  for (const x of [-6, -2, 2, 6]) {
    s.box(0.18, 1.35, 5.4, PAL.wood, room.center.x + x, 0.72, room.center.z - 3.25);
    s.box(0.22, 3.5, 0.22, PAL.woodDark, room.center.x + x, 1.75, room.center.z - 5.9);
    s.box(0.22, 2.2, 0.22, PAL.woodDark, room.center.x + x, 1.1, room.center.z - 0.6);
    game.physics.fixedBox(room.center.x + x, 0.72, room.center.z - 3.25, 0.1, 0.72, 2.7, 0, GROUPS.world);
  }
  for (const x of [-4, 0, 4]) {
    s.box(3.65, 0.16, 0.18, PAL.woodLight, room.center.x + x, 0.45, room.center.z - 0.58);
    s.box(3.65, 0.16, 0.18, PAL.woodLight, room.center.x + x, 1.08, room.center.z - 0.58);
    game.physics.fixedBox(room.center.x + x, 0.75, room.center.z - 0.58, 1.82, 0.75, 0.1, 0, GROUPS.world);
  }
  horse(s, room.center.x, room.center.z - 3.75);
  for (let i = 0; i < 12; i++) s.box(0.04, 0.04, 1.7, 0xc3a65a, room.center.x - 6.5 + (i % 4) * 0.25, 0.45 + Math.floor(i / 4) * 0.1, room.center.z + 2.7, 0, i * 0.1);
  for (const x of [-6.2, 6.2]) {
    s.cyl(0.52, 0.52, 0.9, 10, 0xbd9149, room.center.x + x, 0.52, room.center.z - 4.8, 0, 0, Math.PI / 2);
    s.cyl(0.54, 0.54, 0.05, 10, 0x795b2e, room.center.x + x - 0.44, 0.52, room.center.z - 4.8, 0, 0, Math.PI / 2);
  }
  wallLantern(s, room.center.x, 3.45, room.center.z - 6.6);
  room.root.add(meshOf(s));
  counter(game, room.root, room.center, 4.5, 2.65, PAL.wood);
}

const detailBuilders = { guns: gunsInterior, doctor: doctorInterior, sheriff: sheriffInterior, maps: mapsInterior, clothes: clothesInterior, saloon: saloonInterior, stable: stableInterior };

const names = { guns: 'Otis Vale', doctor: 'Doctor Finch', sheriff: 'Sheriff Boone', maps: 'Elias Ward', clothes: 'Lena Pike', saloon: 'Mae Sullivan', stable: 'Tom Reed' };
const shirts = { guns: 0x6f3a2d, doctor: 0x56776f, sheriff: 0x746039, maps: 0x426c68, clothes: 0x855c75, saloon: 0x9b4d36, stable: 0x7e6a42 };

function shopkeeper(room, spec) {
  const look = { shirt: shirts[spec.kind], vest: PAL.woodDark, hat: 0xb49366, band: PAL.woodDark, pants: 0x494844 };
  const model = addRollPivot(makeCharacter(look));
  showGun(model, null); model.arm.rotation.x = 1.1;
  const keeperOffset = { guns: -3.75, doctor: -4.45, sheriff: -3.65, maps: -4.05, clothes: -4.15, saloon: -5.25, stable: 1.7 };
  const keeperZ = room.center.z + keeperOffset[spec.kind];
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
    if (!npc.seated && player && Math.hypot(player.x - npc.x, player.z - npc.z) < 4) {
      npc.yaw = turnToward(npc.yaw, Math.atan2(player.x - npc.x, player.z - npc.z), dt * 4);
    }
    npc.model.root.rotation.y = npc.yaw;
    npc.animation.dt = dt;
    animateCharacter(npc.model, npc.animation);
    if (npc.seated) {
      npc.model.legs[0].rotation.x = -1.25;
      npc.model.legs[1].rotation.x = -1.25;
      npc.model.body.position.y = -0.2;
      npc.model.arm.rotation.x = 0.62;
    } else {
      npc.model.body.position.y = 0;
      npc.model.arm.rotation.x = 1.1;
    }
  }
}
