// Game state and the run: camps, permadeath, saving, Dead Eye, hit-stop,
// explosions, and the order everything updates in each tick.
import * as THREE from 'three';
import { T } from './tuning.js';
import { Physics, GROUPS } from './physics.js';
import { PhysObj } from './physics.js';
import { NavGrid } from './nav.js';
import { FX } from './fx.js';
import { MAT, PAL } from './models.js';
import { Prop, Debris, sharedGeometries } from './props.js';
import { Bandit, BANDIT_TYPES, lineGeo } from './enemy.js';
import { Player } from './player.js';
import { Projectiles } from './projectiles.js';
import { generateCamp, buildScenery, ARENA_HALF, PLAYER_SPAWN } from './level.js';
import { UNLOCKS, WEAPONS } from './weapons.js';
import { randomSeed } from './rng.js';
import { MapView } from './map.js';

const SAVE_KEY = 'dustiron.run.v1';
const scorchGeo = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);
const scorchMat = new THREE.MeshLambertMaterial({ color: 0x3a2a20, transparent: true, opacity: 0.55, depthWrite: false });

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s.seed === 'number' && Array.isArray(s.unlocked) ? s : null;
  } catch { return null; }
}

function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

export class Game {
  constructor({ render, rig, input, audio, ui }) {
    this.render = render;
    this.scene = render.scene;
    this.rig = rig;
    this.input = input;
    this.audio = audio;
    this.ui = ui;
    this.fx = new FX(render.scene, render.flash);
    this.mapView = new MapView();
    this.spotT = 0;
    this.groups = GROUPS;
    this.arenaHalf = ARENA_HALF;
    this.state = 'title';
    this.time = 0;
    this.realTime = 0;
    this.intent = { move: { x: 0, z: 0 }, aim: null, fireHeld: false, firePressed: false, reload: false, dodgeUntil: -1, switchTo: null };
    this.aimPoint = new THREE.Vector3();
    this.enemies = [];
    this.props = [];
    this.corpses = [];
    this.player = null;
    this.physics = null;
    this.levelGroup = null;
    this.run = null;
    this.hitStopT = 0;
    this.slowmo = { scale: 1, t: 0, target: 1 };
    this.clearT = -1;
    this.deathT = -1;
    this.saveT = 0;
    this.navT = 0;
    this.navDirty = true;
    this.flanker = null;
    this.camp = { x: 0, z: 0, t: 0 };
    this.heartT = 0;

    this.deadEye = {
      meter: 0, active: false,
      add(v) { if (!this.active) this.meter = Math.min(1, this.meter + v); },
    };
    this.tokens = {
      holders: new Set(),
      take(b) {
        if (b.type === 'rusher') return true;
        for (const h of this.holders) if (!h.alive) this.holders.delete(h);
        if (this.holders.size >= T.enemy.tokens) return false;
        this.holders.add(b);
        return true;
      },
      release(b) { this.holders.delete(b); },
    };
  }

  get stats() { return this.run; }

  // ---------- run lifecycle ----------

  newRun() {
    deleteSave();
    this.run = {
      seed: randomSeed(), camp: 0, bounty: 0, kills: 0, shots: 0, hits: 0, time: 0, damageTaken: 0,
      hp: T.player.hp, unlocked: ['revolver'], weapon: 0, deadEye: 0, version: 1,
    };
    this.loadCamp();
  }

  continueRun(save) {
    this.run = { ...save };
    this.loadCamp();
  }

