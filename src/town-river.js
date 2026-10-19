// The creek south of town and the bridge that carries Main Street over it.
import * as THREE from 'three';
import { PAL, Shape, meshOf } from './models.js';
import { GROUPS } from './physics.js';
import { createRng } from './rng.js';
import { blot, blotMesh, strip } from './decals.js';
import { BRIDGES, RIVER_MAX_X, RIVER_MIN_X, riverCenter, riverTangent, riverWidth } from './terrain.js';

function riverLine(offset = 0, step = 1.5) {
  const points = [];
  for (let x = RIVER_MIN_X - 4; x <= RIVER_MAX_X + 4; x += step) points.push({ x, z: riverCenter(x) + offset });
  return points;
}

function reeds(s, rng, x, z) {
  for (let j = 0; j < rng.int(4, 8); j++) {
    const h = rng.range(0.6, 1.4);
    s.cone(0.05, h, 4, rng.chance(0.5) ? 0x768151 : 0x9a9059, x + rng.range(-0.6, 0.6), h / 2, z + rng.range(-0.4, 0.4), rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15));
  }
  if (rng.chance(0.4)) s.cyl(0.04, 0.04, 0.22, 5, 0x5c3a22, x, 1.2, z);
}

function cottonwood(s, rng, x, z) {
  const h = rng.range(3.2, 5);
  s.cyl(0.16, 0.3, h, 7, 0x5c4532, x, h / 2, z, rng.range(-0.06, 0.06), 0, rng.range(-0.06, 0.06));
  for (const [dx, dy, dz, k, color] of [[0, 1, 0, 1.7, 0x6d7d48], [-0.9, 0.86, 0.3, 1.2, 0x80894f], [0.8, 0.82, -0.4, 1.25, 0x5d6f40]]) {
    s.add(new THREE.IcosahedronGeometry(1, 1), color, x + dx, h * dy + 0.4, z + dz, 0, rng.range(0, 6), 0, k, k * 0.72, k);
  }
}

export function buildRiver(game, group) {
  const rng = createRng(0x6372_6b);
  // Wet bank, shallow edge and deep channel are three soft strips, so the shore has no hard line.
  const bankWidth = (t) => { const x = RIVER_MIN_X - 4 + t * (RIVER_MAX_X - RIVER_MIN_X + 8); return riverWidth(x) + 7 + Math.sin(x * 0.21) * 1.6; };
  const waterWidth = (t) => { const x = RIVER_MIN_X - 4 + t * (RIVER_MAX_X - RIVER_MIN_X + 8); return riverWidth(x) + 0.8; };
  group.add(strip(riverLine(), {
    width: bankWidth, y: 0.016, fade: 8, wobble: 0.25, seed: 9,
    profile: [[-1, 0], [-0.72, 0.55], [-0.5, 0.85], [0.5, 0.85], [0.72, 0.55], [1, 0]],
    color: (t, across) => (Math.abs(across) > 0.6 ? 0xc59866 : 0x9d7652),
  }));
  group.add(strip(riverLine(), {
    width: waterWidth, y: 0.04, fade: 6, wobble: 0.12, seed: 11,
    profile: [[-1, 0], [-0.86, 0.95], [-0.45, 1], [0, 1], [0.45, 1], [0.86, 0.95], [1, 0]],
    color: (t, across) => (Math.abs(across) > 0.8 ? 0x7d9a9a : Math.abs(across) > 0.4 ? 0x5f7f88 : 0x4f6d7a),
  }));
  // Faint current lines that follow the bend.
  for (const offset of [-1.4, 1.1]) group.add(strip(riverLine(offset, 2), {
    width: 0.25, y: 0.046, fade: 10, seed: 13 + offset, opacity: 0.35,
    profile: [[-1, 0], [0, 1], [1, 0]], color: () => 0x9fbcc0,
  }));

  // Bank scenery in uneven groups with open sand between them.
  const s = new Shape(), shade = [];
  for (let x = RIVER_MIN_X + 3; x < RIVER_MAX_X - 3; x += rng.range(3, 9)) {
    if (BRIDGES.some((bridge) => Math.abs(x - bridge.x) < 10)) continue;
    const side = rng.chance(0.5) ? 1 : -1, z0 = riverCenter(x), edge = riverWidth(x) / 2;
    const kind = rng.next();
    if (kind < 0.35) {
      for (let j = 0; j < rng.int(1, 3); j++) {
        const r = rng.range(0.4, 1.2), along = rng.range(-1.2, 1.2), out = edge + rng.range(-0.3, 1.6);
        s.rock(r, rng.chance(0.5) ? PAL.rock : PAL.rockLight, x + along, r * 0.3, z0 + side * out, 0.55, 0.25, rng.int(1, 999), rng.range(0, 6));
      }
    } else if (kind < 0.7) reeds(s, rng, x, z0 + side * (edge + rng.range(0.2, 1.4)));
    else if (kind < 0.8 && Math.abs(x) > 24) {
      const z = z0 + side * (edge + rng.range(4, 7));
      cottonwood(s, rng, x, z);
      game.physics.fixedCylinder(x, 1.5, z, 1.5, 0.3, GROUPS.world);
      shade.push(blot(x + 0.8, z - 0.6, 2.4, 1.9, 0x6f5838, 0.35));
    } else shade.push(blot(x, z0 + side * (edge + 2), rng.range(2, 4), rng.range(1, 2), 0xd7b37f, 0.5));
  }
  group.add(meshOf(s, undefined, true));
  group.add(blotMesh(shade));

  // Water blocks walking. Exact gaps leave room for the three bridge decks.
  const openings = BRIDGES.map((bridge) => ({ min: bridge.x - 3.25, max: bridge.x + 3.25 }));
  const sections = [];
  let start = RIVER_MIN_X;
  for (const opening of openings) {
    sections.push([start, opening.min]);
    start = opening.max;
  }
  sections.push([start, RIVER_MAX_X]);
  for (const [sectionStart, sectionEnd] of sections) {
    const steps = Math.max(1, Math.ceil((sectionEnd - sectionStart) / 4.5));
    for (let i = 0; i < steps; i++) {
      const x0 = sectionStart + (sectionEnd - sectionStart) * i / steps;
      const x1 = sectionStart + (sectionEnd - sectionStart) * (i + 1) / steps;
      const x = (x0 + x1) / 2;
      const z = (riverCenter(x0) + riverCenter(x1)) / 2;
      const angle = Math.atan2(riverCenter(x1) - riverCenter(x0), x1 - x0);
      const length = Math.hypot(x1 - x0, riverCenter(x1) - riverCenter(x0)) + 0.15;
      game.physics.fixedBox(x, 1, z, length / 2, 1, riverWidth(x) / 2 - 0.4, -angle, GROUPS.world);
    }
  }
  for (const bridge of BRIDGES) buildBridge(game, group, bridge);
}

