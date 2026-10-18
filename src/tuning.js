// Every feel number lives here. Press ` (backquote) in game to tune live.

export const T = {
  sim: { hz: 60, maxFrame: 0.25, maxTicksPerFrame: 8 },

  render: { maxPixelRatio: 1.5, shadowMapSize: 2048, shadowSpan: 17 },

  camera: {
    fov: 35,
    pitchDeg: 55,
    distance: 28,
    minDistance: 20,
    maxDistance: 48,
    zoomStep: 2,
    followHalfLife: 0.06,
    lookAhead: 3,
    lookAheadFactor: 0.3,
    shakeDecay: 1.5,
    shakeMaxOffset: 0.45,
    shakeMaxRollDeg: 1.6,
    shakeFreq: 17,
  },

  player: {
    radius: 0.35,
    halfHeight: 0.55,
    speed: 5.5,
    accelTime: 0.08,
    stopTime: 0.06,
    turnRate: 24,
    hp: 100,
    regenDelay: 3,
    regenRate: 22,
    regenStep: 25,
    gunHeight: 1.0,
    hitRadius: 0.42,
    bandageHeal: 35,
  },

  dodge: { duration: 0.35, distance: 4.5, iframes: 0.25, cooldown: 0.6, buffer: 0.15 },

  deadEye: { timeScale: 0.3, maxRealTime: 4, fillHit: 0.08, fillKill: 0.2, minToStart: 0.1, damageMult: 1.5 },

  hitStop: { kill: 0.05, crit: 0.03, explosion: 0.06 },

  aimAssist: { angleDeg: 3, range: 30 },

  enemy: {
    sightRange: 18,
    sightFovDeg: 110,
    closeSense: 3.5,
    hearRange: 25,
    memory: 6,
    perceptionInterval: 0.2,
    alertTime: 0.6,
    tokens: 2,
    flankAfter: 5,
    coverMin: 6,
    coverMax: 14,
    separation: 1.1,
    accuracyPerCamp: 0.08,
  },

  explosion: { radius: 4, damage: 80, impulse: 26, chainDelay: 0.15, trauma: 0.7 },

  run: { saveInterval: 2, deathSlowmo: 0.25, killSlowmoTime: 0.7 },
};
