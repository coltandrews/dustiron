// Hunting in the browser: draws animals and carcasses and handles skinning.
// Offline it runs the Wildlife simulation itself. Online the server runs it
// for everyone; snapshots move puppet animals here, shots at them go to the
// server, and skinning asks the server for the pelt.
import * as THREE from 'three';
import { T } from './tuning.js';
import { GROUPS } from './physics.js';
import { MAT, Shape, meshOf } from './models.js';
import { angleDelta } from './character.js';
import { PELTS } from './items.js';
import { ANIMAL_STATES, SPECIES, SPECIES_KEYS, Wildlife } from './wildlife.js';

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
  if (def.legend) for (let i = 0; i < 3; i++) s.box(0.04 * k, 0.03 * k, 0.3 * k, 0x8a6a5a, 0.26 * k, 1.05 * k * tall + i * 0.07 * k, 0.1 * k + i * 0.05, 0, 0.3, 0);
  const root = new THREE.Group(), body = meshOf(s, MAT.solid);
  root.add(body);
  for (const [x, z] of [[-0.16, 0.42], [0.16, 0.42], [-0.16, -0.42], [0.16, -0.42]]) {
    const leg = new THREE.Group(), ls = new Shape();
    ls.box(0.11 * k, 0.75 * k * tall, 0.11 * k, c, 0, -0.37 * k * tall, 0);
    ls.box(0.12 * k, 0.08 * k, 0.14 * k, 0x2a2018, 0, -0.74 * k * tall, 0.02 * k);
    leg.add(meshOf(ls, MAT.solid));
    leg.position.set(x * k, 0.78 * k * tall, z * k);
    root.add(leg); legs.push(leg);
  }
  return { root, body, legs, phase: Math.random() * 6 };
}

export class Hunting {
  constructor(game) {
    this.game = game;
    this.online = !!game.net;
    this.models = new Map();
    this.carcassModels = new Map();
    this.puppets = new Map();
    this.carcasses = [];
    this.visible = true;
    this.sim = this.online ? null : new Wildlife(this.localHost());
  }

  /** The offline host: one rider (this player) and local damage. */
  localHost() {
    const g = this.game;
    const rider = () => {
      const p = g.player;
      return { id: 'me', x: p.x, z: p.z, alive: p.alive, room: g.frontier?.inside ? 'room' : null, safe: g.inTown(),
        sneaking: p.sneaking, moveFraction: p.moveFraction, mounted: !!g.horse?.mounted, invulnerable: p.invulnerable };
    };
    return {
      physics: g.physics, enemyController: g.enemyController, world: g.run.world,
      riders: () => (g.player ? [rider()] : []),
      localRider: () => (g.player ? rider() : null),
      bearAllowed: () => !g.run.questFlags?.['hunt:bear'],
      bite: (r, dmg, dx, dz, a) => { this.biteSound(a); g.player.damage(dmg, dx, dz); },
      added: (a) => this.addModel(a.id, a.kind),
      removed: (a) => this.dropModel(a.id),
      hurt: (a) => this.hurtSound(a),
      killed: (a, c) => { this.addCarcass(c); if (a.def.legend) this.legendDown(); },
      carcassGone: (c) => this.dropCarcass(c.id),
    };
  }

  get animals() { return this.sim ? this.sim.animals : [...this.puppets.values()]; }

  dispose() {
    this.sim?.dispose();
    for (const p of this.puppets.values()) if (p.body) this.game.physics?.removeBody(p.body);
    for (const id of [...this.models.keys()]) this.dropModel(id);
    for (const id of [...this.carcassModels.keys()]) this.dropCarcass(id);
    this.puppets.clear();
  }

  // ---------- models ----------

  addModel(id, kind) {
    const m = buildModel(SPECIES[kind]);
    m.root.visible = this.visible;
    this.game.levelGroup.add(m.root);
    this.models.set(id, m);
    return m;
  }

  dropModel(id) {
    const m = this.models.get(id);
    if (!m) return;
    this.game.levelGroup?.remove(m.root);
    this.models.delete(id);
  }

  addCarcass(c) {
    const m = buildModel(c.def ?? SPECIES[c.kind]);
    m.root.position.set(c.x, (c.def ?? SPECIES[c.kind]).size * 0.3, c.z);
    m.root.rotation.set(0, c.yaw, Math.PI / 2 * c.dir);
    for (const leg of m.legs) leg.rotation.x = 0.2;
    m.root.visible = this.visible;
    this.game.levelGroup.add(m.root);
    this.carcassModels.set(c.id, m);
    if (!this.carcasses.some((x) => x.id === c.id)) this.carcasses.push(c);
    this.game.audio.at('bodyFall', c.x, c.z, { vol: Math.min(1, (c.def ?? SPECIES[c.kind]).size), delay: 0.2 });
  }

  dropCarcass(id) {
    const m = this.carcassModels.get(id);
    if (m) this.game.levelGroup?.remove(m.root);
    this.carcassModels.delete(id);
    this.carcasses = this.carcasses.filter((c) => c.id !== id);
  }

  hurtSound(a) {
    const def = a.def;
    this.game.audio.at('enemyHurt', a.x, a.z, { vol: 0.4, pitch: def.size < 0.5 ? 1.8 : def.legend ? 0.6 : 1.2 });
  }

  biteSound(a) { this.game.audio.at('enemyHurt', a.x, a.z, { vol: 0.8, pitch: a.def.legend ? 0.45 : 0.75 }); }

  legendDown() {
    const g = this.game;
    g.ui.toast('Old Scar falls. The forest goes quiet.', 5);
    g.audio.cue?.('victory');
    if (!this.online) g.questEvent({ type: 'hunt', animal: 'bear' });
  }

