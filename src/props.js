// Props: cover objects, destructibles, explosive barrels and their debris.
import * as THREE from 'three';
import { GROUPS, PhysObj } from './physics.js';
import {
  MAT, PAL, Shape, meshOf, crateShape, barrelShape, fenceShape, wagonShape, tentShape, cactusShape,
  fragmentShape, FRAGMENT_HALF,
} from './models.js';
import { T } from './tuning.js';
import { rand } from './rng.js';

export const PROP_DEFS = {
  crate: { hp: 40, body: 'box', half: [0.55, 0.55, 0.55], density: 2.2, surface: 'wood', frag: 'plank', frags: 6, cover: true, sound: 'crateBreak' },
  barrel: { hp: 60, body: 'cyl', r: 0.42, halfH: 0.575, density: 2.6, surface: 'water', frag: 'stave', frags: 5, cover: true, sound: 'barrelBreak' },
  supply: { indestructible: true, body: 'fixedBox', half: [0.72, 0.45, 0.48], surface: 'wood', cover: false },
  tnt: { hp: 20, body: 'cyl', r: 0.42, halfH: 0.575, density: 1.6, surface: 'wood', frag: 'redStave', frags: 4, cover: true, explosive: true, sound: 'barrelBreak' },
  fence: { hp: 25, body: 'fixedBox', half: [1.1, 0.575, 0.08], surface: 'wood', frag: 'rail', frags: 3, cover: false, sound: 'crateBreak' },
  wagon: { indestructible: true, body: 'fixedBox', half: [1.12, 0.75, 1.65], surface: 'wood', cover: true },
  tent: { indestructible: true, body: 'fixedBox', half: [1.2, 1.2, 1.2], surface: 'cloth', cover: true },
  rock: { indestructible: true, body: 'fixedCyl', surface: 'stone', cover: true },
  cactus: { indestructible: true, body: 'fixedCyl', r: 0.26, halfH: 1.1, surface: 'plant', cover: false },
  campfire: { indestructible: true, body: 'fixedCyl', r: 0.75, halfH: 0.15, surface: 'stone', cover: false },
};

const geoCache = new Map();
export const sharedGeometries = () => new Set(geoCache.values());
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make().build());
  return geoCache.get(key);
}

