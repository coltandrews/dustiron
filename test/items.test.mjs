import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife } from '../src/life.js';
import { START_MONEY, buy, cannotBuy, useItem, ammoMax, CATALOGUE, priceOf } from '../src/items.js';

test('a new life starts poor: $15, a revolver, a few rounds, one bandage', () => {
  const life = createLife(5);
  assert.equal(life.bounty, START_MONEY);
  assert.deepEqual(life.unlocked, ['revolver']);
  assert.equal(life.items.bandage, 1);
  assert.ok(life.ammo.pistol > 0 && life.ammo.pistol <= 24);
  const basics = ['ammo-pistol', 'bandage', 'meal', 'coffee'].reduce((sum, id) => sum + CATALOGUE[id].price, 0) + CATALOGUE.map.price;
  assert.ok(basics > START_MONEY, 'cannot buy every basic supply at once');
});

test('purchases fail atomically with a clear reason', () => {
  const life = createLife(6), before = structuredClone(life);
  assert.match(cannotBuy(life, 'rifle'), /\$130/);
  assert.equal(buy(life, 'rifle').ok, false);
  assert.deepEqual(life, before);
  assert.equal(buy(life, '__proto__').ok, false);
  assert.equal(buy(life, 'bandage', 'guns').ok, false, 'shops sell only their own stock');
  assert.equal(buy(life, 'bandage', 'doctor').ok, true);
  assert.equal(life.items.bandage, 2);
});

test('carry limits hold for supplies and ammunition; the belt raises ammo limits', () => {
  const life = createLife(7);
  life.bounty = 1000;
  while (buy(life, 'bandage').ok);
  assert.equal(life.items.bandage, CATALOGUE.bandage.max);
  while (buy(life, 'ammo-pistol').ok);
  assert.equal(life.ammo.pistol, ammoMax(life, 'pistol'));
  buy(life, 'belt');
  assert.ok(ammoMax(life, 'pistol') > 48);
  assert.equal(buy(life, 'belt').ok, false);
});

test('the trail merchant charges more than town', () => {
  assert.ok(priceOf('bandage', 'merchant') > priceOf('bandage', 'doctor'));
});

test('food works only out of a fight; oil cleans every gun; horses are rented once', () => {
  const life = createLife(8);
  life.bounty = 500;
  buy(life, 'meal'); buy(life, 'oil'); buy(life, 'whiskey');
  assert.equal(useItem(life, 'meal', { inFight: true }).ok, false);
  assert.equal(useItem(life, 'meal').ok, true);
  assert.equal(life.mealHeal, 30);
  life.guns.revolver.condition = 0.7;
  assert.equal(useItem(life, 'oil').ok, true);
  assert.equal(life.guns.revolver.condition, 1);
  assert.equal(useItem(life, 'whiskey', { inFight: true }).ok, true);
  assert.equal(buy(life, 'rent').ok, true);
  assert.equal(buy(life, 'rent').ok, false);
  assert.equal(life.horse.owned, false);
});
