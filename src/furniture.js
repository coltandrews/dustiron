// Low-poly furniture built in local space and merged into a room shape.
// Every builder takes a Shape and local coordinates (x right, z toward the
// viewer, y up from the floor). place() moves the finished piece into the room.
import * as THREE from 'three';
import { PAL, Shape } from './models.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Interior floor height. Characters stand at y = 0, so the floor sits just above it. */
export const FLOOR = 0.03;

/** Merges a local-space shape into `target` at (x, y, z) with a yaw. */
export function place(target, shape, x, y, z, ry = 0, scale = 1) {
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(_up, ry), new THREE.Vector3(scale, scale, scale));
  for (const part of shape.parts) { part.applyMatrix4(_m); target.parts.push(part); }
  shape.parts = [];
  return target;
}

/** A thin dark pad on the floor reads as contact shadow under heavy furniture. */
export function pad(s, w, d, color = 0x5e3d24) {
  s.box(w, 0.012, d, color, 0, FLOOR + 0.012, 0);
  return s;
}

export function crate(s, size = 0.8, color = PAL.plank, y = FLOOR) {
  const h = size / 2, t = 0.07;
  s.box(size * 0.94, size * 0.94, size * 0.94, color, 0, y + h, 0);
  for (const x of [-h + t / 2, h - t / 2]) for (const z of [-h + t / 2, h - t / 2]) s.box(t, size, t, PAL.woodDark, x, y + h, z);
  for (const yy of [y + t / 2, y + size - t / 2]) {
    s.box(size, t, t, PAL.woodDark, 0, yy, h - t / 2);
    s.box(size, t, t, PAL.woodDark, 0, yy, -h + t / 2);
    s.box(t, t, size, PAL.woodDark, h - t / 2, yy, 0);
    s.box(t, t, size, PAL.woodDark, -h + t / 2, yy, 0);
  }
  s.box(size * 1.25, 0.06, 0.03, PAL.woodDark, 0, y + h, h + 0.005, 0, 0, Math.PI / 4);
  return s;
}

export function barrel(s, r = 0.36, h = 0.95, body = PAL.wood, lid = PAL.woodDark) {
  s.cyl(r * 0.88, r, h / 2, 10, body, 0, FLOOR + h * 0.25, 0);
  s.cyl(r, r * 0.88, h / 2, 10, body, 0, FLOOR + h * 0.75, 0);
  for (const y of [0.12, 0.5, 0.88]) s.cyl(r * (y === 0.5 ? 1.02 : 0.93), r * (y === 0.5 ? 1.02 : 0.93), 0.045, 10, PAL.iron, 0, FLOOR + h * y, 0);
  s.cyl(r * 0.84, r * 0.84, 0.03, 10, lid, 0, FLOOR + h, 0);
  return s;
}

/** An open water trough that runs along the local z axis. */
export function waterTrough(s, length = 2.6, width = 0.9, y = FLOOR) {
  const halfW = width / 2, halfL = length / 2;
  const wall = 0.1, rim = 0.07, top = y + 0.7;

  // Keep the water clear of all wood faces. The gap prevents depth flicker.
  s.box(width - wall * 2, 0.1, length - wall * 2, PAL.woodDark, 0, y + 0.27, 0);
  for (const side of [-1, 1]) {
    s.box(wall, 0.48, length, PAL.wood, side * (halfW - wall / 2), y + 0.46, 0);
    s.box(rim, 0.08, length + 0.06, PAL.woodLight, side * (halfW - rim / 2), top, 0);
  }
  for (const side of [-1, 1]) {
    s.box(width - wall * 2, 0.48, wall, PAL.wood, 0, y + 0.46, side * (halfL - wall / 2));
    s.box(width, 0.08, rim, PAL.woodLight, 0, top, side * (halfL - rim / 2));
  }
  s.box(width - wall * 2 - 0.06, 0.035, length - wall * 2 - 0.06, PAL.water, 0, y + 0.53, 0);

  // Two trestles hold the basin above the ground. Iron straps strengthen the sides.
  for (const z of [-halfL * 0.58, halfL * 0.58]) {
    s.box(width + 0.12, 0.12, 0.16, PAL.woodDark, 0, y + 0.16, z);
    for (const x of [-halfW * 0.68, halfW * 0.68]) s.box(0.12, 0.28, 0.12, PAL.woodDark, x, y + 0.14, z);
    for (const x of [-halfW - 0.012, halfW + 0.012]) s.box(0.035, 0.44, 0.055, PAL.iron, x, y + 0.45, z);
  }
  return s;
}

