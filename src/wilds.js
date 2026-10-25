// Scenery across the open land: desert clusters, the pine forest in the
// northwest and the ragged cliffs at the edge. Meshes are merged per square
// chunk so the renderer can skip everything outside the camera's view.
import { PAL, Shape, meshOf } from './models.js';
import { GROUPS } from './physics.js';
import { blot, blotMesh } from './decals.js';
import { campTrailPoints, distanceToTrail, forestAt, inRiver, pineRoadPoints } from './terrain.js';
import { townsOf } from './towns.js';
import { MAIN_STREET, bones, cactus, deadTree, grass, hoodoo, scrub, smooth } from './land.js';

const CHUNK = 70;
/** Stands in for a Shape on the server, which builds colliders but no meshes. */
const NULL_SHAPE = { parts: [], add() {}, box() {}, cyl() {}, cone() {}, rock() {} };

/** A pine: a short trunk under three to four stacked cones. */
export function pine(s, rng, x, z, h) {
  const trunk = h * 0.22, r = h * 0.3, dark = rng.pick([0x2f5132, 0x35593a, 0x2b4a30]), mid = rng.pick([0x3f6b40, 0x456f43, 0x3b6640]);
  s.cyl(h * 0.045, h * 0.06, trunk + 0.4, 6, 0x5a3f2b, x, trunk / 2, z);
  const tiers = h > 7 ? 4 : 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, rr = r * (1 - t * 0.62), hh = h * (0.42 - t * 0.06);
    s.cone(rr, hh, 7, i % 2 ? mid : dark, x, trunk + t * h * 0.66 + hh / 2, z, 0, rng.range(0, 1), 0);
  }
}

function bush(s, rng, x, z, scale = 1) {
  const color = rng.pick([0x4f7a3f, 0x5b8344, 0x46703a]);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + rng.range(0, 1), d = i ? 0.35 * scale : 0;
    s.rock(rng.range(0.38, 0.55) * scale, i % 2 ? color : 0x3f6634, x + Math.cos(a) * d, 0.32 * scale, z + Math.sin(a) * d, 0.8, 0.2, rng.int(1, 999));
  }
  if (rng.chance(0.3)) for (let i = 0; i < 3; i++) s.box(0.09, 0.09, 0.09, rng.pick([0xc0452f, 0xe0d070, 0xf2f0e8]), x + rng.range(-0.5, 0.5), 0.62 * scale, z + rng.range(-0.5, 0.5));
}

function greenGrass(s, rng, x, z) {
  const color = rng.pick([0x6f9a48, 0x7fa653, 0x5d8a3e, 0x92ad5a]);
  for (let j = 0; j < rng.int(5, 9); j++) {
    const h = rng.range(0.3, 0.62);
    s.cone(0.04, h, 3, color, x + rng.range(-0.3, 0.3), h / 2, z + rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3));
  }
}

function log(s, rng, x, z) {
  const len = rng.range(2.4, 4.2), yaw = rng.range(0, Math.PI);
  s.cyl(0.26, 0.3, len, 7, 0x6a4a32, x, 0.26, z, 0, yaw, Math.PI / 2);
  s.cyl(0.24, 0.24, 0.05, 7, 0xb08a5c, x + Math.cos(yaw) * len / 2, 0.26, z - Math.sin(yaw) * len / 2, 0, yaw, Math.PI / 2);
  if (rng.chance(0.5)) s.rock(0.25, 0x5b8344, x, 0.5, z, 0.5, 0.3, rng.int(1, 99));
}

function stump(s, rng, x, z) {
  const r = rng.range(0.25, 0.4);
  s.cyl(r, r * 1.2, 0.5, 7, 0x6a4a32, x, 0.25, z);
  s.cyl(r * 0.92, r * 0.92, 0.03, 7, 0xc29a68, x, 0.51, z);
}

function fern(s, rng, x, z) {
  const color = rng.pick([0x4d7d3a, 0x5f8c42]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + rng.range(-0.2, 0.2);
    s.box(0.12, 0.03, 0.75, color, x + Math.sin(a) * 0.3, 0.22, z + Math.cos(a) * 0.3, -0.45, a, 0);
  }
}

