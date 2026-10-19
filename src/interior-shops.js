// Layouts for the five trade shops. Each room has an entry zone at the front,
// a customer zone in the middle and a service zone behind the counter.
// Local coordinates: x across the room (±8.95 inside), z from the back wall
// (-6.95) to the door (+7.25).
import * as THREE from 'three';
import { PAL } from './models.js';
import {
  FLOOR, barrel, bolt, bottle, chair, counter, crate, dressForm, folded, frame, hatStand, jar, longGun, pad,
  pistol, poster, shelfUnit, stool, table, wallLantern,
} from './furniture.js';

const BACK = -6.95, LEFT = -8.95, RIGHT = 8.95;
const R = Math.PI / 2;

function runner(s, w, d, color, border) {
  s.box(w, 0.02, d, border, 0, FLOOR + 0.02, 0);
  s.box(w - 0.24, 0.024, d - 0.24, color, 0, FLOOR + 0.024, 0);
  for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) s.box(w - 0.5, 0.027, 0.06, border, 0, FLOOR + 0.026, z);
}

function rail(kit, x0, x1, z) {
  // A low service rail with turned balusters closes the gap beside a counter.
  const w = x1 - x0;
  kit.put((s) => {
    s.box(w, 0.1, 0.16, PAL.woodDark, 0, FLOOR + 1.0, 0);
    s.box(w, 0.08, 0.12, PAL.woodDark, 0, FLOOR + 0.12, 0);
    for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += 0.3) s.cyl(0.035, 0.035, 0.86, 5, PAL.woodLight, x, FLOOR + 0.56, 0);
    for (const x of [-w / 2, w / 2]) s.box(0.16, 1.15, 0.16, PAL.woodDark, x, FLOOR + 0.58, 0);
  }, (x0 + x1) / 2, z);
  kit.solid((x0 + x1) / 2, z, w / 2, 0.12);
}

