// The open land around town: ground, town roads and grouped desert scenery.
// Scenery is placed in seeded clusters with open ground between them, so the
// desert reads as natural rather than as an even scatter.
import * as THREE from 'three';
import { MAT, PAL, Shape, meshOf } from './models.js';
import { GROUPS } from './physics.js';
import { blot, blotMesh, resample, road } from './decals.js';
import { BRIDGE, forestAt, pineRoadPoints } from './terrain.js';

export function ground(group, half, seed) {
  const cells = Math.round((half * 2 + 60) / 4.5);
  const geo = new THREE.PlaneGeometry(half * 2 + 60, half * 2 + 60, cells, cells).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PAL.sand), shade = new THREE.Color(PAL.sandDark);
  const light = new THREE.Color(PAL.sandLight), c = new THREE.Color();
  const meadow = new THREE.Color(0x5f7a3e), moss = new THREE.Color(0x4a6334), dry = new THREE.Color(0xa39a5c), g = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const broad = Math.sin(x * 0.021 + seed) * Math.cos(z * 0.017 - seed * 0.3) + Math.sin((x + z) * 0.008 + seed * 0.1) * 0.6;
    const grain = Math.sin(x * 0.19 + z * 0.13 + seed * 0.07) * 0.08;
    const n = broad * 0.24 + grain;
    c.copy(base).lerp(n < 0 ? light : shade, Math.min(0.45, Math.abs(n)));
    // Pine country: meadow green with darker moss under the trees and dry grass at the edge.
    const f = forestAt(x, z);
    if (f > 0) {
      g.copy(meadow).lerp(n < 0 ? dry : moss, Math.min(0.5, Math.abs(n) * 1.4));
      c.lerp(dry, Math.min(1, f * 2.2));
      const t = Math.max(0, Math.min(1, (f - 0.3) / 0.45));
      c.lerp(g, t * t * (3 - 2 * t));
    }
    for (let j = 0; j < 3; j++) { colors[(i + j) * 3] = c.r; colors[(i + j) * 3 + 1] = c.g; colors[(i + j) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(meshOf(geo, MAT.solid, false));
}

export const MAIN_STREET = [
  { x: -3.5, z: -60 }, { x: -2.6, z: -48 }, { x: 0.6, z: -36 }, { x: -0.9, z: -24 }, { x: 0.6, z: -12 },
  { x: -0.5, z: 0 }, { x: 0.7, z: 12 }, { x: 0.5, z: 21 }, { x: 0, z: BRIDGE.north }, { x: 0, z: BRIDGE.south },
  { x: -0.6, z: BRIDGE.south + 8 }, { x: -2.8, z: 56 }, { x: -1.6, z: 68 },
];

export function smooth(points, samples = 4) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
  return curve.getPoints((points.length - 1) * samples).map((p) => ({ x: p.x, z: p.z }));
}

/** Main street and short porch walks as soft decals. */
export function roads(group, doors) {
  const street = resample(smooth(MAIN_STREET), 1.1);
  const taper = (t) => Math.min(1, 0.45 + t * 4, 0.45 + (1 - t) * 4);
  group.add(road(street, (t) => (6.4 + Math.sin(t * 17) * 0.5) * taper(t), { fade: 10, seed: 3 }));
  // The stage road north to Pine Hollow.
  group.add(road(resample(pineRoadPoints(), 1.4), (t) => 4.2 + Math.sin(t * 23) * 0.4, { fade: 6, seed: 11 }));
  // Narrow foot paths run from the street to each porch step.
  for (const door of doors) {
    const side = Math.sign(door.x), endX = side * 6.7;
    const points = resample(smooth([{ x: side * 1.6, z: door.z + side * 0.6 }, { x: side * 4, z: door.z - side * 0.25 }, { x: endX, z: door.z }], 6), 0.6);
    group.add(road(points, 1.7, { ruts: false, fade: 1.4, seed: door.z, base: 0xb47a4b, wash: 0xc08a57 }));
  }
}