  loadCamp() {
    this.unload();
    const run = this.run;
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.physics = new Physics();
    this.enemyController = this.physics.characterController();
    this.time = 0;

    buildScenery(this, run.seed + run.camp);
    const layout = generateCamp(run.seed, run.camp);
    this.campName = layout.name;
    this.debris = new Debris(this);
    this.projectiles = new Projectiles(this);
    this.props = layout.props.map((spec) => new Prop(this, spec.kind, spec));
    this.player = new Player(this, PLAYER_SPAWN.x, PLAYER_SPAWN.z, run);
    this.enemies = layout.enemies.map((e) => new Bandit(this, e.type, e.x, e.z, run.camp));
    this.campStartBounty = run.bounty;
    this.corpses = [];

    this.nav = new NavGrid(ARENA_HALF, 0.5, 0.45);
    this.nav.setStatic(this.props.filter((p) => !p.dynamic).map((p) => p.footprint()));
    this.rebuildNav();

    this.deadEye.meter = run.deadEye ?? 0;
    this.deadEye.active = false;
    this.tokens.holders.clear();
    this.flanker = null;
    this.hitStopT = 0;
    this.slowmo = { scale: 1, t: 0, target: 1 };
    this.clearT = -1;
    this.deathT = -1;
    this.camp = { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, t: 0 };
    this.fx.clear();
    Object.assign(this.intent, { firePressed: false, reload: false, dodgeUntil: -1, switchTo: null, aim: null });
    this.rig.snap(PLAYER_SPAWN.x, PLAYER_SPAWN.z - 3);
    this.state = 'playing';
    this.ui.show(null);
    const n = this.enemies.length;
    this.ui.toast(`Camp ${run.camp + 1} · ${this.campName} · ${n} outlaws`, 3);
    this.audio.setAmbience(0.13);
    this.save();
  }

  unload() {
    if (!this.levelGroup) return;
    const shared = sharedGeometries();
    shared.add(lineGeo);
    shared.add(scorchGeo);
    this.levelGroup.traverse((o) => {
      if (!o.isMesh) return;
      if (!shared.has(o.geometry)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m !== MAT.solid && m !== MAT.glow && m !== scorchMat) m.dispose();
    });
    this.scene.remove(this.levelGroup);
    this.levelGroup = null;
    this.physics.free();
    this.physics = null;
    this.enemies = [];
    this.props = [];
    this.corpses = [];
    this.player = null;
    this.deadEye.active = false;
    this.audio.setDeadEye(false);
    this.ui.el.app.classList.remove('deadeye');
  }

  save() {
    if (!this.run || !this.player || !this.player.alive) return;
    const data = { ...this.run, hp: this.player.hp, weapon: this.player.gunIndex, deadEye: this.deadEye.meter };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  }

  quitToTitle() {
    this.save();
    this.unload();
    this.state = 'title';
    this.audio.setAmbience(0);
    this.ui.setContinue(loadSave());
    this.ui.show('title');
  }

  pause(on) {
    if (on && this.state === 'playing') { this.state = 'paused'; this.ui.show('pause'); this.save(); this.setDeadEye(false); }
    else if (!on && this.state === 'paused') { this.state = 'playing'; this.ui.show(null); }
  }

  openMap() {
    if (this.state !== 'playing') return;
    this.state = 'map';
    this.setDeadEye(false);
    this.input.fireHeld = false;
    this.ui.show('map');
    this.mapView.draw(this);
    this.audio.play('uiClick', { bus: 'ui' });
  }

  closeMap() {
    if (this.state !== 'map') return;
    this.state = 'playing';
    this.ui.show(null);
  }

