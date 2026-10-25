// The player: tight kinematic movement, dodge roll with i-frames, guns,
// health with threshold regeneration.
import { T } from './tuning.js';
import { GROUPS, RAPIER } from './physics.js';
import { makeCharacter, LOOKS, muzzleLocal } from './models.js';
import { addRollPivot, animateCharacter, showGun, angleDelta, turnToward, makeCorpse, poseSeated } from './character.js';
import { WEAPONS, Gun, STEADY_TIME } from './weapons.js';
import { effectActive } from './items.js';
import { fireShot } from './player-fire.js';
import { drinkSway, staggerMove, tickVices } from './vices.js';

const COAT_LOOK = { ...LOOKS.player, vest: 0x335a63, shirt: 0xd9c89a };

export class Player {
  /**
   * @param {object} game
   * @param {number} x
   * @param {number} z
   * @param {{hp:number, unlocked:string[], weapon:number}} run
   */
  constructor(game, x, z, run) {
    this.game = game;
    this.x = x; this.z = z;
    this.px = x; this.pz = z;
    this.vx = 0; this.vz = 0;
    this.yaw = Math.PI;
    this.prevYaw = this.yaw;
    this.hp = run.hp;
    this.alive = true;
    this.sinceHit = 99;
    this.pool = run.ammo;
    this.guns = run.unlocked.map((k) => new Gun(WEAPONS[k], run.guns[k], this.pool));
    this.gunIndex = Math.min(run.weapon ?? 0, this.guns.length - 1);
    this.rollT = -1;
    this.rollCooldown = 0;
    this.rollX = 0; this.rollZ = 1;
    this.stepT = 0;
    this.flash = 0;
    this.speedNow = 0;
    this.emptyClickT = 0;
    this.steadyT = 0;
    this.recoil = 0;
    this.bandageT = -1;
    this.run = run;

    const cap = game.physics.kinematicCapsule(x, z, T.player.halfHeight, T.player.radius, GROUPS.player, this);
    this.body = cap.body;
    this.collider = cap.collider;
    this.bodyY = cap.y;
    this.controller = game.physics.characterController();

    this.model = addRollPivot(makeCharacter(run.gear.coat ? COAT_LOOK : LOOKS.player));
    this.coat = run.gear.coat;
    showGun(this.model, this.gun.def.key);
    game.levelGroup.add(this.model.root);
  }

  get gun() { return this.guns[this.gunIndex]; }
  get rolling() { return this.rollT >= 0; }
  get invulnerable() { return this.rollT >= 0 && this.rollT < T.dodge.iframes; }
  get moveFraction() { return Math.min(1, this.speedNow / T.player.speed); }
  get steady() { return this.steadyT >= STEADY_TIME; }
  get sway() { return drinkSway(this.run); }
  get bandaging() { return this.bandageT >= 0; }

  /** Spread the reticle should show right now. */
  aimSpread() { return this.gun.spread(this.moveFraction, this.steady, this.sway); }

  refreshInventory(run) {
    this.run = run;
    this.pool = run.ammo;
    for (const key of run.unlocked) {
      let gun = this.guns.find((g) => g.def.key === key);
      if (!gun) { gun = new Gun(WEAPONS[key], run.guns[key], this.pool); this.guns.push(gun); }
      gun.pool = this.pool;
      gun.ammo = run.guns[key].ammo;
      gun.condition = run.guns[key].condition ?? 1;
    }
    this.hp = run.hp;
    if (this.coat !== run.gear.coat) {
      this.game.levelGroup.remove(this.model.root);
      this.model.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      this.model.material.dispose();
      this.model = addRollPivot(makeCharacter(run.gear.coat ? COAT_LOOK : LOOKS.player));
      this.game.levelGroup.add(this.model.root);
      this.coat = run.gear.coat;
      showGun(this.model, this.gun.def.key);
    }
  }

