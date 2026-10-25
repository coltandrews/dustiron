// Wildlife for hunting. Animals appear around the rider according to the land
// (pronghorn and rabbits in the desert, deer, elk, boar and wolves in the
// pines), graze, bolt at gunfire and leave a carcass to skin. Wolves and the
// great bear Old Scar fight back. Each browser keeps its own animals; online,
// their bites are sent to the server, which owns the rider's health.
import * as THREE from 'three';
import { T } from './tuning.js';
import { GROUPS, RAPIER } from './physics.js';
import { MAT, Shape, meshOf } from './models.js';
import { angleDelta, turnToward } from './character.js';
import { forestAt, inRiver } from './terrain.js';
import { townsOf } from './towns.js';
import { PELTS } from './items.js';

export const SPECIES = {
  rabbit: { hp: 12, speed: 7.5, size: 0.32, radius: 0.3, sense: 12, herd: [1, 2], pelt: 'rabbitPelt', color: 0xa08a6a, belly: 0xd8cbb0 },
  pronghorn: { hp: 55, speed: 10, size: 0.85, radius: 0.5, sense: 26, herd: [2, 4], pelt: 'hide', color: 0xc08a50, belly: 0xf0e6d0, horns: 'prong' },
  deer: { hp: 65, speed: 9, size: 0.9, radius: 0.5, sense: 22, herd: [2, 3], pelt: 'deerHide', color: 0x8a6440, belly: 0xd8c8a8, horns: 'antler' },
  elk: { hp: 140, speed: 8, size: 1.25, radius: 0.7, sense: 26, herd: [1, 2], pelt: 'elkHide', color: 0x6e5034, belly: 0xc8b090, horns: 'rack' },
  boar: { hp: 85, speed: 6.5, size: 0.7, radius: 0.55, sense: 14, herd: [1, 2], pelt: 'boarHide', color: 0x4a3a30, belly: 0x5a4a3e, tusks: true, temper: 'hurt', bite: 14 },
  wolf: { hp: 60, speed: 8.5, size: 0.78, radius: 0.5, sense: 26, herd: [3, 4], pelt: 'wolfPelt', color: 0x6a6a6e, belly: 0xb8b8b4, temper: 'hunt', bite: 11 },
  bear: { hp: 650, speed: 7.2, size: 1.75, radius: 0.95, sense: 34, herd: [1, 1], pelt: 'bearHide', color: 0x3a2a20, belly: 0x5a4030, temper: 'hunt', bite: 30, legend: true },
};

const SPAWN = { min: 70, max: 110, despawn: 150 };

/** Which animals live at a spot, by how green the land is. */
function speciesFor(green, rng) {
  if (green > 0.6) return rng < 0.36 ? 'deer' : rng < 0.52 ? 'elk' : rng < 0.7 ? 'boar' : rng < 0.85 ? 'wolf' : 'rabbit';
  if (green > 0.25) return rng < 0.4 ? 'deer' : rng < 0.6 ? 'boar' : rng < 0.85 ? 'rabbit' : 'pronghorn';
  return rng < 0.55 ? 'pronghorn' : 'rabbit';
}