function guns(kit) {
  const { put, solid } = kit;
  put((s) => counter(s, 7.4, 0x70402b), 0, -3.0); solid(0, -3.0, 3.75, 0.55);
  rail(kit, LEFT, -3.7, -3.0); rail(kit, 3.7, RIGHT, -3.0);
  // Glass display on the counter: revolvers on red felt behind brass rails.
  put((s) => {
    s.box(2.4, 0.03, 0.72, 0x7a2c2a, 0, FLOOR + 1.115, 0);
    for (const z of [-0.36, 0.36]) s.box(2.46, 0.24, 0.04, PAL.brass, 0, FLOOR + 1.24, z);
    for (const x of [-1.22, 1.22]) s.box(0.04, 0.24, 0.72, PAL.brass, x, FLOOR + 1.24, 0);
    for (const x of [-0.75, 0, 0.75]) pistol(s, x, FLOOR + 1.15, 0, 0.3);
  }, 1.8, -2.95);
  put((s) => { s.box(0.5, 0.18, 0.34, 0x5d6b3a, 0, FLOOR + 1.19, 0); s.box(0.52, 0.04, 0.36, PAL.canvas, 0, FLOOR + 1.29, 0); }, -2.2, -2.95, 0.15);
  // Long gun rack on the back wall: four rifles and shotguns on pegs over a pale board.
  put((s) => {
    s.box(4.2, 1.9, 0.06, 0xc7a774, 0, 2.15, 0.03);
    s.box(4.4, 0.1, 0.12, PAL.woodDark, 0, 3.15, 0.06); s.box(4.4, 0.1, 0.12, PAL.woodDark, 0, 1.15, 0.06);
    [1.45, 1.85, 2.25, 2.65].forEach((y, i) => {
      for (const x of [-1.6, 1.6]) s.box(0.06, 0.06, 0.16, PAL.iron, x, y - 0.07, 0.1);
      longGun(s, i % 2 ? -0.95 : 0.95, y, 0.16, 0, i % 2 ? PAL.woodLight : 0x9a5a34);
      longGun(s, i % 2 ? 0.75 : -0.75, y, 0.16, Math.PI, i % 2 ? 0x9a5a34 : PAL.woodLight);
    });
  }, -2.6, BACK + 0.02);
  // Pistol board and ammunition shelves to the right.
  put((s) => {
    s.box(2.0, 1.2, 0.06, 0xc7a774, 0, 2.3, 0.03);
    for (const [x, y] of [[-0.5, 2.6], [0.4, 2.6], [-0.5, 2.05], [0.4, 2.05]]) pistol(s, x, y, 0.09, 0);
  }, 2.3, BACK + 0.02);
  put((s) => shelfUnit(s, 2.4, 2.6, 4, (sh, row, y) => {
    for (let i = 0; i < 4; i++) {
      const color = [0xa8322a, 0x5d6b3a, 0xb58a4c, 0x7a2c2a][(row + i) % 4];
      sh.box(0.42, 0.2, 0.34, color, -0.84 + i * 0.56, y + 0.1, 0.02);
      sh.box(0.44, 0.04, 0.36, PAL.canvas, -0.84 + i * 0.56, y + 0.21, 0.02);
    }
  }), 6.4, BACK + 0.3); solid(6.4, BACK + 0.3, 1.25, 0.3, 0, 2.6);
  // Locked safe in the corner and a repair bench along the left wall, both behind the counter.
  put((s) => {
    pad(s, 1.3, 1.2);
    s.box(1.1, 1.3, 0.95, 0x3b3633, 0, FLOOR + 0.65, 0);
    s.box(0.86, 1.04, 0.05, 0x4a4440, 0, FLOOR + 0.67, 0.49);
    s.cyl(0.11, 0.11, 0.05, 10, PAL.brass, 0.05, FLOOR + 0.8, 0.53, R);
    s.box(0.06, 0.24, 0.06, PAL.brass, 0.27, FLOOR + 0.6, 0.53);
    for (const y of [0.3, 1.05]) s.box(0.06, 0.12, 0.08, PAL.iron, -0.42, FLOOR + y, 0.52);
    s.box(1.14, 0.08, 0.99, 0x2b2725, 0, FLOOR + 1.3, 0);
  }, -7.8, -6.15); solid(-7.8, -6.15, 0.6, 0.55, 0, 1.4);
  put((s) => {
    table(s, 2.3, 0.85, 0.92, 0x8c5a34);
    s.box(0.24, 0.16, 0.2, PAL.iron, 0.8, FLOOR + 1.0, 0.25); s.box(0.06, 0.06, 0.4, PAL.iron, 0.8, FLOOR + 1.1, 0.25);
    longGun(s, -0.2, FLOOR + 0.98, 0, 0.1);
    s.box(0.3, 0.05, 0.05, PAL.woodLight, -0.7, FLOOR + 0.94, 0.25, 0, 0.4); s.box(0.08, 0.1, 0.12, PAL.iron, -0.58, FLOOR + 0.97, 0.3);
    s.box(1.8, 1.0, 0.04, 0xc7a774, 0, 1.75, -0.4);
    for (let i = 0; i < 5; i++) s.box(0.05, 0.36 + (i % 2) * 0.12, 0.05, PAL.iron, -0.7 + i * 0.35, 1.8, -0.36);
  }, -8.4, -4.6, R); solid(-8.35, -4.6, 0.45, 1.15, 0, 1);
  // Customer side: stacked ammunition crates, a powder keg and a practice target.
  put((s) => { crate(s, 0.82); s.box(0.5, 0.02, 0.3, 0xa8322a, 0, FLOOR + 0.6, 0.415); }, -6.9, 3.2, 0.12);
  put((s) => crate(s, 0.82, 0x8f6139), -7.75, 2.35, -0.08);
  put((s) => crate(s, 0.62), -6.85, 3.2, 0.3, 0.82);
  solid(-7.25, 2.8, 0.95, 0.85, 0, 1.4);
  put((s) => { barrel(s, 0.34, 0.9, 0x5c3a22); s.box(0.3, 0.12, 0.02, PAL.bone, 0, FLOOR + 0.55, 0.35); }, -5.7, 3.9);
  solid(-5.7, 3.9, 0.36, 0.36);
  put((s) => {
    s.cyl(0.62, 0.62, 0.06, 14, PAL.bone, 0, 2.1, 0.04, R);
    for (const [r, c] of [[0.48, 0xa8322a], [0.34, PAL.bone], [0.2, 0xa8322a], [0.08, PAL.black]]) s.cyl(r, r, 0.07, 14, c, 0, 2.1, 0.05 + (0.62 - r) * 0.02, R);
  }, LEFT + 0.02, 0.6, R);
  put((s) => { chair(s); }, 7.6, 2.6, -R + 0.25);
  put((s) => { s.cyl(0.18, 0.22, 0.28, 8, PAL.brass, 0, FLOOR + 0.14, 0); }, 6.6, 3.6);
  put((s) => runner(s, 1.7, 4.8, 0x7c2f27, 0xc49a5c), 0, 2.4);
  put((s) => wallLantern(s, 2.7), -0.2, BACK + 0.02);
  put((s) => wallLantern(s, 2.7), 4.6, BACK + 0.02);
}

