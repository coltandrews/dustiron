// Web Audio with every sound synthesized in code: no files to download.
// Buses: sfx -> low-pass (swept by Dead Eye) -> master; reverb send; ui; ambience.

const TAU = Math.PI * 2;

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.active = 0;
    this.maxVoices = 28;
    this.listenerX = 0;
    this.listenerZ = 0;
    this.muted = false;
  }

  /** Must run from a user gesture (browsers block audio until then). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.85; this.master.connect(comp);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.7;
    this.lp.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.lp);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.makeImpulse(1.7);
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.3;
    this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.lp);
    this.ui = ctx.createGain(); this.ui.gain.value = 0.6; this.ui.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.0; this.amb.connect(this.master);
    this.build();
    this.startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  setDeadEye(on) {
    if (!this.ctx) return;
    this.lp.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, on ? 0.06 : 0.2);
  }

  setAmbience(level) {
    if (this.amb) this.amb.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8);
  }

  setListener(x, z) { this.listenerX = x; this.listenerZ = z; }

  /** Play a sound positioned in the world (pan and distance from the listener). */
  at(name, x, z, opts = {}) {
    const dx = x - this.listenerX, dz = z - this.listenerZ;
    const d = Math.hypot(dx, dz);
    const vol = (opts.vol ?? 1) / (1 + d / 14);
    this.play(name, { ...opts, vol, pan: Math.max(-0.85, Math.min(0.85, dx / 16)) });
  }

  play(name, { vol = 1, pan = 0, pitch = 1, vary = 0.06, reverb = 0.25, bus = 'sfx', delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buffer = this.buffers[name];
    if (!buffer) return;
    if (this.active >= this.maxVoices && vol < 0.5) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * vary);
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g); g.connect(p);
    p.connect(bus === 'ui' ? this.ui : this.sfx);
    if (reverb > 0 && bus !== 'ui') { const s = ctx.createGain(); s.gain.value = reverb; p.connect(s); s.connect(this.reverb); }
    this.active++;
    src.onended = () => { this.active--; src.disconnect(); g.disconnect(); p.disconnect(); };
    src.start(ctx.currentTime + delay);
  }

  // ---------- synthesis ----------

  makeBuffer(dur, fn, channels = 1) {
    const sr = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(dur * sr));
    const buf = this.ctx.createBuffer(channels, n, sr);
    for (let c = 0; c < channels; c++) {
      const d = buf.getChannelData(c);
      const state = { lp: 0, lp2: 0, hp: 0 };
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const v = fn(i / sr, state, sr);
        d[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      if (peak > 0.98) for (let i = 0; i < n; i++) d[i] *= 0.95 / peak;
    }
    return buf;
  }

  makeImpulse(dur) {
    return this.makeBuffer(dur, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * (t < 0.01 ? t / 0.01 : 1), 2);
  }

  build() {
    const N = () => Math.random() * 2 - 1;
    const lp = (s, x, fc, sr, key = 'lp') => { const a = 1 - Math.exp((-TAU * fc) / sr); s[key] += a * (x - s[key]); return s[key]; };
    const sweep = (t, a, b, k) => b + (a - b) * Math.exp(-t * k);

    const shot = (bodyStart, bodyEnd, bodyDecay, thumpHz, thumpAmt, crackAmt, dur) => this.makeBuffer(dur, (t, s, sr) => {
      const n = N();
      const low = lp(s, n, 7000, sr, 'lp2');
      const crack = (n - low) * Math.exp(-t * 110) * crackAmt + n * Math.exp(-t * 160) * 0.5 * crackAmt;
      const body = lp(s, n, sweep(t, bodyStart, bodyEnd, 10), sr) * Math.exp(-t * bodyDecay) * 1.6;
      const thump = Math.sin(TAU * (thumpHz - thumpHz * 0.45 * Math.min(1, t * 6)) * t) * Math.exp(-t * 18) * thumpAmt;
      return crack + body + thump;
    });

    const B = this.buffers;
    B.revolver = shot(3200, 260, 8, 85, 0.9, 1, 0.8);
    B.enemyShot = shot(2600, 220, 9, 75, 0.7, 0.8, 0.7);
    B.shotgun = shot(2200, 160, 5.5, 60, 1.2, 1, 1.1);
    B.rifle = shot(4200, 300, 6, 95, 0.8, 1.3, 1.0);

    const click = (t, at, hz, decay) => (t >= at ? Math.sin(TAU * hz * (t - at)) * Math.exp(-(t - at) * decay) : 0);
    B.dryClick = this.makeBuffer(0.12, (t) => click(t, 0, 2600, 260) * 0.7 + click(t, 0.035, 1900, 300) * 0.5 + N() * Math.exp(-t * 400) * 0.3);
    B.reloadTick = this.makeBuffer(0.08, (t) => click(t, 0, 3100, 200) * 0.5 + N() * Math.exp(-t * 350) * 0.35);
    B.reloadDone = this.makeBuffer(0.25, (t, s, sr) => click(t, 0, 1500, 120) * 0.7 + click(t, 0.06, 2400, 160) * 0.6 + lp(s, N(), 400, sr) * Math.exp(-t * 30) * 0.8);
    B.switch = this.makeBuffer(0.18, (t, s, sr) => click(t, 0, 900, 90) * 0.6 + lp(s, N(), 900, sr) * Math.exp(-t * 40) * 0.6);

    B.whiz = this.makeBuffer(0.32, (t, s, sr) => {
      const env = Math.sin(Math.PI * Math.min(1, t / 0.32)) ** 2;
      const x = N();
      const hp = x - lp(s, x, sweep(t, 2400, 900, 6), sr);
      return lp(s, hp, 5200, sr, 'lp2') * env * 0.9;
    });

    B.hitFlesh = this.makeBuffer(0.22, (t, s, sr) => lp(s, N(), 650, sr) * Math.exp(-t * 26) * 2 + Math.sin(TAU * 120 * t) * Math.exp(-t * 32) * 0.7);
    B.hitWood = this.makeBuffer(0.2, (t, s, sr) => lp(s, N(), 1700, sr) * Math.exp(-t * 38) * 1.4 + Math.sin(TAU * 310 * t) * Math.exp(-t * 34) * 0.6);
    B.hitDirt = this.makeBuffer(0.18, (t, s, sr) => lp(s, N(), 900, sr) * Math.exp(-t * 30) * 1.6);
    B.hitMetal = this.makeBuffer(0.3, (t) => (Math.sin(TAU * 1850 * t) * 0.5 + Math.sin(TAU * 2770 * t) * 0.3) * Math.exp(-t * 16) + N() * Math.exp(-t * 200) * 0.3);

    const knocks = Array.from({ length: 7 }, () => [Math.random() * 0.28, 180 + Math.random() * 260]);
    B.crateBreak = this.makeBuffer(0.55, (t, s, sr) => {
      let v = lp(s, N(), 2200, sr) * Math.exp(-t * 9) * 1.2;
      for (const [at, hz] of knocks) v += click(t, at, hz, 40) * 0.5;
      return v;
    });
    B.barrelBreak = this.makeBuffer(0.8, (t, s, sr) => {
      let v = lp(s, N(), 1800, sr) * Math.exp(-t * 7) * 1.1;
      const x = N();
      v += (x - lp(s, x, 1500, sr, 'lp2')) * Math.exp(-t * 4) * 0.5;
      for (const [at, hz] of knocks) v += click(t, at * 1.2, hz * 0.8, 35) * 0.45;
      return v;
    });
    B.explosion = this.makeBuffer(2.4, (t, s, sr) => {
      const body = lp(s, N(), sweep(t, 1500, 70, 2.2), sr) * Math.exp(-t * 1.9) * 2.4;
      const sub = Math.sin(TAU * (48 - 18 * Math.min(1, t)) * t) * Math.exp(-t * 3.5) * 1.3;
      const crackle = Math.random() < 0.004 * Math.exp(-t * 2) ? N() * 2 : 0;
      return body + sub + crackle + N() * Math.exp(-t * 60) * 0.8;
    });
    B.footstep = this.makeBuffer(0.09, (t, s, sr) => lp(s, N(), 520, sr) * Math.exp(-t * 55) * 1.4);
    B.roll = this.makeBuffer(0.4, (t, s, sr) => lp(s, N(), 480, sr) * Math.sin(Math.PI * Math.min(1, t / 0.4)) * 1.6);
    B.hurt = this.makeBuffer(0.32, (t, s, sr) => Math.sin(TAU * sweep(t, 190, 95, 6) * t + Math.sin(TAU * 30 * t) * 0.6) * Math.exp(-t * 9) * 0.7 + lp(s, N(), 700, sr) * Math.exp(-t * 18) * 0.8);
    B.enemyHurt = this.makeBuffer(0.25, (t, s, sr) => Math.sin(TAU * sweep(t, 160, 110, 8) * t) * Math.exp(-t * 12) * 0.55 + lp(s, N(), 600, sr) * Math.exp(-t * 20) * 0.6);
    B.enemyDeath = this.makeBuffer(0.55, (t, s, sr) => Math.sin(TAU * sweep(t, 170, 70, 4) * t + Math.sin(TAU * 22 * t)) * Math.exp(-t * 5) * 0.6 + lp(s, N(), 500, sr) * Math.exp(-t * 8) * 0.6);
    B.bodyFall = this.makeBuffer(0.3, (t, s, sr) => lp(s, N(), 350, sr) * Math.exp(-t * 16) * 2 + Math.sin(TAU * 60 * t) * Math.exp(-t * 20) * 0.6);
    B.deadEyeIn = this.makeBuffer(0.9, (t, s, sr) => {
      const rise = Math.min(1, t / 0.25);
      return lp(s, N(), 300 + 2500 * rise * Math.exp(-t * 3), sr) * Math.exp(-t * 3) * 1.4 + Math.sin(TAU * 52 * t) * Math.exp(-t * 4) * 0.8;
    });
    B.heartbeat = this.makeBuffer(0.5, (t) => (click(t, 0, 52, 22) + click(t, 0.17, 46, 26) * 0.75) * 1.1);
    B.coin = this.makeBuffer(0.9, (t) => [0, 0.09, 0.18].reduce((v, at, i) => v + click(t, at, [1320, 1568, 2093][i], 7) * 0.4, 0));
    B.uiClick = this.makeBuffer(0.06, (t) => click(t, 0, 1400, 140) * 0.6);
    B.alert = this.makeBuffer(0.3, (t) => click(t, 0, 660, 14) * 0.25 + click(t, 0.08, 880, 14) * 0.25);
    B.fuse = this.makeBuffer(0.3, (t, s, sr) => { const x = N(); return (x - lp(s, x, 3000, sr)) * 0.5 * (1 - t / 0.3); });
    B.wind = this.makeBuffer(6, (t, s, sr) => {
      const cut = 260 + 180 * Math.sin(TAU * t / 6) + 90 * Math.sin(TAU * t / 1.5);
      const fade = Math.min(1, t / 0.3, (6 - t) / 0.3);
      return lp(s, lp(s, N(), cut, sr, 'lp2'), cut, sr) * 2.4 * fade;
    });
  }

  startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.wind;
    src.loop = true;
    src.connect(this.amb);
    src.start();
  }
}
