// Pine Hollow: a logging town in the northwest forest. A main street runs
// north from the stage road to a white chapel, lined with storefronts on
// boardwalks; behind them are the lumber yard, the livery corral and cabins.
// The four businesses with keepers have rooms inside (built by interiors.js).
// Local frame: the street runs along z through the town center, x is across.
import * as THREE from 'three';
import { PAL, Shape, meshOf, wagonShape } from './models.js';
import { GROUPS } from './physics.js';
import { BUILDERS, SYMBOLS, gable, lantern, shingle } from './town-buildings.js';
import { barrel, crate, hayBale, place, waterTrough } from './furniture.js';
import { horse as horseShape } from './interior-social.js';
import { townsperson } from './townsfolk.js';
import { animateCharacter, turnToward } from './character.js';
import { road, resample, blot, blotMesh } from './decals.js';
import { PINE_HOLLOW } from './terrain.js';

/** Storefronts. Those with an `npc` have a room and a keeper; the rest are facades. */
const FRONTS = [
  { id: 'pine-store', label: 'General Store', kind: 'clothes', side: -1, z: -24, color: 0x6b5a3a, width: 8, depth: 6.8, height: 4.6 },
  { id: 'pine-assay', label: 'Assay Office', kind: 'maps', side: 1, z: -24, color: 0x4a6a5a, width: 6.6, depth: 6.6, height: 4.4 },
  { id: 'pine-trade', label: 'Morrow Trading Post', kind: 'guns', side: -1, z: -11, color: 0x6a4a32, width: 8.4, depth: 7.2, height: 3.8, npc: 'hank' },
  { id: 'pine-saloon', label: 'The Timber Wolf', kind: 'saloon', side: 1, z: -10, color: 0x4f6b4a, width: 9.6, depth: 7.4, height: 6.8, npc: 'ruby' },
  { id: 'pine-deputy', label: "Deputy's Office", kind: 'sheriff', side: -1, z: 3, color: 0x5d5446, width: 8, depth: 7, height: 4, npc: 'hale' },
  { id: 'pine-doctor', label: 'Doc Lacey', kind: 'doctor', side: 1, z: 3, color: 0xcfc6a8, width: 7.6, depth: 6.8, height: 4.2, npc: 'lacey' },
  { id: 'pine-livery', label: 'Livery', kind: 'stable', side: -1, z: 17, color: 0x7a5a38, width: 9.8, depth: 7.6, height: 4.6 },
  { id: 'pine-hotel', label: 'Hollow Hotel', kind: 'clothes', side: 1, z: 17, color: 0x7a4a3a, width: 8.6, depth: 7, height: 5.2 },
];

export const PINE_NPCS = {
  ruby: { name: 'Ruby Tate', look: { shirt: 0x8a2f3c, vest: 0x2b2026, hat: 0x2b2026, band: 0xc9a273, pants: 0x3a2f35, apron: 0xe8dcc0 } },
  hank: { name: 'Hank Morrow', look: { shirt: 0x7a6a4a, vest: 0x4a3a28, hat: 0x5c4a32, band: PAL.woodDark, pants: 0x3f3a33, apron: 0xb39a72 } },
  hale: { name: 'Deputy Hale', look: { shirt: 0x5e6e7a, vest: 0x2e2a26, hat: 0x3a2e24, band: PAL.brass, pants: 0x34302c, star: true } },
  lacey: { name: 'Doc Lacey', look: { shirt: 0xe3dccb, vest: 0x3a4a3c, hat: 0x2b2a2a, band: PAL.black, pants: 0x34383d } },
};

/** The length of Main Street: from the south gate (+z) to the chapel yard (-z). */
export const PINE_STREET = { south: 46, north: -36 };

function cabin(s, w, d, h, color) {
  for (let y = 0.2; y < h; y += 0.36) {
    s.cyl(0.18, 0.18, w + 0.4, 6, y % 0.72 < 0.36 ? color : 0x6a4a32, 0, y, d / 2, 0, 0, Math.PI / 2);
    s.cyl(0.18, 0.18, w + 0.4, 6, color, 0, y, -d / 2, 0, 0, Math.PI / 2);
    s.cyl(0.18, 0.18, d + 0.4, 6, 0x6a4a32, w / 2, y + 0.18, 0, Math.PI / 2);
    s.cyl(0.18, 0.18, d + 0.4, 6, 0x6a4a32, -w / 2, y + 0.18, 0, Math.PI / 2);
  }
  s.box(w, h, d, 0x5a3f2b, 0, h / 2, 0);
  gable(s, w, d, h, 1.6, 0x4a4038, color, 0.6);
  s.box(1.1, 2.1, 0.1, PAL.woodDark, 0, 1.05, d / 2 + 0.2);
  s.box(0.9, 0.8, 0.1, 0xf0c070, w * 0.28, 1.7, d / 2 + 0.2);
  s.box(0.7, h + 1.4, 0.7, PAL.rockDark, -w / 2 + 0.6, (h + 1.4) / 2, -d / 4);
  // A woodpile under the eave and a step.
  for (let i = 0; i < 6; i++) s.cyl(0.13, 0.13, 1.2, 6, i % 2 ? 0x8a6a48 : 0x6a4a32, w / 2 + 0.5, 0.15 + Math.floor(i / 3) * 0.26, -0.6 + (i % 3) * 0.28, Math.PI / 2);
  s.box(1.4, 0.16, 0.6, PAL.plank, 0, 0.08, d / 2 + 0.55);
}