function doctor(kit) {
  const { put, solid } = kit;
  put((s) => counter(s, 4.8, 0xbfae8c, 0x6f5a45), 3.4, -3.3); solid(3.4, -3.3, 2.5, 0.55);
  rail(kit, 5.9, RIGHT, -3.3);
  // Medicine shelves behind the counter.
  put((s) => shelfUnit(s, 4.4, 2.7, 4, (sh, row, y) => {
    for (let i = 0; i < 8; i++) {
      const x = -1.85 + i * 0.53;
      if ((i + row) % 3 === 0) jar(sh, x, y, 0.02, [0xd8cdb5, 0x9db0a8][row % 2]);
      else bottle(sh, x, y, 0.02, [0x6b3d24, 0x4f7a5e, 0x3f5d7a, 0x8a5a2c][(i + row) % 4], 0.3 + (i % 2) * 0.06);
    }
  }, 0x5f4a3a), 3.4, BACK + 0.3); solid(3.4, BACK + 0.3, 2.2, 0.3, 0, 2.7);
  // Scales, mortar and a ledger on the counter.
  put((s) => {
    s.box(0.5, 0.04, 0.22, PAL.woodDark, 0, FLOOR + 1.12, 0);
    s.cyl(0.02, 0.02, 0.38, 5, PAL.brass, 0, FLOOR + 1.32, 0);
    s.box(0.5, 0.02, 0.02, PAL.brass, 0, FLOOR + 1.5, 0);
    for (const x of [-0.22, 0.22]) s.cyl(0.1, 0.06, 0.04, 8, PAL.brass, x, FLOOR + 1.36, 0);
    s.cyl(0.12, 0.08, 0.12, 8, 0xd8cdb5, 0.75, FLOOR + 1.17, 0.05);
    s.box(0.04, 0.22, 0.04, PAL.woodDark, 0.79, FLOOR + 1.27, 0.05, 0, 0, 0.5);
    s.box(0.5, 0.05, 0.36, 0x6b3d24, -0.9, FLOOR + 1.13, 0.05, 0, 0.2);
    s.box(0.46, 0.02, 0.32, PAL.canvas, -0.9, FLOOR + 1.165, 0.05, 0, 0.2);
  }, 3.4, -3.25);
  // Treatment bed with frame, mattress, blanket, pillow and headboard against the back wall.
  put((s) => {
    pad(s, 1.5, 2.6);
    s.box(1.18, 0.1, 2.2, PAL.woodDark, 0, FLOOR + 0.5, 0);
    for (const x of [-0.56, 0.56]) for (const z of [-1.06, 1.06]) s.cyl(0.05, 0.05, 0.5, 6, PAL.woodDark, x, FLOOR + 0.25, z);
    s.box(1.06, 0.16, 2.06, 0xe8dcc0, 0, FLOOR + 0.63, 0);
    s.box(1.12, 0.12, 1.3, 0x5f7f86, 0, FLOOR + 0.7, 0.36);
    s.box(1.14, 0.13, 0.12, 0xe8dcc0, 0, FLOOR + 0.71, -0.26);
    s.box(0.78, 0.14, 0.4, 0xf3ead6, 0, FLOOR + 0.78, -0.76);
    s.box(1.3, 1.2, 0.08, PAL.woodDark, 0, FLOOR + 0.62, -1.12);
    s.box(1.0, 0.8, 0.05, PAL.wood, 0, FLOOR + 0.72, -1.08);
    for (const x of [-0.62, 0.62]) { s.cyl(0.06, 0.06, 1.34, 6, PAL.woodDark, x, FLOOR + 0.67, -1.12); s.cyl(0.08, 0.08, 0.08, 6, PAL.brass, x, FLOOR + 1.38, -1.12); }
    s.box(1.3, 0.62, 0.07, PAL.woodDark, 0, FLOOR + 0.35, 1.12);
  }, -6.3, -5.7); solid(-6.3, -5.7, 0.65, 1.18, 0, 0.9);
  // Bedside instrument table and a doctor's bag.
  put((s) => {
    table(s, 0.8, 0.6, 0.78, PAL.wood);
    s.box(0.5, 0.02, 0.34, 0xd5d0c4, 0, FLOOR + 0.79, 0);
    for (let i = 0; i < 4; i++) s.box(0.03, 0.02, 0.24, 0x9da5a8, -0.15 + i * 0.1, FLOOR + 0.81, 0);
    bottle(s, 0.28, FLOOR + 0.78, -0.18, 0x6b3d24, 0.26);
    s.box(0.42, 0.26, 0.22, 0x2a2422, 0.1, FLOOR + 0.13, 0.1); s.box(0.3, 0.05, 0.05, PAL.brass, 0.1, FLOOR + 0.28, 0.1);
  }, -4.75, -6.35);
  // Washstand with basin, pitcher, towel and mirror on the left wall.
  put((s) => {
    table(s, 1.3, 0.62, 0.86, PAL.wood);
    s.add(new THREE.TorusGeometry(0.26, 0.05, 5, 12), PAL.canvas, 0, FLOOR + 0.92, 0, R);
    s.cyl(0.23, 0.15, 0.08, 12, 0x9db0a8, 0, FLOOR + 0.9, 0);
    s.cyl(0.1, 0.12, 0.32, 8, PAL.canvas, 0.42, FLOOR + 1.02, 0.05); s.box(0.04, 0.16, 0.06, PAL.canvas, 0.53, FLOOR + 1.06, 0.05);
    s.box(0.06, 0.5, 0.3, 0xf0e6d0, -0.68, FLOOR + 0.62, 0.05);
    s.box(0.9, 1.0, 0.06, PAL.woodDark, 0, 1.75, -0.31); s.box(0.74, 0.84, 0.04, 0x9fbcc0, 0, 1.75, -0.27);
  }, LEFT + 0.33, -1.6, R); solid(LEFT + 0.33, -1.6, 0.33, 0.68, 0, 1);
  // Folding privacy screen between treatment and waiting areas.
  put((s) => {
    for (let i = 0; i < 3; i++) {
      const x = 0, z = -0.9 + i * 0.9, ry = i % 2 ? 0.35 : -0.35;
      const g = new THREE.BoxGeometry(0.06, 1.7, 0.86);
      s.add(g, PAL.woodDark, x + (i % 2 ? 0.14 : 0), FLOOR + 0.95, z, 0, ry, 0);
      s.add(new THREE.BoxGeometry(0.07, 1.42, 0.7), 0xd9cfb4, x + (i % 2 ? 0.14 : 0), FLOOR + 1.0, z, 0, ry, 0);
    }
  }, -4.0, -3.0); solid(-3.95, -3.0, 0.22, 1.3, 0, 1.8);
  // Waiting chairs, a plant and an anatomy chart for the customer side.
  for (const z of [0.4, 1.5]) put((s) => chair(s, 0x7a6a52), 8.2, z, -R);
  put((s) => { table(s, 0.6, 0.6, 0.6, PAL.wood); s.cyl(0.14, 0.11, 0.2, 8, 0xa0583a, 0, FLOOR + 0.7, 0); s.add(new THREE.IcosahedronGeometry(0.22, 0), 0x6d8a50, 0, FLOOR + 0.94, 0); }, 8.2, 2.5);
  put((s) => { frame(s, 1.1, 1.4, PAL.woodDark, 0xe8dcc0, 2.3); s.box(0.12, 0.8, 0.03, 0xa63e32, 0, 2.3, 0.06); s.add(new THREE.SphereGeometry(0.12, 7, 5), 0xa06b55, 0, 2.82, 0.06, 0, 0, 0, 1, 1, 0.3); }, -1.6, BACK + 0.02);
  put((s) => runner(s, 1.6, 4.6, 0x52706b, 0xd8cdb5), 1.2, 2.4);
  put((s) => wallLantern(s, 2.7), -6.3, BACK + 0.02);
  put((s) => wallLantern(s, 2.7), 0.8, BACK + 0.02);
}