/** A shop counter facing +z (the customer side) with panels, overhanging top and a brass foot rail. */
export function counter(s, w, color, top = PAL.woodDark, h = 1.05) {
  pad(s, w + 0.4, 1.3);
  s.box(w, 0.12, 0.84, PAL.black, 0, FLOOR + 0.06, -0.02);
  s.box(w, h - 0.12, 0.8, color, 0, FLOOR + 0.12 + (h - 0.12) / 2, 0);
  const panels = Math.max(2, Math.round(w / 1.2));
  for (let i = 0; i < panels; i++) {
    const x = -w / 2 + (i + 0.5) * (w / panels);
    s.box(w / panels - 0.26, h - 0.48, 0.04, PAL.woodLight, x, FLOOR + 0.18 + (h - 0.36) / 2, 0.41);
    s.box(w / panels - 0.42, h - 0.64, 0.05, color, x, FLOOR + 0.18 + (h - 0.36) / 2, 0.42);
  }
  for (let i = 0; i <= panels; i++) s.box(0.09, h - 0.12, 0.06, top, -w / 2 + i * (w / panels), FLOOR + 0.06 + h / 2, 0.42);
  s.box(w + 0.24, 0.1, 1.06, top, 0, FLOOR + h + 0.05, 0.04);
  s.box(w + 0.3, 0.05, 1.12, PAL.woodLight, 0, FLOOR + h - 0.01, 0.04);
  s.cyl(0.04, 0.04, w - 0.2, 6, PAL.brass, 0, FLOOR + 0.24, 0.62, 0, 0, Math.PI / 2);
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) s.box(0.05, 0.22, 0.2, PAL.brass, x, FLOOR + 0.18, 0.52);
  return s;
}

/** A wall shelf unit. fill(shape, row, x, y) places goods on each shelf. */
export function shelfUnit(s, w, h, rows, fill, color = PAL.woodDark, depth = 0.5) {
  pad(s, w + 0.2, depth + 0.3);
  s.box(w, h, 0.06, color, 0, FLOOR + h / 2, -depth / 2 + 0.03);
  for (const x of [-w / 2, w / 2]) s.box(0.1, h, depth, color, x, FLOOR + h / 2, 0);
  s.box(w + 0.22, 0.14, depth + 0.12, color, 0, FLOOR + h + 0.07, 0.02);
  s.box(w + 0.1, 0.06, depth + 0.06, PAL.woodLight, 0, FLOOR + h - 0.02, 0.03);
  s.box(w, 0.22, depth, color, 0, FLOOR + 0.11, 0);
  const step = (h - 0.3) / rows;
  for (let row = 0; row < rows; row++) {
    const y = FLOOR + 0.22 + row * step;
    s.box(w - 0.08, 0.05, depth - 0.04, PAL.woodLight, 0, y, 0);
    if (fill) fill(s, row, y + 0.025);
  }
  return s;
}

export function bottle(s, x, y, z, color, h = 0.34, r = 0.06) {
  s.cyl(r, r, h * 0.66, 7, color, x, y + h * 0.33, z);
  s.cone(r, h * 0.2, 7, color, x, y + h * 0.76, z);
  s.cyl(r * 0.38, r * 0.38, h * 0.16, 5, color, x, y + h * 0.92, z);
  s.cyl(r * 0.42, r * 0.42, 0.03, 5, PAL.woodDark, x, y + h, z);
  return s;
}