const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Prop {
  /**
   * @param {object} game
   * @param {string} kind
   * @param {{x:number,z:number,ry?:number,r?:number,h?:number,seed?:number}} spec
   */
  constructor(game, kind, spec) {
    this.game = game;
    this.kind = kind;
    this.def = PROP_DEFS[kind];
    this.hp = this.def.hp ?? Infinity;
    this.alive = true;
    this.fixedX = spec.x;
    this.fixedZ = spec.z;
    this.ry = spec.ry ?? 0;
    this.fuse = -1;
    this.flash = 0;
    this.looted = Boolean(spec.looted);
    this.lootMoney = Number.isSafeInteger(spec.lootMoney) ? spec.lootMoney : 0;
    this.lootAmmo = Number.isSafeInteger(spec.lootAmmo) ? spec.lootAmmo : 0;
    this.build(spec);
  }

  build(spec) {
    const { game, def, kind } = this;
    const ph = game.physics;
    let geo;
    if (kind === 'crate') geo = cachedGeo('crate', () => crateShape(1.1));
    else if (kind === 'barrel') geo = cachedGeo('barrel', () => barrelShape(0.42, 1.15, PAL.wood, PAL.iron));
    else if (kind === 'tnt') geo = cachedGeo('tnt', () => barrelShape(0.42, 1.15, PAL.tnt, PAL.black, PAL.bone));
    else if (kind === 'fence') geo = cachedGeo('fence', () => fenceShape(2.2));
    else if (kind === 'wagon') geo = cachedGeo('wagon', () => wagonShape());
    else if (kind === 'tent') geo = cachedGeo('tent', () => tentShape());
    else if (kind === 'cactus') geo = cachedGeo('cactus' + (spec.seed % 6), () => cactusShape(1.9 + (spec.seed % 3) * 0.3, spec.seed));
    else if (kind === 'rock') {
      const s = new Shape();
      s.rock(spec.r, PAL.rock, 0, spec.r * 0.45, 0, 0.75, 0.3, spec.seed ?? 1);
      s.rock(spec.r * 0.55, PAL.rockLight, spec.r * 0.55, spec.r * 0.25, spec.r * 0.3, 0.7, 0.3, (spec.seed ?? 1) + 7);
      geo = s.build();
    } else if (kind === 'campfire') geo = cachedGeo('campfire', () => {
      const s = new Shape();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s.rock(0.17, PAL.rockDark, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, 0.6, 0.25, i);
      }
      s.box(1.0, 0.13, 0.13, PAL.woodDark, 0, 0.1, 0, 0, 0.5, 0);
      s.box(1.0, 0.13, 0.13, PAL.woodDark, 0, 0.16, 0, 0, -0.6, 0);
      return s;
    });

    this.material = def.indestructible ? MAT.solid : MAT.solid.clone();
    if (!def.indestructible) { this.material.emissive = new THREE.Color(0xfff2d0); this.material.emissiveIntensity = 0; }
    if (kind === 'supply') {
      this.mesh = new THREE.Group();
      const base = new Shape();
      base.box(1.36, 0.62, 0.86, PAL.wood, 0, 0.31, 0);
      base.box(1.42, 0.1, 0.92, PAL.woodDark, 0, 0.08, 0);
      for (const x of [-0.58, 0.58]) base.box(0.1, 0.68, 0.92, PAL.iron, x, 0.34, 0);
      base.box(0.28, 0.3, 0.06, PAL.brass, 0, 0.42, 0.47);
      base.box(0.1, 0.13, 0.07, PAL.black, 0, 0.42, 0.5);
      const baseMesh = new THREE.Mesh(cachedGeo('supply-base', () => base), this.material);
      this.mesh.add(baseMesh);

      const lid = new Shape();
      lid.box(1.42, 0.2, 0.84, PAL.woodLight, 0, 0, 0.4);
      lid.box(1.48, 0.08, 0.9, PAL.woodDark, 0, 0.06, 0.4);
      for (const x of [-0.6, 0.6]) lid.box(0.1, 0.25, 0.9, PAL.iron, x, 0, 0.4);
      this.lid = new THREE.Group();
      this.lid.position.set(0, 0.7, -0.42);
      this.lid.add(new THREE.Mesh(cachedGeo('supply-lid', () => lid), this.material));
      this.lid.rotation.x = this.looted ? -1.15 : 0;
      this.mesh.add(this.lid);
    } else this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.traverse((part) => {
      if (!part.isMesh) return;
      part.castShadow = true;
      part.receiveShadow = true;
    });
    game.levelGroup.add(this.mesh);

    if (def.body === 'box' || def.body === 'cyl') {
      const halfY = def.body === 'box' ? def.half[1] : def.halfH;
      const shape = def.body === 'box'
        ? { type: 'box', hx: def.half[0], hy: def.half[1], hz: def.half[2] }
        : { type: 'cylinder', halfH: def.halfH, r: def.r };
      const { body, collider } = ph.dynamic({
        x: spec.x, y: halfY + 0.002, z: spec.z, ry: this.ry, shape, density: def.density,
        friction: 0.8, restitution: 0.05, group: GROUPS.prop, owner: this, linDamp: 0.6, angDamp: 0.9,
      });
      this.body = body;
      this.collider = collider;
      this.physObj = ph.track(new PhysObj(body, this.mesh));
      this.physObj.render(1);
    } else {
      this.mesh.position.set(spec.x, 0, spec.z);
      this.mesh.rotation.y = this.ry;
      this.mesh.updateMatrix();
      this.mesh.matrixAutoUpdate = false;
      if (def.body === 'fixedBox') {
        this.halfExt = def.half;
        this.collider = ph.fixedBox(spec.x, def.half[1], spec.z, def.half[0], def.half[1], def.half[2], this.ry, GROUPS.prop, this);
      } else {
        const r = kind === 'rock' ? spec.r * 0.95 : def.r;
        const halfH = kind === 'rock' ? Math.max(0.6, spec.r * 0.75) : def.halfH;
        this.radius = r;
        this.collider = ph.fixedCylinder(spec.x, halfH, spec.z, halfH, r, GROUPS.prop, this);
        this.coverOk = kind !== 'rock' || spec.r >= 0.8;
      }
    }

    if (kind === 'campfire') {
      this.flame = meshOf(cachedGeo('flame', () => {
        const s = new Shape();
        s.cone(0.32, 0.8, 5, PAL.ember, 0, 0.45, 0);
        s.cone(0.2, 0.62, 5, PAL.fire, 0.08, 0.42, 0.05, 0, 0.6, 0);
        s.cone(0.14, 0.42, 4, 0xffe08a, -0.06, 0.35, -0.04);
        return s;
      }), MAT.glow, false, false);
      this.flame.position.set(spec.x, 0.1, spec.z);
      game.levelGroup.add(this.flame);
      this.fireLight = new THREE.PointLight(0xff8a3a, 6, 9, 1.4);
      this.fireLight.position.set(spec.x, 1.1, spec.z);
      game.levelGroup.add(this.fireLight);
      this.emberT = 0;
    }
  }

  get dynamic() { return !!this.body; }
  get x() { return this.body ? this.body.translation().x : this.fixedX; }
  get z() { return this.body ? this.body.translation().z : this.fixedZ; }

  yaw() {
    if (!this.body) return this.ry;
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _up.set(0, 0, 1).applyQuaternion(_q);
    return Math.atan2(_up.x, _up.z);
  }

  upright() {
    if (!this.body) return true;
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    return Math.abs(_up.y) > 0.7;
  }

  /** Footprint for navigation: a rotated box or a circle. */
  footprint() {
    const def = this.def;
    if (def.body === 'box') return { x: this.x, z: this.z, hx: def.half[0], hz: def.half[2], ry: this.yaw() };
    if (def.body === 'fixedBox') return { x: this.x, z: this.z, hx: def.half[0], hz: def.half[2], ry: this.ry };
    if (def.body === 'cyl') return { x: this.x, z: this.z, r: this.upright() ? def.r : def.halfH };
    return { x: this.x, z: this.z, r: this.radius };
  }

  isCover() {
    if (!this.alive || !this.def.cover) return false;
    if (this.kind === 'rock') return this.coverOk;
    return true;
  }

  setLooted(looted, instant = false) {
    this.looted = Boolean(looted);
    if (instant && this.lid) this.lid.rotation.x = this.looted ? -1.15 : 0;
  }

  coverPoints() {
    const fp = this.footprint();
    const pad = 0.75;
    const pts = [];
    if (fp.r !== undefined) {
      const n = fp.r > 1 ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: fp.x + Math.sin(a) * (fp.r + pad), z: fp.z + Math.cos(a) * (fp.r + pad) });
      }
      return pts;
    }
    const c = Math.cos(fp.ry), s = Math.sin(fp.ry);
    const local = [[fp.hx + pad, 0], [-fp.hx - pad, 0], [0, fp.hz + pad], [0, -fp.hz - pad]];
    if (fp.hz > 1.2) local.push([fp.hx + pad, fp.hz * 0.6], [fp.hx + pad, -fp.hz * 0.6], [-fp.hx - pad, fp.hz * 0.6], [-fp.hx - pad, -fp.hz * 0.6]);
    if (fp.hx > 1.2) local.push([fp.hx * 0.6, fp.hz + pad], [-fp.hx * 0.6, fp.hz + pad], [fp.hx * 0.6, -fp.hz - pad], [-fp.hx * 0.6, -fp.hz - pad]);
    for (const [lx, lz] of local) pts.push({ x: fp.x + lx * c + lz * s, z: fp.z - lx * s + lz * c });
    return pts;
  }

  /** Bullet or blast damage. Returns the surface name for effects. */
  damage(amount, hx, hy, hz, dirX, dirZ, impulse, source = 'player') {
    if (!this.alive) return this.def.surface;
    if (this.body && impulse > 0) {
      this.body.applyImpulseAtPoint({ x: dirX * impulse, y: impulse * 0.15, z: dirZ * impulse }, { x: hx, y: hy, z: hz }, true);
    }
    if (this.def.indestructible) return this.def.surface;
    this.hp -= amount;
    this.flash = 0.05;
    if (this.hp <= 0) {
      if (this.def.explosive && source === 'chain') { this.fuse = T.explosion.chainDelay; this.hp = 1; }
      else this.break(dirX, dirZ);
    } else if (this.def.explosive) {
      this.game.audio.at('fuse', this.x, this.z, { vol: 0.5 });
    }
    return this.def.surface;
  }

  break(dirX = 0, dirZ = 0) {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    const x = this.x, z = this.z;
    const y = this.body ? this.body.translation().y : 0.6;
    const def = this.def;
    for (let i = 0; i < def.frags; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.5, 4.5);
      g.debris.spawn(def.frag,
        x + Math.sin(a) * 0.3, y + rand(-0.2, 0.4), z + Math.cos(a) * 0.3,
        Math.sin(a) * sp + dirX * 3, rand(2, 5), Math.cos(a) * sp + dirZ * 3);
    }
    g.fx.emit(def.surface === 'water' ? 'splash' : 'wood', x, y, z, 14, 0, 0, Math.PI, 1.2);
    g.fx.emit('dust', x, 0.3, z, 8, 0, 0, Math.PI, 1.3);
    g.audio.at(def.sound, x, z, { vol: 0.9 });
    g.addTrauma(0.12);
    this.remove();
    g.navDirty = true;
    if (def.explosive) g.explode(x, z);
  }

  remove() {
    const g = this.game;
    if (this.physObj) g.physics.untrack(this.physObj);
    if (this.body) g.physics.removeBody(this.body);
    else if (this.collider) g.physics.removeCollider(this.collider);
    this.body = null;
    this.collider = null;
    g.levelGroup.remove(this.mesh);
    if (this.material !== MAT.solid) this.material.dispose();
    if (this.kind === 'rock') this.mesh.geometry.dispose();
  }

  tick(dt) {
    if (this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) { this.fuse = -1; this.break(); }
    }
    if (this.body && this.alive) {
      const t = this.body.translation();
      // Props knocked out of the arena fall away; remove them.
      if (t.y < -5) { this.alive = false; this.remove(); this.game.navDirty = true; }
    }
  }

  render(alpha, realDt, time) {
    if (!this.alive) return;
    if (this.physObj) this.physObj.render(alpha);
    if (this.flash > 0) {
      this.flash -= realDt;
      this.material.emissiveIntensity = this.flash > 0 ? 0.55 : 0;
    }
    if (this.lid) {
      const target = this.looted ? -1.15 : 0;
      this.lid.rotation.x += (target - this.lid.rotation.x) * Math.min(1, realDt * 9);
    }
    if (this.flame) {
      const f = 1 + Math.sin(time * 17) * 0.08 + Math.sin(time * 29) * 0.06;
      this.flame.scale.set(f, 1 + Math.sin(time * 13) * 0.14, f);
      this.flame.rotation.y = time * 0.7;
      this.fireLight.intensity = 6 + Math.sin(time * 19) * 0.9 + Math.sin(time * 7) * 0.6;
      this.emberT -= realDt;
      if (this.emberT <= 0) { this.emberT = rand(0.08, 0.2); this.game.fx.emit('ember', this.x, 0.5, this.z, 1); }
    }
  }
}