function sheriff(kit) {
  const { put, solid } = kit;
  // Barred cell in the back-left corner with a cot, bucket and a high window.
  const cellX = -3.5, cellZ = -2.45;
  put((s) => {
    s.box(RIGHT + cellX, 0.02, -BACK + cellZ, 0x6e665b, 0, FLOOR + 0.012, 0);
    for (let x = -2.6; x <= 2.7; x += 0.32) s.box(0.02, 0.026, -BACK + cellZ - 0.1, 0x5b544b, x, FLOOR + 0.014, 0);
  }, (LEFT + cellX) / 2, (BACK + cellZ) / 2);
  put((s) => {
    const w = cellX - LEFT;
    for (let x = 0.12; x < w; x += 0.26) {
      if (x > w - 1.55 && x < w - 0.55) continue;
      s.cyl(0.035, 0.035, 2.9, 5, PAL.iron, LEFT + x, FLOOR + 1.45, 0);
    }
    for (const y of [0.18, 1.55, 2.9]) s.box(w, 0.08, 0.1, PAL.iron, LEFT + w / 2, FLOOR + y, 0);
    // The cell door sits in the bar line with its own frame and lock box.
    for (let i = 0; i < 4; i++) s.cyl(0.035, 0.035, 2.6, 5, 0x4a443f, cellX - 1.42 + i * 0.26, FLOOR + 1.35, 0.04);
    for (const y of [0.25, 1.4, 2.55]) s.box(1.0, 0.07, 0.08, 0x4a443f, cellX - 1.03, FLOOR + y, 0.04);
    s.box(0.18, 0.26, 0.14, 0x2b2725, cellX - 0.48, FLOOR + 1.4, 0.06); s.box(0.06, 0.08, 0.16, PAL.brass, cellX - 0.48, FLOOR + 1.4, 0.08);
  }, 0, cellZ);
  put((s) => {
    const d = cellZ - BACK;
    for (let z = 0.12; z < d; z += 0.26) s.cyl(0.035, 0.035, 2.9, 5, PAL.iron, 0, FLOOR + 1.45, BACK + z);
    for (const y of [0.18, 1.55, 2.9]) s.box(0.1, 0.08, d, PAL.iron, 0, FLOOR + y, BACK + d / 2);
    s.box(0.16, 3.0, 0.16, PAL.iron, 0, FLOOR + 1.5, cellZ);
  }, cellX, 0);
  solid((LEFT + cellX) / 2, cellZ, (cellX - LEFT) / 2, 0.08, 0, 2.9);
  solid(cellX, (BACK + cellZ) / 2, 0.08, (cellZ - BACK) / 2, 0, 2.9);
  put((s) => {
    pad(s, 2.3, 0.95);
    s.box(2.1, 0.08, 0.8, PAL.woodDark, 0, FLOOR + 0.42, 0);
    for (const x of [-0.98, 0.98]) for (const z of [-0.34, 0.34]) s.box(0.07, 0.42, 0.07, PAL.woodDark, x, FLOOR + 0.21, z);
    s.box(1.96, 0.1, 0.7, 0x9a917f, 0, FLOOR + 0.51, 0);
    s.box(1.2, 0.08, 0.72, 0x6c4a38, 0.35, FLOOR + 0.58, 0);
    s.box(0.42, 0.1, 0.5, 0xc9c0a8, -0.75, FLOOR + 0.6, 0);
  }, -6.6, -6.4); solid(-6.6, -6.4, 1.05, 0.42, 0, 0.6);
  put((s) => { s.cyl(0.18, 0.15, 0.32, 8, 0x6b6560, 0, FLOOR + 0.16, 0); s.add(new THREE.TorusGeometry(0.16, 0.015, 4, 8, Math.PI), PAL.iron, 0, FLOOR + 0.32, 0); }, -4.2, -3.2);
  put((s) => {
    s.box(1.2, 0.8, 0.06, PAL.woodDark, 0, 3.0, 0.03); s.box(1.0, 0.6, 0.07, 0x6f9aa0, 0, 3.0, 0.04);
    for (let x = -0.4; x <= 0.41; x += 0.2) s.cyl(0.025, 0.025, 0.64, 4, PAL.iron, x, 3.0, 0.08);
  }, -6.2, BACK + 0.02);
  // Sheriff's desk with drawers, lamp, papers and inkwell, plus his chair.
  put((s) => {
    pad(s, 3.0, 1.5);
    s.box(2.8, 0.09, 1.25, 0x6a4a2e, 0, FLOOR + 0.82, 0);
    s.box(2.4, 0.02, 0.9, 0x3f5a46, 0, FLOOR + 0.87, -0.04);
    for (const x of [-1.05, 1.05]) {
      s.box(0.66, 0.78, 1.1, 0x5c3f27, x, FLOOR + 0.39, 0);
      for (const y of [0.2, 0.46, 0.7]) { s.box(0.58, 0.2, 0.03, 0x7a5535, x, FLOOR + y, 0.56); s.box(0.12, 0.03, 0.04, PAL.brass, x, FLOOR + y, 0.58); }
    }
    s.box(1.4, 0.6, 0.04, 0x5c3f27, 0, FLOOR + 0.5, 0.5);
    s.cyl(0.12, 0.14, 0.05, 8, PAL.brass, 0.95, FLOOR + 0.9, -0.25); s.cyl(0.07, 0.09, 0.2, 8, 0xf3c063, 0.95, FLOOR + 1.02, -0.25);
    s.cyl(0.09, 0.05, 0.14, 8, 0xe9d9b0, 0.95, FLOOR + 1.18, -0.25);
    for (let i = 0; i < 4; i++) s.box(0.42, 0.012, 0.56, i % 2 ? PAL.canvas : 0xe2cc98, -0.5 + i * 0.05, FLOOR + 0.88 + i * 0.012, 0.02 + i * 0.03, 0, -0.1 + i * 0.12);
    s.cyl(0.05, 0.05, 0.07, 6, PAL.black, 0.35, FLOOR + 0.9, 0.12); s.box(0.015, 0.2, 0.015, PAL.bone, 0.38, FLOOR + 1.0, 0.12, 0, 0, 0.4);
    s.cyl(0.12, 0.12, 0.02, 5, PAL.brass, -1.1, FLOOR + 0.88, 0.3);
  }, 3.0, -2.9); solid(3.0, -2.9, 1.42, 0.65, 0, 0.9);
  put((s) => chair(s, 0x6a4a2e), 4.35, -4.25, 0.5);
  // Wanted board, rifle rack, filing cabinet and coffee stove.
  put((s) => {
    s.box(3.4, 1.6, 0.06, 0x9a7650, 0, 2.25, 0.03); s.box(3.6, 0.1, 0.1, PAL.woodDark, 0, 3.1, 0.05);
    for (const [x, y, tone] of [[-1.2, 2.35, 0], [-0.4, 2.2, 1], [0.4, 2.35, 0], [1.2, 2.2, 1]]) {
      poster(s, y, tone);
      for (const part of s.parts.slice(-6)) part.translate(x, 0, 0.07);
    }
  }, 3.0, BACK + 0.02);
  put((s) => {
    s.box(0.12, 1.9, 1.9, PAL.woodDark, 0, 1.75, 0);
    for (let i = 0; i < 3; i++) longGun(s, 0.08, 1.2 + i * 0.5, 0, -R, PAL.woodLight);
    for (const z of [-0.6, 0.6]) for (let i = 0; i < 3; i++) s.box(0.14, 0.05, 0.05, PAL.iron, 0.1, 1.13 + i * 0.5, z);
  }, RIGHT - 0.08, -2.0);
  put((s) => {
    pad(s, 1.0, 0.8);
    s.box(0.8, 1.5, 0.6, 0x5c4a36, 0, FLOOR + 0.75, 0);
    for (let i = 0; i < 4; i++) { s.box(0.68, 0.3, 0.03, 0x6e5a42, 0, FLOOR + 0.25 + i * 0.35, 0.31); s.box(0.14, 0.04, 0.04, PAL.brass, 0, FLOOR + 0.3 + i * 0.35, 0.33); }
  }, 7.9, -6.55); solid(7.9, -6.55, 0.42, 0.32, 0, 1.5);
  put((s) => {
    pad(s, 1.0, 1.0);
    s.cyl(0.36, 0.42, 0.74, 9, PAL.iron, 0, FLOOR + 0.5, 0);
    for (let i = 0; i < 3; i++) s.cyl(0.05, 0.05, 0.14, 4, PAL.iron, Math.cos(i * 2.1) * 0.3, FLOOR + 0.07, Math.sin(i * 2.1) * 0.3);
    s.cyl(0.4, 0.4, 0.05, 9, 0x2b2725, 0, FLOOR + 0.9, 0);
    s.cyl(0.08, 0.08, 3.4, 6, PAL.iron, 0, FLOOR + 2.6, 0);
    s.cyl(0.11, 0.13, 0.2, 7, 0x6a7b80, 0.14, FLOOR + 1.02, 0.05); s.box(0.12, 0.04, 0.04, 0x6a7b80, 0.29, FLOOR + 1.08, 0.05);
  }, 7.6, -0.4); solid(7.6, -0.4, 0.45, 0.45, 0, 1);
  // A bench for visitors and a hat rack by the door.
  put((s) => {
    pad(s, 2.3, 0.7);
    s.box(2.1, 0.07, 0.46, PAL.wood, 0, FLOOR + 0.42, 0);
    for (const x of [-0.92, 0.92]) s.box(0.1, 0.42, 0.42, PAL.woodDark, x, FLOOR + 0.21, 0);
    s.box(2.1, 0.32, 0.06, PAL.wood, 0, FLOOR + 0.82, -0.22);
  }, 7.9, 3.1, -R); solid(7.9, 3.1, 0.3, 1.05, 0, 0.6);
  put((s) => hatStand(s, [0x7a5a36, 0x3a2a24]), -2.6, 5.6);
  put((s) => { for (const x of [-0.06, 0.06]) s.add(new THREE.TorusGeometry(0.07, 0.015, 4, 8), PAL.brass, x, 1.6, 0.05); s.box(0.06, 0.06, 0.1, PAL.iron, 0, 1.72, 0.03); }, -3.32, cellZ + 0.04);
  put((s) => runner(s, 1.6, 4.8, 0x6a4a36, 0xb08a59), 0.6, 2.3);
  put((s) => wallLantern(s, 2.7), 0.3, BACK + 0.02);
  put((s) => wallLantern(s, 2.7), 6.4, BACK + 0.02);
}

