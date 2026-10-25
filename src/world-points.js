// Places to visit between town and the camps: a homestead, a wounded traveler,
// a trail merchant, buried caches, wrecked wagons and graves. Each one has a
// small model and an interaction; what the player did there is saved per life.
import * as THREE from 'three';
import { PAL, Shape, meshOf, wagonShape } from './models.js';
import { GROUPS } from './physics.js';
import { createRng } from './rng.js';
import { townsperson } from './townsfolk.js';
import { blot, blotMesh } from './decals.js';
import { generateCamp } from './level.js';
import { animateCharacter, poseSeated } from './character.js';

const LOOKS = {
  amos: { shirt: 0x8a7a5a, vest: 0x5b4127, hat: 0x6b5236, band: PAL.woodDark, pants: 0x3f4a5a },
  eli: { shirt: 0xd9c9a6, vest: 0x4b5a4a, hat: 0x9a7447, band: PAL.woodDark, pants: 0x514338, scarf: 0x8e3f39 },
  juan: { shirt: 0xb85c3a, vest: 0x2f2a27, hat: 0xc9a273, band: 0x8e3f39, pants: 0x3a3330, scarf: 0xe0b450 },
  otto: { shirt: 0x7a3a2a, vest: 0x5a4632, hat: 0x6a5a42, band: 0x2e2420, pants: 0x4a4436, scarf: 0xb79b70 },
};

function lodge(s, x, z, game) {
  for (let y = 0.2; y < 2.8; y += 0.36) {
    for (const side of [-1, 1]) s.cyl(0.18, 0.18, 6.4, 6, 0x6a4a32, x, y, z + side * 2.5, 0, 0, Math.PI / 2);
    for (const side of [-1, 1]) s.cyl(0.18, 0.18, 5.4, 6, 0x7a5638, x + side * 3, y + 0.18, z, Math.PI / 2);
  }
  s.box(6, 2.8, 5, 0x5a3f2b, x, 1.4, z);
  for (const side of [-1, 1]) s.box(6.8, 0.2, 3.4, 0x4a4038, x, 3.5, z + side * 1.4, side * 0.6);
  s.box(1.1, 2.1, 0.1, PAL.woodDark, x, 1.05, z + 2.7);
  s.box(0.6, 3.8, 0.6, PAL.rockDark, x - 2.4, 1.9, z - 1.2);
  // Drying racks with stretched hides and a pile of antlers.
  for (let i = 0; i < 3; i++) {
    const rx = x + 4.2 + i * 1.5;
    s.box(0.1, 1.8, 0.1, PAL.woodDark, rx - 0.6, 0.9, z + 1.5); s.box(0.1, 1.8, 0.1, PAL.woodDark, rx + 0.6, 0.9, z + 1.5);
    s.box(1.3, 0.08, 0.08, PAL.woodDark, rx, 1.75, z + 1.5);
    s.box(1, 1.1, 0.05, [0xa0805a, 0x8a6a48, 0x6a5a4a][i], rx, 1.15, z + 1.5);
  }
  for (let i = 0; i < 4; i++) s.cyl(0.03, 0.05, 0.8, 4, PAL.bone, x - 3.5 + i * 0.2, 0.35, z + 2.4, 0.6, i, 0.4);
  game.physics.fixedBox(x, 1.4, z, 3.1, 1.4, 2.6, 0, GROUPS.world);
}

function mill(s, x, z, game) {
  // Charred posts and beams, a fallen saw blade and the stacked logs nobody took.
  for (const [dx, dz, h] of [[-4, -3, 3.2], [0, -3, 1.6], [4, -3, 2.6], [-4, 3, 2.2], [4, 3, 3.4], [0, 3, 0.9]]) s.box(0.35, h, 0.35, 0x2c2420, x + dx, h / 2, z + dz);
  s.box(8.6, 0.3, 0.35, 0x2c2420, x, 3.1, z - 3, 0, 0, 0.08);
  s.box(9, 0.2, 7, 0x3a2e28, x, 0.1, z);
  s.cyl(1.3, 1.3, 0.06, 16, 0x8a8a90, x + 1.2, 0.15, z + 0.4, Math.PI / 2 - 0.08, 0.3, 0);
  for (let i = 0; i < 5; i++) s.cyl(0.32, 0.32, 5, 7, 0x6a4a32, x - 7, 0.32 + Math.floor(i / 3) * 0.55, z - 1.4 + (i % 3) * 0.66 + Math.floor(i / 3) * 0.33, 0, 0, Math.PI / 2);
  for (let i = 0; i < 8; i++) s.box(0.5, 0.06, 0.5, 0x1e1a18, x - 3 + i * 0.9, 0.22, z + Math.sin(i) * 2, 0, i, 0);
  game.physics.fixedBox(x - 7, 0.6, z - 0.7, 2.5, 0.6, 1.1, 0, GROUPS.world);
}

