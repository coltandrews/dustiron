// The shared world simulation that runs on the server: camps, outlaws, props,
// enemy bullets and explosions. It reuses the game's own outlaw, prop and camp
// code by standing in for the browser game object, with one twist: each
// outlaw fights the player it is focused on, so `this.player` is set to that
// outlaw's target just before it thinks.
import { Sky } from '../src/sky.js';
import * as THREE from 'three';
import { Physics, GROUPS } from '../src/physics.js';
import { T } from '../src/tuning.js';
import { buildFrontier } from '../src/frontier.js';
import { buildEncounter, campList, disposeEncounter, rebuildCampNav } from '../src/encounters.js';
import { questDefs } from '../src/life.js';
import { inSafeZone } from '../src/towns.js';
import { PROP_DEFS } from '../src/props.js';
import { q2, q3 } from '../src/protocol.js';
import { ServerProjectiles } from './projectiles.js';

/** Minutes a cleared camp stays empty before new outlaws move in. */
export const CAMP_RESPAWN = 12 * 60;
/** No camp respawns while a player is this close to it. */
const RESPAWN_CLEAR = 90;
/** Outlaws farther than this from every player stand still. */
const THINK_RANGE = 65;

const SKIP_SOUNDS = new Set(['enemyDeath', 'bodyFall', 'explosion', 'debris',
  ...Object.values(PROP_DEFS).map((def) => def.sound).filter(Boolean)]);

export class Sim {
  /**
   * @param {object} world world data from makeWorld()
   * @param {{emit:Function, toast:Function, questEvent:Function, enemyKilled:Function, playerDamage:Function, wantsAlive:Function}} hooks
   */
  constructor(world, hooks) {
    this.hooks = hooks;
    this.headless = true;
    this.physics = new Physics();
    this.enemyController = this.physics.characterController();
    this.levelGroup = new THREE.Group();
    this.headless = true;
    this.run = { seed: world.seed, world, camps: {} };
    this.time = 0;
    this.questDefs = questDefs(world);
    this.players = new Map();
    this.player = null;
    this.ctxPlayer = null;
    this.navDirty = false;
    this.navT = 0;
    this.camps = new Map();
    this.debris = { spawn() {}, items: [], tick() {} };
    const sim = this;
    this.fx = {
      muzzle(x, y, z, dx, dz, big) { sim.emit(['muz', q2(x), q2(y), q2(z), q3(dx), q3(dz), big ? 1 : 0], x, z); },
      impact(kind, x, y, z, nx, nz, dx, dz) { sim.emit(['imp', kind, q2(x), q2(y), q2(z), q3(nx), q3(nz), q3(dx), q3(dz)], x, z); },
      emit() {}, tracer() {}, casing() {}, explosion() {},
    };
    this.audio = {
      at(name, x, z, opts = {}) {
        if (SKIP_SOUNDS.has(name)) return;
        sim.emit(['snd', name, q2(x), q2(z), opts.vol ?? 1, opts.pitch ?? 1, opts.delay ?? 0], x, z);
      },
      play() {}, impact() {}, cue() {},
    };
    this.ui = { toast(text, seconds) { sim.hooks.toast(text, seconds, sim.ctxPlayer ?? sim.player); } };
    this.tokens = {
      holders: new Set(),
      take(b) {
        if (b.type === 'rusher') return true;
        let count = 0;
        for (const h of this.holders) {
          if (!h.alive) { this.holders.delete(h); continue; }
          if (h.targetId === b.targetId) count++;
        }
        if (count >= T.enemy.tokens) return false;
        this.holders.add(b);
        return true;
      },
      release(b) { this.holders.delete(b); },
    };
    this.town = buildFrontier(this, world);
    this.projectiles = new ServerProjectiles(this);
    this.encounters = campList(world).map((camp, index) => this.buildCamp(camp, index));
    this.rebuildNav();
  }

  // ---------- the parts of the game object that outlaws and props use ----------

  /** Bandits ask "is the player in a shop?" through game.frontier.inside. */
  get frontier() { return { inside: !!this.player?.room }; }
  get flanker() { return this.player?.flanker ?? null; }
  set flanker(value) { if (this.player) this.player.flanker = value; }
  get enemies() { return this.encounters.flatMap((c) => c.enemies); }
  get props() { return this.encounters.flatMap((c) => c.props); }

  sightScale() { return Sky.sightScale(this.time); }

  inTown() { return !!this.player && inSafeZone(this.run.world, this.player.x, this.player.z, this.player.room); }
  playerCamping() { return this.player?.campT ?? 0; }
  save() {}
  addTrauma() {}
  hitStop() {}
  spawnCorpse(model, x, z) { return { mesh: { position: { x, z } } }; }
  questEvent(event) { this.hooks.questEvent(event, this.ctxPlayer ?? this.player); }
  wantsAlive(enemy) { return this.hooks.wantsAlive(enemy); }

