// Saloon and livery stable layouts, the horse model, and seated patrons.
import * as THREE from 'three';
import { PAL, Shape } from './models.js';
import { patron } from './townsfolk.js';
import {
  FLOOR, barrel, bottle, chair, counter, frame, hayBale, mug, pad, place, roundTable, sack, saddle, shelfUnit,
  stool, wallLantern,
} from './furniture.js';

const BACK = -6.95, LEFT = -8.95, RIGHT = 8.95, R = Math.PI / 2;

function sideRail(kit, x0, x1, z) {
  const w = x1 - x0;
  kit.put((s) => {
    s.box(w, 0.1, 0.16, PAL.woodDark, 0, FLOOR + 1.0, 0);
    for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += 0.3) s.cyl(0.035, 0.035, 0.9, 5, PAL.woodLight, x, FLOOR + 0.5, 0);
    for (const x of [-w / 2, w / 2]) s.box(0.16, 1.15, 0.16, PAL.woodDark, x, FLOOR + 0.58, 0);
  }, (x0 + x1) / 2, z);
  kit.solid((x0 + x1) / 2, z, w / 2, 0.12);
}

/** Places a chair facing a table center and returns the seat point slightly behind the chair middle. */
function seatAround(kit, cx, cz, radius, angle, color) {
  const dx = Math.sin(angle) * radius, dz = Math.cos(angle) * radius, yaw = Math.atan2(-dx, -dz);
  kit.put((s) => chair(s, color), cx + dx, cz + dz, yaw);
  const back = 0.1;
  return { x: cx + dx - Math.sin(yaw) * back, z: cz + dz - Math.cos(yaw) * back, yaw };
}

const PATRONS = {
  ada: { shirt: 0x486a73, vest: 0x6b442d, hat: 0x9a7447, band: PAL.brass, pants: 0x3c4448, scarf: 0xb9a06a },
  wes: { shirt: 0x8b5338, vest: 0x2f2a27, hat: 0x3e3028, band: PAL.brass, pants: 0x514338 },
  hank: { shirt: 0x6f7c55, vest: 0x5b4127, hat: 0x6b5236, band: PAL.woodDark, pants: 0x3f3a34 },
  june: { shirt: 0x9e6971, vest: 0x4a3443, hat: 0xc7a983, band: 0x9e6971, pants: 0x4b4146 },
};

