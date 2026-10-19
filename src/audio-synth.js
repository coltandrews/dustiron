// Small DSP kit for rendering sounds into AudioBuffers once, at load.
// Each sound is a factory that returns a per-sample function, so every channel
// and every variant gets its own filter state.

export const TAU = Math.PI * 2;
export const N = () => Math.random() * 2 - 1;
export const sweep = (t, a, b, k) => b + (a - b) * Math.exp(-t * k);
export const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) * d));
export const click = (t, at, hz, decay) => (t >= at ? Math.sin(TAU * hz * (t - at)) * Math.exp(-(t - at) * decay) : 0);
export const vary = (v, amt = 0.08) => v * (1 + (Math.random() * 2 - 1) * amt);
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** `rate` lets dark, long sounds (wind, room tone) render at a lower sample rate. */
export function kit(ctx, rate = ctx.sampleRate) {
  const sr = rate;

  /** Renders `dur` seconds; `factory()` returns (t) => sample. Clipping peaks are scaled down. */
  const make = (dur, factory, channels = 1) => {
    const n = Math.max(1, Math.floor(dur * sr));
    const buf = ctx.createBuffer(channels, n, sr);
    for (let c = 0; c < channels; c++) {
      const d = buf.getChannelData(c);
      const fn = factory(c);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const v = fn(i / sr);
        d[i] = v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      if (peak > 0.98) for (let i = 0; i < n; i++) d[i] *= 0.95 / peak;
      // Short fade-out so loops and cut-offs never click.
      const fade = Math.min(n, Math.floor(sr * 0.004));
      for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
    }
    return buf;
  };

  /** One-pole low-pass. The coefficient is cached while the cutoff holds still. */
  const LP = () => {
    let y = 0, f = -1, a = 0;
    return (x, fc) => {
      if (fc !== f) { f = fc; a = 1 - Math.exp((-TAU * fc) / sr); }
      return (y += a * (x - y));
    };
  };
  /** One-pole high-pass. */
  const HP = () => { const l = LP(); return (x, fc) => x - l(x, fc); };
  /** Two-pole resonator (band-pass), roughly unity gain at the peak. */
  const RESO = () => {
    let y1 = 0, y2 = 0, lf = -1, lbw = -1, r = 0, c = 0;
    return (x, f, bw) => {
      if (f !== lf || bw !== lbw) { lf = f; lbw = bw; r = Math.exp((-Math.PI * bw) / sr); c = 2 * r * Math.cos((TAU * f) / sr); }
      const y = (1 - r) * x * 2 + c * y1 - r * r * y2;
      y2 = y1; y1 = y;
      return y;
    };
  };
  /** Sine with a phase accumulator, so frequency sweeps stay smooth. */
  const OSC = () => { let ph = Math.random() * TAU; return (f) => Math.sin((ph += (TAU * f) / sr)); };
  /** Band-limited-ish sawtooth (a few harmonics): a glottal pulse for voices. */
  const SAW = () => { let ph = 0; return (f) => { ph = (ph + f / sr) % 1; return 2 * ph - 1; }; };
  /** Smoothed random walk, -1..1, for slow wobble. */
  const DRIFT = (rate) => { let v = 0, target = 0, k = 0; return () => { if (k-- <= 0) { target = N(); k = Math.floor(sr / rate); } v += (target - v) * (rate / sr) * 4; return v; }; };

  /**
   * A short voiced sound: glottal pulse through two formants.
   * f0: [start, end] pitch; formants: [[f1a, f1b], [f2a, f2b]]; breath: noise mix.
   */
  const voice = (dur, f0, formants, { attack = 0.02, decay = 7, breath = 0.25, rough = 0 } = {}) => make(dur, () => {
    const g = SAW(), r1 = RESO(), r2 = RESO(), r3 = RESO(), pre = LP(), wob = OSC(), br = HP();
    return (t) => {
      const k = Math.min(1, t / dur);
      const pitch = f0[0] + (f0[1] - f0[0]) * k + wob(28) * rough * 12;
      const src = pre(g(pitch), 2600) + br(N(), 900) * breath;
      const f1 = formants[0][0] + (formants[0][1] - formants[0][0]) * k;
      const f2 = formants[1][0] + (formants[1][1] - formants[1][0]) * k;
      const v = r1(src, f1, 90) * 1.4 + r2(src, f2, 140) + r3(src, 2900, 300) * 0.3;
      return v * env(t, attack, decay) * 1.6;
    };
  });

  /** Karplus-Strong plucked string at `hz`: nylon guitar and banjo-ish timbres. */
  const pluck = (hz, dur, { damp = 0.996, bright = 0.5, body = 2400 } = {}) => {
    const n = Math.max(1, Math.floor(dur * sr));
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const len = Math.max(2, Math.round(sr / hz));
    const line = new Float32Array(len);
    const l0 = LP();
    for (let i = 0; i < len; i++) line[i] = l0(N(), 1200 + bright * 6000);
    const tone = LP();
    let idx = 0, last = 0, peak = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % len];
      const v = (cur + next) * 0.5 * damp;
      line[idx] = v;
      idx = (idx + 1) % len;
      last = tone(cur, body);
      d[i] = last;
      if (Math.abs(last) > peak) peak = Math.abs(last);
    }
    const scale = peak > 0 ? 0.9 / peak : 1;
    const fade = Math.floor(sr * 0.02);
    for (let i = 0; i < n; i++) d[i] *= scale * (i > n - fade ? (n - i) / fade : 1);
    return buf;
  };

  return { sr, make, LP, HP, RESO, OSC, SAW, DRIFT, voice, pluck };
}
