// Wildlife for hunting: who lives where, how animals graze, bolt and fight,
// and the carcasses they leave. This is pure simulation with no meshes, so the
// same code runs in the browser (offline) and on the server (online, where
// every rider shares the same herds). wildlife-view.js draws the animals.
//
// The host supplies: physics, enemyController, world, riders() and the
// callbacks bite(rider, dmg, dx, dz), killed(a, carcass, by), bearAllowed(),
// and optional added(a), removed(a), carcassGone(c), hurt(a).
import { T } from './tuning.js';
import { GROUPS, RAPIER } from './physics.js';
import { turnToward } from './character.js';
import { forestAt, inRiver } from './terrain.js';
import { townsOf } from './towns.js';

export const SPECIES = {
  rabbit: { hp: 12, speed: 7.5, size: 0.32, radius: 0.3, sense: 12, herd: [1, 2], pelt: 'rabbitPelt', color: 0xa08a6a, belly: 0xd8cbb0 },
  pronghorn: { hp: 55, speed: 10, size: 0.85, radius: 0.5, sense: 26, herd: [2, 4], pelt: 'hide', color: 0xc08a50, belly: 0xf0e6d0, horns: 'prong' },
  deer: { hp: 65, speed: 9, size: 0.9, radius: 0.5, sense: 22, herd: [2, 3], pelt: 'deerHide', color: 0x8a6440, belly: 0xd8c8a8, horns: 'antler' },
  elk: { hp: 140, speed: 8, size: 1.25, radius: 0.7, sense: 26, herd: [1, 2], pelt: 'elkHide', color: 0x6e5034, belly: 0xc8b090, horns: 'rack' },
  boar: { hp: 85, speed: 6.5, size: 0.7, radius: 0.55, sense: 14, herd: [1, 2], pelt: 'boarHide', color: 0x4a3a30, belly: 0x5a4a3e, tusks: true, temper: 'hurt', bite: 14 },
  wolf: { hp: 60, speed: 8.5, size: 0.78, radius: 0.5, sense: 26, herd: [3, 4], pelt: 'wolfPelt', color: 0x6a6a6e, belly: 0xb8b8b4, temper: 'hunt', bite: 11 },
  bear: { hp: 650, speed: 7.2, size: 1.75, radius: 0.95, sense: 34, herd: [1, 1], pelt: 'bearHide', color: 0x3a2a20, belly: 0x5a4030, temper: 'hunt', bite: 30, legend: true },
};
export const SPECIES_KEYS = Object.keys(SPECIES);
export const ANIMAL_STATES = ['graze', 'flee', 'charge'];

const SPAWN = { min: 70, max: 110, despawn: 150 };
const CARCASS_LIFE = 180;
const SKIN_RANGE = 3.2;

/** Which animals live at a spot, by how green the land is. */
function speciesFor(green, r) {
  if (green > 0.6) return r < 0.36 ? 'deer' : r < 0.52 ? 'elk' : r < 0.7 ? 'boar' : r < 0.85 ? 'wolf' : 'rabbit';
  if (green > 0.25) return r < 0.4 ? 'deer' : r < 0.6 ? 'boar' : r < 0.85 ? 'rabbit' : 'pronghorn';
  return r < 0.55 ? 'pronghorn' : 'rabbit';
}

export class Wildlife {
  constructor(host) {
    this.host = host;
    this.animals = [];
    this.carcasses = [];
    this.spawnT = 1;
    this.nextId = 1;
    this.time = 0;
  }

  dispose() {
    for (const a of [...this.animals]) this.remove(a);
    for (const c of [...this.carcasses]) this.dropCarcass(c);
  }

  byId(id) { return this.animals.find((a) => a.id === id) ?? null; }

  spawn(kind, x, z) {
    const h = this.host, def = SPECIES[kind];
    const cap = h.physics.kinematicCapsule(x, z, T.player.halfHeight, def.radius, GROUPS.enemy, null);
    const a = {
      id: `a${this.nextId++}`, kind, def, x, z, px: x, pz: z, yaw: Math.random() * 6.28, prevYaw: 0, hp: def.hp, alive: true, animal: true,
      state: 'graze', stateT: Math.random() * 3, tx: x, tz: z, speed: 0, biteT: 0, hurt: false, walk: false, hitters: new Map(),
      body: cap.body, collider: cap.collider, bodyY: cap.y,
    };
    // Offline, a shot that meets the capsule lands here directly.
    a.onHit = (dmg, dx, dz, knock, zone) => this.hit(a, dmg * (zone === 'head' ? 1.6 : 1), dx, dz, h.localRider?.() ?? null);
    h.physics.setOwner(cap.collider, a);
    this.animals.push(a);
    h.added?.(a);
    return a;
  }

  remove(a) {
    if (a.body) { this.host.physics.removeBody(a.body); a.body = null; }
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
    this.host.removed?.(a);
  }

  /** Gunfire nearby sends grazers running and draws hunters in. */
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

