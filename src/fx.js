// Pooled visual effects: particles, tracers and light flashes. Nothing here
// allocates per frame, so effects never cause garbage-collection hitches.
import * as THREE from 'three';
import { PAL } from './models.js';
import { rand } from './rng.js';

const MAX_SOLID = 700;
const MAX_GLOW = 320;
const MAX_TRACERS = 40;

const KINDS = {
  dust: { colors: [PAL.sandLight, PAL.sand, PAL.sandDark], size: [0.12, 0.26], speed: [1, 3], up: [0.8, 2.4], g: -5, drag: 2.2, life: [0.45, 0.9], bounce: 0, glow: false, grow: 0.6 },
  wood: { colors: [PAL.plank, PAL.woodDark, PAL.woodLight], size: [0.06, 0.14], speed: [2.5, 6], up: [1.5, 4], g: -18, drag: 0.6, life: [0.9, 1.5], bounce: 0.3, glow: false },
  blood: { colors: [0x8e1f1a, 0x6e1612, 0xa52a20], size: [0.06, 0.12], speed: [1.5, 4.5], up: [0.5, 2.5], g: -18, drag: 0.8, life: [0.7, 1.1], bounce: 0, stick: true, glow: false },
  sparks: { colors: [0xffd27a, 0xffe7b0, 0xffa94a], size: [0.035, 0.07], speed: [3, 8], up: [0.5, 3], g: -12, drag: 1, life: [0.15, 0.3], bounce: 0.4, glow: true },
  smoke: { colors: [PAL.smoke, 0x857a70, 0x5a514a], size: [0.35, 0.7], speed: [0.3, 1.4], up: [0.6, 1.6], g: 0.6, drag: 1.4, life: [1.2, 2.4], bounce: 0, glow: false, grow: 0.9 },
  fire: { colors: [0xffa040, 0xff6a24, 0xffe08a], size: [0.3, 0.65], speed: [1, 5], up: [1.5, 4.5], g: 1.5, drag: 2.5, life: [0.3, 0.65], bounce: 0, glow: true },
  muzzle: { colors: [0xffe2a0, 0xffc060], size: [0.12, 0.24], speed: [2, 5], up: [0, 0.4], g: 0, drag: 8, life: [0.04, 0.08], bounce: 0, glow: true },
  casing: { colors: [PAL.brass], size: [0.05, 0.06], speed: [1.2, 2.4], up: [2, 3], g: -18, drag: 0.3, life: [1.2, 1.8], bounce: 0.35, glow: false },
  splash: { colors: [0x8fb4c2, 0xb7d3dc, 0x6f97a6], size: [0.06, 0.12], speed: [1.5, 4], up: [2, 4.5], g: -16, drag: 0.5, life: [0.5, 0.9], bounce: 0, glow: false },
  ember: { colors: [0xffb24a, 0xff7a2a], size: [0.04, 0.08], speed: [0.1, 0.5], up: [0.8, 1.8], g: 0.4, drag: 0.6, life: [0.6, 1.2], bounce: 0, glow: true },
};