  setVisible(on) {
    if (this.visible === on) return;
    this.visible = on;
    for (const m of this.models.values()) m.root.visible = on;
    for (const m of this.carcassModels.values()) m.root.visible = on;
  }

  // ---------- online puppets ----------

  /** Applies the server's animal rows [id, kind, x, z, yaw, speed, state, hp] and carcass rows [id, kind, x, z, yaw, dir]. */
  apply(rows = [], carcassRows = []) {
    const g = this.game, seen = new Set();
    for (const [id, k, x, z, yaw, speed, state, hp] of rows) {
      seen.add(id);
      let p = this.puppets.get(id);
      if (!p) {
        const kind = SPECIES_KEYS[k] ?? 'deer', def = SPECIES[kind];
        const cap = g.physics.kinematicCapsule(x, z, T.player.halfHeight, def.radius, GROUPS.enemy, null);
        p = { id, kind, def, x, z, px: x, pz: z, yaw, prevYaw: yaw, nx: x, nz: z, nyaw: yaw, speed, state: 'graze', hp: def.hp, alive: true, animal: true, body: cap.body, bodyY: cap.y };
        p.onHit = (dmg, dx, dz, knock, zone) => { this.game.net.queueHit('a', id, zone ?? 'body', dx, dz); return { killed: false, crit: false }; };
        g.physics.setOwner(cap.collider, p);
        this.puppets.set(id, p);
        this.addModel(id, kind);
      }
      p.nx = x; p.nz = z; p.nyaw = yaw; p.speed = speed; p.state = ANIMAL_STATES[state] ?? 'graze';
      const newHp = hp * p.def.hp;
      if (newHp < p.hp - 0.5) this.hurtSound(p);
      if (p.state === 'charge' && p.lastState !== 'charge' && p.def.temper) this.biteSound(p);
      p.lastState = p.state;
      p.hp = newHp;
    }
    for (const [id, p] of this.puppets) {
      if (seen.has(id)) continue;
      if (p.body) g.physics.removeBody(p.body);
      this.puppets.delete(id);
      this.dropModel(id);
    }
    const carc = new Set();
    for (const [id, k, x, z, yaw, dir] of carcassRows) {
      carc.add(id);
      if (!this.carcassModels.has(id)) {
        const kind = SPECIES_KEYS[k] ?? 'deer';
        this.addCarcass({ id, kind, def: SPECIES[kind], x, z, yaw, dir });
      }
    }
    for (const id of [...this.carcassModels.keys()]) if (!carc.has(id)) this.dropCarcass(id);
  }

  /** The server handed us a pelt we skinned. */
  onPelt(m) {
    const g = this.game, run = g.run, pelt = m.pelt;
    if (!PELTS[pelt]) return;
    run.items[pelt] = Math.min(9, (run.items[pelt] ?? 0) + 1);
    this.skinned(pelt);
  }

  skinned(pelt) {
    const g = this.game, run = g.run;
    g.audio.play('bandage', { vol: 0.5, pitch: 0.7 });
    g.ui.questNote(`${PELTS[pelt].name} · ${run.items[pelt]} carried. Hank or Otto will buy it.`);
    g.save();
  }

  // ---------- per tick ----------

  tick(dt) {
    if (this.sim) { this.sim.tick(dt); return; }
    const k = Math.min(1, dt * 10);
    for (const p of this.puppets.values()) {
      p.px = p.x; p.pz = p.z; p.prevYaw = p.yaw;
      const far = Math.hypot(p.nx - p.x, p.nz - p.z) > 8;
      p.x = far ? p.nx : p.x + (p.nx - p.x) * k;
      p.z = far ? p.nz : p.z + (p.nz - p.z) * k;
      p.yaw += angleDelta(p.yaw, p.nyaw) * k;
      p.body?.setNextKinematicTranslation({ x: p.x, y: p.bodyY, z: p.z });
    }
  }

  hear(x, z, range) { this.sim?.hear(x, z, range); }

  points() {
    return this.carcasses.map((c) => ({ id: c.id, kind: 'skin', label: `Skin the ${c.kind === 'bear' ? 'great bear' : c.kind}`, x: c.x, z: c.z, carcass: c }));
  }

  skin(point) {
    const g = this.game, run = g.run, pelt = (point.carcass.def ?? SPECIES[point.carcass.kind]).pelt;
    if ((run.items[pelt] ?? 0) >= 9) { g.ui.toast('You cannot carry more of those.'); return; }
    if (this.online) { g.net.act('skin', { id: point.id }); return; }
    const p = g.player, got = this.sim.skin(point.id, { x: p.x, z: p.z });
    if (!got) return;
    run.items[got] = (run.items[got] ?? 0) + 1;
    this.skinned(got);
  }

  render(alpha, dt) {
    for (const a of this.animals) {
      const m = this.models.get(a.id);
      if (!m) continue;
      m.root.position.set(a.px + (a.x - a.px) * alpha, 0, a.pz + (a.z - a.pz) * alpha);
      m.root.rotation.y = a.prevYaw + angleDelta(a.prevYaw, a.yaw) * alpha;
      m.phase += dt * (2 + a.speed * 1.6);
      const swing = Math.min(1, a.speed / 3) * 0.7;
      m.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(m.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * swing; });
      m.root.position.y = Math.abs(Math.sin(m.phase)) * Math.min(0.12, a.speed * 0.012) * a.def.size;
      m.body.rotation.x = a.state === 'graze' && a.speed < 0.3 && Math.sin(m.phase * 0.2) > 0.3 ? 0.18 : 0;
    }
  }
}
