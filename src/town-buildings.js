// The seven street-front buildings. Each has its own roof form, height, porch,
// trim and a hanging shingle with a painted symbol, so stores read without text.
// Store names stay on the map. Local frame: the front faces +z, the street.
import * as THREE from 'three';
import { PAL, Shape, meshOf } from './models.js';
import { GROUPS } from './physics.js';
import { buildBacklots } from './town-backlots.js';
import { buildRiver } from './town-river.js';
import { window } from './facade.js';

export const STORES = [
  { id: 'guns', label: 'Guns & Ammo', kind: 'guns', side: -1, z: -18, color: 0x6f392c, width: 8.4, depth: 7.2, height: 3.8 },
  { id: 'doctor', label: 'Doctor Finch', kind: 'doctor', side: 1, z: -18, color: 0xd4c9ab, width: 7.6, depth: 6.8, height: 4.2 },
  { id: 'sheriff', label: 'Sheriff', kind: 'sheriff', side: -1, z: -6, color: 0x756348, width: 8, depth: 7, height: 4 },
  { id: 'maps', label: 'Maps & Trails', kind: 'maps', side: 1, z: -6, color: 0x426c68, width: 6.6, depth: 6.6, height: 4.4 },
  { id: 'clothes', label: 'Clothier', kind: 'clothes', side: -1, z: 6, color: 0x815b72, width: 8, depth: 6.8, height: 4.6 },
  { id: 'saloon', label: 'The Last Drop', kind: 'saloon', side: 1, z: 6, color: 0x9b4d36, width: 9.6, depth: 7.4, height: 6.8 },
  { id: 'stable', label: 'Livery Stable', kind: 'stable', side: -1, z: 16, color: 0x8d7547, width: 9.8, depth: 7.6, height: 4.6 },
];

function shutters(s, x, y, z, color, h = 1.5, w = 1.3) {
  for (const side of [-1, 1]) {
    s.box(0.4, h, 0.08, color, x + side * (w / 2 + 0.34), y, z + 0.04, 0, side * 0.12);
    for (let v = -h / 2 + 0.25; v < h / 2; v += 0.3) s.box(0.32, 0.04, 0.1, PAL.woodDark, x + side * (w / 2 + 0.34), y + v, z + 0.07, 0, side * 0.12);
  }
}

function door(s, z, color = PAL.woodDark, double = false) {
  // Doors are 2.3 m tall so they read at a person's scale beside a 1.9 m character.
  const xs = double ? [-0.5, 0.5] : [0];
  s.box(double ? 2.3 : 1.45, 2.6, 0.1, PAL.woodLight, 0, 1.3, z - 0.02);
  for (const x of xs) {
    s.box(double ? 0.94 : 1.12, 2.3, 0.12, color, x, 1.15, z);
    s.box(double ? 0.7 : 0.86, 0.9, 0.14, PAL.wood, x, 1.55, z + 0.02);
    s.box(double ? 0.7 : 0.86, 0.6, 0.14, PAL.wood, x, 0.55, z + 0.02);
    s.box(0.07, 0.07, 0.16, PAL.brass, x + (double ? (x < 0 ? 0.36 : -0.36) : 0.42), 1.1, z + 0.06);
  }
}

function siding(s, w, h, z, trim, base) {
  for (let y = 0.45; y < h - 0.1; y += 0.42) s.box(w - 0.3, 0.035, 0.06, PAL.woodDark, 0, y, z + 0.03);
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) s.box(0.22, h, 0.2, trim, x, h / 2, z + 0.08);
  s.box(w + 0.1, 0.36, 0.2, base, 0, 0.18, z + 0.05);
}

function walls(s, spec, trim) {
  const { width: w, depth: d, height: h, color } = spec;
  s.box(w, h, d, color, 0, h / 2, 0);
  siding(s, w, h, d / 2, trim, PAL.rockDark);
  // Stone footing all round grounds the building and hides the ground seam.
  s.box(w + 0.16, 0.34, d + 0.16, PAL.rockDark, 0, 0.17, 0);
  // A back door and window face the alley; side windows face the neighbors.
  s.box(1.1, 2.2, 0.1, PAL.woodDark, w * 0.22, 1.1, -d / 2 - 0.04);
  s.box(1.5, 0.16, 0.8, PAL.plank, w * 0.22, 0.1, -d / 2 - 0.45);
  window(s, -w * 0.22, 2, -d / 2 - 0.05, 0x3f5558, 1.1, 1.2);
  for (const side of [-1, 1]) {
    const win = new Shape();
    window(win, 0, 2.1, 0, 0x46626a, 1, 1.2);
    for (const part of win.parts) { part.rotateY(side * Math.PI / 2); part.translate(side * (w / 2 + 0.04), 0, -d * 0.12); s.parts.push(part); }
  }
}