function saloon(kit) {
  const { put, solid, room } = kit, c = room.center;
  put((s) => counter(s, 11, 0x6c3429, 0x3d1f18), 0, -4.2); solid(0, -4.2, 5.65, 0.55);
  sideRail(kit, LEFT, -5.75, -4.2); sideRail(kit, 5.75, RIGHT, -4.2);
  // Bottles, glasses, a till and a tap keg along the bar.
  put((s) => {
    for (const [x, color] of [[-4.6, 0x6f925e], [-4.35, 0xc4904b], [-1.6, 0x6b3d24], [1.9, 0x6f925e]]) bottle(s, x, FLOOR + 1.1, -0.05, color);
    for (const x of [-3.8, -3.55, -1.1, 2.4, 2.65]) s.cyl(0.05, 0.04, 0.12, 6, 0xd8e4dc, x, FLOOR + 1.16, 0.1);
    s.box(0.62, 0.38, 0.42, PAL.brass, 3.9, FLOOR + 1.29, -0.08); s.box(0.5, 0.18, 0.2, 0x8a6a2c, 3.9, FLOOR + 1.52, -0.16);
    for (let i = 0; i < 4; i++) s.box(0.08, 0.06, 0.06, PAL.bone, 3.72 + i * 0.12, FLOOR + 1.45, 0.14);
  }, 0, -4.2);
  for (const x of [-4.4, -3.0, 2.6, 4.1]) put((s) => stool(s, 0.72, 0.21), x, -3.25);
  // Back bar with three shelves of bottles, a mirror and two kegs on cradles.
  put((s) => shelfUnit(s, 8.6, 2.5, 3, (sh, row, y) => {
    for (let i = 0; i < 16; i++) {
      if (row === 1 && i > 6 && i < 9) continue;
      const color = [0x6f925e, 0xc4904b, 0x6b3d24, 0x9a4b36, 0x4f6d4e][(i * 3 + row) % 5];
      bottle(sh, -3.95 + i * 0.53, y, 0.02, color, 0.32 + ((i + row) % 3) * 0.05);
    }
  }, 0x3d1f18), 0, BACK + 0.3); solid(0, BACK + 0.3, 4.3, 0.3, 0, 2.5);
  put((s) => { frame(s, 3.0, 1.0, 0x3d1f18, 0xa9c4c6, 3.4); s.box(3.2, 0.12, 0.12, PAL.brass, 0, 3.98, 0.06); }, 0, BACK + 0.02);
  for (const x of [-5.1, 5.1]) put((s) => {
    for (const z of [-0.28, 0.28]) s.box(0.95, 0.32, 0.12, PAL.woodDark, 0, FLOOR + 0.16, z);
    s.cyl(0.36, 0.36, 0.8, 10, PAL.wood, 0, FLOOR + 0.68, 0, 0, 0, R);
    for (const dx of [-0.3, 0.3]) s.cyl(0.38, 0.38, 0.05, 10, PAL.iron, dx, FLOOR + 0.68, 0, 0, 0, R);
    s.cyl(0.04, 0.04, 0.16, 5, PAL.brass, 0.44, FLOOR + 0.62, 0, 0, 0, R);
  }, x, -5.9);
  // Upright piano against the left wall with keys facing the room, and its stool.
  put((s) => {
    pad(s, 1.9, 1.1);
    s.box(1.64, 1.3, 0.6, 0x342622, 0, FLOOR + 0.65, -0.05);
    s.box(1.72, 0.08, 0.68, 0x241a18, 0, FLOOR + 1.34, -0.05);
    s.box(1.5, 0.06, 0.36, 0x241a18, 0, FLOOR + 0.78, 0.38);
    s.box(1.36, 0.04, 0.22, PAL.bone, 0, FLOOR + 0.82, 0.42);
    for (let i = 0; i < 9; i++) if (i % 7 !== 2 && i % 7 !== 6) s.box(0.07, 0.05, 0.12, PAL.black, -0.6 + i * 0.15, FLOOR + 0.85, 0.37);
    s.box(1.4, 0.48, 0.05, 0x493026, 0, FLOOR + 1.05, 0.26);
    s.box(0.7, 0.36, 0.03, 0xe8dcc0, 0, FLOOR + 1.12, 0.29, -0.2);
    for (const x of [-0.7, 0.7]) { s.box(0.1, 0.72, 0.1, 0x241a18, x, FLOOR + 0.36, 0.48); s.cyl(0.04, 0.05, 0.14, 6, PAL.brass, x * 0.85, FLOOR + 1.45, 0.1); }
    s.box(0.5, 0.07, 0.1, PAL.brass, 0, FLOOR + 0.12, 0.27);
    place(s, stool(new Shape(), 0.5, 0.24), 0, 0, 0.98);
  }, LEFT + 0.36, -1.3, R); solid(LEFT + 0.38, -1.3, 0.4, 0.88, 0, 1.4);
  // Pot-belly stove and wood box on the right.
  put((s) => {
    pad(s, 1.1, 1.1);
    s.cyl(0.42, 0.5, 0.95, 10, PAL.iron, 0, FLOOR + 0.62, 0);
    s.cyl(0.48, 0.48, 0.06, 10, 0x2b2725, 0, FLOOR + 1.12, 0); s.cyl(0.24, 0.3, 0.16, 8, PAL.iron, 0, FLOOR + 1.22, 0);
    for (let i = 0; i < 3; i++) s.cyl(0.05, 0.05, 0.16, 4, PAL.iron, Math.cos(i * 2.1) * 0.36, FLOOR + 0.08, Math.sin(i * 2.1) * 0.36);
    s.box(0.24, 0.18, 0.04, 0xff8a3a, 0, FLOOR + 0.55, 0.46);
    s.cyl(0.09, 0.09, 3.3, 6, PAL.iron, 0, FLOOR + 2.85, 0);
  }, 7.8, -0.8); solid(7.8, -0.8, 0.5, 0.5, 0, 1.2);
  put((s) => {
    s.box(1.0, 0.5, 0.6, PAL.woodDark, 0, FLOOR + 0.25, 0);
    for (let i = 0; i < 6; i++) s.cyl(0.07, 0.08, 0.8, 5, i % 2 ? PAL.wood : PAL.woodLight, -0.3 + (i % 3) * 0.2, FLOOR + 0.54 + Math.floor(i / 3) * 0.13, -0.1 + Math.floor(i / 3) * 0.16, 0, 0, R);
  }, 8.2, 0.85, -R); solid(8.2, 0.85, 0.32, 0.52, 0, 0.7);
  // Blackjack table: felt over a wood rail, chips, a dealer's rack and cards at each place.
  const tx = 0, tz = 0.9;
  put((s) => {
    s.cyl(1.7, 1.7, 0.012, 12, 0x5e3d24, 0, FLOOR + 0.012, 0);
    s.cyl(1.48, 1.48, 0.1, 12, PAL.woodDark, 0, FLOOR + 0.73, 0);
    s.cyl(1.28, 1.28, 0.04, 12, 0x285a44, 0, FLOOR + 0.79, 0);
    s.add(new THREE.TorusGeometry(1.38, 0.09, 5, 12), PAL.woodLight, 0, FLOOR + 0.79, 0, R);
    s.cyl(0.16, 0.22, 0.7, 8, PAL.woodDark, 0, FLOOR + 0.35, 0);
    for (let i = 0; i < 4; i++) s.box(0.14, 0.08, 1.3, PAL.woodDark, 0, FLOOR + 0.05, 0, 0, i * Math.PI / 4 * 2 + Math.PI / 4);
    s.box(1.1, 0.07, 0.3, PAL.woodDark, 0, FLOOR + 0.84, -0.95);
    for (let i = 0; i < 6; i++) s.cyl(0.06, 0.06, 0.07, 8, [PAL.red, PAL.brass, 0x4d6d72][i % 3], -0.44 + i * 0.176, FLOOR + 0.885, -0.95);
    for (const a of [-1.75, -0.6, 0.6, 1.75]) {
      const x = Math.sin(a) * 0.86, z = Math.cos(a) * 0.86;
      for (let k = 0; k < 2; k++) s.box(0.16, 0.012, 0.23, PAL.bone, x + k * 0.07, FLOOR + 0.817 + k * 0.004, z, 0, a + 0.15 * k);
      for (let k = 0; k < 3; k++) s.cyl(0.05, 0.05, 0.03, 8, [PAL.red, PAL.brass, 0x4d6d72][(k + Math.round(a * 3)) % 3], Math.sin(a) * 0.55, FLOOR + 0.82 + k * 0.032, Math.cos(a) * 0.55);
    }
    s.box(0.16, 0.012, 0.23, PAL.bone, -0.12, FLOOR + 0.817, -0.5, 0, 0.1);
    s.box(0.16, 0.012, 0.23, PAL.red, 0.1, FLOOR + 0.817, -0.5, 0, -0.1);
  }, tx, tz); solid(tx, tz, 1.25, 1.25, Math.PI / 4, 0.9);
  const seats = [-1.75, -0.6, 0.6, 1.75].map((angle) => seatAround(kit, tx, tz, 2.0, angle, PAL.wood));
  patron(room, 'Ada Crow', PATRONS.ada, seats[0].x, seats[0].z, seats[0].yaw, 0.4);
  patron(room, 'Wes Mercer', PATRONS.wes, seats[3].x, seats[3].z, seats[3].yaw, 3.6);
  for (const [i, seat] of [[1, seats[1]], [2, seats[2]]]) room.points.push({
    id: `blackjack-seat-${i}`, label: 'Blackjack', kind: 'blackjack',
    x: c.x + seat.x, z: c.z + seat.z, yaw: seat.yaw,
  });
  // Two drinking tables, each with a patron, a bottle and glasses.
  for (const [x, z, name, look, angles, phase] of [[5.4, 3.3, 'Hank Dillard', PATRONS.hank, [R + 0.3, -R + 0.3], 1.8], [-5.4, 3.3, 'June Hale', PATRONS.june, [-R - 0.3, R - 0.3], 5.0]]) {
    put((s) => { roundTable(s, 0.62, 0.76); bottle(s, 0.1, FLOOR + 0.76, -0.1, 0xc4904b); mug(s, -0.25, FLOOR + 0.76, 0.18, 0xd8e4dc); }, x, z);
    solid(x, z, 0.5, 0.5, 0, 0.8);
    const [first] = angles.map((angle) => seatAround(kit, x, z, 1.05, angle, PAL.woodDark));
    patron(room, name, look, first.x, first.z, first.yaw, phase);
  }
  put((s) => { s.cyl(0.18, 0.22, 0.28, 8, PAL.brass, 0, FLOOR + 0.14, 0); s.cyl(0.12, 0.12, 0.02, 8, 0x5a3a20, 0, FLOOR + 0.29, 0); }, -1.6, -3.2);
  put((s) => { s.cyl(0.18, 0.22, 0.28, 8, PAL.brass, 0, FLOOR + 0.14, 0); }, 1.4, -3.2);
  for (const x of [-7.2, 7.2]) put((s) => { frame(s, 1.5, 1.05, 0x3d1f18, x < 0 ? 0x9a6a3a : 0x5f6e57, 2.6); s.box(1.0, 0.25, 0.03, x < 0 ? 0xc49a5c : 0xd9c08c, 0, 2.45, 0.06, 0, 0, 0.1); }, x, BACK + 0.02);
  for (const x of [-4.4, 4.4]) put((s) => wallLantern(s, 2.9), x, BACK + 0.02);
}

