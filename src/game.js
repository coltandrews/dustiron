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
import { createLife, discover, questDefs } from './life.js';
import { buildWorldPoints } from './world-points.js';
import { Horse } from './horse.js';
import { Tips } from './tips.js';
import { enemyKilled, questEvent, tickProgress, wantsAlive } from './progress.js';
import { updateIntent } from './game-input.js';
import { ammoMax } from './items.js';
import { objective } from './quests.js';
import { loadSave as readSave, writeLife, endLife } from './storage.js';
import { buildFrontier } from './frontier.js';
import { buildEncounters, captureEncounters, rebuildCampNav } from './encounters.js';
import { TownActions } from './town-actions.js';
import { randomSeed } from './rng.js';
import { MapView } from './map.js';
import { NetWorld } from './net-world.js';
import { townAt } from './towns.js';
import { drunkScreen } from './vices.js';
import { Hunting } from './hunting.js';
import { BossBar } from './ui-boss.js';
import { Sky } from './sky.js';

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
    this.tips = new Tips(this);
    this.horse = null;
    this.worldPoints = null;
    this.questDefs = [];
    this.progressT = 0;
    this.sprintHeld = false;
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
    /** The shared server, when riding online (see game-online.js). */
    this.net = null;
    this.netWorld = null;
    this.bossBar = new BossBar();
    this.sky = render.sun ? new Sky(render) : null;
    this.worldClock = null;

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
    // Online, the server deals the next life; it arrives as a 'life' message.
    if (this.net) { this.net.act('newLife'); this.ui.show('loading'); return; }
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
    this.questDefs = questDefs(run.world);
    this.frontier = buildFrontier(this, run.world);
    this.worldPoints = buildWorldPoints(this, this.levelGroup);
    this.debris = new Debris(this);
    this.projectiles = new Projectiles(this);
    this.player = new Player(this, run.player.x, run.player.z, run);
    for (const key of ['yaw', 'sinceHit', 'rollT', 'rollCooldown', 'rollX', 'rollZ']) {
      if (Number.isFinite(run.player[key])) this.player[key] = run.player[key];
    }
    this.player.prevYaw = this.player.yaw;
    this.horse = run.horse ? new Horse(this, run.horse) : null;
    this.rig.ride = 0;
    this.frontier.restore(run.interior);
    this.encounters = buildEncounters(this);
    this.props = this.encounters.flatMap((c) => c.props);
    this.enemies = this.encounters.flatMap((c) => c.enemies);
    for (const shot of run.projectiles ?? []) this.projectiles.spawn(shot.x, shot.z, shot.dx, shot.dz, shot.speed, shot.dmg, shot.left);
    this.corpses = [];
    this.rebuildNav();
    this.wildlife = new Hunting(this);
    if (this.net) this.netWorld = new NetWorld(this, this.net);

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
    if (run.migrated) this.ui.toast('Your old life is now in Mercy Crossing. Your money and guns are kept.', 6);
    delete run.migrated;
    this.save();
  }

  unload() {
    if (!this.levelGroup) return;
    this.netWorld?.dispose();
    this.netWorld = null;
    this.wildlife?.dispose();
    this.wildlife = null;
    this.horse?.dispose();
    this.horse = null;
    this.worldPoints = null;
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
    this.ui.el.app.style?.setProperty('--vice-filter', 'none'); if (this.ui.el.app.dataset) delete this.ui.el.app.dataset.vice;
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
    if (this.net) { this.run.simTime = this.time; this.net.markLife(); return; }
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
      for (const key of ['ammo', 'cooldown', 'bloom', 'reloading', 'reloadT', 'reloadTotal', 'condition']) run.guns[gun.def.key][key] = gun[key];
    }
  }

  sightScale() { return Sky.sightScale(this.worldClock ?? this.time); }

  inTown() {
    return !!this.player && (this.frontier?.inside || !!townAt(this.run.world, this.player.x, this.player.z));
  }

  /** Guns come out outside town, or anywhere during an agreed duel. */
  gunsAllowed() {
    return !this.inTown() || !!this.net?.dueling;
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
    gun.reserve = Math.min(ammoMax(this.run, gun.def.ammoType), gun.reserve + chest.lootAmmo);
    this.fx.emit('dust', chest.x, 0.7, chest.z, 5, 0, 1, Math.PI, 0.5);
    this.audio.at('chestOpen', chest.x, chest.z, { vol: 0.8 });
    this.audio.play('coin', { bus: 'ui', vol: 0.65, delay: 0.25 });
    this.ui.toast(`Found $${chest.lootMoney} and ${chest.lootAmmo} ${gun.def.name.toLowerCase()} rounds.`, 3.5);
    this.save();
    return true;
  }

  useBandage() { this.player.startBandage(); this.tips.done('heal'); }

  questEvent(event) { return questEvent(this, event); }
  wantsAlive(enemy) { return wantsAlive(this, enemy); }

  /** Moves the player at once, for dismounting and tests. */
  teleportPlayer(x, z) {
    const p = this.player;
    p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0;
    p.body.setTranslation({ x, y: p.bodyY, z }, true);
    p.body.setNextKinematicTranslation({ x, y: p.bodyY, z });
    this.physics.world.propagateModifiedBodyPositionsToColliders();
  }

  /** Up to two current jobs for the HUD. */
  trackerHtml() {
    if (!this.run || this.state === 'title') return '';
    const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const order = { complete: 0, active: 1 };
    return this.questDefs.filter((d) => order[this.run.quests[d.id].status] !== undefined)
      .sort((a, b) => order[this.run.quests[a.id].status] - order[this.run.quests[b.id].status]).slice(0, 2)
      .map((d) => `<div><b>${esc(d.title)}</b>${esc(objective(this.run, d))}</div>`).join('');
  }

  spawnHorse() {
    this.horse?.dispose();
    this.run.horse.x = 0; this.run.horse.z = 0;
    this.horse = new Horse(this, this.run.horse);
    this.horse.x = this.horse.data.x = -5.4; this.horse.z = this.horse.data.z = 21;
    this.ui.questNote(`${this.horse.name} waits outside the livery. F to mount, V to whistle.`);
  }

  endRental() {
    this.horse?.dispose();
    this.horse = null;
    this.run.horse = null;
    this.rig.ride = 0;
    this.save();
  }

  openJournal() {
    if (this.state !== 'playing') return;
    this.state = 'journal';
    this.setDeadEye(false);
    this.input.fireHeld = false;
    this.ui.showJournal(this);
    this.audio.play('page', { bus: 'ui', vol: 0.8 });
  }

  closeJournal() {
    if (this.state !== 'journal') return;
    this.state = 'playing';
    this.input.clear();
    this.ui.show(null);
  }

  quitToTitle() {
    this.save();
    this.unload();
    if (this.net) { this.net.close(); this.net = null; }
    this.worldClock = null;
    this.sky?.reset();
    this.state = 'title';
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
    this.audio.play('page', { bus: 'ui', vol: 0.9, pitch: 0.8 });
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
    if (this.net) this.run.status = 'dead';
    else if (!endLife(this.run)) this.ui.toast('The life has ended. Browser storage could not save this change.', 8);
    this.state = 'dying';
    this.deathT = 1.8;
    this.slowmo = { scale: T.run.deathSlowmo, t: 1.2, target: T.run.deathSlowmo };
    this.setDeadEye(false);
    this.audio.cue('death');
    this.addTrauma(0.6);
    this.tokens.holders.clear();
  }

  // ---------- events used by entities ----------

  addTrauma(a) { this.rig.addTrauma(a); }
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  onEnemyKilled(e, crit) {
    const run = this.run;
    run.kills++;
    this.deadEye.add(T.deadEye.fillKill);
    this.hitStop(T.hitStop.kill);
    this.addTrauma(0.15);
    if (!e.isTarget) this.ui.toast(crit ? 'Clean shot' : 'Outlaw down', 2);
    const camp = e.encounter;
    if (enemyKilled(this, e)) {
      this.slowmo = { scale: 0.3, t: T.run.killSlowmoTime, target: 0.3 };
      this.ui.toast(`${camp.name} is quiet now.`, 4);
      this.audio.cue('victory');
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
    this.audio.at('debris', x, z, { vol: 0.7, delay: 0.25 });
    this.addTrauma(E.trauma);
    this.hitStop(T.hitStop.explosion);
    this.noise(x, z, 30);
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.position.set(x, 0.015, z);
    scorch.scale.setScalar(1.8);
    scorch.rotation.y = Math.random() * 6;
    this.levelGroup.add(scorch);
    // Online the server already dealt the blast's damage; only the push is shown here.
    if (this.net) this.pushBodies(x, z);
    else this.blast(x, z);
    this.navDirty = true;
  }

  blast(x, z) {
    const E = T.explosion;
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
    this.pushBodies(x, z);
  }

  pushBodies(x, z) {
    const E = T.explosion;
    const push = (body) => {
      const t = body.translation();
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > E.radius * 1.5) return;
      const f = 1 - d / (E.radius * 1.5);
      body.applyImpulse({ x: (dx / d) * 6 * f, y: 5 * f, z: (dz / d) * 6 * f }, true);
    };
    for (const it of this.debris.items) push(it.body);
    for (const c of this.corpses) push(c.body);
  }

  /** Gunfire: bandits in range hear it. */
  noise(x, z, range) {
    this.wildlife?.hear(x, z, Math.max(range, 45));
    if (this.net) return; // the server hears shots online
    for (const e of this.enemies) if (e.alive && Math.hypot(e.x - x, e.z - z) < range) e.hear(x, z, true);
  }

  /** A bandit that spots the player warns allies nearby. */
  /** Warns nearby allies. Scouts shout loud enough for the whole camp. */
  shout(from, reach = 1) {
    for (const e of this.enemies) {
      if (e === from || !e.alive || e.knows || e.surrendered) continue;
      if (Math.hypot(e.x - from.x, e.z - from.z) < 11 * reach) e.hear(from.lastSeenX, from.lastSeenZ);
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
    if (on) this.audio.play('deadEyeIn', { vol: 0.9, reverb: 0.4 });
  }

  // ---------- per frame ----------

  /** Reads input into intents. Runs once per frame before simulation ticks. */
  updateIntent() { updateIntent(this); }

  /** The sim time scale for this frame. */
  timeScale() {
    // A shared world cannot slow down for one rider: online time always runs.
    if (this.net) return this.player ? 1 : 0;
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
    if (this.net && this.state !== 'playing') Object.assign(this.intent, { move: { x: 0, z: 0 }, fireHeld: false, firePressed: false });
    this.frontier.beforePlayer(this.intent);
    p.tick(dt, gunDt, this.intent);
    this.frontier.tick(dt);
    this.horse?.tick(dt, this.intent, this.sprintHeld);
    this.worldPoints.tick(dt, p);
    this.progressT -= dt;
    if (this.progressT <= 0 && this.state === 'playing') { this.progressT = 1; tickProgress(this); }
    if (p.alive) {
      if (!this.frontier.inside) discover(this.run, p.x, p.z);
      if (!this.frontier.inside) {
        if (Math.hypot(p.x - this.camp.x, p.z - this.camp.z) > 2) { this.camp.x = p.x; this.camp.z = p.z; this.camp.t = 0; }
        else this.camp.t += dt;
      }
    }
    if (this.netWorld) this.netWorld.tick(dt);
    else for (const e of this.enemies) {
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
    this.wildlife.tick(dt);
    this.projectiles.tick(dt);
    for (const pr of this.props) pr.tick(dt);
    this.debris.tick(dt);
    this.physics.step();
    this.net?.tick(dt);
  }

  /** Real-time updates and rendering. */
  frame(dt, alpha) {
    this.realTime += dt;
    this.audio.update(this, dt);
    if (this.hitStopT > 0) this.hitStopT -= dt;

    if (this.slowmo.t > 0) {
      this.slowmo.t -= dt;
      if (this.slowmo.t <= 0) this.slowmo.target = 1;
    }
    this.slowmo.scale += (this.slowmo.target - this.slowmo.scale) * Math.min(1, dt * (this.slowmo.target < 1 ? 20 : 4));

    const de = this.deadEye;
    if (de.active) {
      de.meter -= dt / T.deadEye.maxRealTime;
      if (de.meter <= 0) { de.meter = 0; this.setDeadEye(false); }
    }

    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) { this.state = 'dead'; this.ui.showDead(this.run); }
    }
    if (this.state === 'playing') {
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = T.run.saveInterval; this.save(); }
    }

    const p = this.player;
    if (p) {
      const near = this.encounters.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 34);
      this.locationName = this.frontier.inside ? this.frontier.locationLabel() : this.inTown() ? townAt(this.run.world, p.x, p.z)?.name ?? 'Mercy Crossing' : (near?.name ?? 'The frontier');
      this.interactionHint = this.horse?.mounted
        ? (this.horse.showDismountHint(this.realTime) ? 'Hold [E] to get off' : '')
        : (this.townActions.hint() || this.lootHint());
      this.frontier.render(alpha);
      drunkScreen(this.ui.el.app, this.run, this.realTime);
      const simDt = this.net || this.state === 'playing' || this.state === 'dying' ? dt : 0;
      p.render(alpha, simDt);
      this.horse?.render(dt);
      this.netWorld?.render(alpha, simDt);
      this.wildlife?.setVisible(!this.frontier.inside);
      if (!this.frontier.inside) this.wildlife?.render(alpha, simDt);
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
      const focus = this.frontier.viewFocus() ?? (p.alive || !p.corpse ? p.model.root.position : p.corpse.mesh.position);
      this.rig.update(dt, focus, p.alive && !this.frontier.inside ? this.intent.aim : null);
      this.sky?.update(this, dt);
      this.render.focusShadow(this.rig.target.x, this.rig.target.z);
      this.audio.setListener(this.rig.target.x, this.rig.target.z);
      const fxScale = this.net ? 1 : (de.active ? T.deadEye.timeScale : 1) * this.slowmo.scale;
      if (this.state === 'playing' || this.state === 'dying' || this.net) this.fx.update(dt * fxScale);
      this.ui.update(this, dt);
      this.bossBar.update(this);
    } else {
      // Title backdrop: slow drift over empty desert.
      this.rig.target.x = Math.sin(this.realTime * 0.05) * 6;
      this.rig.update(dt, this.rig.target, null);
      this.render.focusShadow(this.rig.target.x, this.rig.target.z);
    }
    this.render.renderer.render(this.scene, this.rig.camera);
  }
}