export function gable(s, w, d, eave, rise, color, fill, overhang = 0.5) {
  const angle = Math.atan2(rise, d / 2), slope = Math.hypot(d / 2, rise) + overhang;
  for (const side of [-1, 1]) {
    s.box(w + 0.8, 0.2, slope, color, 0, eave + rise / 2, side * d / 4, side * angle);
    for (let x = -w / 2; x <= w / 2; x += 0.62) s.box(0.04, 0.22, slope - 0.06, PAL.woodDark, x, eave + rise / 2 + 0.02, side * d / 4, side * angle);
    s.box(w + 0.84, 0.12, 0.16, PAL.woodDark, 0, eave - 0.05, side * (d / 2 + overhang * 0.7));
  }
  // Gable ends close the triangle under the roof.
  const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const geo = new THREE.ExtrudeGeometry(tri, { depth: w - 0.02, bevelEnabled: false });
  geo.translate(0, 0, -(w - 0.02) / 2);
  s.add(geo, fill, 0, eave, 0, 0, Math.PI / 2, 0);
  s.cyl(0.12, 0.12, w + 1, 6, PAL.woodLight, 0, eave + rise + 0.06, 0, 0, 0, Math.PI / 2);
}

function hip(s, w, d, eave, rise, color) {
  s.add(new THREE.ConeGeometry(1, 1, 4, 1), color, 0, eave + rise / 2, 0, 0, Math.PI / 4, 0, (w + 0.9) / Math.SQRT2, rise, (d + 0.9) / Math.SQRT2);
  s.box(w + 0.7, 0.14, d + 0.7, PAL.woodDark, 0, eave, 0);
}

function falseFront(s, w, h, z, color, trim, stepped = false) {
  s.box(w + 0.2, h, 0.3, color, 0, h / 2, z);
  if (stepped) for (const [sw, sh] of [[w * 0.7, 0.55], [w * 0.38, 0.45]]) s.box(sw, sh, 0.3, color, 0, h + (sw === w * 0.7 ? 0.27 : 0.78), z);
  s.box(w + 0.45, 0.2, 0.42, trim, 0, h, z + 0.05);
  for (let x = -w / 2 + 0.6; x < w / 2; x += 1.1) s.box(0.14, 0.24, 0.18, PAL.woodDark, x, h - 0.2, z + 0.18);
}

export function porch(s, w, depth, high, posts = 2) {
  const z0 = 3.4, zc = z0 + depth / 2;
  s.box(w + 0.4, 0.24, depth, PAL.plank, 0, 0.12, zc);
  for (let x = -w / 2; x <= w / 2; x += 0.5) s.box(0.03, 0.02, depth - 0.06, PAL.woodDark, x, 0.245, zc);
  s.box(w + 0.44, 0.1, 0.12, PAL.woodDark, 0, 0.2, z0 + depth);
  s.box(w + 0.7, 0.16, depth + 0.4, PAL.woodDark, 0, high, zc + 0.12, -0.1);
  s.box(w + 0.5, 0.1, depth + 0.2, PAL.woodLight, 0, high + 0.12, zc + 0.1, -0.1);
  for (let i = 0; i < posts; i++) {
    const x = -w / 2 + 0.2 + i * (w - 0.4) / (posts - 1);
    if (Math.abs(x) < 1.4) continue;
    s.box(0.18, high, 0.18, PAL.woodLight, x, high / 2, z0 + depth - 0.12);
    s.box(0.5, 0.1, 0.12, PAL.wood, x + (x < 0 ? 0.22 : -0.22), high - 0.3, z0 + depth - 0.12, 0, 0, (x < 0 ? -0.6 : 0.6));
  }
  // Two steps line up with the door at x = 0.
  s.box(2.4, 0.16, 0.42, PAL.plank, 0, 0.08, z0 + depth + 0.2);
  s.box(2.4, 0.06, 0.08, PAL.woodDark, 0, 0.17, z0 + depth + 0.4);
}