export function jar(s, x, y, z, color, h = 0.22, r = 0.09) {
  s.cyl(r, r * 0.92, h, 8, color, x, y + h / 2, z);
  s.cyl(r * 1.04, r * 1.04, 0.05, 8, PAL.iron, x, y + h + 0.02, z);
  return s;
}

export function mug(s, x, y, z, color = 0xa98a5e, ry = 0) {
  s.cyl(0.085, 0.075, 0.19, 8, color, x, y + 0.095, z);
  s.cyl(0.072, 0.072, 0.02, 8, 0xd9a24b, x, y + 0.185, z);
  s.box(0.03, 0.12, 0.05, color, x + Math.cos(ry) * 0.1, y + 0.1, z - Math.sin(ry) * 0.1, 0, ry);
  return s;
}

/** A plain table: top, apron and four turned legs. */
export function table(s, w, d, h = 0.78, top = PAL.wood, legs = PAL.woodDark) {
  pad(s, w + 0.25, d + 0.25);
  s.box(w, 0.08, d, top, 0, FLOOR + h - 0.04, 0);
  s.box(w + 0.06, 0.03, d + 0.06, PAL.woodLight, 0, FLOOR + h - 0.005, 0);
  s.box(w - 0.18, 0.12, d - 0.18, legs, 0, FLOOR + h - 0.14, 0);
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) {
    s.cyl(0.05, 0.065, h - 0.08, 6, legs, x, FLOOR + (h - 0.08) / 2, z);
    s.box(0.12, 0.1, 0.12, legs, x, FLOOR + h * 0.62, z);
  }
  return s;
}

/** A round pedestal table. */
export function roundTable(s, r, h = 0.78, top = PAL.wood) {
  s.cyl(r + 0.2, r + 0.2, 0.012, 12, 0x5e3d24, 0, FLOOR + 0.012, 0);
  s.cyl(r, r, 0.08, 12, top, 0, FLOOR + h - 0.04, 0);
  s.cyl(r + 0.03, r + 0.03, 0.03, 12, PAL.woodLight, 0, FLOOR + h - 0.01, 0);
  s.cyl(0.09, 0.13, h - 0.08, 8, PAL.woodDark, 0, FLOOR + (h - 0.08) / 2, 0);
  for (let i = 0; i < 4; i++) s.box(0.12, 0.08, r * 1.2, PAL.woodDark, 0, FLOOR + 0.05, 0, 0, i * Math.PI / 2 + Math.PI / 4);
  return s;
}

/** A chair whose seat faces +z. The seat top sits under a seated hip (0.5 m). */
export function chair(s, color = PAL.wood) {
  const seat = FLOOR + 0.38;
  s.box(0.5, 0.06, 0.48, color, 0, seat - 0.03, 0);
  for (const x of [-0.21, 0.21]) {
    s.cyl(0.03, 0.035, seat, 5, PAL.woodDark, x, seat / 2, 0.19);
    s.cyl(0.035, 0.04, seat + 0.62, 5, PAL.woodDark, x, (seat + 0.62) / 2, -0.21);
  }
  for (const y of [seat + 0.28, seat + 0.52]) s.box(0.44, 0.07, 0.04, y > seat + 0.4 ? color : PAL.woodLight, 0, y, -0.22);
  s.box(0.4, 0.03, 0.03, PAL.woodDark, 0, FLOOR + 0.16, 0);
  return s;
}

export function stool(s, h = 0.66, r = 0.2) {
  s.cyl(r, r * 0.95, 0.07, 9, PAL.woodLight, 0, FLOOR + h - 0.035, 0);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    s.cyl(0.025, 0.035, h - 0.06, 5, PAL.woodDark, Math.cos(a) * r * 0.7, FLOOR + (h - 0.06) / 2, Math.sin(a) * r * 0.7);
  }
  s.add(new THREE.TorusGeometry(r * 0.6, 0.018, 4, 9), PAL.brass, 0, FLOOR + h * 0.35, 0, Math.PI / 2);
  return s;
}

