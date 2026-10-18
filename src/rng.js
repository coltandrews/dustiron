// Seeded random numbers so each run's camps are reproducible from one seed.

export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

// Unseeded helpers for cosmetic randomness (particles, pitch variation).
export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
export const randSpread = (spread) => (Math.random() + Math.random() - 1) * spread;