  /** Damage from a rider's shot. Returns {killed} like an outlaw's onHit. */
  hit(a, dmg, dx, dz, by) {
    if (!a.alive) return { killed: false, crit: false };
    a.hp -= dmg;
    if (by) a.hitters.set(by.id, this.time);
    this.host.hurt?.(a);
    if (a.hp <= 0) { this.kill(a, dx, dz, by); return { killed: true, crit: false }; }
    a.hurt = true;
    if (a.def.temper) { a.state = 'charge'; if (by) a.focus = by.id; }
    else this.flee(a, by?.x ?? a.x - dx, by?.z ?? a.z - dz);
    return { killed: false, crit: false };
  }

  kill(a, dx, dz, by) {
    a.alive = false;
    const carcass = { id: `c${a.id.slice(1)}`, kind: a.kind, def: a.def, x: a.x, z: a.z, yaw: a.yaw, dir: dx > 0 ? 1 : -1, t: 0 };
    this.remove(a);
    this.carcasses.push(carcass);
    this.host.killed?.(a, carcass, by);
  }

  /** Takes the skin from a carcass for a rider standing over it. Returns the pelt id or null. */
  skin(id, rider) {
    const c = this.carcasses.find((x) => x.id === id);
    if (!c || !rider || Math.hypot(c.x - rider.x, c.z - rider.z) > SKIN_RANGE) return null;
    this.dropCarcass(c);
    return c.def.pelt;
  }

  dropCarcass(c) {
    const i = this.carcasses.indexOf(c);
    if (i >= 0) this.carcasses.splice(i, 1);
    this.host.carcassGone?.(c);
  }

  /** Riders who share credit for a kill: anyone who hit it in the last minute. */
  creditFor(a) {
    return [...a.hitters.entries()].filter(([, t]) => this.time - t < 60).map(([id]) => id);
  }

  // ---------- per tick ----------

  tick(dt) {
    this.time += dt;
    const riders = this.host.riders().filter((r) => r.alive && !r.room);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; for (const r of riders) this.populate(r); }
    for (const a of [...this.animals]) {
      a.px = a.x; a.pz = a.z; a.prevYaw = a.yaw;
      let near = null, d = Infinity;
      for (const r of riders) { const k = Math.hypot(a.x - r.x, a.z - r.z); if (k < d) { d = k; near = r; } }
      if (a.focus) { const f = riders.find((r) => r.id === a.focus); if (f) { near = f; d = Math.hypot(a.x - f.x, a.z - f.z); } }
      if (d > SPAWN.despawn && !(a.def.legend && d < 400)) { this.remove(a); continue; }
      this.think(a, near, d, dt);
    }
    for (const c of [...this.carcasses]) {
      c.t += dt;
      const far = riders.every((r) => Math.hypot(c.x - r.x, c.z - r.z) > SPAWN.despawn * 1.3);
      if (c.t > CARCASS_LIFE || far) this.dropCarcass(c);
    }
  }

  populate(P) {
    const h = this.host, world = h.world;
    const cap = forestAt(P.x, P.z) > 0.5 ? 9 : 6, near = this.animals.filter((a) => Math.hypot(a.x - P.x, a.z - P.z) < 130).length;
    // Old Scar keeps to his den.
    const den = world.sites?.find((s) => s.kind === 'den'), dd = den ? Math.hypot(den.x - P.x, den.z - P.z) : Infinity;
    if (den && dd < 90 && dd > 30 && !this.animals.some((a) => a.def.legend) && !this.carcasses.some((c) => c.def.legend) && h.bearAllowed()) {
      this.spawn('bear', den.x, den.z + 6);
    }
    if (near >= cap || P.safe) return;
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
    const def = a.def;
    a.stateT -= dt;
    if (P) {
      const sense = def.sense * (P.sneaking ? 0.55 : P.moveFraction > 0.75 ? 1.15 : 1) * (P.mounted ? 1.2 : 1);
      if (P.safe) { if (a.state === 'charge') { a.state = 'graze'; a.focus = null; } }
      else if (def.temper === 'hunt' && d < sense && a.state !== 'charge') a.state = 'charge';
      else if (!def.temper && d < sense && a.state !== 'flee') this.flee(a, P.x, P.z);
      else if (def.temper === 'hurt' && a.hurt && a.state !== 'charge') a.state = 'charge';
    } else if (a.state === 'charge') a.state = 'graze';
    let want = 0, tx = a.tx, tz = a.tz;
    if (a.state === 'charge' && P) {
      tx = P.x; tz = P.z; want = def.speed * (def.legend ? 0.95 : 1);
      if (d > 60) { a.state = 'graze'; a.hurt = false; a.focus = null; }
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
      const cc = this.host.enemyController;
      cc.computeColliderMovement(a.collider, { x: mx, y: 0, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.enemyMove);
      const mv = cc.computedMovement();
      a.x += mv.x; a.z += mv.z;
      if (Math.hypot(mv.x, mv.z) < Math.hypot(mx, mz) * 0.3 && a.state !== 'charge') a.yaw += 1.2;
      a.body.setNextKinematicTranslation({ x: a.x, y: a.bodyY, z: a.z });
    }
  }

  bite(a, P) {
    if (P.invulnerable || P.safe) return;
    const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz) || 1;
    a.bit = (a.bit ?? 0) + 1;
    this.host.bite(P, a.def.bite, dx / d, dz / d, a);
  }
}