  /** Starts wrapping a bandage. It heals at the end; a hard hit stops it. */
  startBandage() {
    const g = this.game;
    if (!this.alive || this.bandaging || this.rolling) return;
    if (this.hp >= T.player.hp) { g.ui.toast('You are not hurt.'); return; }
    if (!this.run.items.bandage) { g.ui.toast('No bandages. The doctor sells them.'); return; }
    this.bandageT = 0;
    this.gun.reloading = false;
    g.audio.play('bandage', { vol: 0.7 });
  }

  tickCare(dt) {
    const g = this.game, P = T.player;
    if (this.bandaging) {
      this.bandageT += dt;
      if (this.bandageT >= P.bandageTime) {
        this.bandageT = -1;
        this.run.items.bandage--;
        const healed = Math.min(P.hp - this.hp, P.bandageHeal);
        this.hp += healed;
        g.ui.toast(`Bandaged · +${Math.round(healed)} health`);
        g.net?.act('heal', { src: 'bandage' });
        g.audio.play('heal', { bus: 'ui', vol: 0.6 });
        g.save();
      }
    }
    // A meal heals slowly once the shooting has stopped for a while.
    if (this.run.mealHeal > 0 && effectActive(this.run, 'meal') && this.sinceHit > 5 && this.hp < P.hp) {
      const step = Math.min(this.run.mealHeal, 2 * dt, P.hp - this.hp);
      this.hp += step; this.run.mealHeal -= step;
      if (g.net && (this.mealSendT = (this.mealSendT ?? 0) - dt) <= 0) { this.mealSendT = 1.5; g.net.act('heal', { src: 'meal' }); }
    }
  }

  switchTo(i) {
    if (i < 0 || i >= this.guns.length || i === this.gunIndex || !this.alive) return;
    this.gun.reloading = false;
    this.gunIndex = i;
    this.gun.cooldown = Math.max(this.gun.cooldown, 0.18);
    showGun(this.model, this.gun.def.key);
    this.game.audio.play('switch', { vol: 0.6 });
  }

