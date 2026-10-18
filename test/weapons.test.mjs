import test from 'node:test';
import assert from 'node:assert/strict';
import { Gun, WEAPONS } from '../src/weapons.js';
import { createLife, normalizeLife } from '../src/life.js';

const savedFields = ['ammo', 'reserve', 'cooldown', 'bloom', 'reloading', 'reloadT', 'reloadTotal'];
function restore(gun) {
  const life = createLife(41);
  life.guns.revolver = Object.fromEntries(savedFields.map((key) => [key, gun[key]]));
  const saved = normalizeLife(JSON.parse(JSON.stringify(life))).guns.revolver;
  return Object.assign(new Gun(WEAPONS.revolver, saved.ammo, saved.reserve), saved);
}

test('a partial reload only loads rounds that exist in the reserve', () => {
  const gun = new Gun(WEAPONS.revolver, 1, 2);
  assert.equal(gun.startReload(), true);
  assert.equal(gun.reloadTotal, WEAPONS.revolver.reloadPerRound * 2);
  assert.equal(gun.update(gun.reloadTotal / 2), false);
  assert.equal(gun.ammo, 1);
  assert.equal(gun.reserve, 2);
  assert.equal(gun.update(gun.reloadTotal), true);
  assert.equal(gun.ammo, 3);
  assert.equal(gun.reserve, 0);
  assert.equal(gun.startReload(), false);
  assert.equal(gun.update(20), false);
  assert.equal(gun.ammo, 3);
});

test('empty reserves and full magazines cannot start a reload', () => {
  const empty = new Gun(WEAPONS.revolver, 0, 0);
  assert.equal(empty.startReload(), false);
  assert.equal(empty.canFire(), false);
  assert.equal(empty.update(10), false);
  assert.equal(empty.ammo, 0);
  const full = new Gun(WEAPONS.revolver, WEAPONS.revolver.mag, 4);
  assert.equal(full.startReload(), false);
  assert.equal(full.reserve, 4);
});

test('firing during a reload cancels it without adding or removing reserve rounds', () => {
  const gun = new Gun(WEAPONS.revolver, 2, 9);
  gun.startReload();
  gun.update(0.4);
  assert.equal(gun.canFire(), true);
  gun.fire();
  assert.equal(gun.reloading, false);
  assert.equal(gun.ammo, 1);
  assert.equal(gun.reserve, 9);
  gun.update(5);
  assert.equal(gun.ammo, 1);
  assert.equal(gun.reserve, 9);
  assert.equal(gun.startReload(), true);
  gun.update(gun.reloadTotal);
  assert.equal(gun.ammo, 6);
  assert.equal(gun.reserve, 4);
});

test('save and restore during a reload cannot refill or duplicate ammunition', () => {
  let gun = new Gun(WEAPONS.revolver, 1, 3);
  gun.startReload();
  gun.update(0.5);
  const total = gun.ammo + gun.reserve;
  gun = restore(gun);
  assert.equal(gun.reloading, true);
  assert.equal(gun.reloadT, 0.5);
  assert.equal(gun.ammo, 1);
  assert.equal(gun.reserve, 3);
  gun = restore(gun);
  assert.equal(gun.ammo + gun.reserve, total);
  assert.equal(gun.update(gun.reloadTotal - gun.reloadT + 0.001), true);
  assert.equal(gun.ammo, 4);
  assert.equal(gun.reserve, 0);
  assert.equal(gun.ammo + gun.reserve, total);
  gun = restore(gun);
  gun.update(5);
  assert.equal(gun.ammo, 4);
  assert.equal(gun.reserve, 0);
  gun.fire();
  gun = restore(gun);
  assert.equal(gun.ammo + gun.reserve, total - 1);
});