function den(s, x, z, game) {
  // A dark hollow under a heap of mossy boulders, with bones at the mouth.
  s.rock(5, 0x6f6c62, x, 2.2, z - 2, 0.8, 0.25, 41);
  s.rock(3.4, 0x7d7a70, x - 4, 1.4, z, 0.9, 0.3, 42);
  s.rock(3, 0x5b7a40, x + 3.6, 1.3, z - 0.5, 0.7, 0.3, 43);
  s.box(2.6, 1.8, 0.1, 0x14100e, x, 0.9, z + 2.4);
  for (let i = 0; i < 5; i++) s.box(0.06, 0.06, 0.6, PAL.bone, x - 1 + i * 0.5, 0.04, z + 3.4 + Math.sin(i) * 0.4, 0, i, 0);
  game.physics.fixedCylinder(x, 2, z - 2, 2, 4.2, GROUPS.world);
  game.physics.fixedCylinder(x - 4, 1.4, z, 1.4, 2.8, GROUPS.world);
  game.physics.fixedCylinder(x + 3.6, 1.3, z - 0.5, 1.3, 2.4, GROUPS.world);
}
export const VISIT_RANGE = 14;

function homestead(s, x, z, game) {
  s.box(6, 3.2, 5, 0x806342, x, 1.6, z);
  s.box(6.2, 0.3, 5.2, PAL.rockDark, x, 0.15, z);
  for (const side of [-1, 1]) s.box(6.8, 0.2, 3.3, 0x51402f, x, 3.75, z + side * 1.35, side * 0.55);
  s.box(1.1, 2.2, 0.1, PAL.woodDark, x, 1.1, z + 2.52);
  s.box(1.1, 1.0, 0.1, 0x46626a, x - 1.8, 1.9, z + 2.52); s.box(1.1, 1.0, 0.1, 0x46626a, x + 1.8, 1.9, z + 2.52);
  s.box(0.7, 2.2, 0.7, PAL.rockDark, x - 2, 3.6, z - 1.2);
  s.box(6.4, 0.14, 1.6, PAL.plank, x, 0.08, z + 3.3);
  // A small fenced garden and a well.
  for (let i = 0; i <= 8; i++) s.box(0.12, 1, 0.12, PAL.woodDark, x + 4.5 + (i % 3) * 1.5, 0.5, z - 2 + Math.floor(i / 3) * 1.5);
  for (let i = 0; i < 6; i++) s.cone(0.18, 0.4, 5, 0x6d8a50, x + 5 + (i % 3) * 0.9, 0.2, z - 1.2 + Math.floor(i / 3) * 1.4);
  s.cyl(0.7, 0.75, 0.8, 10, PAL.rock, x - 4.5, 0.4, z + 1); s.box(1.6, 0.1, 0.1, PAL.woodDark, x - 4.5, 1.9, z + 1);
  for (const dx of [-0.7, 0.7]) s.box(0.1, 1.5, 0.1, PAL.woodDark, x - 4.5 + dx, 1.15, z + 1);
  game.physics.fixedBox(x, 1.6, z, 3, 1.6, 2.5, 0, GROUPS.world);
  game.physics.fixedCylinder(x - 4.5, 0.5, z + 1, 0.5, 0.8, GROUPS.world);
}

function cairn(s, x, z, dug) {
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    s.rock(0.22 + (i % 3) * 0.06, i % 2 ? PAL.rockLight : PAL.rock, x + Math.cos(a) * 0.35, 0.12 + (i > 4 ? 0.25 : 0), z + Math.sin(a) * 0.35, 0.7, 0.3, i + 3);
  }
  if (dug) s.box(0.9, 0.05, 0.6, 0x5c3a22, x + 0.9, 0.03, z);
}