/** Grouped scenery for the whole land. */
export function wilds(game, group, world, rng) {
  const half = world.half ?? 210, camps = world.camps ?? [], shade = [];
  const chunks = new Map();
  const at = (x, z) => {
    if (game.headless) return NULL_SHAPE;
    const key = `${Math.floor((x + half) / CHUNK)}:${Math.floor((z + half) / CHUNK)}`;
    let s = chunks.get(key);
    if (!s) { s = new Shape(); chunks.set(key, s); }
    return s;
  };
  const trails = camps.map((camp, index) => campTrailPoints(camp, index));
  const street = smooth(MAIN_STREET), road = pineRoadPoints();
  const towns = townsOf(world);
  const places = [...(world.sites ?? []).map((p) => ({ x: p.x, z: p.z, r: p.kind === 'landmark' ? 9 : p.kind === 'mill' || p.kind === 'lodge' ? 14 : 7 })), ...(world.ambushes ?? []).map((p) => ({ x: p.x, z: p.z, r: 4 }))];
  const free = (x, z, margin = 0) => Math.hypot(x, z * 0.9) > 40 + margin
    && towns.every((t) => t.id === 'mercy' || Math.hypot(x - t.x, z - t.z) > t.radius + 22 + margin)
    && places.every((p) => Math.hypot(x - p.x, z - p.z) > p.r + margin)
    && camps.every((c) => Math.hypot(x - c.x, z - c.z) > 30 + margin)
    && trails.every((trail) => distanceToTrail(x, z, trail) > 3.5 + margin)
    && distanceToTrail(x, z, street) > 4 + margin
    && distanceToTrail(x, z, road) > 5 + margin
    && !inRiver(x, z, 1 + margin) && Math.abs(x) < half - 6 && Math.abs(z) < half - 6;
  const solids = [];
  const solid = (x, z, r, h) => { solids.push({ x, z, r }); game.physics.fixedCylinder(x, h / 2, z, h / 2, r, GROUPS.world); };
  const clear = (x, z, r) => solids.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.8);
  const tree = (x, z, h) => { if (!free(x, z, 0.5) || !clear(x, z, 0.4)) return; pine(at(x, z), rng, x, z, h); solid(x, z, h * 0.06 + 0.12, h); };

  for (const site of world.sites ?? []) {
    const s = at(site.x, site.z);
    if (site.kind === 'landmark') {
      hoodoo(s, rng, site.x, site.z, site.height); solid(site.x, site.z, site.height * 0.26, site.height);
      shade.push(blot(site.x + 1.5, site.z - 1, site.height * 0.6, site.height * 0.45, 0x8a5a36, 0.35));
    } else if (site.kind === 'tree') {
      deadTree(s, rng, site.x, site.z, 6.5); solid(site.x, site.z, 0.35, 6.5);
      s.box(0.04, 1.4, 0.04, PAL.canvasDark, site.x + 1.4, 4.2, site.z);
      bones(s, rng, site.x + 1.6, site.z + 1.2);
    }
  }

  // Clusters: each is a small scene. The mix depends on how green the land is.
  const centers = [], area = (half * 2) ** 2, target = Math.round(170 * area / 420 ** 2);
  for (let i = 0; i < target * 6 && centers.length < target; i++) {
    const x = rng.range(-half + 10, half - 10), z = rng.range(-half + 10, half - 10);
    if (!free(x, z, 2) || centers.some((c) => Math.abs(c.x - x) < 15 && Math.hypot(c.x - x, c.z - z) < 15)) continue;
    centers.push({ x, z, kind: rng.next(), green: forestAt(x, z) });
  }
  for (const center of centers) {
    const { x: cx, z: cz, kind: k, green } = center, s = at(cx, cz);
    if (green > 0.55) {
      if (k < 0.62) {
        // Stand of pines with brush and fallen wood beneath.
        const n = rng.int(4, 9);
        for (let j = 0; j < n; j++) { const a = rng.range(0, 6), d = Math.sqrt(rng.next()) * 8; tree(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rng.range(4.5, 8)); }
        for (let j = 0; j < rng.int(2, 5); j++) (rng.chance(0.5) ? fern : bush)(s, rng, cx + rng.range(-7, 7), cz + rng.range(-7, 7));
        if (rng.chance(0.4)) log(s, rng, cx + rng.range(-5, 5), cz + rng.range(-5, 5));
        shade.push(blot(cx, cz, rng.range(7, 10), rng.range(6, 9), 0x3f5a30, 0.3, 0.012, rng.range(0, 3)));
      } else if (k < 0.82) {
        // Meadow: tall grass, flowers and a lone tree.
        for (let j = 0; j < rng.int(8, 14); j++) greenGrass(s, rng, cx + rng.range(-7, 7), cz + rng.range(-7, 7));
        if (rng.chance(0.6)) tree(cx + rng.range(-4, 4), cz + rng.range(-4, 4), rng.range(5, 7.5));
        for (let j = 0; j < rng.int(1, 3); j++) bush(s, rng, cx + rng.range(-6, 6), cz + rng.range(-6, 6), rng.range(0.7, 1.1));
      } else if (k < 0.92) {
        // Mossy boulders.
        const r = rng.range(1.4, 3.2);
        if (clear(cx, cz, r)) {
          s.rock(r, 0x7d7a70, cx, r * 0.5, cz, rng.range(0.8, 1.2), 0.24, rng.int(1, 999), rng.range(0, 6));
          s.rock(r * 0.6, 0x5b7a40, cx + 0.2, r * 0.95, cz - 0.1, 0.35, 0.3, rng.int(1, 999));
          solid(cx, cz, r * 0.8, r * 1.2);
        }
        for (let j = 0; j < rng.int(2, 4); j++) fern(s, rng, cx + rng.range(-4, 4), cz + rng.range(-4, 4));
      } else {
        // Old logging: stumps and a cut log.
        for (let j = 0; j < rng.int(3, 6); j++) stump(s, rng, cx + rng.range(-6, 6), cz + rng.range(-6, 6));
        log(s, rng, cx, cz);
      }
      continue;
    }
    if (green > 0.2) {
      if (k >= 0.5) {
        for (let j = 0; j < rng.int(6, 12); j++) (rng.chance(0.7) ? greenGrass : grass)(s, rng, cx + rng.range(-7, 7), cz + rng.range(-7, 7));
        if (rng.chance(0.5)) bush(s, rng, cx + rng.range(-5, 5), cz + rng.range(-5, 5), 0.8);
        continue;
      }
      // The forest edge: a few pines among dry grass and scrub.
      for (let j = 0; j < rng.int(1, 4); j++) tree(cx + rng.range(-7, 7), cz + rng.range(-7, 7), rng.range(4.5, 7));
      for (let j = 0; j < rng.int(4, 8); j++) (rng.chance(0.5) ? greenGrass : grass)(s, rng, cx + rng.range(-7, 7), cz + rng.range(-7, 7));
      if (rng.chance(0.5)) scrub(s, rng, cx + rng.range(-5, 5), cz + rng.range(-5, 5));
      continue;
    }
    if (k < 0.24) {
      const r = rng.range(1.6, 4.2);
      if (clear(cx, cz, r)) {
        s.rock(r, PAL.cliff, cx, r * 0.55, cz, rng.range(0.9, 1.3), 0.24, rng.int(1, 999), rng.range(0, 6));
        const a = rng.range(0, 6), d = r * 0.85;
        s.rock(r * 0.55, PAL.rockLight, cx + Math.cos(a) * d, r * 0.3, cz + Math.sin(a) * d, 0.8, 0.22, rng.int(1, 999));
        solid(cx, cz, r * 0.8, r * 1.2);
        shade.push(blot(cx + 0.6, cz - 0.4, r * 1.6, r * 1.3, 0x8a5a36, 0.3, 0.014, a));
      }
      for (let j = 0; j < rng.int(3, 7); j++) {
        const a = rng.range(0, 6), d = rng.range(r + 0.5, r + 4), rr = rng.range(0.18, 0.6);
        s.rock(rr, rng.chance(0.5) ? PAL.rock : PAL.rockDark, cx + Math.cos(a) * d, rr * 0.3, cz + Math.sin(a) * d, 0.6, 0.3, rng.int(1, 999), a);
      }
      if (rng.chance(0.6)) scrub(s, rng, cx + rng.range(-4, 4), cz + rng.range(-4, 4));
    } else if (k < 0.48) {
      for (let j = 0; j < rng.int(3, 7); j++) {
        const a = rng.range(0, 6), d = Math.sqrt(rng.next()) * rng.range(3, 7);
        cactus(s, rng, cx + Math.cos(a) * d, cz + Math.sin(a) * d, rng.range(0.8, 1.15));
      }
      for (let j = 0; j < rng.int(1, 4); j++) scrub(s, rng, cx + rng.range(-6, 6), cz + rng.range(-6, 6));
    } else if (k < 0.82) {
      for (let j = 0; j < rng.int(5, 11); j++) {
        const a = rng.range(0, 6), d = Math.sqrt(rng.next()) * 7;
        if (rng.chance(0.55)) scrub(s, rng, cx + Math.cos(a) * d, cz + Math.sin(a) * d, rng.range(0.7, 1.3));
        else grass(s, rng, cx + Math.cos(a) * d, cz + Math.sin(a) * d);
      }
      shade.push(blot(cx, cz, rng.range(5, 9), rng.range(4, 7), 0xc0965a, 0.35, 0.012, rng.range(0, 3)));
    } else if (k < 0.92) {
      shade.push(blot(cx, cz, rng.range(6, 11), rng.range(3, 5), 0xdcb582, 0.55, 0.012, rng.range(0, 3)));
      for (let j = 0; j < rng.int(4, 9); j++) {
        const rr = rng.range(0.12, 0.3);
        s.rock(rr, PAL.rockLight, cx + rng.range(-6, 6), rr * 0.3, cz + rng.range(-2.5, 2.5), 0.5, 0.3, rng.int(1, 999));
      }
    } else {
      bones(s, rng, cx, cz);
      if (rng.chance(0.5)) {
        for (let j = 0; j < 7; j++) { const a = j / 7 * Math.PI * 2; s.rock(0.16, PAL.rockDark, cx + 2.5 + Math.cos(a) * 0.55, 0.06, cz + Math.sin(a) * 0.55, 0.6, 0.3, j); }
        s.box(0.9, 0.1, 0.1, 0x3a2a20, cx + 2.5, 0.06, cz, 0, 0.5, 0);
        shade.push(blot(cx + 2.5, cz, 0.9, 0.9, 0x4a3426, 0.5));
      }
      deadTree(s, rng, cx - 2, cz + 1.5, rng.range(2, 3));
    }
  }
  // The forest itself: trees scattered thickly where the land is greenest.
  for (let i = 0; i < Math.round(9000 * area / 840 ** 2); i++) {
    const x = rng.range(-half + 8, half - 8), z = rng.range(-half + 8, half - 8), green = forestAt(x, z);
    if (green < 0.45 || rng.next() > green * 0.75) continue;
    tree(x, z, rng.range(4.5, 7.5));
  }
  // Single plants keep open ground from looking empty.
  const singles = Math.round(420 * area / 420 ** 2);
  for (let i = 0; i < singles; i++) {
    const x = rng.range(-half + 8, half - 8), z = rng.range(-half + 8, half - 8);
    if (!free(x, z)) continue;
    const k = rng.next(), green = forestAt(x, z), s = at(x, z);
    if (green > 0.5) {
      if (k < 0.5) greenGrass(s, rng, x, z);
      else if (k < 0.7) fern(s, rng, x, z);
      else if (k < 0.85) bush(s, rng, x, z, rng.range(0.6, 1));
      else tree(x, z, rng.range(4.5, 7));
    } else if (k < 0.45) (green > 0.2 ? greenGrass : grass)(s, rng, x, z);
    else if (k < 0.8) scrub(s, rng, x, z, rng.range(0.6, 1));
    else if (k < 0.93) { const rr = rng.range(0.15, 0.45); s.rock(rr, PAL.rock, x, rr * 0.3, z, 0.6, 0.3, rng.int(1, 999)); }
    else if (green < 0.2) cactus(s, rng, x, z, rng.range(0.7, 1));
  }
  // Ragged cliffs (desert) or a dark tree wall (forest) close the edge.
  for (const side of [0, 1, 2, 3]) {
    for (let a = -half - 10; a < half + 10;) {
      const r = rng.range(6, 12), edge = half + 4 - rng.range(-2, 5);
      const x = side < 2 ? a : (side === 2 ? -edge : edge);
      const z = side >= 2 ? a : (side === 0 ? -edge : edge);
      const s = at(Math.max(-half, Math.min(half - 1, x)), Math.max(-half, Math.min(half - 1, z)));
      if (forestAt(x, z) > 0.5) {
        for (let j = 0; j < 3; j++) pine(s, rng, x + rng.range(-4, 4), z + rng.range(-4, 4), rng.range(9, 14));
        s.rock(r * 0.7, 0x6f6c62, x, r * 0.3, z, 0.9, 0.28, rng.int(1, 999));
      } else {
        s.rock(r, rng.chance(0.6) ? PAL.cliff : PAL.rock, x, r * 0.45, z, rng.range(0.9, 1.6), 0.28, rng.int(1, 999), rng.range(0, 6));
        if (rng.chance(0.5)) s.rock(r * 0.6, PAL.rockLight, x + rng.range(-3, 3), r * 0.9, z + rng.range(-3, 3), 1, 0.25, rng.int(1, 999));
      }
      a += r * rng.range(0.9, 1.5);
    }
  }
  // The server only needs the colliders above, not the meshes.
  if (game.headless) return;
  for (const s of chunks.values()) if (s.parts.length) group.add(meshOf(s));
  if (shade.length) group.add(blotMesh(shade));
}
