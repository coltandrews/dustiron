// Static dressing for bandit camps: bedrolls, a cook tripod, firewood, saddles,
// trampled ground and, at harder camps, a lookout. None of it blocks movement,
// so camp navigation stays exactly as the props define it.
import * as THREE from 'three';
import { PAL, Shape, meshOf } from './models.js';
import { createRng } from './rng.js';
import { blot, blotMesh } from './decals.js';

function bedroll(s, x, z, yaw, color) {
  s.box(0.75, 0.12, 1.8, color, x, 0.06, z, 0, yaw, 0);
  s.box(0.7, 0.14, 0.5, PAL.canvas, x - Math.sin(yaw) * 0.72, 0.1, z - Math.cos(yaw) * 0.72, 0, yaw, 0);
  s.cyl(0.18, 0.18, 0.72, 7, color, x + Math.sin(yaw) * 0.95, 0.18, z + Math.cos(yaw) * 0.95, 0, yaw, Math.PI / 2);
}

function tripod(s, x, z) {
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    s.cyl(0.03, 0.035, 1.5, 4, PAL.woodDark, x + Math.cos(a) * 0.42, 0.68, z + Math.sin(a) * 0.42, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
  }
  s.box(0.02, 0.5, 0.02, PAL.iron, x, 1.05, z);
  s.cyl(0.2, 0.16, 0.24, 8, PAL.iron, x, 0.72, z);
}

function lookout(s, x, z, yaw) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + sn * lz, z - sn * lx + c * lz];
  for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const [px, pz] = at(lx, lz);
    s.box(0.16, 3.2, 0.16, PAL.woodDark, px, 1.6, pz, lz * 0.03, 0, -lx * 0.03);
  }
  const [cx, cz] = at(0, 0);
  s.box(2.3, 0.14, 2.3, PAL.plank, cx, 2.6, cz, 0, yaw, 0);
  for (const side of [-1, 1]) {
    const [rx, rz] = at(side * 1.1, 0); s.box(0.08, 0.6, 2.3, PAL.wood, rx, 2.95, rz, 0, yaw, 0);
    const [fx, fz] = at(0, side * 1.1); s.box(2.3, 0.6, 0.08, PAL.wood, fx, 2.95, fz, 0, yaw, 0);
  }
  const [lx, lz] = at(0, 1.5);
  for (const side of [-0.3, 0.3]) { const [px, pz] = at(side, 1.5); s.box(0.07, 2.8, 0.07, PAL.woodLight, px, 1.3, pz, -0.25 * Math.cos(yaw), 0, 0); }
  for (let y = 0.4; y < 2.5; y += 0.4) s.box(0.66, 0.05, 0.06, PAL.woodLight, lx, y, lz + (2.5 - y) * 0.1 * Math.cos(yaw), 0, yaw, 0);
}

/** Adds dressing around one camp. Positions avoid the camp's props by at least `gap`. */
export function campDecor(game, camp, layout, seed) {
  const rng = createRng(seed ^ 0x64656372), s = new Shape(), shade = [];
  const taken = layout.props.map((p) => ({ x: p.x, z: p.z, r: p.kind === 'tent' ? 2 : p.kind === 'wagon' ? 2.2 : p.kind === 'campfire' ? 1.2 : 0.8 }));
  const free = (x, z, r = 0.9) => Math.abs(x) < 20 && Math.abs(z) < 20 && taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  const keep = (x, z, r) => taken.push({ x, z, r });
  const cf = layout.campfire;
  // Trampled earth and ash around the fire.
  shade.push(blot(camp.x + cf.x, camp.z + cf.z, 6.5, 5.5, 0x9a6f48, 0.45, 0.013, rng.range(0, 3)));
  shade.push(blot(camp.x + cf.x, camp.z + cf.z, 1.3, 1.3, 0x3d3028, 0.6, 0.015));
  tripod(s, camp.x + cf.x, camp.z + cf.z);
  const rolls = [0x6b3a2a, 0x4b5a4a, 0x7a5a3a, 0x5a4a62, 0x8a6a42];
  for (let i = 0, made = 0; i < 24 && made < 3 + Math.min(2, camp.difficulty); i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(2.6, 3.6), x = cf.x + Math.cos(a) * d, z = cf.z + Math.sin(a) * d;
    if (!free(x, z, 1)) continue;
    bedroll(s, camp.x + x, camp.z + z, Math.atan2(cf.x - x, cf.z - z) + Math.PI, rng.pick(rolls)); keep(x, z, 1); made++;
  }
  // Firewood stack and a pair of saddles near the fire.
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, 6), d = rng.range(4.5, 6.5), x = cf.x + Math.cos(a) * d, z = cf.z + Math.sin(a) * d;
    if (!free(x, z, 1)) continue;
    for (let k = 0; k < 7; k++) s.cyl(0.1, 0.12, 0.9, 6, k % 2 ? PAL.wood : PAL.woodLight, camp.x + x + (k % 3) * 0.2 - 0.2, 0.1 + Math.floor(k / 3) * 0.2, camp.z + z, Math.PI / 2, a, 0);
    keep(x, z, 1); break;
  }
  for (let i = 0, made = 0; i < 12 && made < 2; i++) {
    const a = rng.range(0, 6), d = rng.range(4, 6), x = cf.x + Math.cos(a) * d, z = cf.z + Math.sin(a) * d;
    if (!free(x, z, 0.7)) continue;
    s.box(0.6, 0.3, 0.45, 0x6b3a22, camp.x + x, 0.18, camp.z + z, 0, a, 0.2);
    s.box(0.66, 0.06, 0.62, 0x8d3e2e, camp.x + x, 0.04, camp.z + z, 0, a, 0);
    keep(x, z, 0.7); made++;
  }
  // Harder camps post a lookout at their edge.
  if (camp.difficulty >= 1) {
    for (let i = 0; i < 30; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(13, 17), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!free(x, z, 2)) continue;
      lookout(s, camp.x + x, camp.z + z, a); keep(x, z, 2);
      shade.push(blot(camp.x + x, camp.z + z, 2, 2, 0x8a5a36, 0.35));
      break;
    }
  }
  // Worn footpaths between the fire and each tent.
  for (const tent of layout.props.filter((p) => p.kind === 'tent')) {
    shade.push(blot(camp.x + (tent.x + cf.x) / 2, camp.z + (tent.z + cf.z) / 2, Math.hypot(tent.x - cf.x, tent.z - cf.z) / 2, 1.1, 0xa47448, 0.4, 0.013, Math.atan2(tent.z - cf.z, tent.x - cf.x)));
  }
  const group = new THREE.Group();
  group.add(meshOf(s), blotMesh(shade));
  game.levelGroup.add(group);
  return group;
}