function rail(s, x0, x1, z) {
  s.box(x1 - x0, 0.1, 0.1, PAL.woodLight, (x0 + x1) / 2, 0.95, z);
  for (let x = x0; x <= x1 + 0.01; x += 0.4) s.box(0.06, 0.7, 0.06, PAL.wood, x, 0.6, z);
}

export function lantern(s, x, y, z) {
  s.box(0.06, 0.06, 0.32, PAL.iron, x, y + 0.42, z - 0.12);
  s.cyl(0.15, 0.18, 0.08, 6, PAL.iron, x, y + 0.3, z);
  s.cyl(0.11, 0.11, 0.3, 6, 0xf0bc5c, x, y + 0.1, z);
  s.cyl(0.16, 0.09, 0.08, 6, PAL.iron, x, y - 0.08, z);
}

/** A wooden shingle on an iron bracket with a raised symbol on both faces. */
export function shingle(s, x, high, z, symbol, board = 0xd8c08c) {
  s.box(0.06, 0.06, 1.1, PAL.iron, x, high - 0.25, z - 0.45);
  s.box(0.04, 0.32, 0.04, PAL.iron, x, high - 0.42, z - 0.85);
  const y = high - 0.95;
  s.box(0.08, 0.72, 0.9, PAL.woodDark, x, y, z - 0.45);
  s.box(0.1, 0.6, 0.78, board, x, y, z - 0.45);
  const sym = new Shape();
  symbol(sym);
  for (const side of [-1, 1]) for (const part of sym.parts) {
    const p = part.clone(); p.rotateY(side * Math.PI / 2); p.translate(x + side * 0.06, y, z - 0.45); s.parts.push(p);
  }
}

export const SYMBOLS = {
  guns: (s) => { s.box(0.44, 0.08, 0.02, PAL.iron, 0.06, 0.08, 0); s.cyl(0.08, 0.08, 0.02, 7, PAL.iron, -0.12, 0.06, 0, Math.PI / 2); s.box(0.12, 0.24, 0.02, 0x6b3d24, -0.22, -0.08, 0, 0, 0, -0.35); },
  doctor: (s) => { s.box(0.12, 0.42, 0.02, 0xa63e32, 0, 0, 0); s.box(0.42, 0.12, 0.02, 0xa63e32, 0, 0, 0); },
  sheriff: (s) => { for (let i = 0; i < 5; i++) s.box(0.08, 0.36, 0.02, PAL.brass, 0, 0, 0, 0, 0, i * Math.PI / 5); s.cyl(0.09, 0.09, 0.03, 8, 0xb07a2a, 0, 0, 0, Math.PI / 2); },
  maps: (s) => { s.add(new THREE.TorusGeometry(0.2, 0.025, 4, 14), 0x2f4644, 0, 0, 0); s.box(0.06, 0.46, 0.02, 0xa8322a, 0, 0, 0, 0, 0, Math.PI / 4); s.box(0.06, 0.46, 0.02, 0x2f4644, 0, 0, 0, 0, 0, -Math.PI / 4); },
  clothes: (s) => { s.box(0.5, 0.05, 0.02, 0x4a3443, 0, -0.08, 0); s.box(0.26, 0.2, 0.02, 0x4a3443, 0, 0.04, 0); s.box(0.26, 0.04, 0.02, 0x8e3f39, 0, -0.03, 0); },
  saloon: (s) => { s.box(0.26, 0.32, 0.02, 0xc4904b, 0, -0.02, 0); s.box(0.28, 0.08, 0.02, PAL.bone, 0, 0.17, 0); s.add(new THREE.TorusGeometry(0.08, 0.025, 4, 8, Math.PI), 0x8a5a2c, 0.14, -0.02, 0, 0, 0, -Math.PI / 2); },
  stable: (s) => { s.add(new THREE.TorusGeometry(0.17, 0.045, 5, 12, Math.PI * 1.35), PAL.iron, 0, 0.02, 0, 0, 0, -Math.PI * 0.18); },
};

