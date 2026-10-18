// The player: tight kinematic movement, dodge roll with i-frames, guns,
// health with threshold regeneration.
import { T } from './tuning.js';
import { GROUPS, RAPIER } from './physics.js';
import { makeCharacter, LOOKS, muzzleLocal } from './models.js';
import { addRollPivot, animateCharacter, showGun, angleDelta, turnToward, makeCorpse } from './character.js';
import { WEAPONS, Gun } from './weapons.js';
import { randSpread } from './rng.js';

const DEG = Math.PI / 180;

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
    this.guns = run.unlocked.map((k) => {
      const saved = run.guns[k];
      return Object.assign(new Gun(WEAPONS[k], saved.ammo, saved.reserve), saved);
    });
    this.gunIndex = Math.min(run.weapon ?? 0, this.guns.length - 1);
    this.rollT = -1;
    this.rollCooldown = 0;
    this.rollX = 0; this.rollZ = 1;
    this.stepT = 0;
    this.flash = 0;
    this.speedNow = 0;
    this.emptyClickT = 0;

    const cap = game.physics.kinematicCapsule(x, z, T.player.halfHeight, T.player.radius, GROUPS.player, this);
    this.body = cap.body;
    this.collider = cap.collider;
    this.bodyY = cap.y;
    this.controller = game.physics.characterController();

    this.model = addRollPivot(makeCharacter(run.coat ? { ...LOOKS.player, vest: 0x335a63, shirt: 0xd9c89a } : LOOKS.player));
    this.coat = run.coat;
    showGun(this.model, this.gun.def.key);
    game.levelGroup.add(this.model.root);
  }

  get gun() { return this.guns[this.gunIndex]; }
  get rolling() { return this.rollT >= 0; }
  get invulnerable() { return this.rollT >= 0 && this.rollT < T.dodge.iframes; }

  refreshInventory(run) {
    for (const key of run.unlocked) {
      let gun = this.guns.find((g) => g.def.key === key);
      if (!gun) { gun = new Gun(WEAPONS[key]); this.guns.push(gun); }
      Object.assign(gun, run.guns[key]);
    }
    this.hp = run.hp;
    if (this.coat !== run.coat) {
      this.game.levelGroup.remove(this.model.root);
      this.model.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      this.model.material.dispose();
      this.model = addRollPivot(makeCharacter({ ...LOOKS.player, vest: 0x335a63, shirt: 0xd9c89a }));
      this.game.levelGroup.add(this.model.root);
      this.coat = run.coat;
      showGun(this.model, this.gun.def.key);
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

    // Dodge roll (buffered input).
    this.rollCooldown -= dt;
    if (!this.rolling && this.rollCooldown <= 0 && g.realTime <= intent.dodgeUntil) {
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
      if (this.rollT >= D.duration) { this.rollT = -1; this.rollCooldown = D.cooldown; this.vx *= 0.4; this.vz *= 0.4; }
    } else {
      const tx = intent.move.x * P.speed, tz = intent.move.z * P.speed;
      const accelerating = tx * this.vx + tz * this.vz > 0 || Math.hypot(tx, tz) > Math.hypot(this.vx, this.vz);
      const rate = (P.speed / (tx || tz ? (accelerating ? P.accelTime : P.stopTime) : P.stopTime)) * dt;
      const dx = tx - this.vx, dz = tz - this.vz;
      const dl = Math.hypot(dx, dz);
      if (dl <= rate) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / dl) * rate; this.vz += (dz / dl) * rate; }
    }
    mx = this.vx * dt; mz = this.vz * dt;
    this.controller.computeColliderMovement(this.collider, { x: mx, y: 0, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.playerMove);
    const mv = this.controller.computedMovement();
    this.x += mv.x; this.z += mv.z;
    const lim = g.arenaHalf - 0.6;
    this.x = Math.max(-lim, Math.min(lim, this.x));
    this.z = Math.max(-lim, Math.min(lim, this.z));
    this.body.setNextKinematicTranslation({ x: this.x, y: this.bodyY, z: this.z });
    this.speedNow = Math.hypot(mv.x, mv.z) / dt;

    // Footsteps.
    if (!this.rolling && this.speedNow > 1) {
      this.stepT -= dt * this.speedNow;
      if (this.stepT <= 0) { this.stepT = 2.1; g.audio.play('footstep', { vol: 0.35, vary: 0.15 }); }
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
    if (gun.update(gunDt)) g.audio.play('reloadDone', { vol: 0.8 });
    if (gun.reloading) {
      const per = gun.reloadTotal / Math.max(1, gun.def.mag - gun.ammo);
      gun.tickAcc = (gun.tickAcc ?? 0) + gunDt;
      if (gun.tickAcc >= per) { gun.tickAcc = 0; g.audio.play('reloadTick', { vol: 0.5 }); }
    }
    if (intent.reload) { intent.reload = false; if (gun.startReload()) g.audio.play('reloadTick', { vol: 0.6 }); }
    this.emptyClickT -= gunDt;
    if (!g.inTown() && !this.rolling && (intent.fireHeld || intent.firePressed)) {
      if (gun.canFire()) this.fire();
      else if (gun.ammo <= 0 && intent.firePressed && this.emptyClickT <= 0) {
        this.emptyClickT = 0.3;
        g.audio.play('dryClick', { vol: 0.8 });
        if (gun.startReload()) g.audio.play('reloadTick', { vol: 0.6, delay: 0.1 });
      }
    }
    intent.firePressed = false;
    if (gun.ammo <= 0 && !gun.reloading && gun.cooldown < -0.15) gun.startReload();

    // Threshold regeneration.
    this.sinceHit += dt;
    if (this.sinceHit >= P.regenDelay && this.hp < P.hp) {
      const cap = Math.min(P.hp, Math.ceil(this.hp / P.regenStep - 1e-6) * P.regenStep);
      if (this.hp < cap) this.hp = Math.min(cap, this.hp + P.regenRate * dt);
    }
  }

  muzzle() {
    const m = muzzleLocal(this.gun.def.key);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x + m.x * c + m.z * s, y: m.y, z: this.z - m.x * s + m.z * c };
  }

  fire() {
    const g = this.game, gun = this.gun, def = gun.def;
    if (g.inTown()) return;
    const spreadDeg = gun.fire();
    const aim = g.intent.aim;
    let dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
    if (aim) {
      const ax = aim.x - this.x, az = aim.z - this.z;
      const l = Math.hypot(ax, az);
      if (l > 1.2) { dx = ax / l; dz = az / l; }
    }
    // Aim assist: bend up to a few degrees toward a bandit near the line.
    let baseA = Math.atan2(dx, dz);
    let best = T.aimAssist.angleDeg * DEG;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const ex = e.x - this.x, ez = e.z - this.z;
      const d = Math.hypot(ex, ez);
      if (d > T.aimAssist.range || d < 0.5) continue;
      const off = Math.abs(angleDelta(baseA, Math.atan2(ex, ez)));
      if (off < best && g.physics.los(this.x, this.z, e.x, e.z)) { best = off; baseA = Math.atan2(ex, ez); }
    }

    const mz = this.muzzle();
    const y = T.player.gunHeight;
    const mult = g.deadEye.active ? T.deadEye.damageMult : 1;
    let anyHit = false, anyKill = false, anyCrit = false;
    for (let i = 0; i < def.pellets; i++) {
      const a = baseA + randSpread((spreadDeg * DEG) / 2);
      const rx = Math.sin(a), rz = Math.cos(a);
      const max = def.range * (def.pellets > 1 ? 1.35 : 1.8);
      let ox = this.x, oz = this.z, traveled = 0, pierce = def.pierce, exclude = this.collider;
      let endX = ox + rx * max, endZ = oz + rz * max;
      for (let guard = 0; guard < 4; guard++) {
        const hit = g.physics.castRay(ox, y, oz, rx, 0, rz, max - traveled, GROUPS.playerShot, exclude);
        if (!hit) { endX = ox + rx * (max - traveled); endZ = oz + rz * (max - traveled); break; }
        const d = traveled + hit.dist;
        const fall = d <= def.range ? 1 : Math.max(0.5, 1 - (d - def.range) / def.range);
        const dmg = def.damage * fall * mult;
        const owner = hit.owner;
        endX = hit.x; endZ = hit.z;
        if (owner && owner.onHit) {
          const res = owner.onHit(dmg, rx, rz, def.knockback);
          anyHit = true;
          anyKill = anyKill || res.killed;
          anyCrit = anyCrit || res.crit;
          g.fx.impact('flesh', hit.x, hit.y, hit.z, hit.nx, hit.nz, rx, rz);
          g.audio.at('hitFlesh', hit.x, hit.z, { vol: 0.8 });
          if (res.killed) g.onEnemyKilled(owner, res.crit);
          else g.deadEye.add(T.deadEye.fillHit);
          if (pierce > 0) { pierce--; traveled = d + 0.05; ox = hit.x + rx * 0.05; oz = hit.z + rz * 0.05; exclude = hit.collider; continue; }
        } else if (owner && owner.damage) {
          const surface = owner.damage(dmg, hit.x, hit.y, hit.z, rx, rz, def.impulse, 'player');
          g.fx.impact(surface === 'cloth' || surface === 'plant' ? 'dirt' : surface, hit.x, hit.y, hit.z, hit.nx, hit.nz, rx, rz);
          const snd = surface === 'wood' || surface === 'water' ? 'hitWood' : surface === 'stone' ? 'hitDirt' : 'hitDirt';
          g.audio.at(snd, hit.x, hit.z, { vol: 0.6 });
        } else {
          g.fx.impact('dirt', hit.x, hit.y, hit.z, hit.nx, hit.nz, rx, rz);
          g.audio.at('hitDirt', hit.x, hit.z, { vol: 0.5 });
        }
        break;
      }
      g.fx.tracer(mz.x, mz.y, mz.z, endX, y, endZ, g.deadEye.active ? 0xffb070 : 0xffe7b0);
    }

    g.fx.muzzle(mz.x, mz.y, mz.z, dx, dz, def.pellets > 1);
    if (def.key !== 'shotgun') g.fx.casing(this.x, 1.0, this.z, dx, dz);
    g.audio.play(def.sound, { vol: 1, vary: 0.06 });
    g.addTrauma(def.trauma);
    g.noise(this.x, this.z, T.enemy.hearRange);
    g.stats.shots++;
    if (anyHit) { g.stats.hits++; g.ui.hitMarker(anyKill); }
    if (anyCrit && !anyKill) g.hitStop(T.hitStop.crit);
    this.vx -= dx * 0.6; this.vz -= dz * 0.6; // tiny recoil push
  }

  damage(amount, dirX, dirZ) {
    if (!this.alive || this.invulnerable || this.game.inTown()) return false;
    const g = this.game;
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
      speed: this.rolling ? 0 : this.speedNow, dt: realDt, aiming: !this.game.inTown(), flash: this.flash,
      roll: this.rolling ? this.rollT / T.dodge.duration : -1,
    });
    if (this.game.frontier?.seated) {
      m.legs[0].rotation.x = -1.25;
      m.legs[1].rotation.x = -1.25;
      m.body.position.y = 0.48;
    } else m.body.position.y = 0;
    showGun(m, this.game.inTown() ? null : this.gun.def.key);
    if (this.game.inTown()) m.arm.rotation.x = 1.1;
  }
}
