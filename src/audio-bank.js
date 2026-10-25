// Combat and player sounds, rendered once. Most come in several variants so
// repeated shots, steps and hits never sound like the same sample twice.
// `bankJobs` lists [name, render] pairs in priority order; audio.js renders
// them a few at a time so loading never stalls a frame.
import { TAU, N, sweep, env, click, vary, kit } from './audio-synth.js';
import { worldJobs } from './audio-bank-world.js';

const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));
/** Variants render one at a time: the first is ready soonest, the rest follow. */
const many = (count, render) => ({ count, render });

/** Reverb impulse responses: open desert with mesa echoes, or a wooden room. */
export function makeImpulse(ctx, kind) {
  const { make, LP } = kit(ctx);
  if (kind === 'room') {
    return make(0.8, (c) => {
      const l = LP();
      return (t) => l(N(), 5200 - t * 4000) * Math.exp(-t * 7.5) * (t < 0.004 ? t / 0.004 : 1) * (1 + (c ? 0.1 : -0.1) * Math.sin(t * 90));
    }, 2);
  }
  // Desert: a thin diffuse tail plus discrete slapback echoes that get darker.
  const echoes = [[0.19, 0.55], [0.43, 0.32], [0.78, 0.2], [1.25, 0.11], [1.8, 0.06]];
  return make(2.6, (c) => {
    const diffuse = LP(), echo = LP();
    const off = c ? 0.017 : 0;
    return (t) => {
      let v = diffuse(N(), 3000) * Math.exp(-t * 2.8) * 0.35 * (t < 0.01 ? t / 0.01 : 1);
      for (const [at, amp] of echoes) {
        const e = t - at - off;
        if (e > 0 && e < 0.09) v += N() * amp * Math.exp(-e * 45);
      }
      return v * 0.6 + echo(v, 2400 - Math.min(1.5, t) * 1200) * 0.4;
    };
  }, 2);
}

/** A gunshot: supersonic crack, a swept noise body, a low thump and a rolling tail. */
function gun(k, p) {
  const { make, LP, HP, OSC } = k;
  return make(p.dur, () => {
    const crack = HP(), body = LP(), t1 = LP(), t2 = LP(), thump = OSC();
    const b0 = vary(p.body0), b1 = vary(p.body1), th = vary(p.thump, 0.05);
    return (t) => {
      const n = N();
      const c = crack(n, 2600) * Math.exp(-t * 150) * p.crack + n * Math.exp(-t * 420) * 0.6 * p.crack;
      const b = body(n, sweep(t, b0, b1, 12)) * Math.exp(-t * p.decay) * 1.8;
      const th1 = thump(th * (1 - 0.5 * Math.min(1, t * 7))) * Math.exp(-t * 15) * p.thumpAmt;
      const tail = t2(t1(n, 650), 420) * Math.exp(-t * p.tailDecay) * p.tail * Math.min(1, t * 25);
      return c + b + th1 + tail;
    };
  });
}

/** Metal-on-metal mechanism: clicks at given times plus a little scrape. */
function mech(k, dur, hits, scrape = 0) {
  const { make, HP } = k;
  return make(dur, () => {
    const h = HP();
    const hs = hits.map(([at, hz, decay, amp]) => [at + Math.random() * 0.006, vary(hz, 0.05), decay, amp]);
    return (t) => {
      const noise = h(N(), 3000);
      let v = 0;
      for (const [at, hz, decay, amp] of hs) v += click(t, at, hz, decay) * amp + (t >= at ? noise * Math.exp(-(t - at) * 260) * amp * 0.5 : 0);
      if (scrape) v += h(N(), 2200) * scrape * Math.sin(Math.PI * Math.min(1, t / dur)) * 0.3;
      return v;
    };
  });
}

