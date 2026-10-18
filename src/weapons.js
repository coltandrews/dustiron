// Weapons as data, plus the small state machine every gun shares.

export const WEAPONS = {
  revolver: {
    key: 'revolver', name: 'Revolver', damage: 34, pellets: 1, interval: 0.22, mag: 6,
    reloadFull: 1.4, reloadPerRound: 0.45, spreadDeg: 1.5, bloomDeg: 0.4, bloomMaxDeg: 4, bloomRecover: 0.3,
    range: 22, impulse: 1.6, knockback: 1.6, pierce: 0, trauma: 0.25, sound: 'revolver', layout: 'cylinder',
  },
  shotgun: {
    key: 'shotgun', name: 'Shotgun', damage: 12, pellets: 7, interval: 0.85, mag: 2,
    reloadFull: 1.8, reloadPerRound: 0.9, spreadDeg: 9, bloomDeg: 0, bloomMaxDeg: 0, bloomRecover: 0.3,
    range: 9, impulse: 0.9, knockback: 3.2, pierce: 0, trauma: 0.45, sound: 'shotgun', layout: 'row',
  },
  rifle: {
    key: 'rifle', name: 'Rifle', damage: 75, pellets: 1, interval: 1.1, mag: 5,
    reloadFull: 2.4, reloadPerRound: 0.5, spreadDeg: 0.3, bloomDeg: 1.2, bloomMaxDeg: 2, bloomRecover: 0.6,
    range: 40, impulse: 2.6, knockback: 2.2, pierce: 1, trauma: 0.35, sound: 'rifle', layout: 'row',
  },
};

export class Gun {
  constructor(def, ammo = def.mag, reserve = 0) {
    this.def = def;
    this.ammo = ammo;
    this.reserve = reserve;
    this.cooldown = 0;
    this.bloom = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadTotal = 0;
    this.emptyT = 0;
  }

  get spreadDeg() { return this.def.spreadDeg + this.bloom; }
  get reloadProgress() { return this.reloading ? this.reloadT / this.reloadTotal : 0; }

  /** @returns {boolean} true when a reload just finished */
  update(dt) {
    this.cooldown -= dt;
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - (this.def.bloomDeg / this.def.bloomRecover) * dt);
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadTotal) {
        this.reloading = false;
        const rounds = Math.min(this.def.mag - this.ammo, this.reserve);
        this.ammo += rounds;
        this.reserve -= rounds;
        return true;
      }
    }
    return false;
  }

  startReload() {
    if (this.reloading || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadTotal = Math.min(this.def.reloadFull, this.def.reloadPerRound * Math.min(this.def.mag - this.ammo, this.reserve));
    return true;
  }

  canFire() { return this.cooldown <= 0 && this.ammo > 0; }

  fire() {
    if (this.reloading) this.reloading = false; // firing cancels a partial reload
    this.ammo--;
    this.cooldown = this.def.interval;
    const spread = this.spreadDeg;
    this.bloom = Math.min(this.def.bloomMaxDeg, this.bloom + this.def.bloomDeg);
    return spread;
  }
}