export function cactus(s, rng, x, z, scale = 1) {
  const style = rng.int(0, 3);
  if (style <= 1) {
    const h = rng.range(1.6, 3.8) * scale, r = rng.range(0.17, 0.26) * scale, yaw = rng.range(0, Math.PI * 2);
    const ax = Math.cos(yaw), az = Math.sin(yaw);
    s.cyl(r, r * 1.12, h, 7, PAL.cactus, x, h / 2, z);
    s.cone(r, r * 1.1, 7, 0x789750, x, h + r * 0.5, z);
    const arms = h > 2.4 ? rng.int(1, 2) : rng.int(0, 1);
    for (let k = 0; k < arms; k++) {
      const side = k ? -1 : 1, y = h * rng.range(0.42, 0.62), up = h * rng.range(0.22, 0.34);
      s.cyl(r * 0.62, r * 0.62, 0.42 * scale, 6, PAL.cactusDark, x + ax * side * 0.28 * scale, y, z + az * side * 0.28 * scale, 0, -yaw, Math.PI / 2);
      s.cyl(r * 0.66, r * 0.66, up, 6, PAL.cactus, x + ax * side * 0.5 * scale, y + up / 2, z + az * side * 0.5 * scale);
      s.cone(r * 0.66, r * 0.6, 6, 0x789750, x + ax * side * 0.5 * scale, y + up + r * 0.3, z + az * side * 0.5 * scale);
    }
    if (rng.chance(0.25)) s.cone(r * 0.5, 0.22, 6, 0xd06a52, x, h + r * 1.05, z);
  } else if (style === 2) {
    const count = rng.int(3, 5), yaw = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const a = yaw + i * 1.7, d = i ? rng.range(0.2, 0.55) : 0, h = rng.range(0.4, 0.8) * scale;
      s.add(new THREE.IcosahedronGeometry(1, 0), i % 2 ? PAL.cactusDark : PAL.cactus,
        x + Math.cos(a) * d, h * 0.55, z + Math.sin(a) * d, 0, a, rng.range(-0.25, 0.25), 0.32 * scale, h * 0.55, 0.13 * scale);
      if (rng.chance(0.3)) s.cone(0.09, 0.18, 5, i % 2 ? 0xe0b450 : 0xd06a52, x + Math.cos(a) * d, h + 0.1, z + Math.sin(a) * d);
    }
  } else {
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i++) {
      const r = rng.range(0.2, 0.34) * scale, a = i * 2.2 + rng.range(0, 1), d = i ? rng.range(0.3, 0.5) : 0;
      const h = rng.range(0.4, 0.75) * scale;
      s.cyl(r, r * 1.08, h, 9, i % 2 ? PAL.cactusDark : PAL.cactus, x + Math.cos(a) * d, h / 2, z + Math.sin(a) * d);
      s.cone(r * 0.85, 0.2, 9, 0x789750, x + Math.cos(a) * d, h + 0.1, z + Math.sin(a) * d);
    }
  }
}

export function scrub(s, rng, x, z, scale = 1) {
  const color = rng.pick([0x8d8952, 0x707747, 0x9a8a55, 0x7d7a48]);
  const count = rng.int(5, 8);
  for (let j = 0; j < count; j++) {
    const a = j * Math.PI * 2 / count + rng.range(-0.3, 0.3), d = rng.range(0.05, 0.38) * scale;
    s.cone(rng.range(0.07, 0.13) * scale, rng.range(0.3, 0.7) * scale, 3, j % 3 ? color : PAL.cactusDark,
      x + Math.cos(a) * d, 0.2 * scale, z + Math.sin(a) * d, rng.range(-0.4, 0.4), a, rng.range(-0.3, 0.3));
  }
}

export function grass(s, rng, x, z) {
  const color = rng.pick([0xc6a865, 0xb39858, 0xd1b673]);
  for (let j = 0; j < rng.int(4, 7); j++) {
    const h = rng.range(0.25, 0.5);
    s.cone(0.035, h, 3, color, x + rng.range(-0.25, 0.25), h / 2, z + rng.range(-0.25, 0.25), rng.range(-0.35, 0.35), rng.range(0, 3), rng.range(-0.35, 0.35));
  }
}

export function deadTree(s, rng, x, z, h) {
  const lean = rng.range(-0.12, 0.12), yaw = rng.range(0, Math.PI * 2);
  s.cyl(0.12 * h / 3, 0.24 * h / 3, h, 6, 0x6b5440, x, h / 2, z, lean, 0, -lean);
  for (let i = 0; i < 4; i++) {
    const a = yaw + i * 1.6, y = h * (0.45 + i * 0.12), len = h * rng.range(0.22, 0.36);
    s.cyl(0.03, 0.07, len, 5, 0x7a624b, x + Math.cos(a) * len * 0.4, y + len * 0.3, z + Math.sin(a) * len * 0.4, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
  }
}

export function bones(s, rng, x, z) {
  const yaw = rng.range(0, Math.PI * 2);
  s.box(0.3, 0.18, 0.34, PAL.bone, x, 0.1, z, 0, yaw, 0);
  for (const side of [-1, 1]) s.cone(0.05, 0.4, 5, PAL.bone, x + Math.cos(yaw) * side * 0.26, 0.2, z - Math.sin(yaw) * side * 0.26, 0, 0, side * 1.1);
  for (let i = 0; i < 4; i++) s.box(0.05, 0.05, rng.range(0.3, 0.55), PAL.bone, x + rng.range(-0.8, 0.8), 0.03, z + rng.range(-0.8, 0.8), 0, rng.range(0, 6), 0);
}

export function hoodoo(s, rng, x, z, h) {
  // A stacked rock tower: a broad base, two narrowing drums and a cap stone.
  s.rock(h * 0.32, PAL.cliff, x, h * 0.14, z, 0.6, 0.2, rng.int(1, 999));
  s.cyl(h * 0.16, h * 0.22, h * 0.45, 7, PAL.rock, x, h * 0.36, z);
  s.cyl(h * 0.12, h * 0.15, h * 0.35, 7, 0xb5774f, x, h * 0.74, z, 0.04, 0, 0.03);
  s.cyl(h * 0.19, h * 0.15, h * 0.1, 7, PAL.rockDark, x, h * 0.96, z);
  for (let i = 0; i < 4; i++) s.rock(h * rng.range(0.05, 0.1), PAL.rockLight, x + rng.range(-1, 1) * h * 0.35, h * 0.03, z + rng.range(-1, 1) * h * 0.35, 0.6, 0.3, rng.int(1, 999));
}
