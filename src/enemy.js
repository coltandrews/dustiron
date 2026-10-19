// Bandits: perception, a small state machine, cover use, attack tokens and
// readable aim lines before every shot.
import * as THREE from 'three';
import { T } from './tuning.js';
import { GROUPS, RAPIER } from './physics.js';
import { makeCharacter, LOOKS, muzzleLocal } from './models.js';
import { addRollPivot, animateCharacter, showGun, angleDelta, turnToward, makeCorpse } from './character.js';
import { chooseCover } from './cover.js';
import { rand, randSpread } from './rng.js';
import { surrender, tickCaptive } from './enemy-captive.js';

// How each bandit gun sounds: [sound, pitch].
const GUN_SOUNDS = { rifle: ['rifle', 1.05], repeater: ['rifle', 1.2], shotgun: ['shotgun', 1], heavy: ['revolver', 0.8], pistol: ['enemyShot', 0.95] };

const DEG = Math.PI / 180;

export const BANDIT_TYPES = {
  gunman: {
    look: 'gunman', hp: 100, speed: 3.6, gun: 'revolver', aim: 0.45, burst: 2, burstGap: 0.28, pellets: 1,
    dmg: 15, bulletSpeed: 40, spreadDeg: 4, cooldown: [1.2, 2.2], range: [6, 14], fireRange: 20,
    mag: 6, reload: 1.6, bounty: 15, usesCover: true, sight: 18,
  },
  rusher: {
    look: 'rusher', hp: 70, speed: 5.0, gun: 'shotgun', aim: 0.35, burst: 1, burstGap: 0, pellets: 5,
    dmg: 9, bulletSpeed: 34, spreadDeg: 16, cooldown: [1.2, 1.7], range: [2.5, 6], fireRange: 7.5,
    mag: 2, reload: 1.6, bounty: 20, usesCover: false, sight: 16,
  },
  sharpshooter: {
    look: 'sharpshooter', hp: 60, speed: 3.2, gun: 'rifle', aim: 0.9, burst: 1, burstGap: 0, pellets: 1,
    dmg: 35, bulletSpeed: 60, spreadDeg: 0.8, cooldown: [2.2, 3.2], range: [17, 26], fireRange: 32,
    mag: 5, reload: 2.2, bounty: 30, usesCover: true, sight: 30,
  },
  // Leads a camp: tougher, quicker to shoot and quick to flank.
  leader: {
    look: 'leader', hp: 150, speed: 3.9, gun: 'heavy', aim: 0.42, burst: 2, burstGap: 0.34, pellets: 1,
    dmg: 19, bulletSpeed: 44, spreadDeg: 3.4, cooldown: [1.0, 1.8], range: [5, 12], fireRange: 21,
    mag: 5, reload: 1.8, bounty: 40, usesCover: true, sight: 20, flanks: true,
  },
  // Watches the approaches, shouts the camp awake and keeps his distance.
  scout: {
    look: 'scout', hp: 55, speed: 5.0, gun: 'repeater', aim: 0.55, burst: 1, burstGap: 0, pellets: 1,
    dmg: 12, bulletSpeed: 48, spreadDeg: 3, cooldown: [1.4, 2.4], range: [12, 19], fireRange: 26,
    mag: 8, reload: 2, bounty: 15, usesCover: true, sight: 26, warns: true,
  },
};

export const lineGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const _yellow = new THREE.Color(0xffd35a);
const _red = new THREE.Color(0xff3322);

