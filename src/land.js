// The open land around town: ground, roads, trails and grouped desert scenery.
// Scenery is placed in seeded clusters with open ground between them, so the
// desert reads as natural rather than as an even scatter.
import * as THREE from 'three';
import { MAT, PAL, Shape, meshOf } from './models.js';
import { GROUPS } from './physics.js';
import { blot, blotMesh, resample, road } from './decals.js';
import { BRIDGE, campTrailPoints, distanceToTrail, inRiver } from './terrain.js';

export function ground(group, half, seed) {
  const geo = new THREE.PlaneGeometry(half * 2 + 60, half * 2 + 60, 96, 96).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PAL.sand), shade = new THREE.Color(PAL.sandDark);
  const light = new THREE.Color(PAL.sandLight), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const broad = Math.sin(x * 0.021 + seed) * Math.cos(z * 0.017 - seed * 0.3) + Math.sin((x + z) * 0.008 + seed * 0.1) * 0.6;
    const grain = Math.sin(x * 0.19 + z * 0.13 + seed * 0.07) * 0.08;
    const n = broad * 0.24 + grain;
    c.copy(base).lerp(n < 0 ? light : shade, Math.min(0.45, Math.abs(n)));
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

function smooth(points, samples = 4) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
  return curve.getPoints((points.length - 1) * samples).map((p) => ({ x: p.x, z: p.z }));
}

/** Main street, porch walks and camp trails as soft decals. */
export function roads(group, world, doors) {
  const street = resample(smooth(MAIN_STREET), 1.1);
  const taper = (t) => Math.min(1, 0.45 + t * 4, 0.45 + (1 - t) * 4);
  group.add(road(street, (t) => (6.4 + Math.sin(t * 17) * 0.5) * taper(t), { fade: 10, seed: 3 }));
  // Narrow foot paths run from the street to each porch step.
  for (const door of doors) {
    const side = Math.sign(door.x), endX = side * 6.7;
    const points = resample(smooth([{ x: side * 1.6, z: door.z + side * 0.6 }, { x: side * 4, z: door.z - side * 0.25 }, { x: endX, z: door.z }], 6), 0.6);
    group.add(road(points, 1.7, { ruts: false, fade: 1.4, seed: door.z, base: 0xb47a4b, wash: 0xc08a57 }));
  }
  for (const [index, camp] of (world.camps ?? []).entries()) {
    const points = resample(campTrailPoints(camp, index), 1.6);
    if (points.length > 1) group.add(road(points, (t) => 3.6 + Math.sin(t * Math.PI * 4 + index) * 0.4, { fade: 12, seed: 40 + index }));
  }
}