/** Short-lived physical fragments from broken props. */
export class Debris {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.max = 70;
  }

  spawn(type, x, y, z, vx, vy, vz) {
    const g = this.game;
    const half = FRAGMENT_HALF[type] ?? FRAGMENT_HALF.chunk;
    const geo = cachedGeo('frag-' + type, () => fragmentShape(type));
    const mesh = new THREE.Mesh(geo, MAT.solid);
    mesh.castShadow = true;
    g.levelGroup.add(mesh);
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
    const { body } = g.physics.dynamic({
      x, y: Math.max(y, 0.3), z, rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      shape: { type: 'box', hx: half[0], hy: half[1], hz: half[2] }, density: 0.7,
      friction: 0.9, restitution: 0.2, group: GROUPS.debris, linDamp: 0.2, angDamp: 0.4,
    });
    body.setLinvel({ x: vx, y: vy, z: vz }, true);
    body.setAngvel({ x: rand(-9, 9), y: rand(-9, 9), z: rand(-9, 9) }, true);
    const obj = g.physics.track(new PhysObj(body, mesh));
    this.items.push({ obj, body, mesh, t: 0, life: rand(5, 7) });
    while (this.items.length > this.max) this.kill(this.items[0]);
  }

  kill(item) {
    const g = this.game;
    g.physics.untrack(item.obj);
    g.physics.removeBody(item.body);
    g.levelGroup.remove(item.mesh);
    this.items.splice(this.items.indexOf(item), 1);
  }

  tick(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) this.kill(it);
    }
  }

  render(alpha) {
    for (const it of this.items) {
      it.obj.render(alpha);
      const left = it.life - it.t;
      const s = left < 0.6 ? Math.max(0.01, left / 0.6) : 1;
      it.mesh.scale.setScalar(s);
    }
  }
}