class Pool {
  constructor(scene, max, material) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, vr: 0, size: 0, t: 0, life: 1, k: null, color: new THREE.Color() });
    }
    this.cursor = 0;
  }

  take() {
    for (let n = 0; n < this.max; n++) {
      const i = (this.cursor + n) % this.max;
      if (!this.items[i].alive) { this.cursor = i + 1; return this.items[i]; }
    }
    // Pool full: recycle the next slot.
    const p = this.items[this.cursor % this.max];
    this.cursor++;
    return p;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class FX {
  constructor(scene, flashLight) {
    this.scene = scene;
    this.solid = new Pool(scene, MAX_SOLID, new THREE.MeshLambertMaterial({ flatShading: true }));
    this.glow = new Pool(scene, MAX_GLOW, new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.flash = flashLight;
    this.flashT = 0;
    this.flashMax = 0;

    this.tracers = [];
    const tgeo = new THREE.BoxGeometry(1, 1, 1);
    tgeo.translate(0, 0, 0.5);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(tgeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, t: 0, life: 0.06 });
    }
    this.tracerCursor = 0;
  }

  emit(kind, x, y, z, count, dirX = 0, dirZ = 0, cone = Math.PI, speedMul = 1) {
    const k = KINDS[kind];
    const pool = k.glow ? this.glow : this.solid;
    const baseA = dirX || dirZ ? Math.atan2(dirX, dirZ) : 0;
    for (let i = 0; i < count; i++) {
      const p = pool.take();
      const a = dirX || dirZ ? baseA + rand(-cone, cone) : rand(0, Math.PI * 2);
      const sp = rand(k.speed[0], k.speed[1]) * speedMul;
      p.alive = true;
      p.k = k;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.vy = rand(k.up[0], k.up[1]) * speedMul;
      p.rx = rand(0, 6); p.ry = rand(0, 6); p.rz = rand(0, 6); p.vr = rand(-12, 12);
      p.size = rand(k.size[0], k.size[1]);
      p.t = 0; p.life = rand(k.life[0], k.life[1]);
      p.color.set(k.colors[(Math.random() * k.colors.length) | 0]);
    }
  }

  impact(surface, x, y, z, nx, nz, dirX, dirZ) {
    if (surface === 'wood') { this.emit('wood', x, y, z, 6, nx, nz, 1.0); this.emit('dust', x, y, z, 2, nx, nz, 1.2); }
    else if (surface === 'flesh') { this.emit('blood', x, y, z, 9, dirX, dirZ, 0.6); }
    else if (surface === 'water') { this.emit('splash', x, y, z, 10, nx, nz, 1.1); this.emit('wood', x, y, z, 3, nx, nz, 1); }
    else if (surface === 'metal') { this.emit('sparks', x, y, z, 8, nx, nz, 1.1); }
    else { this.emit('dust', x, y, z, 5, nx, nz, 1.1); this.emit('sparks', x, y, z, 2, nx, nz, 0.9); }
  }

  muzzle(x, y, z, dirX, dirZ, big = false) {
    this.emit('muzzle', x, y, z, big ? 7 : 4, dirX, dirZ, 0.25);
    this.emit('smoke', x, y, z, big ? 2 : 1, dirX, dirZ, 0.4, 0.6);
    this.light(x, y + 0.2, z, big ? 26 : 16, 9);
  }

  casing(x, y, z, dirX, dirZ) {
    // Eject to the right of the firing direction.
    this.emit('casing', x, y, z, 1, dirZ, -dirX, 0.5);
  }

  explosion(x, z) {
    this.emit('fire', x, 0.6, z, 34, 0, 0, Math.PI, 1.4);
    this.emit('smoke', x, 0.8, z, 16, 0, 0, Math.PI, 2.2);
    this.emit('sparks', x, 0.7, z, 22, 0, 0, Math.PI, 1.6);
    this.emit('dust', x, 0.2, z, 18, 0, 0, Math.PI, 2.4);
    this.light(x, 1.5, z, 90, 16);
  }

  tracer(x0, y0, z0, x1, y1, z1, color = 0xffe7b0, thickness = 0.045, life = 0.06) {
    const tr = this.tracers[this.tracerCursor++ % MAX_TRACERS];
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    tr.mesh.position.set(x0, y0, z0);
    tr.mesh.lookAt(x1, y1, z1);
    tr.mesh.scale.set(thickness, thickness, Math.max(0.01, len));
    tr.mesh.material.color.set(color);
    tr.mesh.material.opacity = 1;
    tr.mesh.visible = true;
    tr.t = 0;
    tr.life = life;
  }

  light(x, y, z, intensity, distance) {
    if (intensity < this.flash.intensity) return;
    this.flash.position.set(x, y, z);
    this.flash.distance = distance;
    this.flash.intensity = intensity;
    this.flashMax = intensity;
  }

  clear() {
    for (const pool of [this.solid, this.glow]) { for (const p of pool.items) p.alive = false; pool.mesh.count = 0; }
    for (const tr of this.tracers) tr.mesh.visible = false;
    this.flash.intensity = 0;
  }

  update(dt) {
    for (const pool of [this.solid, this.glow]) {
      let n = 0;
      for (const p of pool.items) {
        if (!p.alive) continue;
        p.t += dt;
        if (p.t >= p.life) { p.alive = false; continue; }
        const k = p.k;
        const drag = Math.exp(-k.drag * dt);
        p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + k.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.vr * dt; p.rz += p.vr * 0.7 * dt;
        const ground = p.size * 0.5;
        if (p.y < ground) {
          p.y = ground;
          if (k.stick) { p.vx = p.vy = p.vz = 0; p.vr = 0; }
          else if (k.bounce > 0 && p.vy < -1) { p.vy = -p.vy * k.bounce; p.vx *= 0.6; p.vz *= 0.6; p.vr *= 0.5; }
          else { p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; p.vr *= 0.8; }
        }
        const f = p.t / p.life;
        let s = p.size;
        if (k.grow) s *= 1 + f * k.grow * 2;
        if (f > 0.65) s *= 1 - (f - 0.65) / 0.35;
        _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)), _s.set(s, s, s));
        pool.mesh.setMatrixAt(n, _m);
        pool.mesh.setColorAt(n, p.color);
        n++;
      }
      pool.mesh.count = n;
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }

    for (const tr of this.tracers) {
      if (!tr.mesh.visible) continue;
      tr.t += dt;
      const f = tr.t / tr.life;
      if (f >= 1) { tr.mesh.visible = false; continue; }
      tr.mesh.material.opacity = 1 - f;
    }

    if (this.flash.intensity > 0) {
      this.flash.intensity *= Math.exp(-dt * 22);
      if (this.flash.intensity < 0.3) this.flash.intensity = 0;
    }
  }
}