/** A wall lantern: bracket, cage and warm glass. */
export function wallLantern(s, y = 2.6) {
  s.box(0.06, 0.06, 0.3, PAL.iron, 0, y + 0.42, 0.15);
  s.cyl(0.13, 0.15, 0.06, 6, PAL.iron, 0, y + 0.3, 0.3);
  s.cyl(0.1, 0.1, 0.28, 6, 0xf3c063, 0, y + 0.12, 0.3);
  for (const a of [0, Math.PI / 2]) s.box(0.24, 0.32, 0.02, PAL.iron, 0, y + 0.12, 0.3, 0, a);
  s.cyl(0.14, 0.08, 0.06, 6, PAL.iron, 0, y - 0.05, 0.3);
  return s;
}

/** A framed picture or notice on a wall facing +z. */
export function frame(s, w, h, color, inner = PAL.canvas, y = 2) {
  s.box(w, h, 0.05, color, 0, y, 0.025);
  s.box(w - 0.12, h - 0.12, 0.06, inner, 0, y, 0.03);
  return s;
}

/** A wanted poster with a portrait block, title band and torn corner. */
export function poster(s, y = 2, tone = 0) {
  s.box(0.62, 0.84, 0.02, 0xe2cc98, 0, y, 0.01);
  s.box(0.46, 0.08, 0.03, PAL.black, 0, y + 0.3, 0.015);
  s.box(0.34, 0.34, 0.03, tone ? 0x6e5440 : 0x4b3a2e, 0, y + 0.04, 0.015);
  for (const dy of [-0.22, -0.3]) s.box(0.42, 0.03, 0.03, 0x8a6a4a, 0, y + dy, 0.015);
  s.box(0.05, 0.05, 0.04, PAL.iron, 0, y + 0.36, 0.02);
  return s;
}

/** A long gun lying along +x, stock to the left. Total length about 1.15 m. */
export function longGun(s, x, y, z, ry = 0, stock = PAL.woodLight, rz = 0) {
  const g = new Shape();
  g.box(0.42, 0.11, 0.06, stock, -0.38, 0, 0, 0, 0, -0.06);
  g.box(0.22, 0.07, 0.07, PAL.woodDark, -0.08, 0.02, 0);
  g.box(0.12, 0.09, 0.08, PAL.iron, 0.07, 0.03, 0);
  g.box(0.6, 0.04, 0.04, PAL.iron, 0.42, 0.05, 0);
  g.box(0.36, 0.035, 0.05, stock, 0.3, 0.0, 0);
  g.add(new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI), PAL.iron, 0.02, -0.04, 0, 0, 0, Math.PI);
  for (const part of g.parts) part.rotateZ(rz);
  place(s, g, x, y, z, ry);
  return s;
}

/** A revolver lying flat, barrel toward +x. */
export function pistol(s, x, y, z, ry = 0) {
  const g = new Shape();
  g.box(0.22, 0.035, 0.05, PAL.iron, 0.1, 0, 0);
  g.cyl(0.045, 0.045, 0.07, 6, PAL.iron, -0.02, 0, 0, Math.PI / 2);
  g.box(0.1, 0.04, 0.09, PAL.woodLight, -0.11, 0, 0.05, 0, 0.5);
  place(s, g, x, y, z, ry);
  return s;
}

/** A hay bale with two binding cords. */
export function hayBale(s, w = 1.1, h = 0.48, d = 0.6, y = FLOOR) {
  s.box(w, h, d, 0xcfae5c, 0, y + h / 2, 0);
  s.box(w + 0.02, h * 0.7, d * 0.7, 0xdbbd6c, 0, y + h / 2, 0);
  for (const x of [-w * 0.28, w * 0.28]) s.box(0.04, h + 0.02, d + 0.02, 0x8c6a35, x, y + h / 2, 0);
  return s;
}