export const BUILDERS = {
  guns(s, b) {
    walls(s, b, 0x9a5d3d);
    gable(s, b.width, b.depth, b.height, 1.25, 0x4a3830, b.color);
    falseFront(s, b.width, b.height + 0.9, b.depth / 2 + 0.05, 0x5a3029, 0x9a5d3d);
    s.box(1.0, 1.9, 1.0, PAL.rockDark, -2.6, b.height + 1.2, -1.6); s.box(1.2, 0.2, 1.2, PAL.iron, -2.6, b.height + 2.2, -1.6);
    door(s, b.depth / 2 + 0.06); window(s, -2.5, 1.9, b.depth / 2 + 0.08, 0x46575a); window(s, 2.5, 1.9, b.depth / 2 + 0.08, 0x46575a);
    for (const x of [-2.5, 2.5]) for (let i = 0; i < 4; i++) s.box(0.05, 1.5, 0.05, PAL.iron, x - 0.45 + i * 0.3, 1.9, b.depth / 2 + 0.24);
    porch(s, b.width, 2.0, 3.0);
    s.box(1.6, 0.12, 0.5, PAL.woodDark, -2.8, 0.55, 4.6); for (const x of [-3.4, -2.2]) s.box(0.1, 0.5, 0.4, PAL.woodDark, x, 0.3, 4.6);
    lantern(s, 1.1, 2.55, b.depth / 2 + 0.3);
  },
  doctor(s, b) {
    walls(s, b, 0xece1c4);
    gable(s, b.width, b.depth, b.height, 1.9, 0x8c5a47, b.color);
    for (let x = -3.4; x <= 3.4; x += 0.85) s.box(0.03, b.height - 0.4, 0.06, 0xc0b28f, x, b.height / 2, b.depth / 2 + 0.06);
    door(s, b.depth / 2 + 0.06, 0x6f8f8a);
    for (const x of [-2.2, 2.2]) { window(s, x, 2, b.depth / 2 + 0.08, 0x668d8c); shutters(s, x, 2, b.depth / 2 + 0.06, 0x6f8f8a); }
    s.box(0.32, 1.1, 0.12, 0xa63e32, 0, b.height + 0.85, b.depth / 2 + 0.12); s.box(1.1, 0.32, 0.12, 0xa63e32, 0, b.height + 0.85, b.depth / 2 + 0.12);
    s.box(1.35, 1.35, 0.08, 0xece1c4, 0, b.height + 0.85, b.depth / 2 + 0.06);
    porch(s, b.width, 1.9, 2.9);
    rail(s, -b.width / 2 + 0.2, -1.3, 5.2); rail(s, 1.3, b.width / 2 - 0.2, 5.2);
    for (const x of [-2.6, 2.6]) { s.box(0.55, 0.45, 0.55, PAL.wood, x, 0.45, 4.5); s.cone(0.32, 0.6, 6, PAL.cactus, x, 0.95, 4.5); }
  },
  sheriff(s, b) {
    walls(s, b, 0x9b8662);
    s.box(b.width + 0.3, 0.2, b.depth + 0.3, 0x46382d, 0, b.height + 0.1, 0);
    falseFront(s, b.width, b.height + 1.1, b.depth / 2 + 0.05, 0x68563d, 0x9b8662, true);
    s.cyl(0.42, 0.42, 0.1, 5, PAL.brass, 0, b.height + 0.95, b.depth / 2 + 0.26, Math.PI / 2);
    s.cyl(0.18, 0.18, 0.12, 8, 0xb07a2a, 0, b.height + 0.95, b.depth / 2 + 0.3, Math.PI / 2);
    door(s, b.depth / 2 + 0.06, 0x4e3828); window(s, -2.3, 2, b.depth / 2 + 0.08, 0x46575a);
    window(s, 2.3, 2, b.depth / 2 + 0.08, 0x46575a);
    for (let i = 0; i < 4; i++) s.box(0.06, 1.5, 0.06, PAL.iron, 1.85 + i * 0.3, 2, b.depth / 2 + 0.24);
    porch(s, b.width, 2.2, 3.1);
    for (let i = 0; i < 3; i++) s.box(0.62, 0.84, 0.03, 0xe2cc98, -3.0 + i * 0.7, 1.95, b.depth / 2 + 0.14, 0, 0, (i - 1) * 0.06);
    lantern(s, -1.15, 2.6, b.depth / 2 + 0.3);
  },
  maps(s, b) {
    walls(s, b, 0x5b8580);
    hip(s, b.width, b.depth, b.height, 2.3, 0x374c4c);
    s.box(1.1, 0.9, 1.1, 0x5b8580, 0, b.height + 2.1, 0); s.add(new THREE.ConeGeometry(0.95, 0.8, 4), 0x2f4040, 0, b.height + 2.95, 0, 0, Math.PI / 4);
    s.cyl(0.03, 0.03, 0.9, 4, PAL.iron, 0, b.height + 3.7, 0); s.box(0.5, 0.04, 0.04, PAL.iron, 0, b.height + 3.9, 0); s.box(0.04, 0.04, 0.5, PAL.iron, 0, b.height + 3.9, 0);
    door(s, b.depth / 2 + 0.06, 0x314a49); window(s, -1.9, 2.1, b.depth / 2 + 0.08, 0x6f9c9c, 1.1); window(s, 1.9, 2.1, b.depth / 2 + 0.08, 0x6f9c9c, 1.1);
    porch(s, b.width, 1.9, 3.0);
    for (const x of [-2.5, 2.5]) { s.cyl(0.15, 0.15, 1.1, 8, PAL.canvas, x, 0.95, 4.7, 0, 0, Math.PI / 2); s.cyl(0.18, 0.18, 0.04, 8, PAL.woodDark, x - 0.56, 0.95, 4.7, 0, 0, Math.PI / 2); }
  },
  clothes(s, b) {
    walls(s, b, 0xa37c93);
    // A mansard roof: steep lower slopes with two dormers, a low cap on top.
    for (const side of [-1, 1]) {
      s.box(b.width + 0.5, 1.5, 0.22, 0x60465b, 0, b.height + 0.7, side * (b.depth / 2 - 0.2), side * 0.32);
      s.box(0.22, 1.5, b.depth + 0.3, 0x60465b, side * (b.width / 2 - 0.2), b.height + 0.7, 0, 0, 0, -side * 0.32);
    }
    s.box(b.width - 0.5, 0.2, b.depth - 0.5, 0x4a3443, 0, b.height + 1.45, 0);
    for (const x of [-2, 2]) { s.box(1.0, 1.0, 0.8, 0xa37c93, x, b.height + 0.85, b.depth / 2 - 0.15); window(s, x, b.height + 0.85, b.depth / 2 + 0.26, 0x7fa1a0, 0.6, 0.7); s.add(new THREE.ConeGeometry(0.8, 0.5, 4), 0x60465b, x, b.height + 1.6, b.depth / 2 - 0.15, 0, Math.PI / 4); }
    door(s, b.depth / 2 + 0.06, 0x5e3f54);
    for (const x of [-2.4, 2.4]) { window(s, x, 2.0, b.depth / 2 + 0.08, 0x7fa1a0, 1.5, 1.7); }
    porch(s, b.width, 2.0, 3.0);
    for (let i = -4; i <= 4; i++) s.box(0.95, 0.07, 1.6, i % 2 ? 0xc58c74 : PAL.canvas, i * 0.95, 3.25, 4.6, -0.22);
  },
  saloon(s, b) {
    walls(s, b, 0xb36b4c);
    s.box(b.width + 0.3, 0.2, b.depth + 0.3, PAL.woodDark, 0, b.height + 0.1, 0);
    falseFront(s, b.width, b.height + 1.3, b.depth / 2 + 0.05, 0x7c392c, 0xb36b4c, true);
    s.box(4.2, 0.7, 0.12, 0xd8c08c, 0, b.height + 0.7, b.depth / 2 + 0.24);
    for (const x of [-1.6, -0.6, 0.4, 1.4]) s.box(0.5, 0.3, 0.04, 0x7c392c, x + 0.1, b.height + 0.7, b.depth / 2 + 0.31);
    door(s, b.depth / 2 + 0.06, 0x5c2f25, true);
    // Swinging half doors in front of the main doors.
    for (const x of [-0.45, 0.45]) s.box(0.82, 1.0, 0.07, PAL.woodLight, x, 1.35, b.depth / 2 + 0.3, 0, x < 0 ? 0.25 : -0.25);
    for (const x of [-3.2, 3.2]) { window(s, x, 2.0, b.depth / 2 + 0.08, 0x596c6d, 1.4, 1.7); window(s, x, 5.1, b.depth / 2 + 0.08, 0x596c6d, 1.1, 1.3); }
    // Upper balcony with rail, posts and a door out to it.
    s.box(b.width + 0.3, 0.18, 2.1, PAL.plank, 0, 3.55, 4.45);
    rail(s, -b.width / 2, b.width / 2, 5.4);
    s.box(1.0, 2.1, 0.1, PAL.woodDark, 0, 4.7, b.depth / 2 + 0.06);
    for (const x of [-1.45, 1.45]) lantern(s, x, 2.6, b.depth / 2 + 0.3);
    porch(s, b.width, 2.1, 3.5, 4);
  },
  stable(s, b) {
    // A barn: board walls, a gambrel roof, big doors and a hay loft opening.
    s.box(b.width, b.height, b.depth, b.color, 0, b.height / 2, 0);
    for (let x = -b.width / 2 + 0.2; x < b.width / 2; x += 0.42) s.box(0.04, b.height - 0.2, 0.06, PAL.woodDark, x, b.height / 2, b.depth / 2 + 0.03);
    s.box(b.width + 0.16, 0.34, b.depth + 0.16, PAL.rockDark, 0, 0.17, 0);
    for (const side of [-1, 1]) {
      s.box(b.width + 0.6, 0.2, 2.1, 0x6c5136, 0, b.height + 0.63, side * (b.depth / 2 - 0.4), side * 0.95);
      s.box(b.width + 0.6, 0.2, 3.25, 0x5e452d, 0, b.height + 2.04, side * (b.depth / 2 - 1) / 2, side * 0.405);
    }
    const end = new THREE.Shape();
    const d = b.depth / 2;
    end.moveTo(-d, 0); end.lineTo(d, 0); end.lineTo(d - 1.0, 1.4); end.lineTo(0, 2.6); end.lineTo(-d + 1.0, 1.4); end.closePath();
    const geo = new THREE.ExtrudeGeometry(end, { depth: b.width - 0.02, bevelEnabled: false }); geo.translate(0, 0, -(b.width - 0.02) / 2);
    s.add(geo, b.color, 0, b.height, 0, 0, Math.PI / 2, 0);
    s.box(1.5, 1.3, 0.12, PAL.woodDark, 0, b.height + 0.9, b.depth / 2 + 0.06); s.box(0.12, 0.12, 1.4, PAL.woodDark, 0, b.height + 2.0, b.depth / 2 + 0.6);
    for (const side of [-1, 1]) {
      s.box(1.5, 3.0, 0.12, 0x6b4a2a, side * 0.78, 1.5, b.depth / 2 + 0.08);
      s.box(1.5, 0.14, 0.16, PAL.woodLight, side * 0.78, 1.5, b.depth / 2 + 0.16, 0, 0, side * 1.1);
      s.box(1.5, 0.14, 0.16, PAL.woodLight, side * 0.78, 2.9, b.depth / 2 + 0.16);
      window(s, side * 3.4, 2.1, b.depth / 2 + 0.08, 0x4f6466, 1, 0.9);
    }
    s.box(3.6, 0.14, 1.8, PAL.plank, 0, 0.07, b.depth / 2 + 0.9);
    lantern(s, -2.2, 3.2, b.depth / 2 + 0.3); lantern(s, 2.2, 3.2, b.depth / 2 + 0.3);
  },
};

