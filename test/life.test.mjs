import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_HALF, createLife, normalizeLife, migrateLife, discover, isDiscovered, work } from '../src/life.js';
import { buy } from '../src/items.js';
import { inRiver } from '../src/terrain.js';

test('one seed makes a stable world; another seed makes a different one', () => {
  const first = createLife(1234);
  assert.deepEqual(first, createLife(1234));
  assert.notDeepEqual(first.world.camps, createLife(1235).world.camps);
  for (const camp of first.world.camps) assert.ok(Math.abs(camp.x) < WORLD_HALF && Math.abs(camp.z) < WORLD_HALF);
});

test('places are spread out, off the river and away from town', () => {
  for (const seed of [1, 2, 3, 77, 1000]) {
    const { world } = createLife(seed);
    const all = [...world.camps, ...world.sites, ...world.ambushes];
    for (const place of all) {
      assert.ok(Math.hypot(place.x, place.z) > 45, `${place.id} too close to town`);
      assert.ok(!inRiver(place.x, place.z, 2), `${place.id} in the river`);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 20, `${all[i].id} and ${all[j].id} overlap`);
    }
  }
});

test('a new life keeps nothing from the last one', () => {
  const old = createLife(12);
  old.bounty = 999; buy(old, 'rifle'); buy(old, 'coat'); buy(old, 'map');
  discover(old, 150, 150);
  old.quests['bounty-camp-1'].status = 'turnedIn';
  const next = createLife(13);
  assert.equal(next.bounty, 15);
  assert.deepEqual(next.unlocked, ['revolver']);
  assert.equal(next.gear.map, false); assert.equal(next.gear.coat, false);
  assert.ok(Object.values(next.quests).every((q) => q.status === 'offered'));
  assert.equal(isDiscovered(next, 150, 150), false);
});

test('travel reveals land and names places found nearby', () => {
  const life = createLife(1);
  assert.equal(isDiscovered(life, 0, 0), true);
  const site = life.world.sites.find((s) => s.kind === 'landmark');
  discover(life, site.x, site.z);
  assert.equal(life.known[site.id], 'found');
  assert.ok(life.newlyFound.includes(site.name));
  assert.equal(discover(life, NaN, 0), false);
});

test('town work only helps a life with no money and almost no rounds', () => {
  const life = createLife(3);
  assert.equal(work(life).ok, false);
  life.bounty = 0; life.ammo.pistol = 0; life.guns.revolver.ammo = 0;
  assert.equal(work(life).ok, true);
  assert.equal(life.ammo.pistol, 12);
});

test('damaged or impossible saves are rejected', () => {
  const life = createLife(9);
  for (const change of [
    (l) => { l.hp = -1; }, (l) => { l.ammo.pistol = -3; }, (l) => { l.items.bandage = 1.5; },
    (l) => { l.quests['bounty-camp-1'].status = 'paidTwice'; }, (l) => { l.quests.fake = { status: 'active' }; },
    (l) => { l.unlocked.push('cannon'); }, (l) => { l.gear.map = 'yes'; }, (l) => { l.horse = { owned: 'maybe' }; },
  ]) {
    const copy = structuredClone(life); change(copy);
    assert.equal(normalizeLife(JSON.parse(JSON.stringify(copy))), null);
  }
  assert.notEqual(normalizeLife(JSON.parse(JSON.stringify(life))), null);
});

test('a version 2 save migrates: money, guns, map and paid bounties stay, other jobs restart', () => {
  const old = { version: 2, status: 'alive', seed: 42, camp: 1, bounty: 140, kills: 6, shots: 30, hits: 20, time: 300, damageTaken: 40,
    hp: 80, unlocked: ['revolver', 'shotgun'], weapon: 1, deadEye: 0.2, bandages: 3, hasMap: true, coat: false,
    player: { x: 0, z: 10 }, guns: { revolver: { ammo: 4, reserve: 20 }, shotgun: { ammo: 2, reserve: 8 } },
    discovered: {}, contracts: { 'camp-1': { status: 'paid', targetDead: true }, 'camp-2': { status: 'active', targetDead: false } }, camps: {} };
  const life = normalizeLife(old);
  assert.ok(life);
  assert.equal(life.version, 3);
  assert.equal(life.bounty, 140);
  assert.equal(life.items.bandage, 3);
  assert.equal(life.gear.map, true);
  assert.equal(life.ammo.pistol, 20); assert.equal(life.ammo.shells, 8);
  assert.equal(life.quests['bounty-camp-1'].status, 'turnedIn');
  assert.equal(life.quests['bounty-camp-2'].status, 'offered');
  assert.equal(migrateLife({ version: 9 }).version, 9);
});
