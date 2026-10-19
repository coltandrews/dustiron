// Adaptive score, generated live on one tempo grid so layers stay in sync.
// Layers: explore (nylon guitar arpeggios), lead (Morricone-style whistle),
// tension (drone, tom pulse, tremolo), combat (galloping drums, bass, strums)
// and piano (honky-tonk, saloon only). audio.js sets the scene and tension;
// this file turns them into layer levels and schedules notes a little ahead.
import { T } from './tuning.js';
import { kit, mtof, N, sweep, env } from './audio-synth.js';

// Chords: bass root and three chord tones (MIDI).
const MINOR = [[45, [57, 60, 64]], [43, [55, 59, 62]], [41, [53, 57, 60]], [40, [52, 56, 59]]]; // Am G F E
const MAJOR = [[48, [55, 60, 64]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62]]]; // C F C G
const PIANO = [[36, [60, 64, 67]], [41, [60, 65, 69]], [36, [60, 64, 67]], [43, [59, 62, 65]]]; // C F C G7
const PENTA = [64, 67, 69, 72, 74, 76, 79, 81]; // A minor pentatonic, whistle range
const RAG = [72, 74, 76, 79, 81, 84];
const INST = { guitar: [45, 57, 69], bass: [33], piano: [48, 60, 72] };
const ramp = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
const LAYERS = ['explore', 'lead', 'tension', 'combat', 'piano'];
const ARP = [-1, null, 0, 1, 2, 1, 0, null]; // -1 = bass root, numbers index chord tones

export class Music {
  constructor(audio) {
    this.audio = audio;
    const ctx = audio.ctx;
    this.stepDur = 60 / T.audio.bpm / 2;
    this.next = ctx.currentTime + 0.1;
    this.i = 0;
    this.chord = MINOR[0];
    this.mood = 'minor';
    this.phrase = null;
    this.motif = makeMotif();
    this.ragIdx = 2;
    this.lastDetect = -99;
    this.layer = {};
    this.level = {};
    this.targetLevels = {};
    // A dotted-eighth echo on guitar and whistle: the open-range sound.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = this.stepDur * 1.5;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2200;
    this.echo.connect(tone); tone.connect(fb); fb.connect(this.echo);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    tone.connect(wet); wet.connect(audio.musicBus);
    for (const name of LAYERS) {
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(audio.musicBus);
      if (name === 'explore' || name === 'lead') g.connect(this.echo);
      this.layer[name] = g; this.level[name] = 0;
    }
    this.drone = null;
    this.queueInstruments();
  }

  /** Instrument samples render through the same budgeted queue as the sound bank. */
  queueInstruments() {
    const k = kit(this.audio.ctx);
    const { make, LP, HP, OSC, pluck } = k;
    const piano = (m) => make(2.4, () => {
      const f = mtof(m), parts = [];
      for (let n = 1; n <= 7; n++) for (const d of [0.9965, 1.0035]) parts.push([OSC(), f * n * d, 0.5 / n ** 1.2, 1.6 + n * 0.9]);
      const h = HP();
      return (t) => {
        let v = h(N(), 2000) * Math.exp(-t * 120) * 0.3;
        for (const [o, hz, amp, dec] of parts) v += o(hz) * amp * Math.exp(-t * dec);
        return v * Math.min(1, t * 400) * 0.6;
      };
    });
    const jobs = [
      ...INST.guitar.map((m) => [`m_guitar_${m}`, () => pluck(mtof(m), 2.6, { damp: 0.997, bright: 0.35, body: 2600 })]),
      ['m_bass_33', () => pluck(mtof(33), 2.2, { damp: 0.995, bright: 0.15, body: 900 })],
      ['m_kick', () => make(0.45, () => { const o = OSC(); return (t) => o(sweep(t, 130, 45, 18)) * Math.exp(-t * 9) * 0.9; })],
      ['m_tom', () => make(0.6, () => { const o = OSC(), l = LP(); return (t) => (o(sweep(t, 160, 95, 10)) * 0.8 + l(N(), 600) * 0.3) * Math.exp(-t * 7); })],
      ['m_rim', () => make(0.12, () => (t) => (Math.sin(2 * Math.PI * 1150 * t) + Math.sin(2 * Math.PI * 1720 * t) * 0.5) * Math.exp(-t * 60) * 0.5)],
      ['m_shaker', () => make(0.09, () => { const h = HP(); return (t) => h(N(), 5000) * env(t, 0.01, 50) * 0.5; })],
      ['m_bell', () => make(3, () => {
        const ps = [[1, 1], [2.01, 0.5], [2.76, 0.35], [5.4, 0.2]].map(([r, a]) => [OSC(), 330 * r, a]);
        return (t) => ps.reduce((v, [o, hz, a]) => v + o(hz) * a, 0) * Math.exp(-t * 1.6) * 0.35;
      })],
      ...INST.piano.map((m) => [`m_piano_${m}`, () => piano(m)]),
    ];
    // Guitar first: the title theme needs it a moment after the first click.
    this.audio.jobs.unshift(...jobs.slice(0, 4));
    this.audio.jobs.push(...jobs.slice(4));
  }

