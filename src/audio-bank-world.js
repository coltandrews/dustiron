// Horse, town, interface and ambience sounds, rendered once after the combat set.
import { N, sweep, env, click, vary, kit } from './audio-synth.js';

const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));
/** Variants render one at a time: the first is ready soonest, the rest follow. */
const many = (count, render) => ({ count, render });

export function worldJobs(k, ctx) {
  const { make, LP, HP, RESO, OSC, DRIFT, voice } = k;

  /** Stereo loops render at half rate: they are dark and long, so this halves the work. */
  const half = kit(ctx, Math.max(22050, Math.round(ctx.sampleRate / 2)));
  const loop = (dur, factory) => half.make(dur, factory, 2);

  return [
    // ---------- interface ----------
    ['uiClick', () => make(0.06, () => (t) => click(t, 0, 1400, 140) * 0.6 + click(t, 0.004, 2800, 260) * 0.15)],
    ['coin', () => make(0.9, () => {
      const notes = [[0, 1320], [0.08, 1568], [0.16, 2093]];
      const oscs = notes.map(() => [OSC(), OSC()]);
      return (t) => notes.reduce((v, [at, hz], i) => v + (t >= at ? (oscs[i][0](hz) + oscs[i][1](hz * 2.76) * 0.25) * Math.exp(-(t - at) * 7) * 0.32 : 0), 0);
    })],
    ['register', () => make(1.1, () => {
      const bell = OSC(), bell2 = OSC(), l = LP();
      return (t) => {
        const drawer = l(N(), 900) * (t < 0.12 ? Math.sin(Math.PI * t / 0.12) : 0) * 0.8 + click(t, 0.12, 400, 40) * 0.8;
        const ring = t > 0.14 ? (bell(2350) + bell2(3510) * 0.4) * Math.exp(-(t - 0.14) * 3.5) * 0.35 : 0;
        return drawer + ring + click(t, 0, 1800, 120) * 0.4;
      };
    })],
    ['page', () => make(0.35, () => {
      const h = HP(), l = LP();
      return (t) => h(l(N(), 6000), 1500) * Math.sin(Math.PI * Math.min(1, t / 0.35)) ** 1.5 * (0.6 + 0.4 * Math.sin(t * 70)) * 0.7;
    })],
    ['quillNote', () => make(0.5, () => {
      const h = HP(), o = OSC();
      return (t) => h(N(), 4000) * (0.5 + 0.5 * Math.sin(t * 120)) * Math.sin(Math.PI * Math.min(1, t / 0.3)) * 0.3 * (t < 0.3 ? 1 : 0) + (t > 0.3 ? o(880) * env(t - 0.3, 0.005, 9) * 0.25 : 0);
    })],
    ['card', () => many(3, () => make(0.12, () => {
      const h = HP(); const f = vary(2800, 0.2);
      return (t) => h(N(), f) * env(t, 0.004, 45) * 0.8 + click(t, 0.05, 900, 150) * 0.2;
    }))],
    ['chips', () => make(0.5, () => {
      const hits = times(6, () => [Math.random() * 0.25, 2600 + Math.random() * 1800]);
      return (t) => hits.reduce((v, [at, hz]) => v + click(t, at, hz, 70) * 0.25, 0);
    })],
    ['lose', () => make(0.5, () => { const o = OSC(); return (t) => o(sweep(t, 220, 150, 3)) * env(t, 0.01, 6) * 0.35; })],

    // ---------- doors, chests, furniture ----------
    ['door', () => make(0.9, () => {
      const r = RESO(), r2 = RESO(), l = LP(), o = OSC();
      let next = 0;
      return (t) => {
        // Stick-slip friction: a pulse train whose rate wanders, through a wooden resonance.
        const rate = 55 + 40 * Math.sin(t * 7) + 25 * Math.sin(t * 23);
        let pulse = 0;
        if (t >= next && t < 0.55) { pulse = 1; next = t + 1 / rate; }
        const creak = (r(pulse, 780, 60) + r2(pulse, 1650, 120) * 0.5) * 3;
        const latch = click(t, 0, 2200, 160) * 0.5;
        const shut = click(t, 0.62, 140, 30) * 0.9 + l(N(), 700) * (t > 0.62 ? Math.exp(-(t - 0.62) * 30) : 0) * 1.2;
        return creak * 0.5 + latch + shut + o(90) * (t > 0.62 ? Math.exp(-(t - 0.62) * 25) : 0) * 0.3;
      };
    })],
    ['batwing', () => make(0.7, () => {
      const flaps = [[0.02, 210], [0.14, 240], [0.3, 200], [0.42, 230]];
      const l = LP();
      return (t) => flaps.reduce((v, [at, hz], i) => v + click(t, at, hz, 40) * (1 - i * 0.2) * 0.7, 0) + l(N(), 800) * Math.exp(-t * 12) * 0.3;
    })],
    ['chestOpen', () => make(0.6, () => {
      const r = RESO(); let next = 0;
      return (t) => {
        let pulse = 0;
        if (t >= next && t < 0.35) { pulse = 1; next = t + 1 / (40 + 70 * t); }
        return r(pulse, 520, 70) * 1.5 + click(t, 0, 1600, 150) * 0.5 + click(t, 0.4, 120, 30) * 0.8;
      };
    })],
    ['saddle', () => make(0.6, () => {
      const r = RESO(); let next = 0;
      return (t) => {
        let pulse = 0;
        if (t >= next && t < 0.45) { pulse = 0.6 + Math.random() * 0.4; next = t + 1 / (25 + Math.random() * 30); }
        return r(pulse, 350, 80) * 1.8 + click(t, 0.48, 2800, 200) * 0.2;
      };
    })],

    // ---------- horse ----------
    ['hoof', () => many(4, () => make(0.14, () => {
      const l = LP(), o = OSC(); const f = vary(380, 0.15);
      return (t) => l(N(), 1100) * Math.exp(-t * 55) * 1.2 + o(f) * Math.exp(-t * 45) * 0.5 + click(t, 0.002, vary(1900), 160) * 0.25;
    }))],
    ['snort', () => many(2, () => make(0.5, () => {
      const l = LP(), h = HP();
      return (t) => h(l(N(), 1800), 300) * env(t, 0.03, 7) * (0.7 + 0.3 * Math.sin(t * 160)) * 1.2;
    }))],
    ['whinny', () => many(2, () => voice(1.1, [vary(620), vary(380)], [[900, 700], [1800, 1500]], { attack: 0.04, decay: 2.2, breath: 0.35, rough: 3.5 }))],
    ['whistle', () => make(0.75, () => {
      const o = OSC(), h = HP();
      return (t) => {
        const second = t > 0.3;
        const local = second ? t - 0.3 : t;
        const f = second ? sweep(local, 1500, 2300, 9) : sweep(local, 1700, 2100, 18);
        const shape = second ? env(local, 0.04, 4) : (local < 0.22 ? Math.sin(Math.PI * local / 0.22) : 0);
        return (o(f + Math.sin(t * 38) * 25) * 0.55 + h(N(), 2000) * 0.04) * shape;
      };
    })],

    // ---------- people and places ----------
    ['dog', () => many(2, () => make(0.6, () => {
      const barks = Math.random() < 0.5 ? [0] : [0, 0.22];
      const parts = barks.map((at) => [at, voice(0.16, [vary(520), vary(380)], [[700, 600], [1500, 1300]], { attack: 0.005, decay: 18, breath: 0.6, rough: 2 })]);
      return (t) => parts.reduce((v, [at, buf]) => { const i = Math.floor((t - at) * buf.sampleRate); return v + (i >= 0 && i < buf.length ? buf.getChannelData(0)[i] : 0); }, 0);
    }))],
    ['anvil', () => make(1.6, () => {
      const strikes = [0, 0.45, 0.9];
      const a = OSC(), b = OSC(), c = OSC();
      return (t) => {
        let e = 0;
        for (const at of strikes) if (t >= at) e += Math.exp(-(t - at) * 6);
        return (a(1210) * 0.5 + b(2870) * 0.25 + c(4130) * 0.12) * e * 0.4;
      };
    })],
    ['glass', () => many(3, () => make(0.5, () => {
      const a = OSC(), b = OSC(); const f = vary(3100, 0.15);
      return (t) => (a(f) + b(f * 1.62) * 0.5) * (Math.exp(-t * 12) + (t > 0.06 ? Math.exp(-(t - 0.06) * 16) * 0.5 : 0)) * 0.2;
    }))],
    ['hawk', () => make(1.6, () => {
      const o = OSC(), h = HP();
      return (t) => {
        const cry = (at, len) => (t >= at && t < at + len ? Math.sin(Math.PI * (t - at) / len) ** 0.7 : 0);
        const shape = cry(0, 0.75) + cry(0.95, 0.5) * 0.6;
        const f = 2900 - 1100 * ((t % 0.95) / 0.95) + Math.sin(t * 70) * 90;
        return (o(f) * 0.4 + h(N(), 3000) * 0.08) * shape;
      };
    })],
    ['creak', () => many(2, () => make(1.0, () => {
      const r = RESO(); let next = 0; const base = vary(420, 0.2);
      return (t) => {
        let pulse = 0;
        if (t >= next && t < 0.8) { pulse = 1; next = t + 1 / (30 + 25 * Math.sin(t * 5)); }
        return r(pulse, base, 50) * 1.6 * Math.sin(Math.PI * Math.min(1, t / 0.9));
      };
    }))],

    // ---------- loops (stereo) ----------
    ['wind', () => loop(8, () => {
      const a = half.LP(), b = half.LP(), gust = half.DRIFT(0.6);
      return (t) => {
        const cut = Math.round((240 + 170 * Math.sin((Math.PI * 2 * t) / 8) + 90 * gust()) / 6) * 6; // steps keep filter maths cached
        const fade = Math.min(1, t / 0.3, (8 - t) / 0.3);
        return b(a(N(), cut), cut) * 2.6 * fade;
      };
    })],
    ['townBed', () => loop(6, () => {
      const voices = half.LP(), band = half.HP(), low = half.LP(), syl = half.DRIFT(5);
      return (t) => {
        const fade = Math.min(1, t / 0.3, (6 - t) / 0.3);
        const murmur = band(voices(N(), 900), 250) * (0.5 + 0.5 * syl()) * 0.9;
        return (murmur + low(N(), 120) * 0.6) * fade;
      };
    })],
    ['chatter', () => loop(6, () => {
      const v1 = half.RESO(), v2 = half.RESO(), l = half.LP(), s1 = half.DRIFT(6), s2 = half.DRIFT(4.5), f = half.DRIFT(1.5);
      return (t) => {
        const fade = Math.min(1, t / 0.3, (6 - t) / 0.3);
        const n = l(N(), 2400);
        const drift = Math.round(f() * 20) / 20;
        const babble = v1(n, 550 + drift * 150, 220) * Math.max(0, s1()) + v2(n, 1300 + drift * 300, 380) * Math.max(0, s2()) * 0.7;
        return babble * 1.6 * fade;
      };
    })],
    ['roomTone', () => loop(4, () => {
      const l = half.LP(), l2 = half.LP(), o = half.OSC();
      return (t) => { const fade = Math.min(1, t / 0.3, (4 - t) / 0.3); return (l2(l(N(), 160), 160) * 2 + o(60) * 0.02) * fade; };
    })],
    ['fire', () => loop(4, () => {
      const roar = half.LP(), pop = half.HP();
      let spark = 0;
      return (t) => {
        const fade = Math.min(1, t / 0.2, (4 - t) / 0.2);
        if (Math.random() < 0.003) spark = 0.6 + Math.random() * 1.4;
        spark *= 0.986;
        return (roar(N(), 350) * 0.9 + pop(N() * spark, 1800) * 1.4) * fade;
      };
    })],
  ];
}