export function bankJobs(ctx) {
  const k = kit(ctx);
  const { make, LP, HP, OSC, voice } = k;
  const thud = (dur, fc, decay, amp, low = 0, lowHz = 70) => make(dur, () => {
    const l = LP(), o = OSC();
    const f = vary(fc, 0.12);
    return (t) => l(N(), f) * Math.exp(-t * decay) * amp + o(lowHz) * Math.exp(-t * decay * 1.3) * low;
  });

  const jobs = [
    // Guns first: they are heard in the first second of play.
    ['revolver', () => many(3, () => gun(k, { dur: 0.9, body0: 3200, body1: 260, decay: 8, thump: 85, thumpAmt: 0.9, crack: 1, tail: 0.7, tailDecay: 4.5 }))],
    ['rifle', () => many(3, () => gun(k, { dur: 1.1, body0: 4400, body1: 300, decay: 6.5, thump: 95, thumpAmt: 0.8, crack: 1.35, tail: 0.8, tailDecay: 3.6 }))],
    ['shotgun', () => many(3, () => gun(k, { dur: 1.2, body0: 2200, body1: 150, decay: 5, thump: 58, thumpAmt: 1.3, crack: 0.9, tail: 1.1, tailDecay: 3 }))],
    ['enemyShot', () => many(3, () => gun(k, { dur: 0.8, body0: 2600, body1: 220, decay: 9, thump: 75, thumpAmt: 0.7, crack: 0.8, tail: 0.6, tailDecay: 5 }))],
    ['dryClick', () => mech(k, 0.12, [[0, 2600, 260, 0.7], [0.035, 1900, 300, 0.5]])],
    ['hitFlesh', () => many(3, () => thud(0.22, 700, 26, 2, 0.7, 120))],
    ['hitDirt', () => many(3, () => make(0.22, () => {
      const l = LP(), h = HP(); const f = vary(900, 0.2);
      return (t) => l(N(), f) * Math.exp(-t * 30) * 1.6 + h(N(), 4000) * Math.exp(-t * 18) * 0.25 * (t > 0.02 ? 1 : 0);
    }))],
    ['hitWood', () => many(3, () => make(0.22, () => {
      const l = LP(), o = OSC(); const f = vary(310, 0.15);
      return (t) => l(N(), 1800) * Math.exp(-t * 38) * 1.3 + o(f) * Math.exp(-t * 30) * 0.7 + o(f * 2.3) * Math.exp(-t * 50) * 0.2;
    }))],
    ['hitMetal', () => many(2, () => make(0.6, () => {
      const a = OSC(), b = OSC(), c = OSC(); const f = vary(1850, 0.1);
      return (t) => (a(f) * 0.5 + b(f * 1.497) * 0.3 + c(f * 2.21) * 0.15) * Math.exp(-t * 9) + N() * Math.exp(-t * 220) * 0.4;
    }))],
    ['hitStone', () => many(3, () => make(0.2, () => {
      const h = HP(), l = LP();
      return (t) => h(N(), 2500) * Math.exp(-t * 60) * 1.1 + l(N(), 1200) * Math.exp(-t * 35) * 0.7;
    }))],
    ['ricochet', () => many(3, () => make(0.55, () => {
      const o = OSC(), h = HP(); const a = vary(3800, 0.15), b = vary(1100, 0.2);
      return (t) => o(sweep(t, a, b, 5) + Math.sin(t * 90) * 60) * env(t, 0.01, 6) * 0.45 + h(N(), 3000) * Math.exp(-t * 80) * 0.4;
    }))],
    ['whiz', () => many(3, () => make(0.32, () => {
      const h = HP(), l = LP(); const top = vary(2400, 0.15);
      return (t) => l(h(N(), sweep(t, top, 900, 6)), 5200) * Math.sin(Math.PI * Math.min(1, t / 0.32)) ** 2 * 0.9;
    }))],
    ['stepDirt', () => many(4, () => make(0.12, () => {
      const l = LP(), h = HP(); const f = vary(520, 0.2);
      return (t) => l(N(), f) * Math.exp(-t * 55) * 1.4 + h(N(), 3500) * Math.exp(-t * 70) * 0.12 * (t > 0.015 ? 1 : 0);
    }))],
    ['stepWood', () => many(4, () => make(0.16, () => {
      const l = LP(), o = OSC(); const f = vary(180, 0.15);
      return (t) => l(N(), 1400) * Math.exp(-t * 60) * 0.9 + o(f) * Math.exp(-t * 35) * 0.6 + click(t, 0.01, vary(900), 120) * 0.15;
    }))],
    ['switch', () => make(0.22, () => {
      const l = LP(), h = HP();
      return (t) => h(l(N(), 2400), 500) * Math.sin(Math.PI * Math.min(1, t / 0.12)) * 0.6 + click(t, 0.13, 1500, 140) * 0.6 + click(t, 0.15, 2600, 200) * 0.3;
    })],
    ['hurt', () => many(3, () => voice(0.32, [vary(170), vary(105)], [[650, 520], [1100, 900]], { decay: 8, breath: 0.4, rough: 0.6 }))],
    ['alert', () => many(3, () => voice(0.28, [vary(190), vary(150)], [[520, 420], [1750, 2250]], { attack: 0.015, decay: 6, breath: 0.2 }))],
    ['enemyHurt', () => many(3, () => voice(0.25, [vary(160), vary(115)], [[700, 560], [1200, 1000]], { decay: 10, breath: 0.45, rough: 0.5 }))],
    ['enemyDeath', () => many(3, () => voice(0.6, [vary(165), vary(78)], [[640, 450], [1150, 800]], { attack: 0.03, decay: 4, breath: 0.5, rough: 0.8 }))],
    ['bodyFall', () => many(2, () => thud(0.35, 380, 15, 2, 0.6, 60))],
    ['roll', () => make(0.4, () => { const l = LP(); return (t) => l(N(), 480) * Math.sin(Math.PI * Math.min(1, t / 0.4)) * 1.6; })],
  ];

  // Reloads and actions: each weapon names its own sounds in weapons.js.
  jobs.push(
    ['cylinderOpen', () => mech(k, 0.2, [[0, 1700, 140, 0.6], [0.05, 2900, 220, 0.35]], 0.4)],
    ['cylinderClose', () => mech(k, 0.35, [[0, 1400, 110, 0.8], [0.09, 3200, 260, 0.25], [0.13, 3200, 260, 0.22], [0.17, 3200, 260, 0.18]])],
    ['loadPistol', () => many(3, () => mech(k, 0.12, [[0, vary(2900), 240, 0.5], [0.03, 4200, 320, 0.25]]))],
    ['loadRifle', () => many(3, () => mech(k, 0.16, [[0, vary(1600), 160, 0.55], [0.06, 2400, 200, 0.35]], 0.25))],
    ['loadShell', () => many(3, () => mech(k, 0.2, [[0.07, vary(700), 90, 0.7], [0.09, 1800, 200, 0.2]], 0.6))],
    ['breakOpen', () => mech(k, 0.3, [[0, 900, 70, 0.8], [0.03, 2100, 160, 0.4], [0.18, 3400, 240, 0.12], [0.21, 3000, 240, 0.1]])],
    ['breakClose', () => mech(k, 0.25, [[0, 700, 60, 1], [0.01, 2300, 160, 0.4]])],
    ['lever', () => mech(k, 0.3, [[0, 1500, 110, 0.6], [0.11, 2300, 140, 0.7], [0.12, 900, 80, 0.4]], 0.5)],
    ['bolt', () => mech(k, 0.45, [[0, 2000, 150, 0.6], [0.12, 1300, 120, 0.4], [0.27, 1700, 110, 0.6], [0.33, 2400, 180, 0.6]], 0.6)],
    ['casing', () => many(3, () => make(0.45, () => {
      const a = OSC(), b = OSC(); const f = vary(4200, 0.08);
      const bounces = [[0, 0.35], [vary(0.11), 0.2], [vary(0.19), 0.1], [vary(0.24), 0.05]];
      return (t) => {
        const tone = a(f) * 0.6 + b(f * 1.58) * 0.4;
        let v = 0;
        for (const [at, amp] of bounces) if (t >= at) v += Math.exp(-(t - at) * 40) * amp;
        return tone * v;
      };
    }))],
    ['crateBreak', () => many(2, () => {
      const knocks = times(7, () => [Math.random() * 0.28, 180 + Math.random() * 260]);
      return make(0.6, () => { const l = LP(); return (t) => { let v = l(N(), 2200) * Math.exp(-t * 9) * 1.2; for (const [at, hz] of knocks) v += click(t, at, hz, 40) * 0.5; return v; }; });
    })],
    ['barrelBreak', () => {
      const knocks = times(7, () => [Math.random() * 0.34, 140 + Math.random() * 220]);
      return make(0.9, () => {
        const l = LP(), w = LP(), h = HP();
        return (t) => { let v = l(N(), 1800) * Math.exp(-t * 7) * 1.1 + h(w(N(), 3000), 800) * Math.exp(-t * 3.5) * 0.5 * Math.min(1, t * 10); for (const [at, hz] of knocks) v += click(t, at, hz, 35) * 0.45; return v; };
      });
    }],
    ['explosion', () => many(2, () => make(2.8, () => {
      const l = LP(), sub = OSC(), cr = HP();
      return (t) => {
        const body = l(N(), sweep(t, 1600, 70, 2.2)) * Math.exp(-t * 1.8) * 2.4;
        const s = sub(48 - 18 * Math.min(1, t)) * Math.exp(-t * 3.2) * 1.4;
        const crackle = Math.random() < 0.006 * Math.exp(-t * 1.6) ? cr(N(), 2000) * 2.2 : 0;
        return body + s + crackle + N() * Math.exp(-t * 60) * 0.9;
      };
    }))],
    ['debris', () => make(1.4, () => {
      const hits = times(14, () => [0.1 + Math.random() * 1.1, 200 + Math.random() * 900, Math.random()]);
      const l = LP();
      return (t) => { let v = 0; for (const [at, hz, a] of hits) v += click(t, at, hz, 60) * a * 0.35; return v + l(N(), 600) * Math.exp(-t * 3) * 0.2 * Math.min(1, t * 5); };
    })],
    ['fuse', () => make(0.35, () => { const h = HP(); return (t) => h(N(), 3000) * 0.5 * (1 - t / 0.35) * (0.6 + 0.4 * Math.sin(t * 160)); })],
    ['deadEyeIn', () => make(1.0, () => {
      const l = LP(), o = OSC();
      return (t) => { const rise = Math.min(1, t / 0.25); return l(N(), 300 + 2500 * rise * Math.exp(-t * 3)) * Math.exp(-t * 3) * 1.4 + o(52) * Math.exp(-t * 4) * 0.8 + o(78) * Math.exp(-t * 5) * 0.3; };
    })],
    ['deadEyeOut', () => make(0.7, () => {
      const l = LP();
      return (t) => l(N(), sweep(t, 400, 3000, 4)) * Math.sin(Math.PI * Math.min(1, t / 0.7)) * 1.1;
    })],
    ['heartbeat', () => make(0.5, () => (t) => (click(t, 0, 52, 22) + click(t, 0.17, 46, 26) * 0.75) * 1.1)],
    ['bandage', () => make(0.7, () => {
      const h = HP(), l = LP();
      const rips = [[0, 0.18], [0.24, 0.12], [0.45, 0.2]];
      return (t) => { let v = 0; for (const [at, d] of rips) if (t >= at && t < at + d) v += h(l(N(), 5000), 1200) * Math.sin(Math.PI * (t - at) / d) * (0.7 + 0.3 * Math.sin(t * 900)); return v * 0.8; };
    })],
    ['heal', () => make(0.9, () => { const a = OSC(), b = OSC(); return (t) => (a(523) * env(t, 0.01, 4) + (t > 0.12 ? b(784) * env(t - 0.12, 0.01, 4) : 0)) * 0.3; })],
    // A match strike and flare, then a soft draw on the cigarette.
    ['match', () => make(1.2, () => {
      const h = HP(), l = LP();
      return (t) => (t < 0.09 ? h(N(), 2500) * Math.sin(Math.PI * t / 0.09) * 0.9 : 0)
        + (t > 0.08 && t < 0.5 ? l(N(), 1800) * Math.exp(-(t - 0.08) * 7) * 0.5 : 0)
        + (t > 0.6 ? l(N(), 900) * Math.sin(Math.PI * Math.min(1, (t - 0.6) / 0.6)) * 0.35 : 0);
    })],
    // Two swallows from a glass.
    ['gulp', () => make(0.7, () => {
      const a = OSC(), l = LP();
      const g = (t, at) => (t >= at && t < at + 0.14 ? a(sweep(t - at, 180, 90, 0.14)) * Math.sin(Math.PI * (t - at) / 0.14) : 0);
      return (t) => (g(t, 0.05) + g(t, 0.32)) * 0.6 + l(N(), 600) * 0.05 * Math.exp(-t * 3);
    })],
  );
  return jobs.concat(worldJobs(k, ctx));
}