function buildModel(def) {
  const s = new Shape(), k = def.size, c = def.color, legs = [];
  const tall = def.horns || def === SPECIES.wolf ? 1 : 0.8;
  s.box(0.5 * k, 0.48 * k, 1.15 * k, c, 0, 0.95 * k * tall, 0);
  s.box(0.42 * k, 0.14 * k, 0.9 * k, def.belly, 0, 0.72 * k * tall, 0);
  s.box(0.24 * k, 0.4 * k, 0.26 * k, c, 0, 1.22 * k * tall, 0.55 * k, -0.5);
  s.box(0.24 * k, 0.24 * k, 0.42 * k, c, 0, 1.4 * k * tall, 0.78 * k);
  s.box(0.12 * k, 0.1 * k, 0.12 * k, 0x1a1412, 0, 1.36 * k * tall, 1.0 * k);
  for (const side of [-1, 1]) s.cone(0.06 * k, 0.18 * k, 4, c, side * 0.1 * k, 1.58 * k * tall, 0.7 * k);
  s.box(0.1 * k, 0.12 * k, 0.24 * k, def.belly, 0, 1.0 * k * tall, -0.62 * k, 0.6);
  if (def.horns === 'antler' || def.horns === 'rack') {
    const r = def.horns === 'rack' ? 1.6 : 1;
    for (const side of [-1, 1]) {
      s.box(0.05 * k, 0.5 * k * r, 0.05 * k, 0xd8c8a8, side * 0.16 * k, 1.75 * k * tall, 0.72 * k, 0.2, 0, side * 0.5);
      s.box(0.04 * k, 0.28 * k * r, 0.04 * k, 0xd8c8a8, side * 0.3 * k, 1.9 * k * tall, 0.66 * k, -0.4, 0, side * 0.2);
    }
  } else if (def.horns === 'prong') for (const side of [-1, 1]) s.box(0.05 * k, 0.32 * k, 0.05 * k, 0x2a2420, side * 0.08 * k, 1.66 * k * tall, 0.74 * k, 0.15);
  if (def.tusks) for (const side of [-1, 1]) s.cone(0.04 * k, 0.16 * k, 4, 0xeadfc6, side * 0.1 * k, 1.28 * k * tall, 0.98 * k, -1.2);
  const root = new THREE.Group();
  root.add(meshOf(s, MAT.solid));
  for (const [x, z] of [[-0.16, 0.42], [0.16, 0.42], [-0.16, -0.42], [0.16, -0.42]]) {
    const leg = new THREE.Group(), ls = new Shape();
    ls.box(0.11 * k, 0.75 * k * tall, 0.11 * k, c, 0, -0.37 * k * tall, 0);
    ls.box(0.12 * k, 0.08 * k, 0.14 * k, 0x2a2018, 0, -0.74 * k * tall, 0.02 * k);
    leg.add(meshOf(ls, MAT.solid));
    leg.position.set(x * k, 0.78 * k * tall, z * k);
    root.add(leg); legs.push(leg);
  }
  return { root, legs };
}

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.animals = [];
    this.spawnT = 1;
    this.carcasses = [];
  }

  dispose() {
    for (const a of [...this.animals]) this.remove(a);
    for (const c of this.carcasses) this.game.levelGroup?.remove(c.model.root);
    this.carcasses = [];
  }

  spawn(kind, x, z) {
    const g = this.game, def = SPECIES[kind];
    const model = buildModel(def);
    model.root.position.set(x, 0, z);
    g.levelGroup.add(model.root);
    const cap = g.physics.kinematicCapsule(x, z, T.player.halfHeight, def.radius, GROUPS.enemy, null);
    const a = {
      kind, def, model, x, z, px: x, pz: z, yaw: Math.random() * 6.28, prevYaw: 0, hp: def.hp, alive: true, animal: true,
      state: 'graze', stateT: Math.random() * 3, tx: x, tz: z, speed: 0, phase: Math.random() * 6, biteT: 0, hurt: false,
      body: cap.body, collider: cap.collider, bodyY: cap.y, flash: 0,
    };
    a.onHit = (dmg, dx, dz, knock, zone) => this.hit(a, dmg * (zone === 'head' ? 1.6 : 1), dx, dz);
    // The collider's owner lets player shots find the animal.
    g.physics.setOwner(cap.collider, a);
    this.animals.push(a);
    return a;
  }

  remove(a) {
    const g = this.game;
    if (a.body) { g.physics.removeBody(a.body); a.body = null; }
    g.levelGroup?.remove(a.model.root);
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
  }

  /** Gunfire nearby sends every animal running, and makes hunters come. */
  hear(x, z, range = 45) {
    for (const a of this.animals) {
      if (!a.alive || Math.hypot(a.x - x, a.z - z) > range) continue;
      if (a.def.temper === 'hunt') a.state = 'charge';
      else this.flee(a, x, z);
    }
  }

  flee(a, fx, fz) {
    const dx = a.x - fx, dz = a.z - fz, d = Math.hypot(dx, dz) || 1;
    a.state = 'flee'; a.stateT = 6 + Math.random() * 3;
    a.tx = a.x + dx / d * 60; a.tz = a.z + dz / d * 60;
  }

  hit(a, dmg, dx, dz) {
    if (!a.alive) return { killed: false, crit: false };
    a.hp -= dmg;
    a.flash = 0.08;
    const g = this.game;
    g.audio.at('enemyHurt', a.x, a.z, { vol: 0.4, pitch: a.def.size < 0.5 ? 1.8 : a.def.legend ? 0.6 : 1.2 });
    if (a.hp <= 0) { this.kill(a, dx, dz); return { killed: true, crit: false }; }
    a.hurt = true;
    if (a.def.temper) a.state = 'charge';
    else { const P = g.player; this.flee(a, P.x, P.z); }
    return { killed: false, crit: false };
  }

  kill(a, dx, dz) {
    const g = this.game;
    a.alive = false;
    if (a.body) { g.physics.removeBody(a.body); a.body = null; }
    a.model.root.rotation.z = Math.PI / 2 * (dx > 0 ? 1 : -1);
    a.model.root.position.y = a.def.size * 0.3;
    for (const leg of a.model.legs) leg.rotation.x = 0.2;
    g.audio.at('bodyFall', a.x, a.z, { vol: a.def.size, delay: 0.2 });
    this.animals.splice(this.animals.indexOf(a), 1);
    this.carcasses.push({ ...a, t: 0, id: `skin-${Math.random().toString(36).slice(2)}` });
    if (a.def.legend) {
      g.ui.toast('Old Scar falls. The forest goes quiet.', 5);
      g.audio.cue?.('victory');
      g.questEvent({ type: 'hunt', animal: 'bear' });
    }
  }

  /** Carcasses the player can skin. */
  points() {
    return this.carcasses.map((c) => ({ id: c.id, kind: 'skin', label: `Skin the ${c.kind === 'bear' ? 'great bear' : c.kind}`, x: c.x, z: c.z, carcass: c }));
  }

  skin(point) {
    const g = this.game, c = point.carcass, run = g.run, pelt = c.def.pelt;
    if ((run.items[pelt] ?? 0) >= 9) { g.ui.toast('You cannot carry more of those.'); return; }
    run.items[pelt] = (run.items[pelt] ?? 0) + 1;
    g.levelGroup.remove(c.model.root);
    this.carcasses.splice(this.carcasses.indexOf(c), 1);
    g.audio.play('bandage', { vol: 0.5, pitch: 0.7 });
    g.ui.questNote(`${PELTS[pelt].name} · ${run.items[pelt]} carried. Hank or Otto will buy it.`);
    g.save();
  }

  // ---------- per tick ----------

  tick(dt) {
    const g = this.game, P = g.player;
    if (!P || g.frontier?.inside) return;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; this.populate(P); }
    for (const a of [...this.animals]) {
      a.px = a.x; a.pz = a.z; a.prevYaw = a.yaw;
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (d > SPAWN.despawn && !a.def.legend) { this.remove(a); continue; }
      this.think(a, P, d, dt);
    }
    for (const c of [...this.carcasses]) {
      c.t += dt;
      if (c.t > 150 || Math.hypot(c.x - P.x, c.z - P.z) > SPAWN.despawn * 1.3) { g.levelGroup.remove(c.model.root); this.carcasses.splice(this.carcasses.indexOf(c), 1); }
    }
  }

  populate(P) {
    const g = this.game, world = g.run.world, green = forestAt(P.x, P.z);
    const cap = green > 0.5 ? 9 : 6, near = this.animals.filter((a) => Math.hypot(a.x - P.x, a.z - P.z) < 130).length;
    // Old Scar keeps to his den until he is killed.
    const den = world.sites?.find((s) => s.kind === 'den');
    if (den && !g.run.questFlags?.['hunt:bear'] && !this.animals.some((a) => a.def.legend) && Math.hypot(den.x - P.x, den.z - P.z) < 90 && Math.hypot(den.x - P.x, den.z - P.z) > 30) {
      this.spawn('bear', den.x, den.z + 6);
    }
    if (near >= cap || g.inTown()) return;
    const angle = Math.random() * Math.PI * 2, dist = SPAWN.min + Math.random() * (SPAWN.max - SPAWN.min);
    const x = P.x + Math.cos(angle) * dist, z = P.z + Math.sin(angle) * dist;
    if (Math.abs(x) > world.half - 10 || Math.abs(z) > world.half - 10 || inRiver(x, z, 3)) return;
    if (townsOf(world).some((t) => Math.hypot(x - t.x, z - t.z) < t.radius + 30)) return;
    if (world.camps.some((c) => Math.hypot(x - c.x, z - c.z) < 45)) return;
    const kind = speciesFor(forestAt(x, z), Math.random()), [lo, hi] = SPECIES[kind].herd;
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    for (let i = 0; i < n; i++) this.spawn(kind, x + (Math.random() - 0.5) * 6, z + (Math.random() - 0.5) * 6);
  }

  think(a, P, d, dt) {
    const g = this.game, def = a.def;
    a.stateT -= dt;
    const sense = def.sense * (P.sneaking ? 0.55 : P.moveFraction > 0.75 ? 1.15 : 1) * (g.horse?.mounted ? 1.2 : 1);
    if (P.alive && !g.inTown()) {
      if (def.temper === 'hunt' && d < sense && a.state !== 'charge') a.state = 'charge';
      else if (!def.temper && d < sense && a.state !== 'flee') this.flee(a, P.x, P.z);
      else if (def.temper === 'hurt' && a.hurt && a.state !== 'charge') a.state = 'charge';
    } else if (a.state === 'charge') a.state = 'graze';
    let want = 0, tx = a.tx, tz = a.tz;
    if (a.state === 'charge') {
      tx = P.x; tz = P.z; want = def.speed * (def.legend ? 0.95 : 1);
      if (d > 60) { a.state = 'graze'; a.hurt = false; }
      a.biteT -= dt;
      if (d < def.radius + 1.3 && a.biteT <= 0) { a.biteT = def.legend ? 1.4 : 1.1; this.bite(a, P); }
      if (d < def.radius + 0.9) want = 0;
    } else if (a.state === 'flee') {
      want = def.speed;
      if (a.stateT <= 0) a.state = 'graze';
    } else {
      if (a.stateT <= 0) { a.stateT = 3 + Math.random() * 5; const r = Math.random() * 8; a.tx = a.x + Math.cos(r) * 6; a.tz = a.z + Math.sin(r) * 6; a.walk = Math.random() < 0.5; }
      want = a.walk ? def.speed * 0.18 : 0;
    }
    const dx = tx - a.x, dz = tz - a.z, l = Math.hypot(dx, dz);
    if (l < 0.5) want = 0;
    if (want > 0) a.yaw = turnToward(a.yaw, Math.atan2(dx, dz), dt * (a.state === 'graze' ? 2 : 6));
    a.speed += (want - a.speed) * Math.min(1, dt * 4);
    const mx = Math.sin(a.yaw) * a.speed * dt, mz = Math.cos(a.yaw) * a.speed * dt;
    if (a.body && (mx || mz)) {
      const cc = g.enemyController;
      cc.computeColliderMovement(a.collider, { x: mx, y: 0, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.enemyMove);
      const mv = cc.computedMovement();
      a.x += mv.x; a.z += mv.z;
      if (Math.hypot(mv.x, mv.z) < Math.hypot(mx, mz) * 0.3 && a.state !== 'charge') a.yaw += 1.2;
      a.body.setNextKinematicTranslation({ x: a.x, y: a.bodyY, z: a.z });
    }
  }

  bite(a, P) {
    const g = this.game, dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz) || 1;
    g.audio.at('enemyHurt', a.x, a.z, { vol: 0.8, pitch: a.def.legend ? 0.45 : 0.75 });
    if (P.invulnerable || g.inTown()) return;
    if (g.net) g.net.act('animal', { dmg: a.def.bite, dx: dx / d, dz: dz / d });
    else P.damage(a.def.bite, dx / d, dz / d);
  }

  render(alpha, dt) {
    for (const a of this.animals) {
      const m = a.model;
      m.root.position.set(a.px + (a.x - a.px) * alpha, 0, a.pz + (a.z - a.pz) * alpha);
      m.root.rotation.y = a.prevYaw + angleDelta(a.prevYaw, a.yaw) * alpha;
      a.phase += dt * (2 + a.speed * 1.6);
      const swing = Math.min(1, a.speed / 3) * 0.7;
      m.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(a.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * swing; });
      m.root.position.y = Math.abs(Math.sin(a.phase)) * Math.min(0.12, a.speed * 0.012) * a.def.size;
      if (a.state === 'graze' && a.speed < 0.3) m.root.children[0].rotation.x = Math.sin(a.phase * 0.2) > 0.3 ? 0.18 : 0;
      else m.root.children[0].rotation.x = 0;
    }
  }
}
