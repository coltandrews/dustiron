// Other riders on the shared server: a model per rider that eases toward the
// latest snapshot, a solid capsule so shots and shoulders meet it, a name tag,
// and a horse under them when they ride. Shots that strike a rider are sent
// to the server, which decides whether they count.
import * as THREE from 'three';
import { T } from './tuning.js';
import { GROUPS } from './physics.js';
import { LOOKS, makeCharacter, muzzleLocal } from './models.js';
import { addRollPivot, animateCharacter, angleDelta, makeCorpse, poseSeated, showGun } from './character.js';
import { animateHorse, horseRig } from './horse-rig.js';
import { PF, GUN_CODES, ROOMS } from './protocol.js';
import { puff } from './vices.js';

const SHIRTS = [0x3e6189, 0x7c3a2e, 0x5d6b3a, 0x8a6a42, 0x5a4a62, 0x2f5a58, 0x9e6971, 0x6a5a3a];
const HATS = [0xc9a273, 0x2e2420, 0x8a6a42, 0x5c3a22, 0xb79b70, 0x3a3a3a];
const SCARVES = [0xc0452f, 0xd9c9a6, 0x3f5470, 0xb98a45, 0x4b5a4a];

/** A stable look for a rider id, so friends can tell each other apart. */
export function riderLook(id, coat) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const look = { ...LOOKS.player, shirt: SHIRTS[h % SHIRTS.length], hat: HATS[(h >> 3) % HATS.length], scarf: SCARVES[(h >> 6) % SCARVES.length] };
  return coat ? { ...look, vest: 0x335a63 } : look;
}

const _v = new THREE.Vector3();

