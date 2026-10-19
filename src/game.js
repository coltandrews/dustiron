// Game state and the run: camps, permadeath, saving, Dead Eye, hit-stop,
// explosions, and the order everything updates in each tick.
import * as THREE from 'three';
import { T } from './tuning.js';
import { Physics, GROUPS, PhysObj, RAPIER } from './physics.js';
import { FX } from './fx.js';
import { MAT, PAL } from './models.js';
import { Debris, sharedGeometries } from './props.js';
import { lineGeo } from './enemy.js';
import { Player } from './player.js';
import { Projectiles } from './projectiles.js';
import { createLife, discover, recordTargetKill } from './life.js';
import { loadSave as readSave, writeLife, endLife } from './storage.js';
import { buildFrontier } from './frontier.js';
import { buildEncounters, captureEncounters, rebuildCampNav } from './encounters.js';
import { TownActions } from './town-actions.js';
import { randomSeed } from './rng.js';
import { MapView } from './map.js';

const scorchGeo = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);
const scorchMat = new THREE.MeshLambertMaterial({ color: 0x3a2a20, transparent: true, opacity: 0.55, depthWrite: false });

export function loadSave() {
  return readSave();
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
    this.arenaHalf = 210;
    this.encounters = [];
    this.frontier = null;
    this.townActions = new TownActions(this);
    this.interactionHint = '';
    this.locationName = 'Mercy Crossing';
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
    this.run = createLife(randomSeed());
    writeLife(this.run, undefined, true);
    this.saveFailed = false;
    this.loadWorld();
  }

  continueRun(save) {
    this.run = { ...save };
    this.loadWorld();
  }

  loadWorld() {
    this.unload();
    const run = this.run;
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.physics = new Physics();
    this.enemyController = this.physics.characterController();
    this.time = run.simTime ?? 0;
    this.arenaHalf = run.world.half;
    this.tokens.holders.clear();
    this.frontier = buildFrontier(this, run.world);
    this.debris = new Debris(this);
    this.projectiles = new Projectiles(this);
    this.player = new Player(this, run.player.x, run.player.z, run);
    for (const key of ['yaw', 'sinceHit', 'rollT', 'rollCooldown', 'rollX', 'rollZ']) {
      if (Number.isFinite(run.player[key])) this.player[key] = run.player[key];
    }
    this.player.prevYaw = this.player.yaw;
    this.frontier.restore(run.interior);
    this.encounters = buildEncounters(this);
    this.props = this.encounters.flatMap((c) => c.props);
    this.enemies = this.encounters.flatMap((c) => c.enemies);
    for (const shot of run.projectiles ?? []) this.projectiles.spawn(shot.x, shot.z, shot.dx, shot.dz, shot.speed, shot.dmg, shot.left);
    this.corpses = [];
    this.rebuildNav();

    this.deadEye.meter = run.deadEye ?? 0;
    this.deadEye.active = false;
    this.flanker = null;
    this.hitStopT = 0;
    this.slowmo = { scale: 1, t: 0, target: 1 };
    this.deathT = -1;
    this.camp = { x: this.player.x, z: this.player.z, t: 0 };
    this.fx.clear();
    Object.assign(this.intent, { firePressed: false, reload: false, dodgeUntil: -1, switchTo: null, aim: null });
    this.input.clear();
    this.rig.snap(this.player.x, this.player.z - 3);
    this.state = 'playing';
    this.ui.show(null);
    this.ui.toast(run.migrated ? 'Your old life is now in Mercy Crossing. Your money and guns are kept.' : 'One life. Talk to the townspeople with E. Open your map with M.', 6);
    delete run.migrated;
    this.audio.setAmbience(0.13);
    this.save();
  }

  unload() {
    if (!this.levelGroup) return;
    this.frontier?.dispose();
    this.frontier = null;
    this.encounters = [];
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
    this.capturePlayer();
    captureEncounters(this);
    this.run.simTime = this.time;
    this.run.projectiles = this.projectiles.items.filter((p) => p.active).map(({ x, z, dx, dz, speed, dmg, left }) => ({ x, z, dx, dz, speed, dmg, left }));
    const saved = writeLife(this.run);
    this.ui.setSaveStatus(saved);
    if (!saved && !this.saveFailed) {
      this.saveFailed = true;
      this.ui.toast('Save failed. Keep this tab open. Check browser storage.', 8);
    }
    if (saved) this.saveFailed = false;
  }

  capturePlayer() {
    const p = this.player, run = this.run;
    run.hp = p.hp; run.weapon = p.gunIndex; run.deadEye = this.deadEye.meter;
    run.player = {};
    for (const key of ['x', 'z', 'yaw', 'sinceHit', 'rollT', 'rollCooldown', 'rollX', 'rollZ']) run.player[key] = p[key];
    // Rooms sit outside the land, so a life inside a shop saves the street door plus a room offset.
    const room = this.frontier?.inside ? this.frontier.cameraFocus() : null;
    if (room && run.interior) {
      run.interior.local = { x: p.x - room.x, z: p.z - room.z };
      run.player.x = run.interior.outside.x; run.player.z = run.interior.outside.z;
    }
    for (const gun of p.guns) {
      run.guns[gun.def.key] = {};
      for (const key of ['ammo', 'reserve', 'cooldown', 'bloom', 'reloading', 'reloadT', 'reloadTotal']) run.guns[gun.def.key][key] = gun[key];
    }
  }

  inTown() {
    return !!this.player && (this.frontier?.inside || Math.hypot(this.player.x, this.player.z) < this.run.world.town.radius);
  }

  nearestLoot() {
    if (!this.player?.alive || this.inTown()) return null;
    let nearest = null, best = 2;
    for (const prop of this.props) {
      if (!prop.alive || prop.kind !== 'supply' || prop.looted) continue;
      const distance = Math.hypot(prop.x - this.player.x, prop.z - this.player.z);
      if (distance < best) { nearest = prop; best = distance; }
    }
    return nearest;
  }

  lootHint() {
    return this.nearestLoot() ? 'Press [E] to Loot Supplies' : '';
  }

  lootNearest() {
    const chest = this.nearestLoot();
    if (!chest) return false;
    chest.setLooted(true);
    const gun = this.player.gun;
    this.run.bounty += chest.lootMoney;
    gun.reserve += chest.lootAmmo;
    this.fx.emit('dust', chest.x, 0.7, chest.z, 5, 0, 1, Math.PI, 0.5);
    this.audio.play('coin', { bus: 'ui', vol: 0.65 });
    this.ui.toast(`Found $${chest.lootMoney} and ${chest.lootAmmo} ${gun.def.name.toLowerCase()} rounds.`, 3.5);
    this.save();
    return true;
  }

  useBandage() {
    if (!this.player.alive || this.player.hp >= T.player.hp) return;
    if (!this.run.bandages) { this.ui.toast('No bandages. Visit the doctor in town.'); return; }
    this.run.bandages--;
    const healed = Math.min(T.player.hp - this.player.hp, T.player.bandageHeal);
    this.player.hp += healed;
    this.ui.toast(`Bandage used · +${Math.round(healed)} health`);
    this.save();
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
    if (!P.alive || this.frontier.inside) return;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - P.x, e.z - P.z) > 26) continue;
      if (this.physics.los(P.x, P.z, e.x, e.z)) e.markSpotted();
    }
  }

  onPlayerDied() {
    // Write death before effects or menus. A reload must not revive this life.
    this.capturePlayer();
    if (!endLife(this.run)) this.ui.toast('The life has ended. Browser storage could not save this change.', 8);
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
    const proof = recordTargetKill(run, e.id);
    this.deadEye.add(T.deadEye.fillKill);
    this.hitStop(T.hitStop.kill);
    this.addTrauma(0.15);
    this.ui.toast(proof ? 'Target down. Proof collected. Return to the sheriff.' : (crit ? 'Sneak shot' : 'Outlaw down'), 3);
    const camp = e.encounter;
    if (camp.enemies.every((x) => !x.alive) && !run.camps[camp.id].cleared) {
      run.camps[camp.id].cleared = true;
      run.camp++;
      this.slowmo = { scale: 0.3, t: T.run.killSlowmoTime, target: 0.3 };
      this.ui.toast(`${camp.name} is clear. Return to town when you are ready.`, 5);
    }
    this.save();
  }

  spawnCorpse(model, x, z, yaw, dirX, dirZ, force, tall) {
    this.levelGroup.remove(model.root);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    const parts = [];
    const addPart = (object, lx, ly, lz, shape, vx, vy, vz) => {
      object.removeFromParent();
      object.position.set(vx, vy, vz);
      object.rotation.set(0, 0, 0);
      const mesh = new THREE.Group();
      mesh.add(object);
      this.levelGroup.add(mesh);
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      const { body } = this.physics.dynamic({
        x: px, y: ly, z: pz, rot: rotation, shape,
        density: 1.4, friction: 0.9, restitution: 0.03, group: GROUPS.corpse, linDamp: 0.9, angDamp: 1.7,
      });
      body.setLinvel({ x: dirX * force, y: 1.6, z: dirZ * force }, true);
      body.setAngvel({ x: dirZ * 3 + (Math.random() - 0.5), y: (Math.random() - 0.5) * 1.5, z: -dirX * 3 + (Math.random() - 0.5) }, true);
      const obj = this.physics.track(new PhysObj(body, mesh));
      this.corpses.push(obj);
      parts.push(obj);
      return obj;
    };
    const torso = addPart(model.torso, 0, 1.32 * tall, 0, { type: 'box', hx: 0.34, hy: 0.5 * tall, hz: 0.24 }, 0, -1.32 * tall, 0);
    const arm = addPart(model.arm, 0.29, 1.32 * tall, 0.22, { type: 'box', hx: 0.15, hy: 0.15, hz: 0.3 }, 0, 0, -0.22);
    const thighs = [], shins = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      thighs.push(addPart(model.thighs[i], side * 0.12, 0.62 * tall, 0,
        { type: 'box', hx: 0.12, hy: 0.22 * tall, hz: 0.13 }, 0, 0.2 * tall, 0));
      shins.push(addPart(model.shins[i], side * 0.12, 0.2 * tall, 0,
        { type: 'box', hx: 0.13, hy: 0.23 * tall, hz: 0.15 }, 0, 0.22 * tall, 0));
    }
    const joint = (a, b, anchorA, anchorB) => this.physics.world.createImpulseJoint(
      RAPIER.JointData.spherical(anchorA, anchorB), a.body, b.body, true);
    joint(torso, arm, { x: 0.29, y: 0.02 * tall, z: 0 }, { x: 0, y: 0, z: -0.22 });
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      joint(torso, thighs[i], { x: side * 0.12, y: -0.5 * tall, z: 0 }, { x: 0, y: 0.2 * tall, z: 0 });
      joint(thighs[i], shins[i], { x: 0, y: -0.22 * tall, z: 0 }, { x: 0, y: 0.22 * tall, z: 0 });
    }
    torso.parts = parts;
    return torso;
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

  aliveFraction(camp) {
    const total = this.run.camps[camp.id].enemies?.length || camp.enemies.length;
    return total ? camp.enemies.filter((e) => e.alive).length / total : 0;
  }

  playerCamping() { return this.camp.t; }

  rebuildNav() {
    rebuildCampNav(this.encounters);
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
    if (this.state === 'interaction') {
      if (inp.pressed('pause')) this.townActions.close();
      return;
    }
    if (this.state === 'map' && (inp.pressed('map') || inp.pressed('pause'))) { this.closeMap(); return; }
    if (this.state === 'playing' && inp.pressed('map')) { this.openMap(); return; }
    if (inp.pressed('pause') && (this.state === 'playing' || this.state === 'paused')) this.pause(this.state === 'playing');
    if (this.state !== 'playing' && this.state !== 'dying') {
      it.fireHeld = false;
      return;
    }
    if (this.state === 'playing' && inp.pressed('interact')) {
      if (this.townActions.nearest()) { this.townActions.open(); return; }
      if (this.lootNearest()) return;
    }
    if (this.state === 'playing' && inp.pressed('bandage')) this.useBandage();
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
      if (w) this.rig.zoom(w);
    }

    // Dead Eye is held, and drains in real time.
    const de = this.deadEye;
    const want = inp.held('deadEye') && this.state === 'playing' && p && p.alive && !this.inTown();
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
    this.frontier.beforePlayer(this.intent);
    p.tick(dt, gunDt, this.intent);
    this.frontier.tick(dt);
    if (p.alive) {
      if (!this.frontier.inside) discover(this.run, p.x, p.z);
      if (!this.frontier.inside) {
        if (Math.hypot(p.x - this.camp.x, p.z - this.camp.z) > 2) { this.camp.x = p.x; this.camp.z = p.z; this.camp.t = 0; }
        else this.camp.t += dt;
      }
    }
    for (const e of this.enemies) {
      if (this.frontier.inside) {
        if (this.flanker === e) this.flanker = null;
        if (e.token) e.releaseToken();
        e.hideAimLine();
        continue;
      }
      if (Math.hypot(e.x - p.x, e.z - p.z) < 65) e.tick(dt);
      else {
        if (this.flanker === e) this.flanker = null;
        if (e.token) { e.releaseToken(); e.hideAimLine(); e.setState('search'); }
      }
    }
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
      const near = this.encounters.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 34);
      this.locationName = this.frontier.inside ? this.frontier.locationLabel() : this.inTown() ? 'Mercy Crossing' : (near?.name ?? 'The frontier');
      this.interactionHint = this.townActions.hint() || this.lootHint();
      this.frontier.render(alpha);
      const simDt = this.state === 'playing' || this.state === 'dying' ? dt : 0;
      p.render(alpha, simDt);
      if (this.frontier.inside) {
        for (const e of this.enemies) { e.model.root.visible = false; e.hideAimLine(); }
        for (const pr of this.props) {
          pr.mesh.visible = false;
          if (pr.flame) pr.flame.visible = false;
          if (pr.fireLight) pr.fireLight.visible = false;
        }
        for (const item of this.debris.items) item.mesh.visible = false;
        for (const c of this.corpses) c.mesh.visible = false;
      } else {
        for (const e of this.enemies) { e.model.root.visible = e.alive; e.render(alpha, simDt); }
        for (const pr of this.props) {
          pr.mesh.visible = pr.alive;
          if (pr.flame) pr.flame.visible = pr.alive;
          if (pr.fireLight) pr.fireLight.visible = pr.alive;
          pr.render(alpha, dt, this.realTime);
        }
        for (const item of this.debris.items) item.mesh.visible = true;
        this.debris.render(alpha);
        for (const c of this.corpses) { c.mesh.visible = true; c.render(alpha); }
        this.projectiles.render(alpha);
      }
      const focus = this.frontier.cameraFocus() ?? (p.alive || !p.corpse ? p.model.root.position : p.corpse.mesh.position);
      this.rig.update(dt, focus, p.alive && !this.frontier.inside ? this.intent.aim : null);
      this.render.focusShadow(this.rig.target.x, this.rig.target.z);
      this.audio.setListener(this.rig.target.x, this.rig.target.z);
      const fxScale = (de.active ? T.deadEye.timeScale : 1) * this.slowmo.scale;
      if (this.state === 'playing' || this.state === 'dying') this.fx.update(dt * fxScale);
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