  noise(x, z, range) {
    for (const e of this.enemies) if (e.alive && !e.surrendered && Math.hypot(e.x - x, e.z - z) < range) e.hear(x, z, true);
  }

  shout(from, reach = 1) {
    for (const e of from.encounter.enemies) {
      if (e === from || !e.alive || e.knows || e.surrendered) continue;
      if (Math.hypot(e.x - from.x, e.z - from.z) < 11 * reach) e.hear(from.lastSeenX, from.lastSeenZ);
    }
  }

  coverClaimed(x, z, self) {
    for (const e of self.encounter.enemies) {
      if (e === self || !e.alive || !e.cover) continue;
      if (Math.hypot(e.cover.x - x, e.cover.z - z) < 1.3) return true;
    }
    return false;
  }

  aliveFraction(camp) {
    const total = camp.spawned || camp.enemies.length;
    return total ? camp.enemies.filter((e) => e.alive).length / total : 0;
  }

  onEnemyKilled(e, crit, killer = this.ctxPlayer) {
    const camp = e.encounter;
    const cleared = camp.enemies.every((x) => !x.alive);
    if (cleared && !camp.clearedAt) camp.clearedAt = this.time;
    this.hooks.enemyKilled(e, killer, cleared);
  }

  /** Blasts hurt outlaws, players and props. Visuals come from each browser breaking the barrel itself. */
  explode(x, z) {
    const E = T.explosion, killer = this.lastPropHitter ?? null;
    this.noise(x, z, 30);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > E.radius) continue;
      const f = 1 - d / E.radius;
      e.lastHitDir = [dx / d, dz / d, 4 + 6 * f];
      const before = this.player;
      this.player = before ?? killer;
      const res = e.onHit(E.damage * (0.35 + 0.65 * f), dx / d, dz / d, 1 + 4 * f);
      this.player = before;
      if (res.killed) this.onEnemyKilled(e, false, killer);
    }
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d < E.radius) this.hooks.playerDamage(p, E.damage * 0.75 * (0.35 + 0.65 * (1 - d / E.radius)), dx / d, dz / d, { kind: 'blast', by: killer });
    }
    for (const p of this.props) {
      if (!p.alive) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > E.radius * 1.15) continue;
      const f = Math.max(0, 1 - d / (E.radius * 1.15));
      p.damage(E.damage * f, p.x - dx / d * 0.3, 0.5, p.z - dz / d * 0.3, dx / d, dz / d, E.impulse * f, 'chain');
    }
    this.navDirty = true;
  }

  // ---------- camps ----------

  buildCamp(camp, index) {
    this.run.camps[camp.id] = {};
    const encounter = buildEncounter(this, camp, index, false);
    encounter.spawned = encounter.enemies.length;
    encounter.gen = (this.camps.get(camp.id)?.gen ?? 0) + 1;
    encounter.clearedAt = 0;
    for (const e of encounter.enemies) {
      e.updateAimLine = () => {};
      e.targetId = null;
    }
    for (const p of encounter.props) {
      const breakProp = p.break.bind(p);
      p.break = (dx = 0, dz = 0) => {
        if (!p.alive) return;
        breakProp(dx, dz);
        this.emit(['pbreak', p.id, q3(dx), q3(dz)], p.x, p.z);
      };
    }
    this.camps.set(camp.id, encounter);
    return encounter;
  }

  /** Puts fresh outlaws and props into cleared camps that nobody is watching. */
  respawnCamps() {
    for (const [i, encounter] of this.encounters.entries()) {
      if (!encounter.clearedAt || this.time - encounter.clearedAt < CAMP_RESPAWN) continue;
      if ([...this.players.values()].some((p) => Math.hypot(p.x - encounter.x, p.z - encounter.z) < RESPAWN_CLEAR)) continue;
      disposeEncounter(this, encounter);
      this.encounters[i] = this.buildCamp(campList(this.run.world)[i], i);
      this.navDirty = true;
      this.hooks.campReset?.(this.encounters[i]);
    }
  }

  campById(id) { return this.camps.get(id) ?? null; }
  enemyById(id) {
    const campId = id.startsWith('target-') ? this.run.world.camps.find((c) => c.targetId === id)?.id : id.split(':')[0];
    return this.camps.get(campId)?.enemies.find((e) => e.id === id) ?? null;
  }
  propById(id) { return this.camps.get(id.split(':')[0])?.props.find((p) => p.id === id) ?? null; }

  rebuildNav() {
    rebuildCampNav(this.encounters);
    this.navDirty = false;
    this.navT = 0.5;
  }

  // ---------- players ----------

  addPlayer(state) {
    const cap = this.physics.kinematicCapsule(state.x, state.z, T.player.halfHeight, T.player.radius, GROUPS.player, state);
    state.body = cap.body;
    state.bodyY = cap.y;
    this.players.set(state.id, state);
  }

  removePlayer(state) {
    for (const e of this.enemies) if (e.targetId === state.id) { e.targetId = null; if (e.token) e.releaseToken(); }
    if (state.body) this.physics.removeBody(state.body);
    state.body = null;
    this.players.delete(state.id);
  }

  movePlayer(state) {
    state.body?.setNextKinematicTranslation({ x: state.x, y: state.bodyY, z: state.z });
  }

  /** The player an outlaw should fight now: its current focus if still close, else the nearest. */
  pickTarget(e) {
    if (e.captive) return this.players.get(e.captorId) ?? null;
    const valid = (p) => p && p.alive && !p.room && Math.hypot(p.x - e.x, p.z - e.z) < THINK_RANGE + 5;
    const current = this.players.get(e.targetId);
    if (e.knows && valid(current)) return current;
    let best = null, bestD = THINK_RANGE;
    for (const p of this.players.values()) {
      if (!p.alive || p.room) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  // ---------- stepping ----------

  tick(dt) {
    this.time += dt;
    this.navT -= dt;
    if (this.navDirty || this.navT <= 0) this.rebuildNav();
    for (const p of this.players.values()) {
      if (Math.hypot(p.x - p.campX, p.z - p.campZ) > 2) { p.campX = p.x; p.campZ = p.z; p.campT = 0; } else p.campT += dt;
      if (p.flanker && (!p.flanker.alive || p.flanker.targetId !== p.id)) p.flanker = null;
    }
    for (const e of this.enemies) {
      if (!e.alive || e.jailed) continue;
      const target = this.pickTarget(e);
      if (!target) {
        if (e.token) { e.releaseToken(); e.setState('search'); }
        continue;
      }
      if (e.targetId !== target.id && e.token) e.releaseToken();
      e.targetId = target.id;
      this.player = target;
      e.tick(dt);
    }
    this.player = null;
    this.projectiles.tick(dt);
    for (const p of this.props) p.tick(dt);
    this.physics.step();
  }

  emit(event, x = null, z = null) { this.hooks.emit(event, x, z); }

  // ---------- snapshots ----------

  /** Outlaws near a point, as compact rows for a snapshot. */
  enemyRows(x, z, range, states) {
    const rows = [];
    for (const encounter of this.encounters) {
      if (Math.hypot(encounter.x - x, encounter.z - z) > range + 40) continue;
      for (const e of encounter.enemies) {
        if (!e.alive || e.jailed || Math.hypot(e.x - x, e.z - z) > range) continue;
        const flags = (e.surrendered ? 1 : 0) | (e.captive ? 2 : 0) | (e.knows ? 4 : 0) | (e.isTarget ? 8 : 0) | (e.enraged ? 16 : 0);
        const aim = e.state === 'aim' || e.state === 'burst' ? q2(Math.min(1, e.aimT / e.def.aim)) : 0;
        rows.push([e.id, q2(e.x), q2(e.z), q3(e.yaw), Math.max(0, states.indexOf(e.state)), aim, q3(e.aimYaw), flags, q2(e.moveSpeed ?? 0), q2(Math.max(0, e.hp / e.maxHp))]);
      }
    }
    return rows;
  }

  /** Props that are still moving near a point. */
  propRows(x, z, range) {
    const rows = [];
    for (const encounter of this.encounters) {
      if (Math.hypot(encounter.x - x, encounter.z - z) > range + 40) continue;
      for (const p of encounter.props) {
        if (!p.alive || !p.body || p.body.isSleeping()) continue;
        const t = p.body.translation(), r = p.body.rotation();
        rows.push([p.id, q2(t.x), q2(t.y), q2(t.z), q3(r.x), q3(r.y), q3(r.z), q3(r.w)]);
      }
    }
    return rows;
  }

  /** The full state of one camp, in the same format a saved life uses. */
  campState(encounter) {
    return {
      gen: encounter.gen,
      cleared: !!encounter.clearedAt,
      enemies: encounter.enemies.map((e) => ({
        id: e.id, alive: e.alive && !e.jailed, hp: e.hp, x: e.x, z: e.z, yaw: e.yaw,
        surrendered: e.surrendered, captive: e.captive,
      })),
      props: encounter.props.map((p) => ({ id: p.id, alive: p.alive, hp: Number.isFinite(p.hp) ? p.hp : null })),
    };
  }

  allCampStates() {
    return Object.fromEntries(this.encounters.map((encounter) => [encounter.id, this.campState(encounter)]));
  }
}