function maps(kit) {
  const { put, solid } = kit;
  put((s) => counter(s, 5.2, 0x315553, 0x2a3c3a), 1.0, -3.3); solid(1.0, -3.3, 2.7, 0.55);
  rail(kit, -8.95, -1.75, -3.3);
  put((s) => {
    for (let i = 0; i < 3; i++) s.cyl(0.08, 0.08, 0.7, 8, i % 2 ? 0xe9d9b0 : PAL.canvas, -0.6 + i * 0.25, FLOOR + 1.16, 0.08 * i, 0, 0.3 * i, R);
    s.box(0.5, 0.03, 0.4, 0xe9d9b0, 0.9, FLOOR + 1.115, 0.05, 0, -0.15);
    s.cyl(0.1, 0.1, 0.04, 10, PAL.brass, 0.9, FLOOR + 1.15, 0.05);
  }, 1.0, -3.25);
  // Pigeonhole rack of rolled maps behind the counter.
  put((s) => {
    pad(s, 4.4, 0.8);
    s.box(4.2, 2.6, 0.6, 0x2f4644, 0, FLOOR + 1.3, 0);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      const x = -1.75 + col * 0.7, y = FLOOR + 0.42 + row * 0.6;
      s.box(0.6, 0.5, 0.05, 0x1e2d2c, x, y, 0.28);
      for (let k = 0; k < 2 + ((row + col) % 2); k++) s.cyl(0.08, 0.08, 0.5, 7, (k + row) % 3 ? PAL.canvas : 0xd9c08c, x - 0.15 + k * 0.15, y - 0.1 + (k % 2) * 0.14, 0.32, R);
    }
    for (let i = 0; i <= 6; i++) s.box(0.05, 2.5, 0.08, 0x5b8580, -2.1 + i * 0.7, FLOOR + 1.3, 0.33);
    for (let i = 0; i <= 4; i++) s.box(4.2, 0.05, 0.08, 0x5b8580, 0, FLOOR + 0.12 + i * 0.6, 0.33);
  }, 1.0, BACK + 0.35); solid(1.0, BACK + 0.35, 2.1, 0.32, 0, 2.6);
  // A framed survey map of the region.
  put((s) => {
    frame(s, 2.8, 1.9, PAL.woodDark, 0xe6cf9f, 2.4);
    s.box(2.2, 0.08, 0.02, 0x587784, 0, 2.3, 0.07, 0, 0, 0.18); s.box(1.0, 0.08, 0.02, 0x587784, 0.75, 2.62, 0.07, 0, 0, -0.5);
    for (const [x, y, r] of [[-0.8, 2.0, 0.6], [0.3, 1.9, -0.9], [0.5, 2.8, 0.3]]) s.box(0.9, 0.035, 0.02, 0x8c5a34, x, y, 0.07, 0, 0, r);
    for (const [x, y] of [[-0.9, 2.75], [0.95, 1.85], [0.2, 2.45]]) s.cyl(0.06, 0.06, 0.03, 6, 0xa8322a, x, y, 0.08, R);
  }, -5.6, BACK + 0.02);
  // Map table aligned with the walls: a spread map, compass, dividers, ruler and weights.
  put((s) => {
    table(s, 3.4, 1.9, 0.92, 0x6f4a2c, 0x4a3020);
    s.box(2.9, 0.02, 1.5, 0xe6cf9f, 0, FLOOR + 0.93, 0);
    s.box(2.6, 0.06, 0.02, 0x587784, -0.1, FLOOR + 0.95, 0.1, 0, 0.25); s.box(1.2, 0.06, 0.02, 0x587784, 0.9, FLOOR + 0.95, -0.35, 0, -0.6);
    for (const [x, z, r] of [[-0.7, -0.3, 0.5], [0.3, 0.4, -0.7], [0.9, 0.1, 0.2]]) s.box(0.9, 0.03, 0.03, 0x8c5a34, x, FLOOR + 0.95, z, 0, r);
    for (const [x, z] of [[-1.35, -0.65], [1.35, -0.65], [-1.35, 0.65], [1.35, 0.65]]) s.box(0.14, 0.08, 0.14, PAL.iron, x, FLOOR + 0.98, z);
    s.cyl(0.18, 0.18, 0.05, 12, PAL.brass, 0.95, FLOOR + 0.97, 0.45); s.cone(0.05, 0.22, 4, 0xa8322a, 0.95, FLOOR + 1.0, 0.45, R, 0.6);
    for (const r of [0.2, -0.2]) s.box(0.02, 0.02, 0.38, PAL.iron, -0.4, FLOOR + 0.97, -0.1, 0, r);
    s.box(0.9, 0.02, 0.07, 0xc7a46a, -0.95, FLOOR + 0.95, 0.5, 0, 0.1);
  }, -5.2, 0.4); solid(-5.2, 0.4, 1.72, 0.97, 0, 1);
  put((s) => stool(s, 0.62), -3.0, 0.9);
  put((s) => stool(s, 0.62), -5.6, 1.85);
  // Barrel of rolled maps, survey transit on a tripod and a leveling rod.
  put((s) => { barrel(s, 0.34, 0.8, 0x5c3a22); for (let i = 0; i < 5; i++) s.cyl(0.065, 0.065, 0.9, 6, i % 2 ? PAL.canvas : 0xd9c08c, Math.cos(i * 1.3) * 0.15, FLOOR + 0.95, Math.sin(i * 1.3) * 0.15, 0.12 * Math.cos(i), 0, 0.12 * Math.sin(i)); }, -8.0, 3.4);
  solid(-8.0, 3.4, 0.36, 0.36);
  put((s) => {
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; s.cyl(0.025, 0.03, 1.4, 4, PAL.woodLight, Math.cos(a) * 0.24, FLOOR + 0.67, Math.sin(a) * 0.24, Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17); }
    s.cyl(0.1, 0.1, 0.06, 8, PAL.brass, 0, FLOOR + 1.38, 0);
    s.box(0.12, 0.16, 0.12, PAL.brass, 0, FLOOR + 1.5, 0);
    s.cyl(0.05, 0.05, 0.5, 8, PAL.brass, 0, FLOOR + 1.62, 0, R); s.cyl(0.065, 0.065, 0.04, 8, PAL.black, 0, FLOOR + 1.62, 0.26, R);
  }, 5.8, 1.6, -0.5);
  put((s) => {
    s.box(0.12, 3.0, 0.04, PAL.bone, 0, 1.5, 0);
    for (let y = 0.15; y < 3; y += 0.3) s.box(0.13, 0.15, 0.05, 0xa8322a, 0, y, 0);
  }, RIGHT - 0.14, 3.0, -R);
  put((s) => {
    shelfUnit(s, 2.4, 2.4, 4, (sh, row, y) => {
      for (let i = 0; i < 7; i++) sh.box(0.14 + (i % 3) * 0.02, 0.32 + (i % 2) * 0.06, 0.34, [0x6a2f2a, 0x34505a, 0x5b4a2a, 0x2f4644][(i + row) % 4], -0.95 + i * 0.3, y + 0.17, 0);
    }, 0x3a2a20, 0.42);
  }, RIGHT - 0.24, -5.4, -R); solid(RIGHT - 0.24, -5.4, 0.24, 1.2, 0, 2.4);
  put((s) => { s.cyl(0.04, 0.05, 0.8, 6, PAL.woodDark, 0, FLOOR + 0.4, 0); s.cyl(0.24, 0.28, 0.05, 8, PAL.woodDark, 0, FLOOR + 0.03, 0); s.add(new THREE.SphereGeometry(0.34, 10, 7), 0x6f9c9c, 0, FLOOR + 1.12, 0); s.add(new THREE.TorusGeometry(0.38, 0.02, 4, 12, Math.PI), PAL.brass, 0, FLOOR + 1.12, 0, 0, 0, 0.4); }, 7.6, 4.6);
  put((s) => runner(s, 1.6, 4.6, 0x3f5d5a, 0xc9b27e), 1.0, 2.4);
  put((s) => wallLantern(s, 2.8), -2.4, BACK + 0.02);
  put((s) => wallLantern(s, 2.8), 4.4, BACK + 0.02);
}

