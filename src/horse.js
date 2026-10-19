// A rented or owned horse: mount with F, hold E to dismount, whistle with V, sprint
// with Shift while riding. Horses carry stamina, spook under heavy fire and
// never enter buildings. Riding uses the player's own collider.
import { T } from './tuning.js';
import { Shape, meshOf } from './models.js';
import { horse as horseShape } from './interior-social.js';
import { angleDelta } from './character.js';

export const STABLE_SPOT = { x: -5.4, z: 21 };
const BREEDS = {
  rental: { name: 'Old Dusty', coat: 0x8a6a4a, mane: 0x3a2a20, speed: () => T.horse.rentalSpeed, fear: 0.35, stamina: 0.7 },
  owned: { name: 'the bay mare', coat: 0x704631, mane: 0x2a211c, speed: () => T.horse.ownedSpeed, fear: 0.12, stamina: 1 },
};

export class Horse {
  constructor(game, data) {
    this.game = game;
    this.data = data;
    this.breed = BREEDS[data.owned ? 'owned' : 'rental'];
    this.x = Number.isFinite(data.x) ? data.x : STABLE_SPOT.x;
    this.z = Number.isFinite(data.z) ? data.z : STABLE_SPOT.z;
    this.yaw = data.yaw ?? Math.PI;
    this.mounted = false;
    this.called = false;
    this.sprinting = false;
    this.dismountHoldStart = null;
    this.bob = 0;
    const s = new Shape();
    horseShape(s, this.breed.coat, this.breed.mane, true);
    this.mesh = meshOf(s);
    game.levelGroup.add(this.mesh);
  }

  get name() { return this.breed.name; }
  get speedFactor() {
    const sprint = this.sprinting && this.data.stamina > 0.02 ? T.horse.sprint : 1;
    return this.breed.speed() * sprint * (this.data.stamina < 0.05 ? 0.75 : 1);
  }

  /** The interaction point beside an unmounted horse. */
  point() {
    if (this.mounted || this.game.frontier.inside) return null;
    return { id: 'horse', kind: 'mount', label: `Mount ${this.name}`, x: this.x, z: this.z };
  }

  mount() {
    const p = this.game.player;
    if (this.mounted || !p.alive) return false;
    this.mounted = true; this.called = false;
    this.dismountHoldStart = null;
    p.bandageT = -1;
    this.game.rig.ride = 6;
    this.game.tips.done('mount');
    return true;
  }

  /** Steps off on the first clear side. */
  dismount(thrown = false) {
    const g = this.game, p = g.player;
    if (!this.mounted) return false;
    this.mounted = false;
    this.dismountHoldStart = null;
    g.rig.ride = 0;
    const sides = [[Math.cos(p.yaw), -Math.sin(p.yaw)], [-Math.cos(p.yaw), Math.sin(p.yaw)], [-Math.sin(p.yaw), -Math.cos(p.yaw)]];
    for (const [sx, sz] of sides) {
      const hit = g.physics.castRay(p.x, 1, p.z, sx, 0, sz, 1.6, undefined, p.collider);
      if (hit) continue;
      g.teleportPlayer(p.x + sx * 1.3, p.z + sz * 1.3);
      break;
    }
    if (thrown) {
      // A spooked horse bolts a short way and waits.
      this.x += Math.sin(this.yaw) * 12; this.z += Math.cos(this.yaw) * 12;
      g.ui.toast(`${this.name} throws you and bolts`, 3);
    }
    if (g.inTown() && !this.data.owned && this.data.left) {
      g.ui.toast('The stable hand leads Old Dusty home. Your rental is over.', 4);
      g.endRental();
    }
    return true;
  }

  /** Holds the dismount action long enough to prevent accidental exits. */
  updateDismount(held, now) {
    if (!this.mounted || !held) {
      this.dismountHoldStart = null;
      return false;
    }
    if (this.dismountHoldStart === null) this.dismountHoldStart = now;
    if (now - this.dismountHoldStart < T.horse.dismountHold) return false;
    return this.dismount();
  }

  dismountProgress(now) {
    if (this.dismountHoldStart === null) return 0;
    return Math.min(1, Math.max(0, (now - this.dismountHoldStart) / T.horse.dismountHold));
  }

  whistle() {
    const p = this.game.player;
    if (this.mounted) return;
    const d = Math.hypot(this.x - p.x, this.z - p.z);
    this.game.audio.play('uiClick', { vol: 0.9, pitch: 2.2 });
    if (d > T.horse.whistleRange) { this.game.ui.toast(`${this.name} is too far away to hear you`); return; }
    this.called = true;
  }

  spook(amount) {
    if (!this.mounted || amount < T.horse.fearHit) return;
    if (Math.random() < this.breed.fear * (this.data.stamina < 0.3 ? 1.6 : 1)) this.dismount(true);
  }

  tick(dt, intent, sprintHeld) {
    const g = this.game, p = g.player, H = T.horse;
    if (this.mounted) {
      this.x = p.x; this.z = p.z; this.yaw = p.yaw;
      if (!g.inTown()) this.data.left = true;
      const moving = Math.hypot(intent.move.x, intent.move.z) > 0.1;
      this.sprinting = sprintHeld && moving && this.data.stamina > 0.02;
      const max = this.breed.stamina;
      this.data.stamina = this.sprinting ? Math.max(0, this.data.stamina - H.staminaDrain * dt) : Math.min(max, this.data.stamina + H.staminaRegen * dt);
    } else {
      this.sprinting = false;
      this.data.stamina = Math.min(this.breed.stamina, this.data.stamina + H.staminaRegen * dt);
      if (this.called) {
        const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
        if (d < 2.5) this.called = false;
        else {
          const speed = Math.min(9, d * 2);
          this.x += dx / d * speed * dt; this.z += dz / d * speed * dt;
          this.yaw += angleDelta(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
        }
      }
    }
    this.data.x = this.x; this.data.z = this.z; this.data.yaw = this.yaw;
  }

  render(dt) {
    const g = this.game, p = g.player, moving = this.mounted ? p.speedNow > 1 : this.called;
    this.bob += dt * (moving ? 11 : 2);
    this.mesh.visible = !g.frontier.inside;
    this.mesh.position.set(this.mounted ? p.model.root.position.x : this.x, moving ? Math.abs(Math.sin(this.bob)) * 0.08 : 0, this.mounted ? p.model.root.position.z : this.z);
    this.mesh.rotation.y = this.mounted ? p.model.root.rotation.y : this.yaw;
    const m = p.model;
    if (this.mounted && p.alive) {
      // Sit the rider in the saddle with legs either side.
      m.root.position.y = 1.18 + this.mesh.position.y;
      m.legs[0].rotation.set(-1.25, 0, -0.32); m.legs[1].rotation.set(-1.25, 0, 0.32);
      if (m.knees) m.knees[0].rotation.x = m.knees[1].rotation.x = 1.35;
    } else if (m.legs[0].rotation.z !== 0) { m.legs[0].rotation.z = 0; m.legs[1].rotation.z = 0; }
  }

  dispose() {
    this.game.levelGroup?.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