function wreck(s, x, z, yaw) {
  const w = new Shape();
  for (const part of wagonShape().parts) w.parts.push(part);
  for (const part of w.parts) { part.rotateZ(0.42); part.rotateY(yaw); part.translate(x, 0.35, z); s.parts.push(part); }
  s.cyl(0.55, 0.55, 0.1, 12, PAL.woodDark, x + 1.6, 0.06, z + 1.1, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) s.box(0.7, 0.45, 0.5, PAL.plank, x - 1.6 + i * 0.4, 0.22, z - 1.4 + i * 0.3, 0, i, 0);
}

function grave(s, x, z) {
  s.box(0.1, 1.1, 0.1, 0x8a6a48, x, 0.55, z, 0.08); s.box(0.55, 0.1, 0.1, 0x8a6a48, x, 0.78, z, 0.08);
  s.box(0.9, 0.12, 1.8, 0x9a7650, x, 0.06, z + 1);
  for (let i = 0; i < 6; i++) s.rock(0.14, PAL.rock, x - 0.45 + (i % 2) * 0.9, 0.08, z + 0.3 + Math.floor(i / 2) * 0.6, 0.6, 0.3, i);
}

function merchantCamp(s, x, z, game) {
  const wagon = wagonShape();
  for (const part of wagon.parts) { part.rotateY(0.4); part.translate(x, 0, z); s.parts.push(part); }
  s.box(1.6, 0.8, 0.8, PAL.plank, x + 1.8, 0.4, z + 1.6);
  for (let i = 0; i < 3; i++) s.box(0.3, 0.2, 0.3, [PAL.red, 0x5d6b3a, PAL.brass][i], x + 1.4 + i * 0.4, 0.9, z + 1.6);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; s.rock(0.14, PAL.rockDark, x - 2 + Math.cos(a) * 0.5, 0.06, z + 2 + Math.sin(a) * 0.5, 0.6, 0.3, i); }
  game.physics.fixedBox(x, 0.8, z, 1.15, 0.8, 1.7, 0.4, GROUPS.world);
}

/** Camp positions for objects that sit inside a camp, such as the medicine chest. */
export function campFire(game, camp) {
  const index = game.run.world.camps.indexOf(camp);
  const layout = generateCamp((game.run.world.seed ?? game.run.seed) + index * 104729, camp.difficulty);
  return { x: camp.x + layout.campfire.x, z: camp.z + layout.campfire.z };
}