  /**
   * @param {number} dt sim seconds
   * @param {number} gunDt real seconds per tick (guns run in real time during Dead Eye)
   * @param {object} intent
   */
  tick(dt, gunDt, intent) {
    this.px = this.x; this.pz = this.z;
    this.prevYaw = this.yaw;
    if (!this.alive) return;
    const g = this.game, P = T.player, D = T.dodge;
    tickVices(this, dt);

    // Dodge roll (buffered input).
    this.rollCooldown -= dt * (effectActive(this.run, 'coffee') ? 1.6 : 1);
    if (!this.rolling && this.rollCooldown <= 0 && g.realTime <= intent.dodgeUntil && !g.horse?.mounted) {
      if (this.bandaging) { this.bandageT = -1; g.ui.toast('Bandage dropped'); }
      intent.dodgeUntil = -1;
      const mv = intent.move;
      if (mv.x || mv.z) { this.rollX = mv.x; this.rollZ = mv.z; }
      else { this.rollX = Math.sin(this.yaw); this.rollZ = Math.cos(this.yaw); }
      this.rollT = 0;
      g.audio.play('roll', { vol: 0.7 });
      g.fx.emit('dust', this.x, 0.1, this.z, 6, -this.rollX, -this.rollZ, 0.8);
    }

    let mx, mz;
    if (this.rolling) {
      this.rollT += dt;
      const f = this.rollT / D.duration;
      const v0 = D.distance / (D.duration * 0.7);
      const v = v0 * (1 - 0.6 * Math.min(1, f));
      this.vx = this.rollX * v; this.vz = this.rollZ * v;
      if (this.rollT >= D.duration) { this.rollT = -1; this.rollCooldown = D.cooldown; this.recoverT = D.recovery; this.vx *= 0.4; this.vz *= 0.4; }
    } else {
      this.recoverT = Math.max(0, (this.recoverT ?? 0) - dt);
      const speed = P.speed * this.gun.def.moveMult * (this.recoverT > 0 ? 0.5 : 1) * (this.bandaging ? 0.45 : 1) * (g.horse?.mounted ? g.horse.speedFactor : 1);
      const move = staggerMove(this.run, g.time, intent.move);
      const tx = move.x * speed, tz = move.z * speed;
      const accelerating = tx * this.vx + tz * this.vz > 0 || Math.hypot(tx, tz) > Math.hypot(this.vx, this.vz);
      const rate = (speed / (tx || tz ? (accelerating ? P.accelTime : P.stopTime) : P.stopTime)) * dt;
      const dx = tx - this.vx, dz = tz - this.vz;
      const dl = Math.hypot(dx, dz);
      if (dl <= rate) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / dl) * rate; this.vz += (dz / dl) * rate; }
    }
    mx = this.vx * dt; mz = this.vz * dt;
    this.controller.computeColliderMovement(this.collider, { x: mx, y: 0, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.playerMove);
    const mv = this.controller.computedMovement();
    this.x += mv.x; this.z += mv.z;
    if (!g.frontier?.inside) {
      // Shop rooms sit beyond the land edge, so the edge clamp only applies outdoors.
      const lim = g.arenaHalf - 0.6;
      this.x = Math.max(-lim, Math.min(lim, this.x));
      this.z = Math.max(-lim, Math.min(lim, this.z));
    }
    this.body.setNextKinematicTranslation({ x: this.x, y: this.bodyY, z: this.z });
    this.speedNow = Math.hypot(mv.x, mv.z) / dt;

    // Footsteps.
    if (!this.rolling && this.speedNow > 1 && !g.horse?.mounted) {
      this.stepT -= dt * this.speedNow;
      if (this.stepT <= 0) {
        this.stepT = 2.1;
        g.audio.play(g.frontier?.inside ? 'stepWood' : 'stepDirt', { vol: this.sneaking ? 0.16 : 0.32, vary: 0.12, reverb: 0.1 });
      }
    }

    // Aim.
    if (intent.aim) {
      const dx = intent.aim.x - this.x, dz = intent.aim.z - this.z;
      if (dx * dx + dz * dz > 0.25) {
        const target = Math.atan2(dx, dz);
        this.yaw = this.rolling ? Math.atan2(this.rollX, this.rollZ) : turnToward(this.yaw, target, P.turnRate * dt);
      }
    }

    // Weapons.
    if (intent.switchTo !== null) { this.switchTo(intent.switchTo); intent.switchTo = null; }
    const gun = this.gun;
    const reload = gun.update(gunDt);
    if (reload === 'round') g.audio.play(gun.def.loadSound, { vol: 0.55 });
    else if (reload === 'done') {
      g.audio.play(gun.def.loadSound, { vol: 0.55 });
      g.audio.play(gun.def.reloadEnd, { vol: 0.8, delay: 0.12 });
    }
    this.recoil = Math.max(0, this.recoil - gunDt * 3);
    if (this.speedNow < 0.8 && !this.rolling) this.steadyT += gunDt; else this.steadyT = 0;
    if (intent.reload) { intent.reload = false; if (!this.bandaging && gun.startReload()) this.reloadStarted(); }
    this.emptyClickT -= gunDt;
    if (g.gunsAllowed() && !this.rolling && !this.bandaging && (intent.fireHeld || intent.firePressed)) {
      if (gun.canFire()) fireShot(this);
      else if (gun.ammo <= 0 && intent.firePressed && this.emptyClickT <= 0) {
        this.emptyClickT = 0.3;
        this.recoil = Math.min(1, this.recoil + 0.25);
        g.audio.play('dryClick', { vol: 0.9 });
        g.ui.emptyClick();
        if (gun.startReload()) this.reloadStarted(0.1);
        else if (gun.reserve <= 0) g.ui.toast('Out of ammunition');
      }
    }
    intent.firePressed = false;
    if (gun.ammo <= 0 && !gun.reloading && gun.cooldown < -0.15 && !this.bandaging && gun.startReload()) this.reloadStarted();
    this.tickCare(dt);

    // Threshold regeneration.
    this.sinceHit += dt;
    if (this.sinceHit >= P.regenDelay && this.hp < P.hp) {
      const cap = Math.min(P.hp, Math.ceil(this.hp / P.regenStep - 1e-6) * P.regenStep);
      if (this.hp < cap) this.hp = Math.min(cap, this.hp + P.regenRate * dt);
    }
  }

  reloadStarted(delay = 0) {
    const start = this.gun.def.reloadStart;
    if (start) this.game.audio.play(start, { vol: 0.7, delay });
  }

  muzzle() {
    const m = muzzleLocal(this.gun.def.key);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x + m.x * c + m.z * s, y: m.y, z: this.z - m.x * s + m.z * c };
  }

  damage(amount, dirX, dirZ) {
    if (!this.alive || this.invulnerable || this.game.inTown()) return false;
    const g = this.game;
    // Online the server decides every wound; a bullet that reaches us just stops here.
    if (g.net) return true;
    if (this.run.gear.coat) amount *= 0.9;
    if (this.bandaging && amount >= T.player.bandageBreak) { this.bandageT = -1; g.ui.toast('Bandage dropped'); }
    g.horse?.spook(amount);
    this.hp -= amount;
    this.sinceHit = 0;
    this.flash = 0.08;
    g.addTrauma(0.35);
    g.ui.hurt(dirX, dirZ);
    g.audio.play('hurt', { vol: 0.9 });
    g.stats.damageTaken += amount;
    if (this.hp <= 0) { this.hp = 0; this.die(dirX, dirZ); }
    return true;
  }

  /** A wound the server dealt: same feel as a local hit, with the server's health. */
  netHurt(amount, dirX, dirZ, hp) {
    if (!this.alive) return;
    const g = this.game;
    if (this.bandaging && amount >= T.player.bandageBreak) { this.bandageT = -1; g.ui.toast('Bandage dropped'); }
    g.horse?.spook(amount);
    this.hp = hp;
    this.sinceHit = 0;
    this.flash = 0.08;
    g.addTrauma(Math.min(0.5, 0.15 + amount / 60));
    g.ui.hurt(dirX, dirZ);
    g.audio.play('hurt', { vol: 0.9 });
    g.stats.damageTaken += amount;
  }

  die(dirX, dirZ) {
    this.alive = false;
    const g = this.game;
    g.physics.removeBody(this.body);
    this.model.material.emissiveIntensity = 0;
    this.model.pivot.rotation.set(0, 0, 0);
    this.model.pivot.scale.set(1, 1, 1);
    this.corpse = makeCorpse(g, this.model, this.x, this.z, this.yaw, dirX, dirZ, 3.5);
    g.audio.play('bodyFall', { vol: 0.9, delay: 0.4 });
    g.onPlayerDied();
  }

  render(alpha, realDt) {
    if (!this.alive) return;
    const m = this.model;
    m.root.position.set(this.px + (this.x - this.px) * alpha, 0, this.pz + (this.z - this.pz) * alpha);
    m.root.rotation.y = this.prevYaw + angleDelta(this.prevYaw, this.yaw) * alpha;
    if (this.flash > 0) this.flash -= realDt;
    animateCharacter(m, {
      speed: this.rolling ? 0 : this.speedNow, dt: realDt, aiming: this.game.gunsAllowed(), flash: this.flash,
      roll: this.rolling ? this.rollT / T.dodge.duration : -1,
    });
    if (this.game.frontier?.seated && !this.rolling) poseSeated(m);
    if (this.bandaging) { m.arm.rotation.x = 1.35; m.body.rotation.x = 0.18; } else m.body.rotation.x = 0;
    const d = this.run.drunk ?? 0;
    if (d > 0.3) m.pivot.rotation.z = Math.sin(this.game.time * 1.7) * (d - 0.3) * 0.12;
    else if (m.pivot.rotation.z && !this.rolling) m.pivot.rotation.z = 0;
    const armed = this.game.gunsAllowed();
    showGun(m, armed ? this.gun.def.key : null);
    if (!armed) m.arm.rotation.x = 1.1;
    // Hand to the mouth while smoking.
    if (this.smokeT > 0 && !this.rolling) { showGun(m, null); m.arm.rotation.x = 2.2 - Math.abs(Math.sin(this.smokeT * 1.4)) * 0.6; }
  }
}