export class Bandit {
  constructor(game, type, x, z, campIndex, encounter, target) {
    this.game = game;
    this.encounter = encounter;
    this.type = type;
    this.def = BANDIT_TYPES[type];
    this.maxHp = this.def.hp;
    this.hp = this.def.hp;
    this.alive = true;
    this.x = x; this.z = z;
    this.px = x; this.pz = z;
    this.vx = 0; this.vz = 0;
    this.kx = 0; this.kz = 0; // knockback velocity
    this.yaw = Math.PI + rand(-0.6, 0.6);
    this.prevYaw = this.yaw;
    this.state = 'idle';
    this.stateT = 0;
    this.knows = false;
    this.canSee = false;
    this.unseenT = 0;
    this.lastSeenX = x; this.lastSeenZ = z;
    this.lastSeenT = -99;
    this.stimX = x; this.stimZ = z;
    this.perceptT = rand(0, T.enemy.perceptionInterval);
    this.cover = null;
    this.coverCheckT = 0;
    this.token = false;
    this.ammo = this.def.mag;
    this.reloadT = 0;
    this.cooldown = rand(0.3, 1.0);
    this.aimT = 0;
    this.aimYaw = this.yaw;
    this.burstLeft = 0;
    this.burstT = 0;
    this.path = null;
    this.pathIdx = 0;
    this.pathTX = 0; this.pathTZ = 0;
    this.repathT = 0;
    this.homeX = x; this.homeZ = z;
    this.wanderT = rand(0.5, 3);
    this.wanderX = x; this.wanderZ = z;
    this.peekX = x; this.peekZ = z;
    this.fleeing = false;
    this.flash = 0;
    this.zig = rand(0, 6);
    this.accuracy = 1 + campIndex * T.enemy.accuracyPerCamp;
    this.spottedX = x; this.spottedZ = z; this.spottedT = -99; // last time the player saw this bandit
    this.isTarget = !!target;
    this.surrendered = false;

    const ph = game.physics;
    const cap = ph.kinematicCapsule(x, z, T.player.halfHeight, T.player.radius, GROUPS.enemy, this);
    this.body = cap.body;
    this.collider = cap.collider;
    this.bodyY = cap.y;

    const look = LOOKS[this.def.look];
    this.model = addRollPivot(makeCharacter(target ? { ...look, hat: 0x9d302b, band: 0xe4bf6c } : look));
    showGun(this.model, this.def.gun);
    this.model.root.position.set(x, 0, z);
    game.levelGroup.add(this.model.root);

    this.aimLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({
      color: 0xffd35a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.aimLine.visible = false;
    this.aimLine.frustumCulled = false;
    game.levelGroup.add(this.aimLine);
  }

  // ---------- perception ----------

  perceive() {
    const P = this.game.player;
    if (!P.alive || this.game.inTown()) { this.canSee = false; return; }
    const dx = P.x - this.x, dz = P.z - this.z;
    const d = Math.hypot(dx, dz);
    let see = false;
    // Walking slowly keeps the player harder to spot; running draws the eye.
    const sight = this.def.sight * (P.sneaking ? 0.6 : P.moveFraction > 0.75 ? 1.1 : 1);
    if (d < sight) {
      const off = Math.abs(angleDelta(this.yaw, Math.atan2(dx, dz)));
      if (d < T.enemy.closeSense || this.knows || off < (T.enemy.sightFovDeg * DEG) / 2) {
        see = this.game.physics.los(this.x, this.z, P.x, P.z);
      }
    }
    this.canSee = see;
    if (see) {
      this.lastSeenX = P.x; this.lastSeenZ = P.z;
      this.lastSeenT = this.game.time;
      if (!this.knows && this.state !== 'alert') {
        this.alertTo(P.x, P.z);
        this.game.shout(this, this.def.warns ? 3 : 1);
        if (this.def.warns) this.game.audio.at('alert', this.x, this.z, { vol: 0.9, pitch: 1.3 });
      }
    }
  }

  /** Gunfire or an ally's shout. */
  hear(x, z, direct = false) {
    if (!this.alive) return;
    if (!this.knows) {
      if (this.state !== 'alert') this.alertTo(x, z);
    } else if (!this.canSee || direct) {
      this.lastSeenX = x; this.lastSeenZ = z;
      this.lastSeenT = this.game.time;
    }
  }

  alertTo(x, z) {
    this.stimX = x; this.stimZ = z;
    this.lastSeenX = x; this.lastSeenZ = z;
    this.lastSeenT = this.game.time;
    this.setState('alert');
    this.game.audio.at('alert', this.x, this.z, { vol: 0.35 });
  }

  // ---------- state helpers ----------

  setState(s) {
    if (this.state === s) return;
    if ((this.state === 'aim' || this.state === 'burst') && s !== 'burst') this.hideAimLine();
    this.state = s;
    this.stateT = 0;
    this.path = null;
  }

  releaseToken() {
    if (this.token) { this.game.tokens.release(this); this.token = false; }
  }

  engageAfterAlert() {
    this.knows = true;
    if (this.type === 'rusher') this.setState('charge');
    else this.setState('toCover');
  }

  coverRange() {
    if (this.fleeing) return [16, 40];
    return this.def.range;
  }

  pickCover() {
    this.cover = chooseCover(this.game, this, { range: this.coverRange(), fromX: this.lastSeenX, fromZ: this.lastSeenZ });
    return this.cover;
  }

  finishEngage() {
    this.releaseToken();
    this.hideAimLine();
    const [a, b] = this.def.cooldown;
    this.cooldown = rand(a, b) * (this.fleeing ? 1.6 : 1);
    if (this.ammo <= 0) this.reloadT = this.def.reload;
    if (this.type === 'rusher') this.setState('charge');
    else if (this.cover) this.setState('toCover');
    else this.setState('open');
  }

  // ---------- movement ----------

  /** Steers along a nav path toward (tx,tz). Returns true when arrived. */
  moveTo(tx, tz, speed, dt, arrive = 0.35) {
    const dist = Math.hypot(tx - this.x, tz - this.z);
    if (dist < arrive) { this.desire(0, 0, 0); return true; }
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || Math.hypot(tx - this.pathTX, tz - this.pathTZ) > 1) {
      this.path = this.encounter.nav.findPath(this.x, this.z, tx, tz);
      this.pathIdx = 0;
      this.pathTX = tx; this.pathTZ = tz;
      this.repathT = rand(0.7, 1.1);
    }
    let wx = tx, wz = tz;
    if (this.path && this.path.length) {
      while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - this.x, this.path[this.pathIdx].z - this.z) < 0.4) this.pathIdx++;
      wx = this.path[this.pathIdx].x; wz = this.path[this.pathIdx].z;
    }
    const dx = wx - this.x, dz = wz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const slow = Math.min(1, dist / 1.2);
    this.desire(dx / d, dz / d, speed * Math.max(0.35, slow));
    return false;
  }

  desire(dirX, dirZ, speed) {
    this.wantX = dirX * speed;
    this.wantZ = dirZ * speed;
  }

  integrate(dt) {
    // Separation from other bandits.
    let sx = 0, sz = 0;
    for (const o of this.encounter.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < T.enemy.separation) { sx += (dx / d) * (T.enemy.separation - d); sz += (dz / d) * (T.enemy.separation - d); }
    }
    const tx = this.wantX + sx * 2.5, tz = this.wantZ + sz * 2.5;
    const k = Math.min(1, dt * 14);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    const decay = Math.exp(-dt * 7);
    this.kx *= decay; this.kz *= decay;
    const mx = (this.vx + this.kx) * dt, mz = (this.vz + this.kz) * dt;
    const cc = this.game.enemyController;
    cc.computeColliderMovement(this.collider, { x: mx, y: 0, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.enemyMove);
    const mv = cc.computedMovement();
    this.x += mv.x; this.z += mv.z;
    const { x, z } = this.encounter;
    const lim = this.encounter.nav.half - 1;
    this.x = Math.max(x - lim, Math.min(x + lim, this.x));
    this.z = Math.max(z - lim, Math.min(z + lim, this.z));
    this.body.setNextKinematicTranslation({ x: this.x, y: this.bodyY, z: this.z });
    this.moveSpeed = Math.hypot(mv.x, mv.z) / dt;
  }

  faceTo(x, z, dt, rate = 9) {
    this.yaw = turnToward(this.yaw, Math.atan2(x - this.x, z - this.z), rate * dt);
  }

  // ---------- combat ----------

  muzzle() {
    const m = muzzleLocal(this.def.gun, this.model.tall);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x + m.x * c + m.z * s, y: m.y, z: this.z - m.x * s + m.z * c };
  }

  hasShot() {
    const P = this.game.player;
    return P.alive && !this.game.inTown() && this.game.physics.los(this.x, this.z, P.x, P.z);
  }

  fire() {
    const g = this.game, P = g.player, def = this.def;
    if (g.inTown()) { this.finishEngage(); return; }
    const mz = this.muzzle();
    const spread = (def.spreadDeg / this.accuracy) * DEG;
    for (let i = 0; i < def.pellets; i++) {
      const a = this.aimYaw + randSpread(spread / 2);
      g.projectiles.spawn(mz.x, mz.z, Math.sin(a), Math.cos(a), def.bulletSpeed, def.dmg, def.pellets > 1 ? def.fireRange * 1.4 : 45);
    }
    this.ammo--;
    this.markSpotted(); // muzzle flashes give away a shooter's position
    g.fx.muzzle(mz.x, mz.y, mz.z, Math.sin(this.aimYaw), Math.cos(this.aimYaw), def.pellets > 1);
    const gunSound = GUN_SOUNDS[def.gun] ?? GUN_SOUNDS.pistol;
    g.audio.at(gunSound[0], this.x, this.z, { vol: def.gun === 'rifle' ? 1 : 0.8, pitch: gunSound[1], reverb: 0.35 });
    g.addTrauma(0.04);
    if (P.alive) { this.lastSeenX = P.x; this.lastSeenZ = P.z; }
  }

  updateAimLine() {
    const g = this.game;
    const mz = this.muzzle();
    const dx = Math.sin(this.aimYaw), dz = Math.cos(this.aimYaw);
    const hit = g.physics.castRay(mz.x, T.player.gunHeight, mz.z, dx, 0, dz, this.def.fireRange, GROUPS.blockers);
    let len = hit ? hit.dist : this.def.fireRange;
    const P = g.player;
    if (P.alive) len = Math.min(len, Math.hypot(P.x - mz.x, P.z - mz.z) + 1.5);
    const f = Math.min(1, this.aimT / this.def.aim);
    const line = this.aimLine;
    line.visible = true;
    line.position.set(mz.x, mz.y, mz.z);
    line.rotation.set(0, this.aimYaw, 0);
    const thick = this.type === 'sharpshooter' ? 0.05 : 0.035;
    line.scale.set(thick, thick, len);
    line.material.color.copy(_yellow).lerp(_red, f);
    line.material.opacity = 0.3 + f * 0.6;
  }

  hideAimLine() { this.aimLine.visible = false; }

  markSpotted() {
    this.spottedX = this.x; this.spottedZ = this.z; this.spottedT = this.game.time;
  }

  /** @returns {{killed:boolean, crit:boolean}} */
  onHit(dmg, dirX, dirZ, knock) {
    if (!this.alive) return { killed: false, crit: false };
    const crit = !this.knows && !this.surrendered;
    this.hp -= crit ? dmg * 2 : dmg;
    if (this.hp > 0 && !this.surrendered && this.shouldSurrender()) { surrender(this); return { killed: false, crit }; }
    this.flash = 0.06;
    this.kx += dirX * knock * 2.2;
    this.kz += dirZ * knock * 2.2;
    const P = this.game.player;
    this.lastSeenX = P.x; this.lastSeenZ = P.z; this.lastSeenT = this.game.time;
    if (this.hp <= 0) { this.die(dirX, dirZ, 3 + knock * 1.5); return { killed: true, crit }; }
    if (!this.knows) { this.knows = true; this.engageAfterAlert(); this.game.shout(this); }
    this.game.audio.at('enemyHurt', this.x, this.z, { vol: 0.6 });
    if (!this.fleeing && this.hp < this.maxHp * 0.25 && this.game.aliveFraction(this.encounter) <= 0.5 && this.type !== 'rusher') {
      this.fleeing = true;
      this.releaseToken();
      this.cover = null;
      this.setState('toCover');
    }
    return { killed: false, crit };
  }

  /** A wounded bounty target gives up so they can be taken alive. */
  shouldSurrender() {
    return this.isTarget && this.hp < this.maxHp * 0.35 && this.game.wantsAlive?.(this);
  }

  die(dirX, dirZ, force) {
    this.alive = false;
    this.surrendered = false;
    this.releaseToken();
    this.hideAimLine();
    if (this.game.flanker === this) this.game.flanker = null;
    const g = this.game;
    g.physics.removeBody(this.body);
    this.body = null;
    this.model.material.emissiveIntensity = 0;
    this.model.pivot.rotation.set(0, 0, 0);
    this.model.pivot.scale.set(1, 1, 1);
    this.corpse = makeCorpse(g, this.model, this.x, this.z, this.yaw, dirX, dirZ, force, this.model.tall);
    g.audio.at('enemyDeath', this.x, this.z, { vol: 0.8 });
    g.audio.at('bodyFall', this.x, this.z, { vol: 0.7, delay: 0.45 });
    g.levelGroup.remove(this.aimLine);
    this.aimLine.material.dispose();
  }

  // ---------- main tick ----------

  tick(dt) {
    if (!this.alive) return;
    const g = this.game, P = g.player, def = this.def;
    this.px = this.x; this.pz = this.z;
    this.prevYaw = this.yaw;
    this.stateT += dt;
    this.wantX = 0; this.wantZ = 0;

    if (this.surrendered) { tickCaptive(this, dt); return; }
    this.perceptT -= dt;
    if (this.perceptT <= 0) { this.perceptT = T.enemy.perceptionInterval; this.perceive(); }
    if (this.canSee) this.unseenT = 0; else this.unseenT += dt;

    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = def.mag; }
    this.cooldown -= dt;
    const sinceSeen = g.time - this.lastSeenT;

    if (!P.alive && this.knows && this.state !== 'idle') {
      this.releaseToken();
      this.knows = false;
      this.homeX = this.x; this.homeZ = this.z;
      this.setState('idle');
    }

    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(3, 6);
          const a = rand(0, Math.PI * 2), r = rand(0.5, 2.5);
          this.wanderX = this.homeX + Math.sin(a) * r;
          this.wanderZ = this.homeZ + Math.cos(a) * r;
        }
        if (!this.moveTo(this.wanderX, this.wanderZ, 1.3, dt)) this.faceTo(this.x + this.wantX, this.z + this.wantZ, dt, 4);
        break;
      }
      case 'alert': {
        this.faceTo(this.stimX, this.stimZ, dt, 7);
        const wait = this.type === 'rusher' ? 0.35 : T.enemy.alertTime;
        if (this.stateT >= wait) this.engageAfterAlert();
        break;
      }
      case 'toCover': {
        if (!this.cover || !this.cover.prop.isCover()) {
          if (!this.pickCover()) { this.setState('open'); break; }
        }
        if (this.moveTo(this.cover.x, this.cover.z, def.speed, dt)) this.setState('hold');
        else if (this.stateT > 6) { this.cover = null; this.setState('open'); }
        break;
      }
      case 'hold': {
        this.faceTo(this.lastSeenX, this.lastSeenZ, dt, 6);
        if (this.cover && (!this.cover.prop.isCover() || Math.hypot(this.cover.x - this.x, this.cover.z - this.z) > 1.2)) {
          this.cover = null; this.setState('toCover'); break;
        }
        this.coverCheckT -= dt;
        if (this.coverCheckT <= 0 && this.cover) {
          this.coverCheckT = 0.5;
          // Flanked: the player can see this spot. Find new cover.
          if (P.alive && this.cooldown > 0.4 && g.physics.los(this.cover.x, this.cover.z, P.x, P.z)) { this.cover = null; this.setState('toCover'); break; }
        }
        if (this.ammo <= 0 && this.reloadT <= 0) this.reloadT = def.reload;
        if (sinceSeen > T.enemy.memory) { this.setState('search'); break; }
        if (!this.fleeing && !this.canSee && g.playerCamping() > T.enemy.flankAfter * (def.flanks ? 0.5 : 1) && !g.flanker && (this.type === 'gunman' || def.flanks)) {
          g.flanker = this; this.setState('flank'); break;
        }
        if (this.cooldown <= 0 && this.ammo > 0 && this.reloadT <= 0 && g.tokens.take(this)) {
          this.token = true;
          this.setState('peek');
        }
        break;
      }
      case 'peek': {
        if (this.stateT === dt) this.choosePeek();
        this.faceTo(this.lastSeenX, this.lastSeenZ, dt, 8);
        if (this.canSee && this.hasShot()) { this.startAim(); break; }
        const arrived = this.moveTo(this.peekX, this.peekZ, def.speed, dt, 0.25);
        if ((arrived && this.stateT > 0.25 && !this.hasShot()) || this.stateT > 1.6) {
          this.releaseToken();
          this.cooldown = 0.8;
          if (g.playerCamping() > 2 && !g.flanker && this.type === 'gunman') { g.flanker = this; this.setState('flank'); }
          else this.setState(this.cover ? 'toCover' : 'open');
        }
        break;
      }
      case 'aim': {
        this.aimT += dt;
        const lockAt = def.aim - 0.12;
        if (this.aimT < lockAt && P.alive) {
          const lead = Math.min(0.5, Math.hypot(P.x - this.x, P.z - this.z) / def.bulletSpeed) * 0.5;
          const tx = P.x + P.vx * lead, tz = P.z + P.vz * lead;
          this.aimYaw = turnToward(this.aimYaw, Math.atan2(tx - this.x, tz - this.z), 5 * dt);
        }
        this.yaw = this.aimYaw;
        this.updateAimLine();
        if (this.unseenT > 0.45) { this.finishEngage(); this.cooldown = 0.4; break; }
        if (this.aimT >= def.aim) {
          this.fire();
          this.burstLeft = def.burst - 1;
          if (this.burstLeft > 0 && this.ammo > 0) { this.burstT = def.burstGap; this.state = 'burst'; }
          else this.finishEngage();
        }
        break;
      }
      case 'burst': {
        this.yaw = this.aimYaw;
        if (P.alive) this.aimYaw = turnToward(this.aimYaw, Math.atan2(P.x - this.x, P.z - this.z), 2 * dt);
        this.updateAimLine();
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.fire();
          this.burstLeft--;
          if (this.burstLeft > 0 && this.ammo > 0) this.burstT = def.burstGap;
          else this.finishEngage();
        }
        break;
      }
      case 'open': {
        // No cover: hold a preferred range and shoot when a token frees up.
        const d = Math.hypot(this.lastSeenX - this.x, this.lastSeenZ - this.z);
        const [lo, hi] = def.range;
        if (d > hi) this.moveTo(this.lastSeenX, this.lastSeenZ, def.speed, dt, hi);
        else if (d < lo) {
          const ax = (this.x - this.lastSeenX) / (d || 1), az = (this.z - this.lastSeenZ) / (d || 1);
          this.moveTo(this.x + ax * 2, this.z + az * 2, def.speed * 0.8, dt);
        }
        this.faceTo(this.lastSeenX, this.lastSeenZ, dt, 8);
        if (this.ammo <= 0 && this.reloadT <= 0) this.reloadT = def.reload;
        if (sinceSeen > T.enemy.memory) { this.setState('search'); break; }
        if (this.stateT > 2 && this.def.usesCover && this.pickCover()) { this.setState('toCover'); break; }
        if (this.cooldown <= 0 && this.ammo > 0 && this.reloadT <= 0 && this.canSee && g.tokens.take(this)) { this.token = true; this.startAim(); }
        break;
      }
      case 'flank': {
        if (this.stateT === dt && !this.chooseFlank()) { g.flanker = null; this.setState('hold'); break; }
        const arrived = this.moveTo(this.peekX, this.peekZ, def.speed * 1.1, dt);
        if (arrived || this.stateT > 7 || (this.canSee && this.stateT > 1)) {
          g.flanker = null;
          this.cover = null;
          if (this.canSee && this.cooldown <= 0.6 && g.tokens.take(this)) { this.token = true; this.startAim(); }
          else this.setState('toCover');
        }
        break;
      }
      case 'search': {
        const arrived = this.moveTo(this.lastSeenX, this.lastSeenZ, def.speed * 0.75, dt);
        if (arrived) this.yaw += dt * 2.2;
        else this.faceTo(this.x + this.wantX, this.z + this.wantZ, dt, 6);
        if (this.canSee) { this.cover = null; this.setState(this.type === 'rusher' ? 'charge' : 'toCover'); break; }
        if (arrived && this.stateT > 4) {
          this.knows = false;
          this.homeX = this.x; this.homeZ = this.z;
          this.setState('idle');
        }
        break;
      }
      case 'charge': {
        const dx = P.x - this.x, dz = P.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        if (this.ammo <= 0 && this.reloadT <= 0) this.reloadT = def.reload;
        if (sinceSeen > T.enemy.memory) { this.setState('search'); break; }
        if (d < 2.6) {
          // Too close: strafe sideways around the player.
          this.desire(-dz / d, dx / d, def.speed * 0.7);
        } else {
          const tx = this.canSee ? P.x : this.lastSeenX, tz = this.canSee ? P.z : this.lastSeenZ;
          this.moveTo(tx, tz, def.speed, dt, 2.4);
          if (this.canSee && d > 4) {
            const z = Math.sin(g.time * 3.5 + this.zig) * 0.75;
            this.wantX += (-dz / d) * z * def.speed;
            this.wantZ += (dx / d) * z * def.speed;
          }
        }
        this.faceTo(P.x, P.z, dt, 10);
        if (d < def.fireRange && this.canSee && this.cooldown <= 0 && this.ammo > 0 && this.reloadT <= 0 && this.hasShot()) this.startAim();
        break;
      }
    }

    this.integrate(dt);
  }

  startAim() {
    this.aimT = 0;
    const P = this.game.player;
    this.aimYaw = Math.atan2(P.x - this.x, P.z - this.z);
    this.setState('aim');
  }

  choosePeek() {
    const P = this.game.player;
    this.peekX = this.x; this.peekZ = this.z;
    if (this.hasShot()) return;
    const dx = this.lastSeenX - this.x, dz = this.lastSeenZ - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const px = -dz / d, pz = dx / d;
    const opts = [[px * 1.3, pz * 1.3], [-px * 1.3, -pz * 1.3], [px * 2.2 + dx / d * 0.6, pz * 2.2 + dz / d * 0.6], [-px * 2.2 + dx / d * 0.6, -pz * 2.2 + dz / d * 0.6]];
    if (Math.random() < 0.5) opts.reverse();
    for (const [ox, oz] of opts) {
      const x = this.x + ox, z = this.z + oz;
      if (!this.encounter.nav.isFree(x, z)) continue;
      if (P.alive && this.game.physics.los(x, z, P.x, P.z)) { this.peekX = x; this.peekZ = z; return; }
    }
    this.peekX = this.x + opts[0][0]; this.peekZ = this.z + opts[0][1];
  }

  chooseFlank() {
    const P = this.game.player;
    const bearing = Math.atan2(this.x - P.x, this.z - P.z);
    const dist = Math.max(8, Math.min(12, Math.hypot(this.x - P.x, this.z - P.z)));
    const sign = Math.random() < 0.5 ? 1 : -1;
    for (const off of [80, 100, 65, 120]) {
      for (const s of [sign, -sign]) {
        const a = bearing + s * off * DEG;
        const x = P.x + Math.sin(a) * dist, z = P.z + Math.cos(a) * dist;
        if (!this.encounter.nav.isFree(x, z)) continue;
        if (!this.game.physics.los(x, z, P.x, P.z)) continue;
        this.peekX = x; this.peekZ = z;
        return true;
      }
    }
    return false;
  }

  render(alpha, realDt) {
    if (!this.alive) return;
    const m = this.model;
    m.root.visible = !this.jailed;
    m.root.position.set(this.px + (this.x - this.px) * alpha, 0, this.pz + (this.z - this.pz) * alpha);
    m.root.rotation.y = this.prevYaw + angleDelta(this.prevYaw, this.yaw) * alpha;
    if (this.flash > 0) this.flash -= realDt;
    animateCharacter(m, {
      speed: this.moveSpeed ?? 0, dt: realDt,
      aiming: this.state === 'aim' || this.state === 'burst' || this.state === 'peek' || (this.knows && this.state === 'hold'),
      flash: this.flash,
    });
    if (this.surrendered) { m.arm.rotation.x = -2.5; m.body.rotation.x = this.captive ? 0.1 : 0; }
    if (this.aimLine.visible) {
      const pulse = 0.85 + Math.sin(this.game.time * 40) * 0.15;
      this.aimLine.material.opacity *= pulse;
    }
  }
}