function buildBridge(game, group, spec) {
  const s = new Shape(), half = (spec.south - spec.north) / 2;
  // The deck sits just above the water so walking feet stay on the boards.
  for (let z = -half + 0.3, i = 0; z <= half - 0.25; z += 0.62, i++) {
    s.box(6.4, 0.12, 0.56, i % 7 === 3 ? PAL.woodLight : i % 2 ? PAL.plank : 0x936238, 0, 0.07, z, 0, (i % 3 - 1) * 0.012, 0);
  }
  for (const x of [-2.4, 2.4]) s.box(0.34, 0.3, half * 2, PAL.woodDark, x, -0.12, 0);
  // Railings with posts, a top rail, a mid rail and a kick board.
  for (const x of [-3.05, 3.05]) {
    for (let z = -half + 0.3; z <= half - 0.2; z += (half * 2 - 0.6) / 5) {
      s.box(0.2, 1.25, 0.2, PAL.woodDark, x, 0.62, z);
      s.box(0.26, 0.08, 0.26, PAL.woodLight, x, 1.27, z);
    }
    s.box(0.16, 0.14, half * 2 - 0.4, PAL.woodLight, x, 1.14, 0);
    s.box(0.1, 0.1, half * 2 - 0.4, PAL.wood, x, 0.62, 0);
    s.box(0.12, 0.24, half * 2 - 0.2, PAL.woodDark, x, 0.2, 0);
  }
  // Piers stand in the water with a pale ring of current around each one.
  for (const z of [-half * 0.35, half * 0.35]) for (const x of [-2.4, 2.4]) {
    s.cyl(0.24, 0.28, 0.5, 7, PAL.woodDark, x, -0.15, z);
    s.cyl(0.42, 0.46, 0.02, 8, 0x8fb0b2, x, 0.05, z);
  }
  // Stone abutments hold each end where the road meets the bank.
  for (const end of [-1, 1]) {
    const z = end * (half + 0.35);
    s.box(6.8, 0.12, 0.8, PAL.rockDark, 0, 0.04, z);
    for (const x of [-3.5, 3.5]) {
      s.rock(0.75, PAL.rock, x, 0.3, z + end * 0.2, 0.8, 0.22, 800 + x + end);
      s.rock(0.45, PAL.rockLight, x * 1.15, 0.18, z + end * 0.9, 0.7, 0.22, 900 + x + end);
    }
  }
  const bridge = meshOf(s);
  const centerZ = (spec.north + spec.south) / 2;
  const angle = -riverTangent(spec.x);
  bridge.position.set(spec.x, 0, centerZ);
  bridge.rotation.y = angle;
  group.add(bridge);
  // Rails keep the player on the deck.
  for (const localX of [-3.05, 3.05]) {
    const x = spec.x + localX * Math.cos(angle);
    const z = centerZ - localX * Math.sin(angle);
    game.physics.fixedBox(x, 1, z, 0.12, 1, half + 0.3, angle, GROUPS.world);
  }
}