export function buildWorldPoints(game, group) {
  const run = game.run, world = run.world, s = new Shape(), shade = [], npcs = [], points = [];
  const rng = createRng((world.seed ?? run.seed) ^ 0x706f696e);
  const state = (id) => run.known[id];
  const npc = (id, name, x, z, yaw, seated = false) => {
    const model = townsperson(LOOKS[id]);
    model.arm.rotation.x = 1.1;
    model.root.position.set(x, 0, z); model.root.rotation.y = yaw;
    group.add(model.root);
    const entry = { id, name, x, z, yaw, seated, model, animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
    npcs.push(entry);
    return entry;
  };
  for (const site of world.sites) {
    const { x, z } = site;
    if (site.kind === 'homestead') {
      homestead(s, x, z, game);
      const amos = npc('amos', 'Amos Hollis', x + 1.5, z + 4.2, 0);
      points.push({ id: 'amos', kind: 'npc', npc: 'amos', name: amos.name, x: amos.x, z: amos.z, site });
    } else if (site.kind === 'traveler') {
      if (state(site.id) === 'helped') continue;
      const eli = npc('eli', 'Eli Watts', x, z, 0.6, true);
      s.rock(0.9, PAL.rock, x - 0.9, 0.4, z - 0.8, 0.7, 0.25, 9);
      s.box(0.7, 0.12, 1.6, 0x6b3a2a, x + 0.9, 0.06, z + 0.3, 0, 0.4, 0);
      shade.push(blot(x, z, 1.2, 1.2, 0x7a2a20, 0.4));
      points.push({ id: 'eli', kind: 'npc', npc: 'eli', name: eli.name, x, z, site });
    } else if (site.kind === 'merchant') {
      merchantCamp(s, x, z, game);
      const juan = npc('juan', 'Juan Ortega', x + 2.2, z + 2.6, 0.3);
      points.push({ id: 'juan', kind: 'npc', npc: 'juan', name: juan.name, x: juan.x, z: juan.z, site });
    } else if (site.kind === 'cache') {
      cairn(s, x, z, state(site.id) === 'looted');
      if (state(site.id) !== 'looted') points.push({ id: site.id, kind: 'cache', label: 'Dig at the cairn', x, z, site });
    } else if (site.kind === 'wreck') {
      wreck(s, x, z, rng.range(0, 6));
      game.physics.fixedBox(x, 0.8, z, 1.4, 0.8, 1.8, 0, GROUPS.world);
      shade.push(blot(x, z, 3, 2.4, 0x7a5a3a, 0.35));
      if (state(site.id) !== 'looted') points.push({ id: site.id, kind: 'loot', label: 'Search the wagon', x: x + 1.8, z: z + 0.6, site });
    } else if (site.kind === 'lodge') {
      lodge(s, x, z, game);
      const otto = npc('otto', 'Otto Brandt', x + 1.2, z + 3.6, 0.2);
      points.push({ id: 'otto', kind: 'npc', npc: 'otto', name: otto.name, x: otto.x, z: otto.z, site });
    } else if (site.kind === 'mill') {
      mill(s, x, z, game);
      shade.push(blot(x, z, 7, 5.5, 0x1e1a18, 0.45));
    } else if (site.kind === 'den') {
      den(s, x, z, game);
    } else if (site.kind === 'grave') {
      grave(s, x, z);
      points.push({ id: site.id, kind: 'grave', label: 'Read the marker', x, z: z + 0.4, site });
    }
  }
  // The stolen medicine chest waits beside the fire at its camp until it is carried off.
  const med = game.questDefs.find((q) => q.id === 'medicine'), medState = med && run.quests.medicine;
  if (med && medState && !medState.carrying && medState.status !== 'turnedIn' && medState.status !== 'failed') {
    const camp = world.camps.find((c) => c.id === med.campId), fire = campFire(game, camp);
    const chest = new Shape();
    chest.box(0.8, 0.5, 0.55, 0xd8cdb5, 0, 0.25, 0); chest.box(0.84, 0.08, 0.6, PAL.woodDark, 0, 0.52, 0);
    chest.box(0.3, 0.3, 0.02, 0xa63e32, 0, 0.3, 0.29); chest.box(0.1, 0.3, 0.03, 0xece1c4, 0, 0.3, 0.3); chest.box(0.3, 0.1, 0.03, 0xece1c4, 0, 0.3, 0.3);
    const mesh = meshOf(chest); mesh.position.set(fire.x + 2.2, 0, fire.z + 0.6); group.add(mesh);
    points.push({ id: 'medicine-chest', kind: 'medicine', label: 'Take the medicine chest', x: fire.x + 2.2, z: fire.z + 0.6, mesh });
  }
  group.add(meshOf(s));
  if (shade.length) group.add(blotMesh(shade));

  const proofs = [];
  return {
    npcs, points, proofs,
    /** Places the player can use right now. */
    interactions() { return [...points, ...proofs]; },
    remove(point) {
      const list = point.kind === 'proof' ? proofs : points;
      const i = list.indexOf(point);
      if (i >= 0) list.splice(i, 1);
      if (point.mesh) { group.remove(point.mesh); point.mesh.geometry.dispose(); }
    },
    /** Marks a dead bounty target so the player can take proof from the body. */
    addProof(enemy) {
      if (proofs.some((p) => p.enemy === enemy)) return;
      proofs.push({ id: `proof-${enemy.id}`, kind: 'proof', label: 'Take proof', enemy,
        get x() { return enemy.corpse?.mesh.position.x ?? enemy.x; }, get z() { return enemy.corpse?.mesh.position.z ?? enemy.z; } });
    },
    removeNpc(id) {
      const i = npcs.findIndex((n) => n.id === id);
      if (i >= 0) { group.remove(npcs[i].model.root); npcs.splice(i, 1); }
      const p = points.findIndex((q) => q.npc === id);
      if (p >= 0) points.splice(p, 1);
    },
    tick(dt, player) {
      for (const n of npcs) {
        n.animation.dt = dt;
        animateCharacter(n.model, n.animation);
        if (n.seated) poseSeated(n.model);
        else n.model.arm.rotation.x = 1.1;
        if (player && Math.hypot(player.x - n.x, player.z - n.z) < 5 && !n.seated) {
          n.yaw += Math.atan2(Math.sin(Math.atan2(player.x - n.x, player.z - n.z) - n.yaw), Math.cos(Math.atan2(player.x - n.x, player.z - n.z) - n.yaw)) * Math.min(1, dt * 4);
          n.model.root.rotation.y = n.yaw;
        }
      }
    },
  };
}
