// Seeded bandit-camp layouts and the static scenery around them.
import * as THREE from 'three';
import { createRng } from './rng.js';
import { PAL, Shape, MAT } from './models.js';

export const ARENA_HALF = 22;
export const PLAYER_SPAWN = { x: 0, z: 18.5 };

/**
 * Bandit roster by threat. The first entry is the camp's wanted target.
 * Low: 3 basic outlaws. Medium: 5 with a leader and a scout. High: 8 with
 * riflemen. Deadly: 10. Difficulty comes from roles, not only from health.
 */
export const ROSTERS = [
  ['gunman', 'gunman', 'rusher'],
  ['leader', 'gunman', 'gunman', 'rusher', 'scout'],
  ['leader', 'gunman', 'gunman', 'gunman', 'rusher', 'rusher', 'sharpshooter', 'scout'],
  ['leader', 'gunman', 'gunman', 'gunman', 'gunman', 'rusher', 'rusher', 'sharpshooter', 'sharpshooter', 'scout'],
];
export const AMBUSH_ROSTER = ['gunman', 'gunman', 'rusher'];

export function rosterFor(camp) {
  return [...ROSTERS[Math.max(0, Math.min(3, camp))]];
}

/** A roadside ambush: rocks for cover and three outlaws waiting behind them. */
export function generateAmbush(seed) {
  const rng = createRng(seed), props = [], enemies = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + rng.range(-0.3, 0.3), d = rng.range(5, 9), r = rng.range(0.9, 1.5);
    props.push({ kind: 'rock', x: Math.cos(a) * d, z: Math.sin(a) * d - 4, r, seed: rng.int(1, 999) });
  }
  for (let i = 0; i < 2; i++) props.push({ kind: 'crate', x: rng.range(-4, 4), z: rng.range(-10, -6), ry: rng.range(0, 3) });
  AMBUSH_ROSTER.forEach((type, i) => {
    const rock = props[i * 2], a = Math.atan2(rock.z + 4, rock.x);
    enemies.push({ type, x: rock.x + Math.cos(a) * (rock.r + 0.9), z: rock.z + Math.sin(a) * (rock.r + 0.9) });
  });
  return { props, enemies, campfire: { x: 0, z: -4 }, name: 'Ambush' };
}

/**
 * Pure data: where everything goes. The game turns this into meshes and colliders.
 * @returns {{props:{kind:string,x:number,z:number,ry?:number,r?:number,seed?:number}[], enemies:{type:string,x:number,z:number}[], campfire:{x:number,z:number}, name:string}}
 */
