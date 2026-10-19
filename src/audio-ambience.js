// Ambience and foley that follow the world rather than single events:
// wind gusts, the town murmur, saloon chatter (muffled from the street),
// room tone, campfire crackle, horse hooves and the odd distant hawk or dog.
import { STABLE_SPOT } from './horse.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Loop levels per scene (before the ambience slider).
const BEDS = {
  frontier: { wind: 0.17, townBed: 0, roomTone: 0 },
  town: { wind: 0.1, townBed: 0.05, roomTone: 0 },
  interior: { wind: 0.025, townBed: 0.012, roomTone: 0.11 },
  saloon: { wind: 0.02, townBed: 0, roomTone: 0.08 },
  title: { wind: 0.14, townBed: 0, roomTone: 0 },
  dead: { wind: 0.09, townBed: 0, roomTone: 0 },
};

// Random one-shots per scene: [sound, weight, volume].
const EVENTS = {
  frontier: { every: [12, 28], list: [['hawk', 3, 0.35], ['creak', 1, 0.15]] },
  town: { every: [4, 10], list: [['anvil', 2, 0.25], ['dog', 2, 0.3], ['whinny', 1, 0.25], ['creak', 2, 0.25], ['snort', 1, 0.3]] },
  saloon: { every: [2, 5], list: [['glass', 4, 0.35], ['creak', 1, 0.25], ['card', 1, 0.3], ['chips', 1, 0.25]] },
  interior: { every: [7, 15], list: [['creak', 1, 0.25]] },
};

export class Ambience {
  constructor(audio) {
    this.audio = audio;
    this.loops = {};
    this.eventT = 3;
    this.gustT = 0;
    this.gust = 1;
    this.strideT = 0;
    this.calledT = 0;
    this.snortT = rand(6, 12);
    this.saloon = null;
  }

  /** Starts a looping bed the first time it is needed (its buffer may still be rendering). */
  ensure(name) {
    const have = this.loops[name];
    if (have) return have;
    const a = this.audio, ctx = a.ctx, buf = a.buffers[name];
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000;
    const p = ctx.createStereoPanner();
    src.connect(g); g.connect(f); f.connect(p); p.connect(a.amb);
    src.start(ctx.currentTime, Math.random() * buf.duration);
    return (this.loops[name] = { g, f, p, level: 0, pan: 0, cut: 20000 });
  }

  set(name, level, tc = 0.8, pan = 0, cut = 20000) {
    if (level < 0.001 && !this.loops[name]) return;
    const l = this.ensure(name);
    if (!l) return;
    const t = this.audio.ctx.currentTime;
    if (Math.abs(l.level - level) > 0.003) { l.g.gain.setTargetAtTime(level, t, tc); l.level = level; }
    if (Math.abs(l.pan - pan) > 0.05) { l.p.pan.setTargetAtTime(pan, t, 0.1); l.pan = pan; }
    if (Math.abs(l.cut - cut) > 50) { l.f.frequency.setTargetAtTime(cut, t, 0.2); l.cut = cut; }
  }

  update(game, dt) {
    const a = this.audio, scene = a.scene, p = game.player;
    const bed = BEDS[scene] ?? BEDS.frontier;

    // Wind breathes: a new gust target every few seconds.
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustT = rand(1.5, 4); this.gust = rand(0.6, 1.35); }
    this.set('wind', bed.wind * this.gust, 1.2);

    // Town murmur fades in as you approach Mercy Crossing.
    let town = bed.townBed;
    if (p && scene === 'frontier') {
      const r = game.run?.world?.town?.radius ?? 40;
      town = 0.05 * clamp01(1 - (Math.hypot(p.x, p.z) - r) / 30);
    }
    this.set('townBed', town);
    this.set('roomTone', bed.roomTone, 0.3);