const CLOTH = [0x3f5470, 0x8e3f39, 0xb98a45, 0x7b8a62, 0xd8c7a0, 0x6e4b63];

function clothes(kit) {
  const { put, solid } = kit;
  put((s) => counter(s, 4.6, 0x704f66, 0x4a3443), 2.2, -3.4); solid(2.2, -3.4, 2.4, 0.55);
  rail(kit, 4.6, RIGHT, -3.4);
  put((s) => {
    folded(s, -1.2, FLOOR + 1.11, 0.02, [CLOTH[0], CLOTH[4], CLOTH[1]]);
    folded(s, -0.6, FLOOR + 1.11, 0.04, [CLOTH[3], CLOTH[2]]);
    s.add(new THREE.TorusGeometry(0.1, 0.03, 4, 10), 0xd8c7a0, 0.9, FLOOR + 1.14, 0.1, R);
    s.box(0.24, 0.015, 0.04, PAL.iron, 0.45, FLOOR + 1.12, 0.12, 0, 0.6); s.box(0.24, 0.015, 0.04, PAL.iron, 0.45, FLOOR + 1.12, 0.12, 0, -0.2);
  }, 2.2, -3.35);
  // Bolt shelves behind the counter, ordered by color.
  put((s) => shelfUnit(s, 4.6, 2.7, 4, (sh, row, y) => {
    for (let i = 0; i < 5; i++) bolt(sh, -1.8 + i * 0.9, y - 0.02, 0.02, CLOTH[(i + row * 2) % CLOTH.length], 0.62);
  }, 0x4a3443), 2.2, BACK + 0.3); solid(2.2, BACK + 0.3, 2.3, 0.3, 0, 2.7);
  // Dress forms on a low platform along the left wall.
  put((s) => {
    pad(s, 1.3, 5.0);
    s.box(1.1, 0.14, 4.8, PAL.woodDark, 0, FLOOR + 0.07, 0);
    s.box(1.0, 0.03, 4.7, 0x8a5b38, 0, FLOOR + 0.15, 0);
  }, -8.1, -3.4); solid(-8.1, -3.4, 0.55, 2.4, 0, 1.8);
  [[-5.1, CLOTH[0], CLOTH[4]], [-3.4, CLOTH[1], CLOTH[2]], [-1.7, CLOTH[3], CLOTH[4]]].forEach(([z, cloth, trim]) => put((s) => dressForm(s, cloth, trim), -8.1, z, R, 0.14));
  put((s) => shelfUnit(s, 2.4, 2.2, 3, (sh, row, y) => {
    for (let i = 0; i < 3; i++) folded(sh, -0.75 + i * 0.75, y, 0.02, [CLOTH[(i + row) % 6], CLOTH[(i + row + 3) % 6]], 0.5, 0.34);
  }, 0x4a3443), -5.2, BACK + 0.3); solid(-5.2, BACK + 0.3, 1.25, 0.3, 0, 2.2);
  put((s) => hatStand(s, [0x3a2a24, 0xc7a983, 0x6b4a35]), -6.4, -0.6);
  // Display table of folded shirts in the customer zone.
  put((s) => {
    table(s, 2.4, 1.1, 0.82, 0x6e4b3a);
    for (let i = 0; i < 4; i++) folded(s, -0.84 + i * 0.56, FLOOR + 0.82, 0, [CLOTH[i], CLOTH[(i + 2) % 6], CLOTH[(i + 4) % 6]], 0.44, 0.38);
  }, -3.2, 1.2); solid(-3.2, 1.2, 1.25, 0.6, 0, 1);
  // Fitting area: curtained booth, standing mirror and a stool on a round rug.
  put((s) => {
    s.cyl(1.55, 1.55, 0.02, 14, 0x6e4b63, 0, FLOOR + 0.02, 0); s.cyl(1.35, 1.35, 0.025, 14, 0xc9a76a, 0, FLOOR + 0.024, 0);
    for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) s.cyl(0.04, 0.04, 2.3, 5, PAL.woodDark, x, FLOOR + 1.15, z);
    s.box(1.8, 0.05, 0.05, PAL.brass, 0, FLOOR + 2.3, -0.85); s.box(0.05, 0.05, 1.8, PAL.brass, 0.85, FLOOR + 2.3, 0); s.box(0.05, 0.05, 1.8, PAL.brass, -0.85, FLOOR + 2.3, 0);
    for (let i = 0; i < 5; i++) s.box(0.34, 2.0, 0.06, i % 2 ? 0x8e3f39 : 0x7a3530, -0.68 + i * 0.34, FLOOR + 1.27, -0.82 + (i % 2) * 0.04);
    for (let i = 0; i < 3; i++) s.box(0.06, 2.0, 0.34, i % 2 ? 0x8e3f39 : 0x7a3530, 0.82 + (i % 2) * 0.04, FLOOR + 1.27, -0.6 + i * 0.34);
    stool(s, 0.48, 0.2);
  }, 6.7, 1.6); solid(6.7, 0.78, 0.92, 0.08, 0, 2); solid(7.55, 1.6, 0.08, 0.92, 0, 2);
  put((s) => {
    s.box(0.7, 0.06, 0.4, PAL.woodDark, 0, FLOOR + 0.03, 0);
    for (const x of [-0.3, 0.3]) s.cyl(0.03, 0.03, 1.7, 5, PAL.woodDark, x, FLOOR + 0.85, 0);
    s.box(0.56, 1.3, 0.05, PAL.woodDark, 0, FLOOR + 1.05, 0); s.box(0.46, 1.18, 0.04, 0xa9c6ca, 0, FLOOR + 1.05, 0.03);
  }, 4.7, 2.6, -0.7);
  put((s) => runner(s, 1.6, 4.6, 0x6e4b63, 0xd8c7a0), 0.4, 2.4);
  put((s) => wallLantern(s, 2.7), -1.4, BACK + 0.02);
  put((s) => wallLantern(s, 2.7), 5.6, BACK + 0.02);
}

export const SHOP_ROOMS = {
  guns: { build: guns, keeper: { x: 0, z: -4.05 }, windows: [{ wall: 'left', at: -1.6 }, { wall: 'right', at: -0.6 }] },
  doctor: { build: doctor, keeper: { x: 3.4, z: -4.35 }, windows: [{ wall: 'left', at: 2.4 }, { wall: 'right', at: -1.8 }, { wall: 'back', at: -1.6, y: 3.5 }] },
  sheriff: { build: sheriff, keeper: { x: 3.0, z: -4.0 }, windows: [{ wall: 'right', at: 1.2 }] },
  maps: { build: maps, keeper: { x: 1.0, z: -4.35 }, windows: [{ wall: 'left', at: -2.6 }, { wall: 'right', at: -1.4 }] },
  clothes: { build: clothes, keeper: { x: 2.2, z: -4.45 }, windows: [{ wall: 'right', at: -1.4 }, { wall: 'left', at: 1.6 }] },
};