export function generateCamp(seed, camp) {
  const rng = createRng(seed + camp * 7919);
  const H = ARENA_HALF;
  const placed = [];
  const props = [];

  const free = (x, z, r, gap = 1.4) => {
    if (Math.abs(x) > H - 1.6 - r || Math.abs(z) > H - 1.6 - r) return false;
    if (Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z) < 5.5 + r) return false;
    for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < p.r + r + gap) return false;
    return true;
  };
  const put = (kind, x, z, r, extra = {}) => { placed.push({ x, z, r }); props.push({ kind, x, z, ...extra }); };
  const tryPlace = (r, zMin, zMax, gap, fn, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const x = rng.range(-H + 2, H - 2), z = rng.range(zMin, zMax);
      if (free(x, z, r, gap)) { fn(x, z); return { x, z }; }
    }
    return null;
  };

  // Campfire and tents form the heart of the camp.
  const cf = { x: rng.range(-5, 5), z: rng.range(-11, -5) };
  put('campfire', cf.x, cf.z, 1.1);
  const tents = rng.int(2, 3);
  const base = rng.range(0, Math.PI * 2);
  for (let i = 0; i < tents; i++) {
    for (let t = 0; t < 12; t++) {
      const a = base + (i / tents) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const d = rng.range(5, 7.5);
      const x = cf.x + Math.sin(a) * d, z = cf.z + Math.cos(a) * d;
      if (free(x, z, 1.8, 1.2)) { put('tent', x, z, 1.8, { ry: Math.atan2(cf.x - x, cf.z - z) }); break; }
    }
  }

  // Wagons.
  const wagons = rng.int(1, 2);
  for (let i = 0; i < wagons; i++) tryPlace(2.0, -17, 9, 1.6, (x, z) => put('wagon', x, z, 2.0, { ry: rng.pick([0, Math.PI / 2, rng.range(-0.5, 0.5)]) }));

  // Cover clusters of crates and barrels.
  const clusters = 6 + Math.min(3, camp);
  for (let c = 0; c < clusters; c++) {
    tryPlace(1.7, -18, 12, 1.5, (x, z) => {
      placed.push({ x, z, r: 1.7 });
      const n = rng.int(2, 4);
      const ry = rng.range(0, Math.PI);
      const cx = Math.cos(ry), sx = Math.sin(ry);
      const layout = [[0, 0], [1.15, 0], [0, 1.15], [-1.15, 0], [1.15, 1.15]];
      for (let i = 0; i < n; i++) {
        const [lx, lz] = layout[i];
        const kind = rng.chance(0.62) ? 'crate' : 'barrel';
        props.push({ kind, x: x + lx * cx + lz * sx, z: z - lx * sx + lz * cx, ry: ry + rng.range(-0.15, 0.15) });
      }
    });
  }

  // Explosive barrels: risky cover.
  const tnt = rng.int(2, 3);
  for (let i = 0; i < tnt; i++) tryPlace(0.5, -18, 10, 1.0, (x, z) => put('tnt', x, z, 0.5));

  // Fence runs.
  const fences = rng.int(3, 5);
  for (let f = 0; f < fences; f++) {
    const sections = rng.int(1, 3);
    const ry = rng.pick([0, Math.PI / 2]);
    tryPlace(sections * 1.15, -18, 13, 1.4, (x, z) => {
      placed.push({ x, z, r: sections * 1.15 });
      for (let s = 0; s < sections; s++) {
        const o = (s - (sections - 1) / 2) * 2.2;
        props.push({ kind: 'fence', x: x + Math.cos(ry) * o, z: z - Math.sin(ry) * o, ry });
      }
    });
  }

  // Rocks and cacti.
  for (let i = 0; i < rng.int(6, 9); i++) {
    const r = rng.range(0.55, 1.35);
    tryPlace(r, -19, 15, 1.4, (x, z) => put('rock', x, z, r, { r, seed: rng.int(1, 999) }));
  }
  for (let i = 0; i < rng.int(6, 10); i++) {
    tryPlace(0.35, -19, 16, 1.6, (x, z) => put('cactus', x, z, 0.35, { seed: rng.int(0, 99) }));
  }

  // Bandits start around the fire and tents, well away from the player.
  const enemies = [];
  const roster = rosterFor(camp);
  for (const type of roster) {
    for (let t = 0; t < 60; t++) {
      const near = rng.chance(0.65);
      const x = near ? cf.x + rng.range(-6, 6) : rng.range(-H + 3, H - 3);
      const z = near ? cf.z + rng.range(-5, 5) : rng.range(-H + 3, 0);
      if (Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z) < 16) continue;
      if (!free(x, z, 0.5, 0.6)) continue;
      if (enemies.some((e) => Math.hypot(e.x - x, e.z - z) < 1.6)) continue;
      enemies.push({ type, x, z });
      break;
    }
  }

  // Supply chests are added after all existing camp data. This keeps old prop
  // IDs and enemy positions stable when a saved life receives this feature.
  const supplies = 2 + Math.min(1, camp);
  for (let i = 0; i < supplies; i++) {
    for (let t = 0; t < 60; t++) {
      const x = rng.range(-H + 3, H - 3), z = rng.range(-17, 10);
      if (!free(x, z, 0.8, 1.2)) continue;
      if (enemies.some((enemy) => Math.hypot(enemy.x - x, enemy.z - z) < 1.6)) continue;
      put('supply', x, z, 0.8, {
        ry: rng.range(-Math.PI, Math.PI),
        lootMoney: rng.int(4 + camp * 2, 10 + camp * 4),
        lootAmmo: rng.int(4 + camp * 2, 8 + camp * 3),
      });
      break;
    }
  }

  const names = ['Coyote Wash', 'Dry Gulch', 'Rattler Flats', 'Buzzard Mesa', 'Red Hollow', 'Cinder Draw', 'Bone Creek', 'Dead Man\'s Bend', 'Copper Notch', 'Sidewinder Pass'];
  return { props, enemies, campfire: cf, name: names[(seed + camp * 3) % names.length] };
}