export class RemotePlayers {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.riders = new Map();
    this.standing = new Map();
    this.tags = null;
    if (globalThis.document?.getElementById) {
      this.tags = document.getElementById('rider-tags');
      if (this.tags) this.tags.replaceChildren();
    }
  }

  get(id) { return this.riders.get(id) ?? null; }

  create(id) {
    const g = this.game, info = this.net.roster.get(id) ?? { name: 'Rider', coat: 0 };
    const model = addRollPivot(makeCharacter(riderLook(id, info.coat)));
    g.levelGroup.add(model.root);
    const rider = {
      id, name: info.name, coat: info.coat, model, x: 0, z: 0, px: 0, pz: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0,
      speed: 0, flags: 0, gun: 'revolver', room: '', rollF: -1, hp: 100, alive: true, seen: 0, fresh: true,
      remote: true, horse: null, tag: null,
    };
    const cap = g.physics.kinematicCapsule(0, 0, T.player.halfHeight, T.player.radius, GROUPS.enemy, rider);
    rider.body = cap.body; rider.bodyY = cap.y;
    // A bullet from this browser that meets the capsule is reported, never applied here.
    rider.onHit = (dmg, dx, dz, knock, zone) => {
      this.net.queueHit('p', id, zone ?? 'body', dx, dz);
      return { killed: false, crit: false };
    };
    if (this.tags) {
      rider.tag = document.createElement('div');
      rider.tag.className = 'rider-tag';
      rider.tag.textContent = info.name;
      this.tags.appendChild(rider.tag);
    }
    this.riders.set(id, rider);
    return rider;
  }

  /** Applies one snapshot's rider rows. Riders missing from it are hidden after a moment. */
  apply(rows, time) {
    for (const row of rows) {
      const [id, x, z, yaw, speed, flags, gun, room, rollF, hp] = row;
      const rider = this.riders.get(id) ?? this.create(id);
      if (!rider.alive) continue;
      rider.tx = x; rider.tz = z; rider.tyaw = yaw; rider.speed = speed; rider.flags = flags;
      rider.gun = GUN_CODES[gun] ?? 'revolver'; rider.room = ROOMS[room] ?? ''; rider.rollF = rollF; rider.hp = hp;
      rider.seen = time;
      if (rider.fresh) { rider.x = rider.px = x; rider.z = rider.pz = z; rider.yaw = yaw; rider.fresh = false; }
      const info = this.net.roster.get(id);
      if (info && rider.tag && rider.name !== info.name) { rider.name = info.name; rider.tag.textContent = info.name; }
    }
  }

  /** Eases each rider toward the latest snapshot and moves their capsule. */
  tick(dt, time) {
    const k = Math.min(1, dt * 14);
    for (const rider of this.riders.values()) {
      rider.px = rider.x; rider.pz = rider.z;
      if (!rider.alive) continue;
      const far = Math.hypot(rider.tx - rider.x, rider.tz - rider.z) > 8;
      rider.x = far ? rider.tx : rider.x + (rider.tx - rider.x) * k;
      rider.z = far ? rider.tz : rider.z + (rider.tz - rider.z) * k;
      if (far) { rider.px = rider.x; rider.pz = rider.z; }
      rider.yaw += angleDelta(rider.yaw, rider.tyaw) * k;
      rider.stale = time - rider.seen > 1.5;
      rider.body?.setNextKinematicTranslation({ x: rider.x, y: rider.bodyY, z: rider.z });
    }
  }

  render(alpha, dt) {
    this.renderHorses(dt);
    const g = this.game, myRoom = g.frontier?.inside ? g.run.interior?.id ?? '' : '';
    const camera = g.rig.camera, w = globalThis.innerWidth ?? 0, h = globalThis.innerHeight ?? 0;
    for (const rider of this.riders.values()) {
      const m = rider.model;
      const visible = rider.alive && !rider.stale && rider.room === myRoom;
      if (!rider.alive) { if (rider.tag) rider.tag.hidden = true; continue; }
      m.root.visible = visible;
      if (rider.horse) rider.horse.root.visible = visible && !!(rider.flags & PF.MOUNT);
      if (rider.tag) rider.tag.hidden = !visible;
      if (!visible) continue;
      const x = rider.px + (rider.x - rider.px) * alpha, z = rider.pz + (rider.z - rider.pz) * alpha;
      const mounted = !!(rider.flags & PF.MOUNT);
      m.root.position.set(x, mounted ? 1.18 + (rider.horse?.body.position.y ?? 0) : 0, z);
      m.root.rotation.y = rider.yaw;
      const armed = !!(rider.flags & PF.ARMED);
      animateCharacter(m, { speed: mounted ? 0 : rider.speed, dt, aiming: armed, flash: 0, roll: rider.flags & PF.ROLL ? Math.max(0, rider.rollF) : -1 });
      if (rider.flags & PF.SEAT) poseSeated(m);
      if (mounted) {
        m.legs[0].rotation.set(-1.25, 0, -0.32); m.legs[1].rotation.set(-1.25, 0, 0.32);
        if (m.knees) m.knees[0].rotation.x = m.knees[1].rotation.x = 1.35;
        if (!rider.horse) { rider.horse = horseRig(0x704631, 0x2a211c, true); g.levelGroup.add(rider.horse.root); }
        animateHorse(rider.horse, rider.speed, dt);
        rider.horse.root.visible = true;
        rider.horse.root.position.set(x, 0, z);
        rider.horse.root.rotation.y = rider.yaw;
      } else if (m.legs[0].rotation.z !== 0) { m.legs[0].rotation.z = 0; m.legs[1].rotation.z = 0; }
      if (rider.flags & PF.BANDAGE) { m.arm.rotation.x = 1.35; m.body.rotation.x = 0.18; } else m.body.rotation.x = 0;
      showGun(m, armed ? rider.gun : null);
      if (!armed) m.arm.rotation.x = 1.1;
      if (rider.flags & PF.DRUNK) m.pivot.rotation.z = Math.sin(this.game.realTime * 1.7 + rider.x) * 0.08;
      else if (!(rider.flags & PF.ROLL)) m.pivot.rotation.z = 0;
      if (rider.flags & PF.SMOKE) {
        showGun(m, null);
        m.arm.rotation.x = 2.2 - Math.abs(Math.sin(this.game.realTime * 1.4)) * 0.6;
        rider.puffT = (rider.puffT ?? 0) - dt;
        if (rider.puffT <= 0) { rider.puffT = 1.1; puff(this.game, x, z, rider.yaw); }
      }
      if (rider.tag && camera) {
        _v.set(x, mounted ? 3.6 : 2.45, z).project(camera);
        const onScreen = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
        rider.tag.hidden = !onScreen;
        if (onScreen) rider.tag.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    }
  }

  /** A rider fired: muzzle flash, tracers to where their bullets stopped, and the shot sound. */
  shot(id, x, z, gunCode, ends) {
    const rider = this.riders.get(id), g = this.game;
    const gun = GUN_CODES[gunCode] ?? 'revolver';
    const yaw = rider ? rider.yaw : 0, m = muzzleLocal(gun);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const mx = x + m.x * c + m.z * s, mz = z - m.x * s + m.z * c;
    for (let i = 0; i + 1 < ends.length; i += 2) g.fx.tracer(mx, m.y, mz, ends[i], T.player.gunHeight, ends[i + 1], 0xffe7b0);
    g.fx.muzzle(mx, m.y, mz, Math.sin(yaw), Math.cos(yaw), gun === 'shotgun');
    const def = { revolver: ['revolver', 1], heavy: ['revolver', 0.8], repeater: ['rifle', 1.2], shotgun: ['shotgun', 1], rifle: ['rifle', 1] }[gun];
    g.audio.at(def[0], x, z, { vol: 0.9, pitch: def[1], reverb: 0.35 });
  }

  /** A rider was killed: they fall where they stood. */
  die(id, dx, dz) {
    const rider = this.riders.get(id);
    if (!rider || !rider.alive) return;
    rider.alive = false;
    if (rider.body) { this.game.physics.removeBody(rider.body); rider.body = null; }
    if (rider.tag) rider.tag.hidden = true;
    if (rider.horse) rider.horse.root.visible = false;
    rider.model.root.visible = true;
    makeCorpse(this.game, rider.model, rider.x, rider.z, rider.yaw, dx, dz, 3.5);
    this.game.audio.at('bodyFall', rider.x, rider.z, { vol: 0.8, delay: 0.4 });
    // The next life arrives as a new rider row; forget this one.
    this.riders.delete(id);
  }

  /** Horses other riders left standing: [ownerId, x, z, yaw, owned]. */
  horses(rows) {
    const g = this.game, seen = new Set();
    for (const [id, x, z, yaw, owned] of rows) {
      seen.add(id);
      let h = this.standing.get(id);
      if (!h || h.owned !== owned) {
        if (h) g.levelGroup.remove(h.mesh);
        const rig = horseRig(owned ? 0x704631 : 0x8a7a68, owned ? 0x2a211c : 0xd8d0c0, true);
        h = { rig, mesh: rig.root, owned, x, z, yaw };
        h.mesh.position.set(x, 0, z);
        g.levelGroup.add(h.mesh);
        this.standing.set(id, h);
      }
      h.x = x; h.z = z; h.yaw = yaw;
    }
    for (const [id, h] of this.standing) if (!seen.has(id)) { g.levelGroup?.remove(h.mesh); this.standing.delete(id); }
  }

  renderHorses(dt) {
    const inside = !!this.game.frontier?.inside, k = Math.min(1, dt * 8);
    for (const h of this.standing.values()) {
      h.mesh.visible = !inside;
      const p = h.mesh.position;
      let moved = 0;
      if (Math.hypot(h.x - p.x, h.z - p.z) > 6) p.set(h.x, 0, h.z);
      else { const dx = (h.x - p.x) * k, dz = (h.z - p.z) * k; p.x += dx; p.z += dz; moved = Math.hypot(dx, dz); }
      // A whistled horse trots over to its rider.
      if (!inside) animateHorse(h.rig, dt > 0 ? moved / dt : 0, dt);
      h.mesh.rotation.y += angleDelta(h.mesh.rotation.y, h.yaw) * k;
    }
  }

  /** Drops riders who left the server. */
  sync(roster) {
    for (const [id, rider] of this.riders) if (!roster.has(id)) this.remove(rider);
  }

  remove(rider) {
    const g = this.game;
    if (rider.body) g.physics.removeBody(rider.body);
    g.levelGroup?.remove(rider.model.root);
    if (rider.horse) g.levelGroup?.remove(rider.horse.root);
    rider.tag?.remove();
    this.riders.delete(rider.id);
  }

  dispose() {
    for (const rider of [...this.riders.values()]) this.remove(rider);
    for (const h of this.standing.values()) this.game.levelGroup?.remove(h.mesh);
    this.standing.clear();
  }

  /** Riders close enough to call out for a duel. */
  near(x, z, range, room) {
    return [...this.riders.values()].filter((r) => r.alive && !r.stale && r.room === room && Math.hypot(r.x - x, r.z - z) < range);
  }
}

