import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife, normalizeLife } from '../src/life.js';
import { SAVE_KEY, loadSave, writeLife, endLife } from '../src/storage.js';

const LEGACY_KEY = 'dustiron.run.v1';
function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}
function oldLife() {
  return { seed: 42, camp: 2, bounty: 321, kills: 9, shots: 50, hits: 30, time: 94.5,
    damageTaken: 60, hp: 57, unlocked: ['revolver', 'shotgun', 'rifle'], weapon: 2, deadEye: 0.4, version: 1 };
}

test('a saved life returns with the same inventory, bullets, and simulation time', () => {
  const storage = memoryStorage(), life = createLife(23);
  life.guns.revolver.ammo = 2; life.ammo.pistol = 9;
  life.simTime = 10.5;
  life.projectiles = [{ x: 80, z: 20, dx: 0, dz: 1, speed: 30, dmg: 12, left: 8 }];
  assert.equal(writeLife(life, storage), true);
  assert.deepEqual(loadSave(storage), life);
});

test('death stores a tombstone and prevents an old living prototype save from returning', () => {
  const storage = memoryStorage(), life = createLife(24);
  storage.setItem(LEGACY_KEY, JSON.stringify(oldLife()));
  writeLife(life, storage);
  assert.equal(endLife(life, storage), true);
  assert.equal(life.status, 'dead');
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).status, 'dead');
  assert.equal(storage.getItem(LEGACY_KEY), null);
  storage.setItem(LEGACY_KEY, JSON.stringify(oldLife()));
  assert.equal(loadSave(storage), null);
});

test('a stale tab cannot revive its dead life', () => {
  const storage = memoryStorage(), life = createLife(25), stale = structuredClone(life);
  writeLife(life, storage);
  endLife(life, storage);
  assert.equal(writeLife(stale, storage), false);
  assert.equal(loadSave(storage), null);
});

test('a stale tab cannot replace a new life; an explicit new life can replace a dead save', () => {
  const storage = memoryStorage(), life = createLife(26), stale = structuredClone(life), next = createLife(27);
  writeLife(life, storage);
  endLife(life, storage);
  assert.equal(writeLife(next, storage, true), true);
  assert.equal(writeLife(stale, storage), false);
  assert.equal(loadSave(storage).seed, next.seed);
});

test('migration keeps earned money, owned guns, selected weapon, health, and statistics', () => {
  const storage = memoryStorage(), old = oldLife();
  storage.setItem(LEGACY_KEY, JSON.stringify(old));
  const life = loadSave(storage);
  assert.equal(life.version, 3);
  assert.equal(life.migrated, true);
  assert.equal(life.seed, old.seed);
  assert.equal(life.bounty, old.bounty);
  assert.equal(life.hp, old.hp);
  assert.deepEqual(life.unlocked, old.unlocked);
  assert.equal(life.unlocked[life.weapon], 'rifle');
  for (const key of ['kills', 'shots', 'hits', 'time', 'damageTaken', 'deadEye']) assert.equal(life[key], old[key]);
  assert.notEqual(normalizeLife(life), null);
  assert.equal(storage.getItem(LEGACY_KEY), JSON.stringify(old));
});

test('dead or invalid prototype records cannot start a migrated life', () => {
  for (const change of [
    (old) => { old.hp = 0; },
    (old) => { old.hp = -1; },
    (old) => { old.status = 'dead'; },
    (old) => { old.seed = -1; },
    (old) => { old.seed = 1.5; },
    (old) => { old.unlocked = null; },
  ]) {
    const storage = memoryStorage(), old = oldLife(); change(old);
    storage.setItem(LEGACY_KEY, JSON.stringify(old));
    assert.equal(loadSave(storage), null);
  }
});

test('invalid current data never falls back to an older living record', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_KEY, JSON.stringify(oldLife()));
  for (const raw of ['{broken', JSON.stringify({ version: 2, status: 'alive' }), JSON.stringify({ version: 2, status: 'dead' })]) {
    storage.setItem(SAVE_KEY, raw);
    assert.equal(loadSave(storage), null);
  }
});

test('unavailable storage reports failure and does not throw', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  const life = createLife(28);
  assert.equal(loadSave(storage), null);
  assert.equal(writeLife(life, storage), false);
  assert.equal(endLife(life, storage), false);
  assert.equal(life.status, 'dead');
});

test('a blocked browser storage getter reports failure and does not throw', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const life = createLife(29);
    assert.equal(loadSave(), null);
    assert.equal(writeLife(life), false);
    assert.equal(endLife(life), false);
    assert.equal(life.status, 'dead');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