function chapel(s) {
  s.box(7, 4.6, 10, 0xe8e2d2, 0, 2.3, 0);
  s.box(7.16, 0.3, 10.16, PAL.rockDark, 0, 0.15, 0);
  gable(s, 7, 10, 4.6, 2.6, 0x4a4038, 0xe8e2d2, 0.4);
  // Bell tower over the door, with a spire and a cross.
  s.box(2.4, 3.2, 2.4, 0xe8e2d2, 0, 6.2, 4);
  s.box(1.4, 1.2, 2.5, 0x2a2420, 0, 6.6, 4);
  s.cone(1.9, 3, 4, 0x4a4038, 0, 9.3, 4, 0, Math.PI / 4);
  s.box(0.12, 1.2, 0.12, PAL.woodDark, 0, 11.3, 4);
  s.box(0.6, 0.12, 0.12, PAL.woodDark, 0, 11.5, 4);
  s.box(1.6, 2.6, 0.12, 0x6a4a32, 0, 1.3, 5.05);
  for (const z of [-3, 0, 2.6]) for (const x of [-3.52, 3.52]) s.box(0.1, 1.8, 0.9, 0x6f9aa0, x, 2.4, z);
  s.box(3, 0.2, 1.6, PAL.plank, 0, 0.1, 5.8);
}

function sawShed(s) {
  for (const [x, z] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) s.box(0.25, 3.4, 0.25, PAL.wood, x, 1.7, z);
  s.box(7, 0.2, 5, 0x4a4038, 0, 3.5, 0, 0.12);
  s.box(5, 0.9, 1, 0x6a4a32, 0, 0.45, 0);
  s.cyl(0.9, 0.9, 0.06, 16, 0x9a9aa0, 0, 1.2, 0, 0, 0, Math.PI / 2);
}

function logPile(s, n = 9) {
  let i = 0;
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row && i < n; k++, i++) {
    s.cyl(0.32, 0.32, 5, 7, i % 2 ? 0x7a5638 : 0x6a4a32, 0, 0.32 + row * 0.56, (k - (3 - row) / 2) * 0.66, 0, 0, Math.PI / 2);
    s.cyl(0.3, 0.3, 0.04, 7, 0xc29a68, 2.52, 0.32 + row * 0.56, (k - (3 - row) / 2) * 0.66, 0, 0, Math.PI / 2);
  }
}

function fence(s, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
  for (let t = 0; t <= len; t += 2) s.box(0.14, 1.1, 0.14, PAL.woodDark, x0 + (x1 - x0) * t / len, 0.55, z0 + (z1 - z0) * t / len);
  for (const y of [0.45, 0.9]) s.box(0.08, 0.1, len, PAL.woodLight, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, ry, 0);
}

function lampPost(s, x, z) {
  s.box(0.16, 3.2, 0.16, PAL.woodDark, x, 1.6, z);
  lantern(s, x, 3.05, z + 0.12);
}

function hitchRail(s, x, z, len = 2.8) {
  s.box(0.12, 0.12, len, PAL.woodLight, x, 0.95, z);
  for (const dz of [-len / 2 + 0.2, len / 2 - 0.2]) s.box(0.12, 1, 0.12, PAL.wood, x, 0.5, z + dz);
}

function well(s) {
  s.cyl(0.8, 0.85, 0.8, 10, PAL.rock, 0, 0.4, 0);
  s.cyl(0.62, 0.62, 0.05, 10, 0x2a3a40, 0, 0.78, 0);
  for (const x of [-0.75, 0.75]) s.box(0.12, 1.7, 0.12, PAL.woodDark, x, 1.25, 0);
  s.box(1.7, 0.12, 0.12, PAL.woodDark, 0, 2.05, 0);
  s.add(new THREE.ConeGeometry(1.2, 0.7, 4), 0x4a4038, 0, 2.45, 0, 0, Math.PI / 4);
}