  /** Marks outlaws the player can currently see, for the map. */
  updateSpotting() {
    const P = this.player;
    if (!P.alive) return;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - P.x, e.z - P.z) > 26) continue;
      if (this.physics.los(P.x, P.z, e.x, e.z)) e.markSpotted();
    }
  }

  onCampCleared() {
    const run = this.run, p = this.player;
    const bonus = 25 * (run.camp + 1);
    run.bounty += bonus;
    const earned = run.bounty - this.campStartBounty;
    const unlockKey = UNLOCKS[run.camp + 1];
    let unlock = null;
    if (unlockKey && !run.unlocked.includes(unlockKey)) { run.unlocked.push(unlockKey); unlock = `${WEAPONS[unlockKey].name} (press ${run.unlocked.length})`; }
    const healed = Math.round(Math.min(T.player.healBetweenCamps, T.player.hp - p.hp));
    run.hp = Math.min(T.player.hp, p.hp + healed);
    run.weapon = p.gunIndex;
    run.deadEye = this.deadEye.meter;
    run.camp++;
    this.state = 'cleared';
    this.setDeadEye(false);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch { /* storage unavailable */ }
    this.audio.play('coin', { bus: 'ui', vol: 0.9 });
    this.ui.showCleared({ name: this.campName, earned, total: run.bounty, healed, unlock });
  }

  onPlayerDied() {
    deleteSave(); // Death is permanent: nothing to come back to.
    this.state = 'dying';
    this.deathT = 1.8;
    this.slowmo = { scale: T.run.deathSlowmo, t: 1.2, target: T.run.deathSlowmo };
    this.setDeadEye(false);
    this.addTrauma(0.6);
    this.tokens.holders.clear();
  }

  // ---------- events used by entities ----------

  addTrauma(a) { this.rig.addTrauma(a); }
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  onEnemyKilled(e, crit) {
    const run = this.run;
    run.kills++;
    const b = BANDIT_TYPES[e.type].bounty;
    run.bounty += b;
    this.deadEye.add(T.deadEye.fillKill);
    this.hitStop(T.hitStop.kill);
    this.addTrauma(0.15);
    this.ui.toast(crit ? `Sneak shot · +$${b}` : `+$${b}`, 1.2);
    if (this.enemies.every((x) => !x.alive) && this.player.alive) {
      this.slowmo = { scale: 0.3, t: T.run.killSlowmoTime, target: 0.3 };
      this.clearT = T.run.clearDelay;
    }
  }

  spawnCorpse(pivot, x, z, yaw, dirX, dirZ, force, tall) {
    const { body } = this.physics.dynamic({
      x, y: 0.92 * tall, z, ry: yaw, shape: { type: 'box', hx: 0.26, hy: 0.9 * tall, hz: 0.2 },
      density: 1.4, friction: 0.9, restitution: 0.05, group: GROUPS.corpse, linDamp: 0.9, angDamp: 1.4,
    });
    body.setLinvel({ x: dirX * force, y: 1.8, z: dirZ * force }, true);
    body.setAngvel({ x: dirZ * 5, y: (Math.random() - 0.5) * 2, z: -dirX * 5 }, true);
    const obj = this.physics.track(new PhysObj(body, pivot));
    this.corpses.push(obj);
    return obj;
  }

  explode(x, z) {
    const E = T.explosion;
    this.fx.explosion(x, z);
    this.audio.at('explosion', x, z, { vol: 1.5, reverb: 0.5, vary: 0.08 });
    this.addTrauma(E.trauma);
    this.hitStop(T.hitStop.explosion);
    this.noise(x, z, 30);
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.position.set(x, 0.015, z);
    scorch.scale.setScalar(1.8);
    scorch.rotation.y = Math.random() * 6;
    this.levelGroup.add(scorch);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > E.radius) continue;
      const f = 1 - d / E.radius;
      const res = e.onHit(E.damage * (0.35 + 0.65 * f), dx / d, dz / d, 1 + 4 * f);
      if (res.killed) this.onEnemyKilled(e, false);
    }
    const P = this.player;
    if (P && P.alive) {
      const dx = P.x - x, dz = P.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d < E.radius) {
        const f = 1 - d / E.radius;
        P.damage(E.damage * 0.75 * (0.35 + 0.65 * f), dx / d, dz / d);
        P.vx += (dx / d) * 6 * f; P.vz += (dz / d) * 6 * f;
      }
    }
    for (const p of this.props) {
      if (!p.alive) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > E.radius * 1.15) continue;
      const f = Math.max(0, 1 - d / (E.radius * 1.15));
      p.damage(E.damage * f, p.x - dx / d * 0.3, 0.5, p.z - dz / d * 0.3, dx / d, dz / d, E.impulse * f, 'chain');
    }
    const push = (body) => {
      const t = body.translation();
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > E.radius * 1.5) return;
      const f = 1 - d / (E.radius * 1.5);
      body.applyImpulse({ x: (dx / d) * 6 * f, y: 5 * f, z: (dz / d) * 6 * f }, true);
    };
    for (const it of this.debris.items) push(it.body);
    for (const c of this.corpses) push(c.body);
    this.navDirty = true;
  }

  /** Gunfire: bandits in range hear it. */
  noise(x, z, range) {
    for (const e of this.enemies) if (e.alive && Math.hypot(e.x - x, e.z - z) < range) e.hear(x, z, true);
  }

  /** A bandit that spots the player warns allies nearby. */
  shout(from) {
    for (const e of this.enemies) {
      if (e === from || !e.alive || e.knows) continue;
      if (Math.hypot(e.x - from.x, e.z - from.z) < 11) e.hear(from.lastSeenX, from.lastSeenZ);
    }
  }

  coverClaimed(x, z, self) {
    for (const e of this.enemies) {
      if (e === self || !e.alive || !e.cover) continue;
      if (Math.hypot(e.cover.x - x, e.cover.z - z) < 1.3) return true;
    }
    return false;
  }

  aliveFraction() {
    if (!this.enemies.length) return 0;
    return this.enemies.filter((e) => e.alive).length / this.enemies.length;
  }

  playerCamping() { return this.camp.t; }

  rebuildNav() {
    this.nav.rebuild(this.props.filter((p) => p.alive && p.dynamic).map((p) => p.footprint()));
    this.navDirty = false;
    this.navT = 0.5;
  }

  setDeadEye(on) {
    const de = this.deadEye;
    if (de.active === on) return;
    de.active = on;
    this.audio.setDeadEye(on);
    this.ui.el.app.classList.toggle('deadeye', on);
    if (on) { this.audio.play('deadEyeIn', { vol: 0.9, reverb: 0.4 }); this.heartT = 0; }
  }

  // ---------- per frame ----------

  /** Reads input into intents. Runs once per frame before simulation ticks. */
  updateIntent() {
    const inp = this.input, it = this.intent;
    if (this.state === 'map' && (inp.pressed('map') || inp.pressed('pause'))) { this.closeMap(); return; }
    if (this.state === 'playing' && inp.pressed('map')) { this.openMap(); return; }
    if (inp.pressed('pause') && (this.state === 'playing' || this.state === 'paused')) this.pause(this.state === 'playing');
    if (this.state !== 'playing' && this.state !== 'dying') {
      it.fireHeld = false;
      return;
    }
    it.move = inp.moveAxis();
    this.rig.place(0);
    const aim = this.rig.projectCursor(inp.mouse.ndcX, inp.mouse.ndcY);
    if (aim) { this.aimPoint.copy(aim); it.aim = this.aimPoint; }
    it.fireHeld = inp.fireHeld;
    if (inp.firePressed) it.firePressed = true;
    if (inp.pressed('reload')) it.reload = true;
    if (inp.pressed('dodge')) it.dodgeUntil = this.realTime + T.dodge.buffer;
    const p = this.player;
    if (p) {
      if (inp.pressed('weapon1')) it.switchTo = 0;
      if (inp.pressed('weapon2')) it.switchTo = 1;
      if (inp.pressed('weapon3')) it.switchTo = 2;
      if (inp.pressed('nextWeapon')) it.switchTo = (p.gunIndex + 1) % p.guns.length;
      const w = inp.takeWheel();
      if (w) it.switchTo = (p.gunIndex + (w > 0 ? 1 : -1) + p.guns.length) % p.guns.length;
    }

    // Dead Eye is held, and drains in real time.
    const de = this.deadEye;
    const want = inp.held('deadEye') && this.state === 'playing' && p && p.alive;
    if (want && !de.active && de.meter >= T.deadEye.minToStart) this.setDeadEye(true);
    if (de.active && !want) this.setDeadEye(false);
  }

  /** The sim time scale for this frame. */
  timeScale() {
    if (this.state !== 'playing' && this.state !== 'dying') return 0;
    if (this.hitStopT > 0) return 0;
    const de = this.deadEye.active ? T.deadEye.timeScale : 1;
    return de * this.slowmo.scale;
  }

  tick(dt, gunDt) {
    this.time += dt;
    if (this.state === 'playing') this.run.time += dt;
    this.navT -= dt;
    if (this.navDirty || this.navT <= 0) this.rebuildNav();

    const p = this.player;
    p.tick(dt, gunDt, this.intent);
    if (p.alive) {
      if (Math.hypot(p.x - this.camp.x, p.z - this.camp.z) > 2) { this.camp.x = p.x; this.camp.z = p.z; this.camp.t = 0; }
      else this.camp.t += dt;
    }
    for (const e of this.enemies) e.tick(dt);
    this.spotT -= dt;
    if (this.spotT <= 0) { this.spotT = 0.2; this.updateSpotting(); }
    this.projectiles.tick(dt);
    for (const pr of this.props) pr.tick(dt);
    this.debris.tick(dt);
    this.physics.step();
  }

  /** Real-time updates and rendering. */
  frame(dt, alpha) {
    this.realTime += dt;
    if (this.hitStopT > 0) this.hitStopT -= dt;

    if (this.slowmo.t > 0) {
      this.slowmo.t -= dt;
      if (this.slowmo.t <= 0) this.slowmo.target = 1;
    }
    this.slowmo.scale += (this.slowmo.target - this.slowmo.scale) * Math.min(1, dt * (this.slowmo.target < 1 ? 20 : 4));

    const de = this.deadEye;
    if (de.active) {
      de.meter -= dt / T.deadEye.maxRealTime;
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.75; this.audio.play('heartbeat', { vol: 0.8, reverb: 0 }); }
      if (de.meter <= 0) { de.meter = 0; this.setDeadEye(false); }
    }

    if (this.clearT > 0 && this.state === 'playing') {
      this.clearT -= dt;
      if (this.clearT <= 0) this.onCampCleared();
    }
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) { this.state = 'dead'; this.ui.showDead(this.run); this.audio.setAmbience(0.05); }
    }
    if (this.state === 'playing') {
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = T.run.saveInterval; this.save(); }
    }

    const p = this.player;
    if (p) {
      p.render(alpha, dt);
      for (const e of this.enemies) e.render(alpha, dt);
      for (const pr of this.props) pr.render(alpha, dt, this.realTime);
      this.debris.render(alpha);
      for (const c of this.corpses) c.render(alpha);
      this.projectiles.render(alpha);
      const focus = p.alive || !p.corpse ? p.model.root.position : p.corpse.mesh.position;
      this.rig.update(dt, focus, p.alive ? this.intent.aim : null);
      this.render.focusShadow(this.rig.target.x, this.rig.target.z);
      this.audio.setListener(this.rig.target.x, this.rig.target.z);
      const fxScale = (de.active ? T.deadEye.timeScale : 1) * this.slowmo.scale;
      if (this.state !== 'paused') this.fx.update(dt * fxScale);
      this.ui.update(this, dt);
    } else {
      // Title backdrop: slow drift over empty desert.
      this.rig.target.x = Math.sin(this.realTime * 0.05) * 6;
      this.rig.update(dt, this.rig.target, null);
      this.render.focusShadow(this.rig.target.x, this.rig.target.z);
    }
    this.render.renderer.render(this.scene, this.rig.camera);
  }
}