function cactus(s, rng, x, z, scale = 1) {
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

function scrub(s, rng, x, z, scale = 1) {
  const color = rng.pick([0x8d8952, 0x707747, 0x9a8a55, 0x7d7a48]);
  const count = rng.int(5, 8);
  for (let j = 0; j < count; j++) {
    const a = j * Math.PI * 2 / count + rng.range(-0.3, 0.3), d = rng.range(0.05, 0.38) * scale;
    s.cone(rng.range(0.07, 0.13) * scale, rng.range(0.3, 0.7) * scale, 3, j % 3 ? color : PAL.cactusDark,
      x + Math.cos(a) * d, 0.2 * scale, z + Math.sin(a) * d, rng.range(-0.4, 0.4), a, rng.range(-0.3, 0.3));
  }
}

function grass(s, rng, x, z) {
  const color = rng.pick([0xc6a865, 0xb39858, 0xd1b673]);
  for (let j = 0; j < rng.int(4, 7); j++) {
    const h = rng.range(0.25, 0.5);
    s.cone(0.035, h, 3, color, x + rng.range(-0.25, 0.25), h / 2, z + rng.range(-0.25, 0.25), rng.range(-0.35, 0.35), rng.range(0, 3), rng.range(-0.35, 0.35));
  }
}

function deadTree(s, rng, x, z, h) {
  const lean = rng.range(-0.12, 0.12), yaw = rng.range(0, Math.PI * 2);
  s.cyl(0.12 * h / 3, 0.24 * h / 3, h, 6, 0x6b5440, x, h / 2, z, lean, 0, -lean);
  for (let i = 0; i < 4; i++) {
    const a = yaw + i * 1.6, y = h * (0.45 + i * 0.12), len = h * rng.range(0.22, 0.36);
    s.cyl(0.03, 0.07, len, 5, 0x7a624b, x + Math.cos(a) * len * 0.4, y + len * 0.3, z + Math.sin(a) * len * 0.4, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
  }
}

function bones(s, rng, x, z) {
  const yaw = rng.range(0, Math.PI * 2);
  s.box(0.3, 0.18, 0.34, PAL.bone, x, 0.1, z, 0, yaw, 0);
  for (const side of [-1, 1]) s.cone(0.05, 0.4, 5, PAL.bone, x + Math.cos(yaw) * side * 0.26, 0.2, z - Math.sin(yaw) * side * 0.26, 0, 0, side * 1.1);
  for (let i = 0; i < 4; i++) s.box(0.05, 0.05, rng.range(0.3, 0.55), PAL.bone, x + rng.range(-0.8, 0.8), 0.03, z + rng.range(-0.8, 0.8), 0, rng.range(0, 6), 0);
}

function hoodoo(s, rng, x, z, h) {
  // A stacked rock tower: a broad base, two narrowing drums and a cap stone.
  s.rock(h * 0.32, PAL.cliff, x, h * 0.14, z, 0.6, 0.2, rng.int(1, 999));
  s.cyl(h * 0.16, h * 0.22, h * 0.45, 7, PAL.rock, x, h * 0.36, z);
  s.cyl(h * 0.12, h * 0.15, h * 0.35, 7, 0xb5774f, x, h * 0.74, z, 0.04, 0, 0.03);
  s.cyl(h * 0.19, h * 0.15, h * 0.1, 7, PAL.rockDark, x, h * 0.96, z);
  for (let i = 0; i < 4; i++) s.rock(h * rng.range(0.05, 0.1), PAL.rockLight, x + rng.range(-1, 1) * h * 0.35, h * 0.03, z + rng.range(-1, 1) * h * 0.35, 0.6, 0.3, rng.int(1, 999));
}

/** Grouped scenery across the land, with a few large landmarks. */
export function desert(game, group, world, rng) {
  const half = world.half ?? 210, camps = world.camps ?? [], s = new Shape(), shade = [];
  const trails = camps.map((camp, index) => campTrailPoints(camp, index));
  const street = smooth(MAIN_STREET);
  const places = [...(world.sites ?? []).map((p) => ({ x: p.x, z: p.z, r: p.kind === 'landmark' ? 9 : 7 })), ...(world.ambushes ?? []).map((p) => ({ x: p.x, z: p.z, r: 4 }))];
  const free = (x, z, margin = 0) => Math.hypot(x, z * 0.9) > 40 + margin
    && places.every((p) => Math.hypot(x - p.x, z - p.z) > p.r + margin)
    && camps.every((c) => Math.hypot(x - c.x, z - c.z) > 30 + margin)
    && trails.every((trail) => distanceToTrail(x, z, trail) > 3.5 + margin)
    && distanceToTrail(x, z, street) > 4 + margin
    && !inRiver(x, z, 1 + margin) && Math.abs(x) < half - 6 && Math.abs(z) < half - 6;
  const solids = [];
  const solid = (x, z, r, h) => { solids.push({ x, z, r }); game.physics.fixedCylinder(x, h / 2, z, h / 2, r, GROUPS.world); };
  const clear = (x, z, r) => solids.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.8);

  // Landmarks come from the life's world data so quests and the map agree on them.
  for (const site of world.sites ?? []) {
    if (site.kind === 'landmark') {
      hoodoo(s, rng, site.x, site.z, site.height); solid(site.x, site.z, site.height * 0.26, site.height);
      shade.push(blot(site.x + 1.5, site.z - 1, site.height * 0.6, site.height * 0.45, 0x8a5a36, 0.35));
    } else if (site.kind === 'tree') {
      deadTree(s, rng, site.x, site.z, 6.5); solid(site.x, site.z, 0.35, 6.5);
      s.box(0.04, 1.4, 0.04, PAL.canvasDark, site.x + 1.4, 4.2, site.z);
      bones(s, rng, site.x + 1.6, site.z + 1.2);
    }
  }

  // Clusters: each one is a small scene with its own mix of rocks and plants.
  const centers = [];
  for (let i = 0; i < 900 && centers.length < 170; i++) {
    const x = rng.range(-half + 10, half - 10), z = rng.range(-half + 10, half - 10);
    if (!free(x, z, 2) || centers.some((c) => Math.hypot(c.x - x, c.z - z) < 15)) continue;
    centers.push({ x, z, kind: rng.next() });
  }
  for (const center of centers) {
    const k = center.kind;
    if (k < 0.24) {
      // Rock outcrop: one or two boulders that block shots, with stones around.
      const r = rng.range(1.6, 4.2);
      if (clear(center.x, center.z, r)) {
        s.rock(r, PAL.cliff, center.x, r * 0.55, center.z, rng.range(0.9, 1.3), 0.24, rng.int(1, 999), rng.range(0, 6));
        const a = rng.range(0, 6), d = r * 0.85;
        s.rock(r * 0.55, PAL.rockLight, center.x + Math.cos(a) * d, r * 0.3, center.z + Math.sin(a) * d, 0.8, 0.22, rng.int(1, 999));
        solid(center.x, center.z, r * 0.8, r * 1.2);
        shade.push(blot(center.x + 0.6, center.z - 0.4, r * 1.6, r * 1.3, 0x8a5a36, 0.3, 0.014, a));
      }
      for (let j = 0; j < rng.int(3, 7); j++) {
        const a = rng.range(0, 6), d = rng.range(r + 0.5, r + 4), rr = rng.range(0.18, 0.6);
        s.rock(rr, rng.chance(0.5) ? PAL.rock : PAL.rockDark, center.x + Math.cos(a) * d, rr * 0.3, center.z + Math.sin(a) * d, 0.6, 0.3, rng.int(1, 999), a);
      }
      if (rng.chance(0.6)) scrub(s, rng, center.x + rng.range(-4, 4), center.z + rng.range(-4, 4));
    } else if (k < 0.48) {
      // Cactus grove of three to seven plants with a few scrubs between them.
      const n = rng.int(3, 7);
      for (let j = 0; j < n; j++) {
        const a = rng.range(0, 6), d = Math.sqrt(rng.next()) * rng.range(3, 7);
        cactus(s, rng, center.x + Math.cos(a) * d, center.z + Math.sin(a) * d, rng.range(0.8, 1.15));
      }
      for (let j = 0; j < rng.int(1, 4); j++) scrub(s, rng, center.x + rng.range(-6, 6), center.z + rng.range(-6, 6));
    } else if (k < 0.82) {
      // Scrub and dry grass field, the most common ground cover.
      for (let j = 0; j < rng.int(5, 11); j++) {
        const a = rng.range(0, 6), d = Math.sqrt(rng.next()) * 7;
        if (rng.chance(0.55)) scrub(s, rng, center.x + Math.cos(a) * d, center.z + Math.sin(a) * d, rng.range(0.7, 1.3));
        else grass(s, rng, center.x + Math.cos(a) * d, center.z + Math.sin(a) * d);
      }
      shade.push(blot(center.x, center.z, rng.range(5, 9), rng.range(4, 7), 0xc0965a, 0.35, 0.012, rng.range(0, 3)));
    } else if (k < 0.92) {
      // A wash of pale gravel with a few loose stones.
      shade.push(blot(center.x, center.z, rng.range(6, 11), rng.range(3, 5), 0xdcb582, 0.55, 0.012, rng.range(0, 3)));
      for (let j = 0; j < rng.int(4, 9); j++) {
        const rr = rng.range(0.12, 0.3);
        s.rock(rr, PAL.rockLight, center.x + rng.range(-6, 6), rr * 0.3, center.z + rng.range(-2.5, 2.5), 0.5, 0.3, rng.int(1, 999));
      }
    } else {
      // Remains of an old camp or a dead animal.
      bones(s, rng, center.x, center.z);
      if (rng.chance(0.5)) {
        for (let j = 0; j < 7; j++) { const a = j / 7 * Math.PI * 2; s.rock(0.16, PAL.rockDark, center.x + 2.5 + Math.cos(a) * 0.55, 0.06, center.z + Math.sin(a) * 0.55, 0.6, 0.3, j); }
        s.box(0.9, 0.1, 0.1, 0x3a2a20, center.x + 2.5, 0.06, center.z, 0, 0.5, 0);
        shade.push(blot(center.x + 2.5, center.z, 0.9, 0.9, 0x4a3426, 0.5));
      }
      deadTree(s, rng, center.x - 2, center.z + 1.5, rng.range(2, 3));
    }
  }
  // A thin layer of single plants keeps the open ground from looking empty.
  for (let i = 0; i < 420; i++) {
    const x = rng.range(-half + 8, half - 8), z = rng.range(-half + 8, half - 8);
    if (!free(x, z)) continue;
    const k = rng.next();
    if (k < 0.45) grass(s, rng, x, z);
    else if (k < 0.8) scrub(s, rng, x, z, rng.range(0.6, 1));
    else if (k < 0.93) { const rr = rng.range(0.15, 0.45); s.rock(rr, PAL.rock, x, rr * 0.3, z, 0.6, 0.3, rng.int(1, 999)); }
    else cactus(s, rng, x, z, rng.range(0.7, 1));
  }
  // Ragged cliffs close the edge of the land, in two uneven rows.
  for (const side of [0, 1, 2, 3]) {
    for (let a = -half - 10; a < half + 10;) {
      const r = rng.range(6, 12), edge = half + 4 - rng.range(-2, 5);
      const x = side < 2 ? a : (side === 2 ? -edge : edge);
      const z = side >= 2 ? a : (side === 0 ? -edge : edge);
      s.rock(r, rng.chance(0.6) ? PAL.cliff : PAL.rock, x, r * 0.45, z, rng.range(0.9, 1.6), 0.28, rng.int(1, 999), rng.range(0, 6));
      if (rng.chance(0.5)) s.rock(r * 0.6, PAL.rockLight, x + rng.range(-3, 3), r * 0.9, z + rng.range(-3, 3), 1, 0.25, rng.int(1, 999));
      a += r * rng.range(0.9, 1.5);
    }
  }
  group.add(meshOf(s));
  if (shade.length) group.add(blotMesh(shade));
}