  // ---------- voices ----------

  note(inst, midi, time, vol, dest, hold = 1.4) {
    const a = this.audio, ctx = a.ctx;
    let base = INST[inst][0];
    for (const b of INST[inst]) if (Math.abs(midi - b) < Math.abs(midi - base)) base = b;
    const buf = a.buffers[`m_${inst}_${base}`];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 2 ** ((midi - base) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.setTargetAtTime(0, time + hold, 0.12);
    src.connect(g); g.connect(dest);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(time);
    src.stop(time + hold + 0.6);
  }

  hit(name, time, vol, dest, rate = 1) {
    const a = this.audio, buf = a.buffers[`m_${name}`];
    if (!buf) return;
    const src = a.ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = a.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(dest);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(time);
  }

  strum(inst, notes, time, vol, dest, gap = 0.012, hold = 0.9) {
    for (let i = 0; i < notes.length; i++) this.note(inst, notes[i], time + i * gap, vol * (1 - i * 0.08), dest, hold);
  }

  whistle(midi, time, dur, vol, dest) {
    const ctx = this.audio.ctx, f = mtof(midi);
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 0.96, time);
    o.frequency.exponentialRampToValueAtTime(f, time + 0.07);
    lfo.frequency.value = 5.2; depth.gain.setValueAtTime(0, time); depth.gain.linearRampToValueAtTime(f * 0.012, time + dur * 0.6);
    lfo.connect(depth); depth.connect(o.frequency);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.05);
    g.gain.setTargetAtTime(0, time + dur, 0.09);
    o.connect(g); g.connect(dest);
    o.start(time); lfo.start(time);
    o.stop(time + dur + 0.6); lfo.stop(time + dur + 0.6);
    o.onended = () => { o.disconnect(); lfo.disconnect(); depth.disconnect(); g.disconnect(); };
  }

  /** A low A pedal for the tension layer: two detuned saws through a dark filter. */
  startDrone() {
    const ctx = this.audio.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.09;
    for (const hz of [55, 55.4, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(lp); o.start(); }
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.15; depth.gain.value = 220; lfo.connect(depth); depth.connect(lp.frequency); lfo.start();
    lp.connect(g); g.connect(this.layer.tension);
    this.drone = g;
  }

  // ---------- cues ----------

  cue(name) {
    const a = this.audio, t = a.ctx.currentTime + 0.03, bus = a.musicBus;
    if (name === 'detect') {
      if (a.scene !== 'frontier' || t - this.lastDetect < 10) return;
      this.lastDetect = t;
      this.note('bass', 40, t, 0.7, bus, 1.4);
      this.hit('tom', t, 0.6, bus, 0.8);
      for (let i = 0; i < 8; i++) this.note('guitar', 52, t + i * 0.055, 0.22 * (1 - i / 9), bus, 0.06);
    } else if (name === 'victory') {
      this.strum('guitar', [45, 57, 61, 64, 69], t, 0.4, bus, 0.03, 2.2);
      this.whistle(76, t + 0.35, 0.3, 0.18, this.echo);
      this.whistle(81, t + 0.7, 1.2, 0.2, this.echo);
      this.hit('bell', t + 0.7, 0.25, bus, 1.33);
    } else if (name === 'death') {
      [57, 56, 53, 52].forEach((m, i) => this.note('guitar', m, t + 0.2 + i * 0.5, 0.32, bus, 1.6));
      this.note('bass', 28, t + 2.2, 0.6, bus, 2.5);
      this.hit('bell', t + 2.2, 0.35, bus, 0.66);
    } else if (name === 'reward') {
      [60, 64, 67, 72].forEach((m, i) => this.note('guitar', m + 12, t + i * 0.07, 0.3, a.ui, 1.2));
    } else if (name === 'quest') {
      this.note('guitar', 79, t, 0.28, a.ui, 1); this.note('guitar', 84, t + 0.09, 0.28, a.ui, 1.2);
    }
  }

  // ---------- conductor ----------

  /** Layer levels for a scene and tension (0..1). Fills one reused object. */
  targets(scene, ten) {
    const L = this.targetLevels;
    L.explore = 0; L.lead = 0; L.tension = 0; L.combat = 0; L.piano = 0;
    if (scene === 'title') { L.explore = 0.9; L.lead = 1; }
    else if (scene === 'frontier') {
      L.explore = 1 - ramp(ten, 0.3, 0.8);
      L.lead = 0.9 * (1 - ramp(ten, 0.05, 0.3));
      L.tension = ramp(ten, 0.15, 0.45) * (1 - 0.5 * ramp(ten, 0.7, 1));
      L.combat = ramp(ten, 0.6, 0.9);
    } else if (scene === 'town') L.explore = 0.75;
    else if (scene === 'interior') L.explore = 0.5;
    else if (scene === 'saloon') L.piano = 1;
    return L;
  }

  update() {
    const a = this.audio, ctx = a.ctx, t = ctx.currentTime;
    const L = this.targets(a.scene, a.tension);
    for (const name of LAYERS) {
      if (Math.abs(L[name] - this.level[name]) < 0.01) continue;
      this.layer[name].gain.setTargetAtTime(L[name], t, L[name] > this.level[name] ? 0.6 : 1.8);
      this.level[name] = L[name];
    }
    if (!this.drone && L.tension > 0) this.startDrone();
    if (this.next < t - 0.25) this.next = t + 0.05; // the tab slept: skip ahead rather than burst
    while (this.next < t + 0.2) { this.step(this.i, this.next); this.next += this.stepDur; this.i++; }
  }

  step(i, time) {
    const s = i % 8, bar = Math.floor(i / 8), lv = this.level, Ly = this.layer, sd = this.stepDur;
    const scene = this.audio.scene;
    if (s === 0) {
      this.mood = scene === 'saloon' ? 'piano' : scene === 'town' || scene === 'interior' ? 'major' : 'minor';
      this.chord = (this.mood === 'piano' ? PIANO : this.mood === 'major' ? MAJOR : MINOR)[bar % 4];
    }
    const [root, tones] = this.chord;
    const swing = this.mood !== 'minor' && s % 2 ? sd * 0.14 : 0;
    const at = time + swing;

    if (lv.explore > 0.02) {
      if (this.mood === 'minor') {
        const pick = bar % 4 === 3 && s === 7 ? 2 : ARP[s];
        if (pick === -1) this.note('guitar', root, at, 0.34, Ly.explore, 2);
        else if (pick !== null) this.note('guitar', tones[pick] + (s === 6 && bar % 2 ? 12 : 0), at, 0.2, Ly.explore, 1.3);
      } else {
        if (s === 0) this.note('guitar', root, at, 0.34, Ly.explore, 1.2);
        if (s === 4) this.note('guitar', root + 7, at, 0.3, Ly.explore, 1.2);
        if (s === 2 || s === 6) this.strum('guitar', tones, at, 0.14, Ly.explore, 0.014, 0.5);
      }
    }

    if (lv.lead > 0.02 && this.mood === 'minor') this.lead(s, bar, time);

    if (lv.tension > 0.02) {
      if (s === 0) this.hit('tom', time, 0.55, Ly.tension, 0.85);
      if (s === 3) this.hit('tom', time, 0.3, Ly.tension, 0.85);
      this.note('guitar', root + 12, time, 0.07, Ly.tension, 0.08);
      this.note('guitar', root + 12, time + sd / 2, 0.05, Ly.tension, 0.08);
    }

    if (lv.combat > 0.02) {
      const C = Ly.combat;
      if (s === 0 || s === 4) this.hit('kick', time, 0.75, C);
      if (s === 3) this.hit('kick', time, 0.45, C);
      if (s === 2 || s === 6) this.hit('rim', time, 0.4, C);
      this.hit('shaker', time, 0.14, C); this.hit('shaker', time + sd / 2, 0.08, C);
      if (s === 0 || s === 3 || s === 4 || s === 6) this.note('bass', root - 12 + (s === 4 ? 7 : s === 6 ? 12 : 0), time, 0.5, C, 0.3);
      if (s === 0) this.strum('guitar', [root + 12, ...tones], time, 0.24, C, 0.01, 0.4);
      if (s === 4) this.strum('guitar', [root + 12, ...tones], time, 0.16, C, 0.01, 0.25);
      if (bar % 2 === 1 && s === 7) { this.hit('tom', time, 0.5, C, 1.1); this.hit('tom', time + sd / 2, 0.55, C, 0.9); }
    }

    if (lv.piano > 0.02) this.piano(s, at, root, tones);
  }

  lead(s, bar, time) {
    // A two-bar whistle phrase every four bars, two times in three.
    if (bar % 4 === 2 && s === 0) this.phrase = Math.random() < 0.67 ? varyMotif(this.motif) : null;
    if (!this.phrase || bar % 4 < 2) return;
    const pos = (bar % 4 - 2) * 8 + s;
    for (const n of this.phrase) if (n.step === pos) this.whistle(PENTA[n.deg], time, n.len * this.stepDur, 0.13, this.layer.lead);
  }

  piano(s, at, root, tones) {
    const P = this.layer.piano;
    if (s === 0) this.note('piano', root, at, 0.42, P, 0.5);
    if (s === 4) this.note('piano', root + 7, at, 0.36, P, 0.5);
    if (s === 2 || s === 6) for (const m of tones) this.note('piano', m, at, 0.17, P, 0.25);
    if (Math.random() < (s === 0 ? 1 : 0.55)) {
      this.ragIdx = Math.max(0, Math.min(RAG.length - 1, this.ragIdx + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
      let m = RAG[this.ragIdx];
      if (s === 0) m = tones[Math.floor(Math.random() * 3)] + 12;
      this.note('piano', m, at, 0.2, P, 0.35);
    }
  }
}

/** A short whistle tune: a few long notes over two bars, ending on a strong degree. */
function makeMotif() {
  const steps = [0, 3, 4, 8, 12];
  let deg = 3;
  return steps.map((step, i) => {
    deg = Math.max(0, Math.min(PENTA.length - 1, deg + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
    if (i === steps.length - 1) deg = [2, 5][Math.floor(Math.random() * 2)];
    return { step, deg, len: i === steps.length - 1 ? 3.5 : (steps[i + 1] - step) * 0.9 };
  });
}

function varyMotif(motif) {
  return motif.map((n, i) => (i > 0 && i < motif.length - 1 && Math.random() < 0.3
    ? { ...n, deg: Math.max(0, Math.min(PENTA.length - 1, n.deg + (Math.random() < 0.5 ? -1 : 1))) }
    : n));
}