/** A burlap sack sitting on the floor. */
export function sack(s, color = 0xb59a6b) {
  s.add(new THREE.SphereGeometry(0.3, 7, 5), color, 0, FLOOR + 0.3, 0, 0, 0, 0, 1, 1.15, 0.85);
  s.cone(0.14, 0.2, 6, color, 0, FLOOR + 0.72, 0);
  s.cyl(0.07, 0.07, 0.05, 6, 0x6b4e2c, 0, FLOOR + 0.64, 0);
  return s;
}

/** A saddle facing +x, seat at y. */
export function saddle(s, y, color = 0x6b3a22) {
  s.box(0.7, 0.05, 0.62, 0x8d3e2e, 0, y - 0.06, 0);
  s.box(0.66, 0.06, 0.66, 0xc7a46a, 0, y - 0.1, 0);
  s.box(0.56, 0.12, 0.42, color, 0, y + 0.02, 0);
  s.box(0.14, 0.24, 0.32, color, 0.26, y + 0.12, 0, 0, 0, -0.3);
  s.box(0.1, 0.18, 0.4, color, -0.28, y + 0.08, 0, 0, 0, 0.35);
  s.cyl(0.035, 0.035, 0.12, 6, PAL.brass, 0.32, y + 0.27, 0);
  for (const side of [-1, 1]) {
    s.box(0.32, 0.3, 0.04, color, 0, y - 0.24, side * 0.33);
    s.box(0.03, 0.4, 0.03, PAL.woodDark, 0, y - 0.38, side * 0.36);
    s.box(0.14, 0.04, 0.1, PAL.iron, 0, y - 0.58, side * 0.37);
  }
  return s;
}

/** A dress form on a stand. */
export function dressForm(s, cloth, trim = PAL.canvas) {
  s.cyl(0.24, 0.28, 0.04, 8, PAL.woodDark, 0, FLOOR + 0.02, 0);
  s.cyl(0.03, 0.03, 0.9, 5, PAL.iron, 0, FLOOR + 0.47, 0);
  s.cone(0.38, 0.62, 8, cloth, 0, FLOOR + 1.06, 0);
  s.cyl(0.17, 0.2, 0.42, 8, cloth, 0, FLOOR + 1.48, 0);
  s.cyl(0.21, 0.17, 0.12, 8, trim, 0, FLOOR + 1.36, 0);
  s.cyl(0.08, 0.1, 0.1, 6, trim, 0, FLOOR + 1.74, 0);
  s.cyl(0.04, 0.04, 0.12, 5, PAL.woodDark, 0, FLOOR + 1.84, 0);
  return s;
}

/** A hat on a peg stand. */
export function hatStand(s, colors) {
  s.cyl(0.18, 0.22, 0.04, 8, PAL.woodDark, 0, FLOOR + 0.02, 0);
  s.cyl(0.03, 0.035, 1.55, 5, PAL.woodDark, 0, FLOOR + 0.8, 0);
  colors.forEach((color, i) => {
    const a = i * 2.1, x = Math.cos(a) * 0.16, z = Math.sin(a) * 0.16, y = FLOOR + 1.25 + i * 0.16;
    s.cyl(0.21, 0.21, 0.025, 9, color, x, y, z, 0.25 * Math.sin(a), 0, 0.25 * Math.cos(a));
    s.cyl(0.1, 0.12, 0.13, 7, color, x, y + 0.07, z);
  });
  return s;
}

/** A folded stack of cloth. */
export function folded(s, x, y, z, colors, w = 0.42, d = 0.32) {
  colors.forEach((color, i) => {
    s.box(w, 0.07, d, color, x, y + 0.035 + i * 0.075, z, 0, (i % 2 ? 0.05 : -0.04));
    s.box(w * 0.9, 0.012, 0.02, PAL.canvas, x, y + 0.07 + i * 0.075, z + d / 2);
  });
  return s;
}

/** A bolt of cloth lying along x. */
export function bolt(s, x, y, z, color, len = 0.7) {
  s.box(len + 0.06, 0.04, 0.05, PAL.woodLight, x, y + 0.13, z);
  s.cyl(0.13, 0.13, len, 8, color, x, y + 0.13, z, 0, 0, Math.PI / 2);
  return s;
}
