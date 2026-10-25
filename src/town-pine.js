// Pine Hollow: a logging town in the northwest forest. Its storefronts reuse
// the Mercy Crossing builders in timber colors, and each has a room inside
// (built by interiors.js) with its own keeper. Local frame: the street runs
// along z through the town center, fronts face the street.
import * as THREE from 'three';
import { PAL, Shape, meshOf } from './models.js';
import { GROUPS } from './physics.js';
import { BUILDERS, SYMBOLS, gable, lantern, shingle } from './town-buildings.js';
import { townsperson } from './townsfolk.js';
import { animateCharacter, turnToward } from './character.js';
import { road, resample } from './decals.js';
import { PINE_HOLLOW } from './terrain.js';

const FRONTS = [
  { id: 'pine-saloon', label: 'The Timber Wolf', kind: 'saloon', side: 1, z: -8, color: 0x4f6b4a, width: 9.6, depth: 7.4, height: 6.8, npc: 'ruby' },
  { id: 'pine-trade', label: 'Morrow Trading Post', kind: 'guns', side: -1, z: -8, color: 0x6a4a32, width: 8.4, depth: 7.2, height: 3.8, npc: 'hank' },
  { id: 'pine-deputy', label: "Deputy's Office", kind: 'sheriff', side: -1, z: 6, color: 0x5d5446, width: 8, depth: 7, height: 4, npc: 'hale' },
  { id: 'pine-doctor', label: 'Doc Lacey', kind: 'doctor', side: 1, z: 6, color: 0xcfc6a8, width: 7.6, depth: 6.8, height: 4.2, npc: 'lacey' },
];

export const PINE_NPCS = {
  ruby: { name: 'Ruby Tate', look: { shirt: 0x8a2f3c, vest: 0x2b2026, hat: 0x2b2026, band: 0xc9a273, pants: 0x3a2f35, apron: 0xe8dcc0 } },
  hank: { name: 'Hank Morrow', look: { shirt: 0x7a6a4a, vest: 0x4a3a28, hat: 0x5c4a32, band: PAL.woodDark, pants: 0x3f3a33, apron: 0xb39a72 } },
  hale: { name: 'Deputy Hale', look: { shirt: 0x5e6e7a, vest: 0x2e2a26, hat: 0x3a2e24, band: PAL.brass, pants: 0x34302c, star: true } },
  lacey: { name: 'Doc Lacey', look: { shirt: 0xe3dccb, vest: 0x3a4a3c, hat: 0x2b2a2a, band: PAL.black, pants: 0x34383d } },
};

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
}

function waterTower(s) {
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) s.box(0.22, 6, 0.22, PAL.wood, x, 3, z);
  s.box(3, 0.2, 3, PAL.plank, 0, 6, 0);
  s.cyl(1.6, 1.6, 2.6, 10, 0x7a5a3a, 0, 7.4, 0);
  for (let y = 6.5; y < 8.6; y += 0.7) s.cyl(1.63, 1.63, 0.08, 10, PAL.iron, 0, y, 0);
  s.cone(1.8, 1, 10, 0x4a4038, 0, 9.2, 0);
}

function placeFront(game, group, spec) {
  const T = PINE_HOLLOW, x = T.x + spec.side * 13, z = T.z + spec.z, ry = -spec.side * Math.PI / 2;
  const s = new Shape(), object = new THREE.Group();
  BUILDERS[spec.kind](s, spec);
  shingle(s, spec.width / 2 - 0.18, spec.kind === 'saloon' ? 3.5 : 3.0, 5.25, SYMBOLS[spec.kind]);
  object.position.set(x, 0, z); object.rotation.y = ry;
  object.add(meshOf(s)); group.add(object);
  game.physics.fixedBox(x, spec.height / 2, z, spec.width / 2, spec.height / 2, spec.depth / 2, ry, GROUPS.world);
  // Like Mercy Crossing: the door point sits on the porch, the street spot just below it.
  const info = PINE_NPCS[spec.npc];
  return { ...spec, keeper: { npc: spec.npc, name: info.name, look: info.look }, x: T.x + spec.side * 8.55, z, outsideX: T.x + spec.side * 7.1, outsideZ: z };
}

/** Builds Pine Hollow into `group`. Returns its door sites (for rooms) and a loafer on the street. */
export function buildPineHollow(game, group) {
  const T = PINE_HOLLOW, npcs = [];
  const sites = FRONTS.map((spec) => placeFront(game, group, spec));
  // A logger whittling by the water tower gives the street some life.
  const model = townsperson({ shirt: 0x8a3a2a, vest: 0x3a3a30, hat: 0x5a4a3a, band: PAL.woodDark, pants: 0x3a4250 });
  model.root.position.set(T.x - 19.5, 0, T.z + 4); model.root.rotation.y = Math.PI / 2; group.add(model.root);
  npcs.push({ id: 'pine-logger', kind: 'idle', x: T.x - 19.5, z: T.z + 4, yaw: Math.PI / 2, home: Math.PI / 2, model, animation: { speed: 0, dt: 0, aiming: false, flash: 0 } });
  // Cabins and a water tower behind the storefronts.
  const extras = new Shape();
  const cabins = [[-24, -24, 0.2], [24, -22, -0.15], [-25, 22, 0.1], [23, 24, -0.2], [-6, -34, 0], [8, 33, Math.PI]];
  for (const [cx, cz, ry] of cabins) {
    const c = new Shape();
    cabin(c, 6, 5, 2.8, 0x7a5638);
    const o = new THREE.Group(); o.position.set(T.x + cx, 0, T.z + cz); o.rotation.y = ry + (cx < 0 ? Math.PI / 2 : -Math.PI / 2);
    o.add(meshOf(c)); group.add(o);
    game.physics.fixedBox(T.x + cx, 1.6, T.z + cz, 3.2, 1.6, 2.7, o.rotation.y, GROUPS.world);
  }
  waterTower(extras);
  const tower = meshOf(extras); tower.position.set(T.x - 22, 0, T.z + 2); group.add(tower);
  game.physics.fixedBox(T.x - 22, 3, T.z + 2, 1.6, 3, 1.6, 0, GROUPS.world);
  // Lamp posts and hitching rails along the street.
  const street = new Shape();
  for (const z of [-20, -2, 14]) for (const side of [-1, 1]) {
    street.box(0.16, 3.2, 0.16, PAL.woodDark, side * 5.8, 1.6, z);
    lantern(street, side * 5.8, 3.05, z + 0.12);
    street.box(2.6, 0.12, 0.12, PAL.woodLight, side * 6.6, 0.95, z + 6);
    for (const dz of [-1.2, 1.2]) street.box(0.12, 1, 0.12, PAL.wood, side * 6.6, 0.5, z + 6 + dz);
  }
  const lamps = meshOf(street); lamps.position.set(T.x, 0, T.z); group.add(lamps);
  const points = [];
  for (let z = -46; z <= 44; z += 2) points.push({ x: T.x + Math.sin(z * 0.05) * 0.8, z: T.z + z });
  group.add(road(resample(points, 1.1), 6, { fade: 8, seed: 21, base: 0x8a6a48, wash: 0x9c7c58 }));
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
