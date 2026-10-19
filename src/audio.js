// Web Audio with every sound synthesized in code: no files to download.
// Graph: voice -> [distance muffle] -> pan -> sfx -> world filter -> master -> limiter.
// The world filter carries Dead Eye, pause and low-health muffling. Reverb has two
// rooms (open desert with mesa echoes, a wooden interior) that crossfade.
// Music (audio-music.js) and ambience (audio-ambience.js) read the game each frame.
import { T } from './tuning.js';
import { bankJobs, makeImpulse } from './audio-bank.js';
import { Music } from './audio-music.js';
import { Ambience } from './audio-ambience.js';

const SETTINGS_KEY = 'dustiron.audio.v1';
const COMBAT = new Set(['toCover', 'hold', 'peek', 'aim', 'flank', 'charge', 'open']);
const AWARE = new Set(['alert', 'search']);
const IMPACT = { wood: 'hitWood', metal: 'hitMetal', stone: 'hitStone', water: 'splash', flesh: 'hitFlesh' };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.jobs = [];
    this.recent = {};
    this.lastVariant = {};
    this.active = 0;
    this.listenerX = 0;
    this.listenerZ = 0;
    this.muted = false;
    this.deadEye = false;
    this.volumes = { master: 0.85, music: 0.65, sfx: 1, ambience: 0.8 };
    this.scene = 'title';
    this.tension = 0;
    this.heartT = 0;
    this.filterTarget = { world: 20000, music: 20000 };
    this.inside = null;
    this.loadSettings();
  }

  // ---------- settings ----------

  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!s) return;
      for (const k of Object.keys(this.volumes)) if (Number.isFinite(s[k])) this.volumes[k] = clamp01(s[k]);
      if (typeof s.muted === 'boolean') this.muted = s.muted;
    } catch { /* storage blocked: keep defaults */ }
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...this.volumes, muted: this.muted })); } catch { /* ignore */ }
  }

  setVolume(kind, v) {
    if (!(kind in this.volumes)) return;
    this.volumes[kind] = clamp01(v);
    this.applyVolumes();
    this.saveSettings();
  }

  setMuted(m) {
    this.muted = m;
    this.applyVolumes();
    this.saveSettings();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.volumes;
    this.master.gain.setTargetAtTime(this.muted ? 0 : v.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.ui.gain.setTargetAtTime(0.6 * v.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music, t, 0.05);
    this.amb.gain.setTargetAtTime(v.ambience, t, 0.05);
  }

  // ---------- setup ----------

  /** Must run from a user gesture (browsers block audio until then). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12;
    limiter.attack.value = 0.002; limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(limiter);
    this.world = ctx.createBiquadFilter(); this.world.type = 'lowpass'; this.world.frequency.value = 20000; this.world.Q.value = 0.7;
    this.world.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.world);
    this.ui = ctx.createGain(); this.ui.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.world);
    this.musicBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
    this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);

    // Two reverb rooms behind one send; only the gains change when you walk indoors.
    this.revIn = ctx.createGain();
    const room = (impulse, gain) => {
      const conv = ctx.createConvolver(); conv.buffer = impulse;
      const g = ctx.createGain(); g.gain.value = gain;
      this.revIn.connect(conv); conv.connect(g); g.connect(this.sfx);
      return g;
    };
    this.outdoorVerb = room(makeImpulse(ctx, 'desert'), 0.32);
    this.roomVerb = room(makeImpulse(ctx, 'room'), 0);
    this.applyVolumes();

    this.jobs = bankJobs(ctx);
    this.buildSome(60);
    this.music = new Music(this);
    this.ambience = new Ambience(this);
    const resume = () => { if (ctx.state === 'suspended') ctx.resume(); };
    addEventListener('pointerdown', resume);
    addEventListener('keydown', resume);
  }

  /** Synthesizes queued sounds until the time budget (ms) runs out. */
  buildSome(budget) {
    const end = performance.now() + budget;
    while (this.jobs.length && performance.now() < end) {
      const [name, make] = this.jobs.shift();
      const out = make();
      if (out.render) {
        // A set of variants: keep the first now, queue the others at the back.
        this.buffers[name] = [out.render(0)];
        for (let i = 1; i < out.count; i++) this.jobs.push([name, () => ({ extra: out.render(i) })]);
      } else if (out.extra) this.buffers[name].push(out.extra);
      else this.buffers[name] = out;
    }
  }

  // ---------- one-shots ----------

  setListener(x, z) { this.listenerX = x; this.listenerZ = z; }

  /** Play a sound positioned in the world: distance sets volume, pan, muffling and reverb. */
  at(name, x, z, opts = {}) {
    const A = T.audio;
    const dx = x - this.listenerX, dz = z - this.listenerZ;
    const d = Math.hypot(dx, dz);
    if (d > A.maxDistance) return;
    const cutoff = d > A.muffleFrom ? Math.max(700, 18000 / (1 + (d - A.muffleFrom) / A.muffleRate)) : 0;
    this.play(name, {
      ...opts,
      vol: (opts.vol ?? 1) / (1 + d / A.falloff),
      pan: Math.max(-0.85, Math.min(0.85, dx / 16)),
      reverb: (opts.reverb ?? 0.25) + Math.min(0.5, d / 60),
      cutoff,
    });
  }

  /** The impact sound for a surface, positioned in the world. */
  impact(surface, x, z, vol = 0.6) {
    const name = IMPACT[surface] ?? 'hitDirt';
    this.at(name, x, z, { vol });
    if ((surface === 'metal' || surface === 'stone') && Math.random() < 0.35) this.at('ricochet', x, z, { vol: vol * 0.8, vary: 0.2, delay: 0.02 });
  }

  play(name, { vol = 1, pan = 0, pitch = 1, vary = 0.06, reverb = 0.25, bus = 'sfx', delay = 0, cutoff = 0, gap = 0.03 } = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted || vol <= 0.002) return;
    const set = this.buffers[name];
    if (!set) return;
    const start = ctx.currentTime + delay;
    // The same sound twice in one instant only stacks louder: skip the copy.
    const prev = this.recent[name];
    if (prev !== undefined && Math.abs(start - prev) < gap) return;
    if (this.active >= T.audio.maxVoices && (vol < 0.5 || this.active >= T.audio.maxVoices + 8)) return;
    this.recent[name] = start;
    let buffer = set;
    if (Array.isArray(set)) {
      let i = Math.floor(Math.random() * set.length);
      if (set.length > 1 && i === this.lastVariant[name]) i = (i + 1) % set.length;
      this.lastVariant[name] = i;
      buffer = set[i];
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    let rate = pitch * (1 + (Math.random() * 2 - 1) * vary);
    if (this.deadEye && bus === 'sfx') rate *= T.audio.deadEyePitch;
    src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g);
    let tail = g, lp = null;
    if (cutoff > 0) {
      lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
      g.connect(lp); tail = lp;
    }
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    tail.connect(p);
    const out = bus === 'ui' ? this.ui : bus === 'music' ? this.musicBus : this.sfx;
    p.connect(out);
    let send = null;
    if (reverb > 0 && bus === 'sfx') { send = ctx.createGain(); send.gain.value = reverb; p.connect(send); send.connect(this.revIn); }
    this.active++;
    src.onended = () => {
      this.active--;
      src.disconnect(); g.disconnect(); p.disconnect();
      if (lp) lp.disconnect();
      if (send) send.disconnect();
    };
    src.start(start);
  }

  /** Musical cues: 'detect', 'victory', 'death', 'reward', 'quest'. */
  cue(name) { this.music?.cue(name); }

  setDeadEye(on) {
    if (!this.ctx || this.deadEye === on) { this.deadEye = on; return; }
    this.deadEye = on;
    if (!on) this.play('deadEyeOut', { vol: 0.7, reverb: 0.3 });
  }

  // ---------- per frame ----------

  /** Reads the game once per frame: scene, combat tension, rooms and filters. */
  update(game, dt) {
    if (!this.ctx) return;
    // Render the rest of the bank in small slices; never mid-fight, when a hitch would hurt.
    if (this.jobs.length && !(game.state === 'playing' && this.tension > 0.05)) this.buildSome(game.state === 'playing' ? 4 : 10);
    const A = T.audio, p = game.player, state = game.state;
    const inside = !!(p && game.frontier?.inside);
    const site = inside ? game.run?.interior?.id : null;

    // Tension: 0.5 when outlaws are looking for you, 1 when they are fighting.
    let target = 0;
    if (p && p.alive && !inside && state !== 'title') {
      for (const e of game.enemies) {
        if (!e.alive || !e.knows || target >= 1) continue;
        if (Math.abs(e.x - p.x) > A.combatRange || Math.abs(e.z - p.z) > A.combatRange) continue;
        target = Math.max(target, COMBAT.has(e.state) ? 1 : AWARE.has(e.state) ? 0.5 : 0.3);
      }
      if (p.sinceHit < 2.5) target = 1;
    }
    const before = this.tension;
    const rate = target > this.tension ? A.tensionRise : A.tensionFall;
    this.tension += (target - this.tension) * Math.min(1, dt / rate);
    if (target === 0 && this.tension < 0.02) this.tension = 0;
    if (before < 0.05 && target >= 0.5) this.cue('detect');

    this.scene = state === 'title' || !p ? 'title'
      : state === 'dead' || state === 'dying' ? 'dead'
        : site === 'saloon' ? 'saloon'
          : inside ? 'interior'
            : game.inTown() ? 'town' : 'frontier';

    if (inside !== this.inside) {
      this.inside = inside;
      const t = this.ctx.currentTime;
      this.outdoorVerb.gain.setTargetAtTime(inside ? 0.02 : 0.32, t, 0.15);
      this.roomVerb.gain.setTargetAtTime(inside ? 0.35 : 0, t, 0.15);
    }

    // A low-health heartbeat outside Dead Eye; Dead Eye keeps its own.
    const lowHp = p && p.alive && p.hp < A.lowHealth && state === 'playing';
    this.heartT -= dt;
    if ((lowHp || (this.deadEye && state === 'playing')) && this.heartT <= 0) {
      this.heartT = this.deadEye ? 0.75 : 0.55 + (p.hp / A.lowHealth) * 0.4;
      this.play('heartbeat', { vol: this.deadEye ? 0.8 : 0.55, reverb: 0, bus: 'ui' });
    }

    const paused = state === 'paused';
    this.setFilters(
      this.deadEye ? A.deadEyeCutoff : paused ? A.pauseCutoff : lowHp ? A.lowHealthCutoff : 20000,
      paused ? 1600 : this.deadEye ? 1400 : site && site !== 'saloon' ? 2600 : 20000,
    );
    this.music.update(game, dt);
    this.ambience.update(game, dt);
  }

  setFilters(world, music) {
    const t = this.ctx.currentTime, f = this.filterTarget;
    if (f.world !== world) { this.world.frequency.setTargetAtTime(world, t, world < f.world ? 0.06 : 0.25); f.world = world; }
    if (f.music !== music) { this.musicFilter.frequency.setTargetAtTime(music, t, 0.2); f.music = music; }
  }
}
