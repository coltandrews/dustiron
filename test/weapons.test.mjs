import test from 'node:test';
import assert from 'node:assert/strict';
import { Gun, WEAPONS, STEADY_FACTOR, MIN_CONDITION } from '../src/weapons.js';
import { createLife, normalizeLife } from '../src/life.js';

const fields = ['ammo', 'cooldown', 'bloom', 'reloading', 'reloadT', 'reloadTotal', 'condition'];
function restore(gun, pool) {
  const life = createLife(41);
  life.guns.revolver = Object.fromEntries(fields.map((key) => [key, gun[key]]));
  life.ammo.pistol = pool.pistol;
  const saved = normalizeLife(JSON.parse(JSON.stringify(life)));
  return new Gun(WEAPONS.revolver, saved.guns.revolver, saved.ammo);
}

test('reloads add one round at a time and stop when the pool is empty', () => {
  const pool = { pistol: 2 }, gun = new Gun(WEAPONS.revolver, { ammo: 1 }, pool);
  assert.equal(gun.startReload(), true);
  assert.equal(gun.update(WEAPONS.revolver.reloadPerRound * 0.5), null);
  assert.equal(gun.ammo, 1);
  assert.equal(gun.update(WEAPONS.revolver.reloadPerRound * 0.6), 'round');
  assert.equal(gun.ammo, 2); assert.equal(pool.pistol, 1);
  assert.equal(gun.update(WEAPONS.revolver.reloadPerRound), 'done');
  assert.equal(gun.ammo, 3); assert.equal(pool.pistol, 0);
  assert.equal(gun.startReload(), false);
});

test('firing stops a reload and keeps the rounds already loaded', () => {
  const pool = { pistol: 10 }, gun = new Gun(WEAPONS.revolver, { ammo: 2 }, pool);
  gun.startReload();
  gun.update(WEAPONS.revolver.reloadPerRound + 0.01);
  assert.equal(gun.ammo, 3);
  gun.fire();
  assert.equal(gun.reloading, false);
  assert.equal(gun.ammo, 2);
  assert.equal(pool.pistol, 9);
});

test('guns of one ammo type share a pool', () => {
  const pool = { rifle: 10 };
  const a = new Gun(WEAPONS.repeater, { ammo: 0 }, pool), b = new Gun(WEAPONS.rifle, { ammo: 0 }, pool);
  a.startReload(); a.update(5);
  assert.equal(b.reserve, pool.rifle);
  assert.equal(a.ammo + pool.rifle, 10);
});

test('spread grows with movement, rapid fire and dirt, and a steady first shot is tighter', () => {
  const gun = new Gun(WEAPONS.revolver, {}, { pistol: 0 });
  const still = gun.spread(0, false), moving = gun.spread(1, false), steady = gun.spread(0, true);
  assert.ok(moving > still);
  assert.equal(steady, still * STEADY_FACTOR);
  gun.fire(); gun.cooldown = 0; gun.fire();
  assert.ok(gun.spread(0, false) > still);
  assert.equal(gun.spread(0, true), gun.spread(0, false), 'a bloomed gun gets no steady bonus');
  for (let i = 0; i < 2000; i++) { gun.ammo = 6; gun.cooldown = 0; gun.fire(); }
  assert.equal(gun.condition, MIN_CONDITION);
});

test('save and load during a reload cannot duplicate ammunition', () => {
  const pool = { pistol: 3 };
  let gun = new Gun(WEAPONS.revolver, { ammo: 1 }, pool);
  gun.startReload(); gun.update(0.5);
  const total = gun.ammo + pool.pistol;
  gun = restore(gun, pool);
  assert.equal(gun.ammo + gun.reserve, total);
  gun.update(10);
  assert.equal(gun.ammo + gun.reserve, total);
});