    // Saloon chatter: full inside, muffled through the walls on the street.
    let chatter = 0, cut = 20000, pan = 0;
    if (scene === 'saloon') chatter = 0.09;
    else if (scene === 'town' && p) {
      this.saloon ??= game.frontier?.sites?.find((s) => s.id === 'saloon') ?? null;
      if (this.saloon) {
        const dx = this.saloon.x - p.x, d = Math.hypot(dx, this.saloon.z - p.z);
        chatter = 0.07 * clamp01(1 - d / 16); cut = 700; pan = Math.max(-0.7, Math.min(0.7, dx / 12));
      }
    }
    this.set('chatter', chatter, 0.4, pan, cut);

    this.campfire(game, scene);
    this.horse(game, dt);
    this.events(game, dt, scene);
  }

  campfire(game, scene) {
    let best = 0, pan = 0;
    const lx = this.audio.listenerX, lz = this.audio.listenerZ;
    if (scene === 'frontier' && game.props) {
      for (const pr of game.props) {
        if (!pr.flame || !pr.alive) continue;
        const dx = pr.x - lx, dz = pr.z - lz;
        if (Math.abs(dx) > 28 || Math.abs(dz) > 28) continue;
        const v = 0.16 / (1 + Math.hypot(dx, dz) / 4);
        if (v > best) { best = v; pan = Math.max(-0.8, Math.min(0.8, dx / 14)); }
      }
    }
    this.set('fire', best, 0.3, pan);
  }

  horse(game, dt) {
    const h = game.horse, p = game.player, a = this.audio;
    if (!h || !p || game.state !== 'playing' || game.frontier?.inside) return;
    if (h.mounted) {
      const speed = p.speedNow ?? 0;
      if (speed > 1) {
        this.strideT -= dt * speed;
        if (this.strideT <= 0) {
          if (h.sprinting) {
            // Gallop: a rolling three-beat, then a gap.
            this.strideT = 4.6;
            for (let i = 0; i < 3; i++) a.play('hoof', { vol: 0.42 - i * 0.05, delay: i * 0.065, reverb: 0.15, vary: 0.1 });
          } else {
            // Trot: an even two-beat.
            this.strideT = 1.7;
            a.play('hoof', { vol: 0.32, reverb: 0.12, vary: 0.1 });
          }
        }
      }
      this.snortT -= dt;
      if (this.snortT <= 0) { this.snortT = rand(7, 16); a.play('snort', { vol: 0.35, vary: 0.1 }); }
    } else if (h.called) {
      this.calledT -= dt;
      if (this.calledT <= 0) { this.calledT = 0.36; a.at('hoof', h.x, h.z, { vol: 0.5, vary: 0.1 }); a.at('hoof', h.x, h.z, { vol: 0.35, delay: 0.07, vary: 0.1 }); }
    }
  }

  events(game, dt, scene) {
    const spec = EVENTS[scene];
    this.eventT -= dt;
    if (!spec || game.state === 'paused' || this.eventT > 0) return;
    this.eventT = rand(spec.every[0], spec.every[1]);
    let total = 0;
    for (const e of spec.list) total += e[1];
    let pick = Math.random() * total, chosen = spec.list[0];
    for (const e of spec.list) { pick -= e[1]; if (pick <= 0) { chosen = e; break; } }
    const [name, , vol] = chosen;
    const a = this.audio;
    if (scene === 'saloon' || scene === 'interior') { a.play(name, { vol, pan: rand(-0.6, 0.6), vary: 0.12 }); return; }
    // Outdoors the sound comes from somewhere around you; the stable horse stays at the stable.
    const ang = rand(0, Math.PI * 2), dist = scene === 'town' ? rand(8, 22) : rand(30, 55);
    let x = a.listenerX + Math.sin(ang) * dist, z = a.listenerZ + Math.cos(ang) * dist;
    if (name === 'whinny' || name === 'snort') { x = STABLE_SPOT.x - 3; z = STABLE_SPOT.z; }
    a.at(name, x, z, { vol: vol * 1.8, vary: 0.1, reverb: 0.4 });
  }
}