function makeBuilding(game, group, spec) {
  const x = spec.side * 13, ry = -spec.side * Math.PI / 2, object = new THREE.Group(), s = new Shape();
  BUILDERS[spec.kind](s, spec);
  if (spec.kind !== 'stable') {
    const postX = spec.width / 2 - 0.2, high = spec.kind === 'saloon' ? 3.5 : spec.kind === 'doctor' ? 2.9 : 3.0;
    shingle(s, postX + 0.02, high, 5.25 + (spec.kind === 'saloon' ? 0.2 : 0), SYMBOLS[spec.kind]);
  } else shingle(s, 2.9, 3.6, spec.depth / 2 + 1.0, SYMBOLS.stable, 0xc9ab72);
  object.position.set(x, 0, spec.z); object.rotation.y = ry;
  object.add(meshOf(s)); group.add(object);
  game.physics.fixedBox(x, spec.height / 2, spec.z, spec.width / 2, spec.height / 2, spec.depth / 2, ry, GROUPS.world);
  // Porch fronts are walkable; the door point sits on the porch in front of the door.
  return { ...spec, x: spec.side * 8.55, z: spec.z, outsideX: spec.side * 7.1, outsideZ: spec.z };
}

export function buildTown(game, group) {
  const sites = STORES.map((spec) => makeBuilding(game, group, spec));
  buildBacklots(game, group, sites);
  buildRiver(game, group);
  return sites;
}