function placeFront(game, group, spec) {
  const T = PINE_HOLLOW, x = T.x + spec.side * 13, z = T.z + spec.z, ry = -spec.side * Math.PI / 2;
  const s = new Shape(), object = new THREE.Group();
  BUILDERS[spec.kind](s, spec);
  if (spec.kind !== 'stable') shingle(s, spec.width / 2 - 0.18, spec.kind === 'saloon' ? 3.5 : 3.0, 5.25, SYMBOLS[spec.kind]);
  object.position.set(x, 0, z); object.rotation.y = ry;
  object.add(meshOf(s)); group.add(object);
  game.physics.fixedBox(x, spec.height / 2, z, spec.width / 2, spec.height / 2, spec.depth / 2, ry, GROUPS.world);
  if (!spec.npc) return null;
  // Like Mercy Crossing: the door point sits on the porch, the street spot just below it.
  const info = PINE_NPCS[spec.npc];
  return { ...spec, keeper: { npc: spec.npc, name: info.name, look: info.look }, x: T.x + spec.side * 8.55, z, outsideX: T.x + spec.side * 7.1, outsideZ: z };
}

/** Builds Pine Hollow into `group`. Returns its door sites (for rooms) and its idle townsfolk. */
export function buildPineHollow(game, group) {
  const T = PINE_HOLLOW, npcs = [], shade = [];
  const sites = FRONTS.map((spec) => placeFront(game, group, spec)).filter(Boolean);
  const s = new Shape();
  const solid = (x, z, hx, hz, h = 1.2, ry = 0) => game.physics.fixedBox(T.x + x, h / 2, T.z + z, hx, h / 2, hz, ry, GROUPS.world);
  const put = (build, x, z, ry = 0) => { const piece = new Shape(); build(piece); place(s, piece, x, 0, z, ry); };

  // Boardwalks join the porches on both sides of the street.
  for (const side of [-1, 1]) {
    s.box(1.9, 0.22, 52, PAL.plank, side * 8.45, 0.11, -3);
    for (let z = -28.5; z <= 22.5; z += 0.5) s.box(1.9, 0.02, 0.03, PAL.woodDark, side * 8.45, 0.225, z);
    s.box(0.1, 0.12, 52, PAL.woodDark, side * 7.5, 0.18, -3);
  }
  // The chapel closes the north end of the street; a well stands in its yard.
  put(chapel, 0, -50);
  solid(0, -50, 3.6, 5.1, 4.6);
  solid(0, -46, 1.2, 1.2, 9);
  put(well, 0, -36);
  solid(0, -36, 0.85, 0.85, 1.2);
  fence(s, -8, -42, -4, -42); fence(s, 4, -42, 8, -42);
  // Lamps and hitching rails stand between the storefronts, never at a door.
  for (const z of [-30, -17.5, -4, 10, 24]) for (const side of [-1, 1]) lampPost(s, side * 6.9, z);
  for (const [side, z] of [[-1, -17.5], [1, -17.5], [-1, 10], [1, 10]]) { hitchRail(s, side * 6.4, z + 1.6); put((p) => waterTrough(p, 2.2, 0.8, 0), side * 6.2, z - 1.8, Math.PI / 2); }
  // Barrels and crates on the boardwalks.
  for (const [x, z] of [[-8.9, -29], [-8.9, -28.2], [8.9, -16.5], [-8.9, 9.2], [8.9, 23.5]]) put((p) => barrel(p), x, z);
  for (const [x, z, k] of [[8.8, -29, 0.8], [-8.8, -16.2, 0.7], [8.8, 9.5, 0.75], [-8.8, 23.4, 0.8]]) put((p) => crate(p, k, PAL.plank, 0), x, z, 0.3);
  // A wagon unloaded outside the general store.
  { const w = wagonShape(); for (const part of w.parts) { part.rotateY(0.15); part.translate(-4.4, 0, -33); s.parts.push(part); } solid(-4.4, -33, 1.1, 1.7, 1.6, 0.15); }

  // East: the lumber yard and saw shed behind the saloon.
  put(sawShed, 27, -12);
  solid(27, -12, 2.6, 0.6);
  for (const [x, z] of [[24, -22], [31, -22], [24, -2], [31, -3]]) { put((p) => logPile(p), x, z); solid(x, z, 2.6, 1.3, 1.5); }
  for (let i = 0; i < 8; i++) s.cyl(0.35, 0.42, 0.5, 7, 0x6a4a32, 20 + (i % 4) * 3.2, 0.25, 6 + Math.floor(i / 4) * 3);
  shade.push(blot(T.x + 27, T.z - 12, 11, 13, 0x8a6a48, 0.45, 0.012, 0.2));
  // West: the livery corral with horses and hay.
  fence(s, -20, 10, -34, 10); fence(s, -34, 10, -34, 26); fence(s, -34, 26, -20, 26); fence(s, -20, 26, -20, 20); fence(s, -20, 10, -20, 16);
  for (const [x, z, ry, coat] of [[-27, 15, 0.6, 0x704631], [-30, 21, 2.4, 0x3a2a20], [-24.5, 22.5, -1.2, 0x9a8a78]]) {
    const h = new Shape(); horseShape(h, coat, 0x2a211c, false); place(s, h, x, 0, z, ry);
  }
  for (const [x, z] of [[-32.5, 12.5], [-32.5, 13.6]]) put((p) => hayBale(p, 1.1, 0.48, 0.6, 0), x, z);
  put((p) => waterTrough(p, 2.4, 0.8, 0), -21.8, 16, Math.PI / 2);
  for (const [x0, z0, x1, z1] of [[-20, 10, -34, 10], [-34, 10, -34, 26], [-34, 26, -20, 26], [-20, 26, -20, 20], [-20, 10, -20, 16]]) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0);
    solid(cx, cz, x0 === x1 ? 0.1 : len / 2, x0 === x1 ? len / 2 : 0.1, 1.1);
  }
  shade.push(blot(T.x - 27, T.z + 18, 8, 9, 0x8a6a48, 0.4, 0.012, 0));

  // Cabins in the trees behind the street, each facing the town.
  const cabins = [[-27, -26, Math.PI / 2], [-30, -8, Math.PI / 2], [28, 12, -Math.PI / 2], [30, 28, -Math.PI / 2 + 0.2], [-27, 36, Math.PI / 2 - 0.2], [16, -40, 0.3]];
  for (const [cx, cz, ry] of cabins) {
    const c = new Shape();
    cabin(c, 6, 5, 2.8, 0x7a5638);
    const o = new THREE.Group(); o.position.set(T.x + cx, 0, T.z + cz); o.rotation.y = ry;
    o.add(meshOf(c)); group.add(o);
    game.physics.fixedBox(T.x + cx, 1.6, T.z + cz, 3.2, 1.6, 2.7, ry, GROUPS.world);
  }

  const mesh = meshOf(s); mesh.position.set(T.x, 0, T.z); group.add(mesh);
  if (shade.length) group.add(blotMesh(shade));

  // Main Street, packed dirt from the south gate to the chapel yard, plus side lanes.
  const street = [];
  for (let z = PINE_STREET.south; z >= PINE_STREET.north; z -= 2) street.push({ x: T.x, z: T.z + z });
  group.add(road(resample(street, 1.1), 10, { fade: 5, seed: 21, base: 0x8a6a48, wash: 0x9c7c58 }));
  group.add(road(resample([{ x: T.x + 9.4, z: T.z - 3 }, { x: T.x + 18, z: T.z - 3 }, { x: T.x + 23, z: T.z - 7 }], 1), 3.2, { fade: 3, seed: 22, base: 0x8a6a48, wash: 0x9c7c58, ruts: false }));
  group.add(road(resample([{ x: T.x - 9.4, z: T.z + 23.5 }, { x: T.x - 15, z: T.z + 23.5 }, { x: T.x - 19, z: T.z + 23.5 }], 1), 3, { fade: 3, seed: 23, base: 0x8a6a48, wash: 0x9c7c58, ruts: false }));

  // A logger whittling on the boardwalk and a preacher at the chapel door.
  const idle = [
    ['pine-logger', { shirt: 0x8a3a2a, vest: 0x3a3a30, hat: 0x5a4a3a, band: PAL.woodDark, pants: 0x3a4250 }, -8.6, 13, Math.PI / 2],
    ['pine-preacher', { shirt: 0x1e1e22, vest: 0x1e1e22, hat: 0x111111, band: 0x111111, pants: 0x1e1e22 }, 1.4, -44.5, 0],
  ];
  for (const [id, look, x, z, yaw] of idle) {
    const model = townsperson(look);
    model.arm.rotation.x = 1.1;
    model.root.position.set(T.x + x, 0, T.z + z); model.root.rotation.y = yaw; group.add(model.root);
    npcs.push({ id, kind: 'idle', x: T.x + x, z: T.z + z, yaw, home: yaw, model, animation: { speed: 0, dt: 0, aiming: false, flash: 0 } });
  }
  return {
    npcs, sites,
    tick(dt, player) {
      for (const npc of npcs) {
        const near = player && Math.hypot(player.x - npc.x, player.z - npc.z) < 3;
        const want = near ? Math.atan2(player.x - npc.x, player.z - npc.z) : npc.home;
        npc.yaw = turnToward(npc.yaw, want, dt * 4);
        npc.model.root.rotation.y = npc.yaw;
        npc.animation.dt = dt; animateCharacter(npc.model, npc.animation); npc.model.arm.rotation.x = 1.1;
      }
    },
  };
}
