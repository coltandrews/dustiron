// Time of day and weather. A day lasts twenty minutes of world time: warm
// mornings, white noon, a red dusk and a blue night lit by the rider's lantern.
// Rain sweeps through now and then, mostly over the pine country. Online, the
// server's clock drives it, so every rider sees the same sky.
import * as THREE from 'three';
import { SKY } from './render.js';
import { forestAt } from './terrain.js';

export const DAY_LENGTH = 1200;
const DROPS = 900;
const KEYS = [
  // phase, sky, sun color, sun, hemi sky, hemi ground, hemi, rim
  [0.0, 0x141a2c, 0x8fa4d8, 0.35, 0x5a6c9c, 0x1c1820, 0.42, 0.15],
  [0.2, 0x1c2238, 0x9aa8d8, 0.3, 0x5a6c9c, 0x1c1820, 0.42, 0.15],
  [0.27, 0xd88a5a, 0xffb07a, 1.4, 0xffc89a, 0x5a3a2f, 0.75, 0.6],
  [0.36, SKY, 0xffefd1, 2.5, 0xffdfad, 0x65412f, 1.0, 0.65],
  [0.5, 0xf0c896, 0xfff4e0, 2.9, 0xffe6bd, 0x6a4632, 1.1, 0.6],
  [0.64, SKY, 0xffe6c0, 2.5, 0xffdfad, 0x65412f, 1.0, 0.65],
  [0.73, 0xc8603e, 0xff8a52, 1.3, 0xffa070, 0x4a2a24, 0.7, 0.8],
  [0.8, 0x26243a, 0x9aa8d8, 0.35, 0x5a6c9c, 0x1c1820, 0.45, 0.2],
  [1.0, 0x141a2c, 0x8fa4d8, 0.35, 0x5a6c9c, 0x1c1820, 0.42, 0.15],
];
const _a = new THREE.Color(), _b = new THREE.Color();

function mix(i, t, out, j) {
  _a.setHex(KEYS[i][j]); _b.setHex(KEYS[i + 1][j]);
  return out.copy(_a).lerp(_b, t);
}