/** A low-poly horse facing +z with feet on the floor. */
export function horse(s, coat = 0x704631, mane = 0x2a211c, tack = true) {
  const dark = new THREE.Color(coat).multiplyScalar(0.62).getHex(), sphere = () => new THREE.SphereGeometry(1, 9, 6);
  s.add(sphere(), coat, 0, 1.28, 0, 0, 0, 0, 0.4, 0.44, 0.92);
  s.add(sphere(), coat, 0, 1.32, 0.6, 0, 0, 0, 0.37, 0.43, 0.4);
  s.add(sphere(), coat, 0, 1.36, -0.6, 0, 0, 0, 0.41, 0.46, 0.44);
  s.cyl(0.15, 0.24, 0.85, 7, coat, 0, 1.74, 0.94, 0.72);
  s.box(0.22, 0.25, 0.6, coat, 0, 2.02, 1.38, 0.55);
  s.box(0.18, 0.18, 0.2, dark, 0, 1.87, 1.62, 0.55);
  for (const side of [-1, 1]) {
    s.cone(0.05, 0.16, 4, coat, side * 0.07, 2.27, 1.2, -0.2, 0, side * 0.2);
    s.box(0.02, 0.04, 0.05, PAL.black, side * 0.115, 2.08, 1.33);
  }
  s.box(0.07, 0.14, 0.86, mane, 0, 1.98, 0.84, -0.78);
  s.box(0.08, 0.06, 0.18, mane, 0, 2.2, 1.24, 0.3);
  s.cyl(0.1, 0.05, 0.95, 6, mane, 0, 1.0, -1.15, -0.32);
  for (const [x, z, hind] of [[-0.22, 0.62, false], [0.22, 0.62, false], [-0.22, -0.66, true], [0.22, -0.66, true]]) {
    s.cyl(0.1, 0.075, 0.55, 6, coat, x, 0.82, z + (hind ? -0.04 : 0), hind ? -0.12 : 0.04);
    s.cyl(0.055, 0.06, 0.48, 5, dark, x, 0.32, z + (hind ? 0.02 : 0));
    s.box(0.13, 0.1, 0.16, PAL.black, x, 0.05, z + 0.02 + (hind ? 0.02 : 0));
  }
  if (tack) {
    place(s, saddle(new Shape(), 1.82), 0, 0, 0.05, -R);
    s.box(0.25, 0.03, 0.03, 0x3d2418, 0, 1.94, 1.52, 0.55);
    for (const side of [-1, 1]) {
      s.box(0.02, 0.03, 0.42, 0x3d2418, side * 0.12, 2.04, 1.36, 0.55);
      s.box(0.02, 0.02, 0.9, 0x3d2418, side * 0.18, 1.82, 1.02, -0.3);
    }
  }
  return s;
}