/** Ground, cliffs and scatter: one merged static mesh plus invisible walls. */
export function buildScenery(game, seed) {
  const rng = createRng(seed ^ 0x5eed);
  const H = ARENA_HALF;

  // Ground with color variation and dunes outside the arena.
  const size = 170, seg = 85;
  const ground = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = ground.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(PAL.sand), cB = new THREE.Color(PAL.sandDark), cC = new THREE.Color(PAL.sandLight), c = new THREE.Color();
  const noise = (x, z) => Math.sin(x * 0.21 + seed) * Math.cos(z * 0.17 - seed * 0.5) + Math.sin(x * 0.07 - z * 0.09) * 0.8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const out = Math.max(Math.abs(x), Math.abs(z)) - (H + 3);
    if (out > 0) pos.setY(i, Math.max(0, (noise(x, z) + 1.2) * Math.min(1, out / 10) * 2.2));
  }
  // Color per triangle (flat look).
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const n = noise(x * 1.7, z * 1.7) * 0.5 + 0.5;
    const r = ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;
    c.copy(cA).lerp(n > 0.5 ? cB : cC, Math.abs(n - 0.5) * 1.2 + r * 0.12);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  ground.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ground.computeVertexNormals();
  const groundMesh = new THREE.Mesh(ground, MAT.solid);
  groundMesh.receiveShadow = true;
  game.levelGroup.add(groundMesh);

  // Scenery: cliffs on three sides, low rocks along the south edge.
  const s = new Shape();
  const ring = (side, along, out) => {
    if (side === 'n') return [along, -H - out];
    if (side === 's') return [along, H + out];
    if (side === 'w') return [-H - out, along];
    return [H + out, along];
  };
  for (const side of ['n', 'w', 'e']) {
    for (let a = -H - 6; a <= H + 6; a += rng.range(2.6, 3.6)) {
      const [x, z] = ring(side, a, rng.range(1.2, 3.2));
      const r = rng.range(2.2, 3.4);
      s.rock(r, rng.chance(0.5) ? PAL.cliff : PAL.rock, x, r * 0.6, z, rng.range(1.1, 1.7), 0.3, rng.int(1, 999), rng.range(0, 6));
      if (rng.chance(0.55)) {
        const r2 = r * rng.range(0.5, 0.75);
        s.rock(r2, PAL.rockLight, x + rng.range(-1, 1), r * 1.5 + r2 * 0.4, z + rng.range(-1, 1), rng.range(1, 1.4), 0.3, rng.int(1, 999));
      }
    }
  }
  for (let a = -H; a <= H; a += rng.range(1.6, 2.6)) {
    const [x, z] = ring('s', a, rng.range(0.6, 1.6));
    s.rock(rng.range(0.5, 0.9), PAL.rockDark, x, 0.25, z, 0.6, 0.3, rng.int(1, 999));
  }
  // Scatter: scrub, skulls and pebbles inside the arena (no collision).
  for (let i = 0; i < 70; i++) {
    const x = rng.range(-H, H), z = rng.range(-H, H);
    const k = rng.next();
    if (k < 0.55) {
      for (let j = 0; j < 3; j++) s.cone(rng.range(0.06, 0.1), rng.range(0.25, 0.45), 3, rng.chance(0.5) ? PAL.cactusDark : 0x8c8a4a, x + rng.range(-0.2, 0.2), 0.15, z + rng.range(-0.2, 0.2), rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3));
    } else if (k < 0.62) {
      s.box(0.22, 0.16, 0.26, PAL.bone, x, 0.08, z, 0, rng.range(0, 6), 0);
      s.box(0.07, 0.07, 0.4, PAL.bone, x + 0.25, 0.04, z + 0.1, 0, rng.range(0, 6), 0);
    } else {
      s.rock(rng.range(0.1, 0.22), PAL.rockDark, x, 0.04, z, 0.5, 0.3, rng.int(1, 999));
    }
  }
  // Distant mesas for depth.
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
    const d = rng.range(58, 70);
    s.cyl(rng.range(5, 9), rng.range(7, 11), rng.range(6, 12), 7, PAL.cliff, Math.cos(a) * d, 3, Math.sin(a) * d - 8);
  }
  const scenery = new THREE.Mesh(s.build(), MAT.solid);
  scenery.castShadow = true;
  scenery.receiveShadow = true;
  game.levelGroup.add(scenery);

  // Physics: ground slab and invisible walls.
  const ph = game.physics;
  ph.fixedBox(0, -0.5, 0, 90, 0.5, 90, 0, game.groups.ground);
  const wall = game.groups.world;
  ph.fixedBox(0, 2, -H - 0.5, H + 1, 2, 0.5, 0, wall);
  ph.fixedBox(0, 2, H + 0.5, H + 1, 2, 0.5, 0, wall);
  ph.fixedBox(-H - 0.5, 2, 0, 0.5, 2, H + 1, 0, wall);
  ph.fixedBox(H + 0.5, 2, 0, 0.5, 2, H + 1, 0, wall);
}