export class Sky {
  constructor(render) {
    this.render = render;
    this.lantern = new THREE.PointLight(0xffb45e, 0, 18, 1.4);
    this.lantern.position.y = 2.4;
    render.scene.add(this.lantern);
    this.rain = 0;
    const geo = new THREE.BufferGeometry();
    this.drops = new Float32Array(DROPS * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.drops, 3));
    this.rainMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbcc8d8, transparent: true, opacity: 0.45, depthWrite: false }));
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    render.scene.add(this.rainMesh);
    for (let i = 0; i < DROPS; i++) this.seedDrop(i, 0, 0, Math.random() * 24);
    this.label = '';
  }

  seedDrop(i, cx, cz, y = 22 + Math.random() * 4) {
    const x = cx + (Math.random() - 0.5) * 70, z = cz + (Math.random() - 0.5) * 70, o = i * 6;
    this.drops[o] = x; this.drops[o + 1] = y; this.drops[o + 2] = z;
    this.drops[o + 3] = x + 0.12; this.drops[o + 4] = y + 0.9; this.drops[o + 5] = z + 0.05;
  }

  /** Back to plain daylight, for the title screen. */
  reset() {
    const r = this.render, k = KEYS[4];
    r.scene.background.setHex(SKY); r.scene.fog.color.setHex(SKY); r.scene.fog.near = 48; r.scene.fog.far = 105;
    r.sun.color.setHex(0xffefd1); r.sun.intensity = 2.7; r.hemi.color.setHex(k[4]); r.hemi.groundColor.setHex(k[5]); r.hemi.intensity = 1.05;
    r.sunOffset.set(-14, 26, 9);
    this.lantern.intensity = 0; this.rainMesh.visible = false; this.rain = 0;
  }

  /** Outlaws see less far at night. */
  static sightScale(time) {
    const ph = Sky.phase(time);
    return ph < 0.22 || ph > 0.8 ? 0.7 : ph < 0.27 || ph > 0.73 ? 0.85 : 1;
  }

  /** Where in the day a world time falls: 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk. */
  static phase(time) { return ((time / DAY_LENGTH) + 0.3) % 1; }

  /** How hard it rains at a time and place, 0 to 1. Same answer on every machine. */
  static rainAt(time, x, z) {
    const wave = Math.sin(time / 310) + Math.sin(time / 173 + 1.7) * 0.6 + Math.sin(time / 97) * 0.25;
    const local = 0.3 + forestAt(x, z) * 0.7;
    return Math.max(0, Math.min(1, (wave - 0.75) * 1.8)) * local;
  }

  update(game, dt) {
    const r = this.render, scene = r.scene;
    const time = game.worldClock ?? game.time;
    const focus = game.rig.target;
    if (r.interior) { this.lantern.intensity = 0; this.rainMesh.visible = false; return; }
    const phase = Sky.phase(time);
    let i = 0;
    while (i < KEYS.length - 2 && phase > KEYS[i + 1][0]) i++;
    const t = (phase - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
    const lerp = (j) => KEYS[i][j] + (KEYS[i + 1][j] - KEYS[i][j]) * t;
    const target = Sky.rainAt(time, focus.x, focus.z);
    this.rain += (target - this.rain) * Math.min(1, dt * 0.5);
    const wet = this.rain;
    mix(i, t, scene.background, 1).lerp(_b.setHex(0x5a6470), wet * 0.6);
    scene.fog.color.copy(scene.background);
    scene.fog.near = 48 - wet * 22; scene.fog.far = 105 - wet * 35;
    mix(i, t, r.sun.color, 2);
    r.sun.intensity = lerp(3) * (1 - wet * 0.55);
    mix(i, t, r.hemi.color, 4);
    mix(i, t, r.hemi.groundColor, 5);
    r.hemi.intensity = lerp(6) * (1 - wet * 0.2);
    r.rim.intensity = lerp(7);
    // The sun swings across the sky; at night the "sun" is the moon from the other side.
    const day = phase > 0.25 && phase < 0.75, arc = day ? (phase - 0.25) / 0.5 : ((phase + 0.25) % 1) / 0.5;
    r.sunOffset.set(-26 + arc * 52, 26, 9 - Math.sin(arc * Math.PI) * 6);
    // The rider's lantern from dusk to dawn.
    const dark = Math.max(0, 1 - r.sun.intensity / 1.2);
    const p = game.player;
    this.lantern.intensity = p?.alive ? dark * 9 : 0;
    if (p) this.lantern.position.set(p.model.root.position.x, 2.4, p.model.root.position.z);
    this.night = dark > 0.6;
    this.label = phase < 0.22 || phase > 0.8 ? 'Night' : phase < 0.33 ? 'Dawn' : phase < 0.45 ? 'Morning' : phase < 0.58 ? 'Noon' : phase < 0.7 ? 'Afternoon' : 'Dusk';
    this.updateRain(focus.x, focus.z, dt);
  }

  updateRain(cx, cz, dt) {
    const on = this.rain > 0.03;
    this.rainMesh.visible = on;
    if (!on) return;
    const count = Math.floor(DROPS * this.rain), d = this.drops;
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      if (i >= count) { d[o + 1] = d[o + 4] = -50; continue; }
      d[o + 1] -= 28 * dt; d[o + 4] -= 28 * dt; d[o] += 1.5 * dt; d[o + 3] += 1.5 * dt;
      if (d[o + 1] < 0 || Math.abs(d[o] - cx) > 40 || Math.abs(d[o + 2] - cz) > 40) this.seedDrop(i, cx, cz);
    }
    this.rainMesh.geometry.attributes.position.needsUpdate = true;
    this.rainMesh.material.opacity = 0.25 + this.rain * 0.3;
  }
}
