// Weapons as data, plus the small state machine every gun shares.
// Reloads add one round at a time and firing stops a reload at once.
// Spread grows with rapid fire (bloom), movement and a dirty barrel, and
// shrinks for a steady first shot.

export const WEAPONS = {
  revolver: {
    key: 'revolver', name: 'Revolver', ammoType: 'pistol', damage: 34, pellets: 1, interval: 0.24, mag: 6,
    reloadPerRound: 0.42, spreadDeg: 1.4, bloomDeg: 0.9, bloomMaxDeg: 5, bloomRecover: 0.35, moveSpreadDeg: 2.2,
    range: 22, impulse: 1.6, knockback: 1.6, pierce: 0, trauma: 0.25, sound: 'revolver', pitch: 1, layout: 'cylinder', wear: 0.0018, moveMult: 1,
    cycle: null, reloadStart: 'cylinderOpen', loadSound: 'loadPistol', reloadEnd: 'cylinderClose',
  },
  heavy: {
    key: 'heavy', name: 'Heavy revolver', ammoType: 'heavy', damage: 58, pellets: 1, interval: 0.55, mag: 5,
    reloadPerRound: 0.55, spreadDeg: 1.2, bloomDeg: 2.6, bloomMaxDeg: 7, bloomRecover: 0.55, moveSpreadDeg: 3,
    range: 24, impulse: 2.6, knockback: 3, pierce: 0, trauma: 0.42, sound: 'revolver', pitch: 0.78, layout: 'cylinder', wear: 0.0022, moveMult: 1,
    cycle: null, reloadStart: 'cylinderOpen', loadSound: 'loadPistol', reloadEnd: 'cylinderClose',
  },
  repeater: {
    key: 'repeater', name: 'Repeater', ammoType: 'rifle', damage: 30, pellets: 1, interval: 0.32, mag: 10,
    reloadPerRound: 0.36, spreadDeg: 1.0, bloomDeg: 0.7, bloomMaxDeg: 4, bloomRecover: 0.3, moveSpreadDeg: 2.6,
    range: 30, impulse: 1.8, knockback: 1.8, pierce: 0, trauma: 0.28, sound: 'rifle', pitch: 1.25, layout: 'row', wear: 0.0016, moveMult: 0.95,
    cycle: 'lever', reloadStart: null, loadSound: 'loadRifle', reloadEnd: 'lever',
  },
  shotgun: {
    key: 'shotgun', name: 'Shotgun', ammoType: 'shells', damage: 12, pellets: 7, interval: 0.85, mag: 2,
    reloadPerRound: 0.6, spreadDeg: 9, bloomDeg: 0, bloomMaxDeg: 0, bloomRecover: 0.3, moveSpreadDeg: 2,
    range: 9, impulse: 0.9, knockback: 3.2, pierce: 0, trauma: 0.45, sound: 'shotgun', pitch: 1, layout: 'row', wear: 0.003, moveMult: 1,
    cycle: null, reloadStart: 'breakOpen', loadSound: 'loadShell', reloadEnd: 'breakClose',
  },
  rifle: {
    key: 'rifle', name: 'Rifle', ammoType: 'rifle', damage: 80, pellets: 1, interval: 1.1, mag: 5,
    reloadPerRound: 0.6, spreadDeg: 0.25, bloomDeg: 1.2, bloomMaxDeg: 2, bloomRecover: 0.6, moveSpreadDeg: 6,
    range: 42, impulse: 2.6, knockback: 2.2, pierce: 1, trauma: 0.35, sound: 'rifle', pitch: 1, layout: 'row', wear: 0.0012, moveMult: 0.85,
    cycle: 'bolt', reloadStart: null, loadSound: 'loadRifle', reloadEnd: 'bolt',
  },
};

/** A gun that is steady for this long fires its first shot with tighter spread. */
export const STEADY_TIME = 0.45;
export const STEADY_FACTOR = 0.45;
export const MIN_CONDITION = 0.6;

export class Gun {
  /** `pool` is the life's shared ammo object; guns of one type draw from the same pool. */
  constructor(def, state = {}, pool = { [def.ammoType]: 0 }) {
    this.def = def;
    this.pool = pool;
    this.ammo = state.ammo ?? def.mag;
    this.cooldown = state.cooldown ?? 0;
    this.bloom = state.bloom ?? 0;
    this.reloading = state.reloading ?? false;
    this.reloadT = state.reloadT ?? 0;
    this.reloadTotal = state.reloadTotal ?? 0;
    this.condition = state.condition ?? 1;
    this.emptyT = 0;
  }

  get reserve() { return this.pool[this.def.ammoType] ?? 0; }
  set reserve(value) { this.pool[this.def.ammoType] = value; }

  /** Current spread in degrees for a given movement fraction (0..1) and steadiness. */
  spread(move = 0, steady = false, sway = 0) {
    const dirt = 1 + (1 - this.condition) * 1.4;
    const base = (this.def.spreadDeg + this.bloom + this.def.moveSpreadDeg * Math.min(1, move) + sway) * dirt;
    return steady && this.bloom < 0.2 ? base * STEADY_FACTOR : base;
  }
  get spreadDeg() { return this.spread(); }
  get reloadProgress() { return this.reloading ? Math.min(1, this.reloadT / this.def.reloadPerRound) : 0; }

  /** @returns {'round'|'done'|null} what the reload did this tick */
  update(dt) {
    this.cooldown -= dt;
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - (this.def.bloomDeg / this.def.bloomRecover) * dt);
    if (!this.reloading) return null;
    this.reloadT += dt;
    if (this.reloadT < this.def.reloadPerRound) return null;
    this.reloadT -= this.def.reloadPerRound;
    if (this.reserve > 0 && this.ammo < this.def.mag) { this.ammo++; this.reserve--; }
    if (this.ammo >= this.def.mag || this.reserve <= 0) { this.reloading = false; this.reloadT = 0; return 'done'; }
    return 'round';
  }

  startReload() {
    if (this.reloading || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadTotal = this.def.reloadPerRound * Math.min(this.def.mag - this.ammo, this.reserve);
    return true;
  }

  canFire() { return this.cooldown <= 0 && this.ammo > 0; }

  /** Fires one shot and returns its spread in degrees. Firing stops a reload. */
  fire(move = 0, steady = false, sway = 0) {
    this.reloading = false;
    this.reloadT = 0;
    const spread = this.spread(move, steady, sway);
    this.ammo--;
    this.cooldown = this.def.interval;
    this.bloom = Math.min(this.def.bloomMaxDeg, this.bloom + this.def.bloomDeg);
    this.condition = Math.max(MIN_CONDITION, this.condition - this.def.wear);
    return spread;
  }
}