function stable(kit) {
  const { put, solid } = kit;
  // Packed dirt and a few straw patches over the planks in the stall half.
  put((s) => {
    s.box(17.8, 0.02, 5.1, 0x8d6a45, 0, FLOOR + 0.01, 0);
    for (const [x, z, w, d, r] of [[-4.6, 0.6, 1.6, 1.0, 0.3], [0.8, 0.2, 1.2, 0.8, -0.5], [4.1, 1.4, 1.5, 0.9, 0.9]]) s.box(w, 0.02, d, 0xc7a95e, x, FLOOR + 0.022, z, 0, r);
  }, 0, -4.4);
  // Three stalls: partitions from the back wall, a low front panel and a hinged gate each.
  for (const x of [-7.2, -2.4, 2.4, 7.2]) {
    put((s) => {
      for (const z of [-2.52, 2.52]) s.box(0.18, 1.7, 0.18, PAL.woodDark, 0, FLOOR + 0.85, z);
      for (let y = 0.2; y < 1.4; y += 0.32) s.box(0.08, 0.28, 5.0, y > 1 ? PAL.woodLight : PAL.wood, 0, FLOOR + y + 0.14, 0);
      s.box(0.14, 0.1, 5.1, PAL.woodDark, 0, FLOOR + 1.52, 0);
    }, x, -4.43);
    solid(x, -4.43, 0.1, 2.52, 0, 1.6);
  }
  for (const [x, open] of [[-4.8, false], [0, false], [4.8, false]]) {
    put((s) => {
      for (const side of [-1, 1]) {
        s.box(1.0, 1.1, 0.08, PAL.wood, side * 1.82, FLOOR + 0.6, 0);
        s.box(1.0, 0.1, 0.14, PAL.woodDark, side * 1.82, FLOOR + 1.18, 0);
      }
      for (const y of [0.25, 0.65, 1.05]) s.box(2.5, 0.16, 0.08, PAL.woodLight, 0, FLOOR + y, 0.02);
      for (const gx of [-1.25, 1.25]) s.box(0.12, 1.25, 0.12, PAL.woodDark, gx, FLOOR + 0.62, 0.02);
      s.box(2.7, 0.14, 0.05, PAL.woodDark, 0, FLOOR + 0.65, 0.07, 0, 0, open ? 0 : 0.42);
      for (const y of [0.3, 1.0]) s.box(0.14, 0.06, 0.1, PAL.iron, -1.2, FLOOR + y, 0.08);
      s.box(0.06, 0.14, 0.12, PAL.iron, 1.18, FLOOR + 0.8, 0.1);
    }, x, -1.92);
    solid(x, -1.92, 2.3, 0.1, 0, 1.3);
  }
  // Mangers and water buckets in each stall.
  for (const x of [-4.8, 0, 4.8]) put((s) => {
    s.box(1.4, 0.5, 0.5, PAL.woodDark, 0, FLOOR + 0.9, 0.25); s.box(1.25, 0.12, 0.38, 0xcfae5c, 0, FLOOR + 1.12, 0.26);
    s.cyl(0.2, 0.17, 0.34, 8, PAL.wood, 1.4, FLOOR + 0.17, 0.4); s.cyl(0.21, 0.21, 0.04, 8, PAL.iron, 1.4, FLOOR + 0.3, 0.4);
  }, x, BACK);
  // The saddled horse waits in the middle stall; a second horse eats in the right stall.
  put((s) => horse(s, 0x704631, 0x2a211c, true), 0, -4.35);
  put((s) => horse(s, 0x9c7a55, 0xe7dcc6, false), 4.75, -4.1, Math.PI + 0.12);
  solid(0, -4.35, 0.45, 1.3, 0, 2); solid(4.75, -4.1, 0.45, 1.3, 0.12, 2);
  put((s) => { hayBale(s, 1.1, 0.48, 0.6); place(s, hayBale(new Shape(), 1.1, 0.48, 0.6, FLOOR + 0.48), 0.15, 0, 0.05, 0.12); }, -4.8, -4.3, 0.4);
  // Tack wall along the left aisle: bridles and coiled ropes on pegs.
  put((s) => {
    s.box(0.06, 0.12, 4.4, PAL.woodDark, 0, 2.1, 0);
    for (let i = 0; i < 4; i++) {
      const z = -1.6 + i * 1.05;
      s.box(0.12, 0.06, 0.06, PAL.iron, 0.06, 2.1, z);
      if (i % 2) s.add(new THREE.TorusGeometry(0.2, 0.035, 4, 10), 0xc7a46a, 0.1, 1.85, z, 0, R);
      else { s.box(0.04, 0.6, 0.04, 0x3d2418, 0.1, 1.8, z - 0.07); s.box(0.04, 0.6, 0.04, 0x3d2418, 0.1, 1.8, z + 0.07); s.box(0.05, 0.05, 0.22, PAL.iron, 0.1, 1.5, z); }
    }
  }, LEFT + 0.02, -4.4);
  put((s) => {
    for (const z of [-0.5, 0.5]) { s.box(0.7, 0.75, 0.85, PAL.wood, 0, FLOOR + 0.38, z); s.box(0.76, 0.06, 0.9, PAL.woodDark, 0, FLOOR + 0.78, z); }
    s.box(0.04, 1.7, 0.04, PAL.woodLight, 0.25, FLOOR + 0.85, 1.15, 0.12); for (let i = 0; i < 3; i++) s.box(0.02, 0.32, 0.02, PAL.iron, 0.25 + (i - 1) * 0.05, FLOOR + 1.85, 1.27, 0.12);
  }, RIGHT - 0.5, -5.2); solid(RIGHT - 0.5, -5.2, 0.4, 0.95, 0, 0.9);
  // Front zone: tack counter, saddle rack, hay, feed and a water trough.
  put((s) => {
    counter(s, 3.0, PAL.wood, PAL.woodDark);
    s.box(0.42, 0.04, 0.32, 0x6b3d24, -0.8, FLOOR + 1.12, 0.05); s.box(0.38, 0.02, 0.28, PAL.canvas, -0.8, FLOOR + 1.145, 0.05);
    for (let i = 0; i < 3; i++) s.add(new THREE.TorusGeometry(0.08, 0.02, 4, 8, Math.PI * 1.4), PAL.iron, 0.4 + i * 0.22, FLOOR + 1.115, 0.1, R);
  }, 5.6, 1.9); solid(5.6, 1.9, 1.6, 0.55);
  put((s) => {
    for (const x of [-0.4, 0.4]) for (const side of [-1, 1]) s.box(0.06, 1.0, 0.06, PAL.woodDark, x, FLOOR + 0.45, side * 0.24, side * 0.25);
    s.box(1.0, 0.1, 0.12, PAL.woodDark, 0, FLOOR + 0.9, 0);
    place(s, saddle(new Shape(), FLOOR + 1.06), 0, 0, 0);
  }, -4.3, 1.6, 0.25); solid(-4.3, 1.6, 0.55, 0.4, 0.25, 1.1);
  put((s) => {
    hayBale(s); place(s, hayBale(new Shape()), 0, 0, 0.66, 0.04); place(s, hayBale(new Shape(), 1.1, 0.48, 0.6, FLOOR + 0.48), 0.05, 0, 0.33, -0.06);
  }, -7.6, 3.2, R); solid(-7.6, 3.4, 0.7, 0.62, 0, 1);
  put((s) => { s.box(0.04, 1.8, 0.04, PAL.woodLight, 0, FLOOR + 0.9, 0, 0, 0, 0.18); for (let i = 0; i < 3; i++) s.box(0.02, 0.32, 0.02, PAL.iron, 0.17 + (i - 1) * 0.05, FLOOR + 1.82, 0, 0, 0, 0.18); }, LEFT + 0.3, 1.5);
  for (const [x, z] of [[-5.9, 4.6], [-6.5, 5.1], [-5.4, 5.3]]) put((s) => sack(s), x, z, x);
  put((s) => {
    pad(s, 0.9, 2.6);
    s.box(0.7, 0.55, 2.4, PAL.woodDark, 0, FLOOR + 0.42, 0); s.box(0.56, 0.05, 2.26, PAL.water, 0, FLOOR + 0.62, 0);
    for (const z of [-1.0, 1.0]) s.box(0.8, 0.16, 0.16, PAL.wood, 0, FLOOR + 0.08, z);
  }, RIGHT - 0.5, 4.4); solid(RIGHT - 0.5, 4.4, 0.36, 1.22, 0, 0.8);
  put((s) => { barrel(s, 0.34, 0.9); }, 3.4, 4.9);
  put((s) => { for (let i = 0; i < 5; i++) s.add(new THREE.TorusGeometry(0.11, 0.03, 4, 8, Math.PI * 1.4), PAL.iron, -0.6 + i * 0.3, 2.6, 0.05, 0, 0, -Math.PI * 0.7); }, 0, BACK + 0.02);
  for (const x of [-2.4, 2.4]) put((s) => wallLantern(s, 2.8), x, BACK + 0.02);
}

export const SOCIAL_ROOMS = {
  saloon: { build: saloon, keeper: { x: 0, z: -5.25 }, windows: [{ wall: 'left', at: 3.2 }, { wall: 'right', at: 3.4 }] },
  stable: { build: stable, keeper: { x: 5.6, z: 0.85 }, windows: [{ wall: 'right', at: 1.6, y: 2.6 }] },
};
