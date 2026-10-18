import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_HALF, createLife, normalizeLife, discover, isDiscovered, purchase, acceptContract, recordTargetKill, claimContracts, work } from '../src/life.js';

test('one seed makes stable camps with distinct targets and safe travel distances', () => {
  const first = createLife(1234);
  assert.deepEqual(first, createLife(1234));
  assert.notDeepEqual(first.world.camps, createLife(1235).world.camps);
  assert.equal(new Set(first.world.camps.map((camp) => camp.targetId)).size, 3);
  for (const camp of first.world.camps) {
    const distance = Math.hypot(camp.x, camp.z);
    assert.ok(distance >= 89 && distance <= 161);
    assert.ok(Math.abs(camp.x) < WORLD_HALF && Math.abs(camp.z) < WORLD_HALF);
  }
});

test('a new life keeps no money, purchases, contracts, or discovered land', () => {
  const old = createLife(12);
  old.bounty = 999;
  purchase(old, 'rifle'); purchase(old, 'coat'); purchase(old, 'map');
  discover(old, 150, 150);
  acceptContract(old, 'camp-1');
  old.status = 'dead';
  const next = createLife(13);
  assert.equal(next.bounty, 0);
  assert.deepEqual(next.unlocked, ['revolver']);
  assert.equal(next.guns.revolver.ammo, 6);
  assert.equal(next.guns.revolver.reserve, 24);
  assert.equal(next.bandages, 1);
  assert.equal(next.hasMap, false); assert.equal(next.coat, false);
  assert.equal(next.contracts['camp-1'].status, 'offered');
  assert.equal(isDiscovered(next, 150, 150), false);
});

test('travel reveals nearby cells; a purchased map does not reveal unexplored land', () => {
  const life = createLife(1);
  assert.equal(isDiscovered(life, 0, 0), true);
  assert.equal(isDiscovered(life, 150, 150), false);
  life.bounty = 25;
  assert.equal(purchase(life, 'map').ok, true);
  assert.equal(isDiscovered(life, 150, 150), false);
  assert.equal(discover(life, 150, 150), true);
  assert.equal(isDiscovered(life, 150, 150), true);
  assert.equal(discover(life, 150, 150), false);
  assert.equal(discover(life, NaN, 0), false);
  discover(life, WORLD_HALF, WORLD_HALF);
  assert.equal(isDiscovered(life, WORLD_HALF, WORLD_HALF), true);
});

test('purchases are atomic, charge once for ownership, and supply the selected gun', () => {
  const life = createLife(2), before = structuredClone(life);
  assert.equal(purchase(life, 'shotgun').ok, false);
  assert.deepEqual(life, before);
  assert.equal(purchase(life, '__proto__').ok, false);
  life.bounty = 100;
  assert.equal(purchase(life, 'shotgun').ok, true);
  assert.equal(life.bounty, 30);
  assert.equal(purchase(life, 'shotgun').ok, false);
  assert.equal(life.bounty, 30);
  life.weapon = 1;
  const reserve = life.guns.shotgun.reserve;
  assert.equal(purchase(life, 'ammo').ok, true);
  assert.equal(life.guns.shotgun.reserve, reserve + 12);
  assert.equal(life.guns.revolver.reserve, 24);
  assert.equal(purchase(life, 'heal').ok, false);
  life.hp = 30;
  assert.equal(purchase(life, 'heal').ok, true);
  assert.equal(life.hp, 100);
});

test('bounty proof survives save/resume and can be paid only once', () => {
  let life = createLife(3);
  const camp = life.world.camps[0];
  assert.equal(acceptContract(life, camp.id).ok, true);
  assert.equal(recordTargetKill(life, camp.targetId), true);
  assert.equal(recordTargetKill(life, camp.targetId), false);
  life = normalizeLife(JSON.parse(JSON.stringify(life)));
  assert.equal(life.contracts[camp.id].status, 'proof');
  assert.deepEqual(claimContracts(life), { ok: true, message: `Collected $${camp.reward} for 1 bounty.`, count: 1, total: camp.reward });
  assert.equal(claimContracts(life).total, 0);
  assert.equal(life.bounty, camp.reward);
  assert.equal(acceptContract(life, camp.id).ok, false);
});

test('a target killed before acceptance can still satisfy its contract once', () => {
  const life = createLife(4), camp = life.world.camps[1];
  recordTargetKill(life, camp.targetId);
  assert.equal(life.contracts[camp.id].status, 'offered');
  assert.equal(claimContracts(life).total, 0);
  acceptContract(life, camp.id);
  assert.equal(life.contracts[camp.id].status, 'proof');
  assert.equal(claimContracts(life).total, camp.reward);
});

test('town transactions cannot be used from the wilderness or after death', () => {
  const life = createLife(5);
  life.bounty = 100; life.player.x = 100;
  assert.equal(purchase(life, 'bandage').ok, false);
  assert.equal(acceptContract(life, 'camp-1').ok, false);
  assert.equal(claimContracts(life).ok, false);
  assert.equal(work(life).ok, false);
  life.player.x = 0; life.status = 'dead'; life.hp = 0;
  assert.equal(purchase(life, 'bandage').ok, false);
  assert.equal(recordTargetKill(life, 'target-1'), false);
  assert.equal(normalizeLife(life).status, 'dead');
});

test('emergency work prevents an ammunition dead end without unlimited stock', () => {
  const life = createLife(6);
  assert.equal(work(life).ok, false);
  life.guns.revolver.ammo = 0; life.guns.revolver.reserve = 0;
  assert.equal(work(life).ok, true);
  assert.equal(life.guns.revolver.reserve, 12);
  assert.equal(work(life).ok, false);
  life.guns.revolver.reserve = 0; life.bounty = 6;
  assert.equal(work(life).ok, false);
  life.bounty = 5;
  assert.equal(work(life).ok, true);
});

test('load keeps actor deaths, damage, physics, gun reloads, and player movement state', () => {
  const life = createLife(7);
  life.player = { ...life.player, x: 88, z: -50, yaw: 2, sinceHit: 0.3, rollT: 0.2 };
  life.guns.revolver = { ammo: 2, reserve: 9, cooldown: -0.1, bloom: 0.3, reloading: true, reloadT: 0.5, reloadTotal: 1.4 };
  life.camps['camp-1'] = { cleared: false, enemies: [
    { id: 'enemy-1', alive: false, hp: -2, x: 80, z: -50, yaw: 1, ammo: 2, state: 'dead' },
    { id: 'enemy-2', alive: true, hp: 31, x: 81, z: -50, state: 'aim', aimT: 0.2, lastSeenT: -100 },
  ], props: [{ id: 'prop-1', alive: true, hp: null, x: 82, z: -50, ry: 1, fuse: -1,
    body: { position: { x: 82, y: 1, z: -50 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, velocity: { x: 1, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0.5, z: 0 } } }] };
  const saved = normalizeLife(life);
  assert.deepEqual(saved, life);
  saved.camps['camp-1'].enemies[1].hp = 1;
  assert.equal(life.camps['camp-1'].enemies[1].hp, 31);
});

test('load rejects old or invalid records without modifying them', () => {
  assert.equal(normalizeLife({ version: 1, seed: 1, unlocked: ['revolver'] }), null);
  for (const change of [
    (life) => { life.bounty = -1; },
    (life) => { life.hp = NaN; },
    (life) => { life.guns.revolver.reserve = -1; },
    (life) => { life.unlocked.push('unknown'); },
    (life) => { life.player.x = WORLD_HALF + 1; },
    (life) => { life.discovered['999:0'] = true; },
    (life) => { life.contracts['camp-1'].status = 'paid'; },
    (life) => { life.status = 'alive'; life.hp = 0; },
  ]) {
    const life = createLife(8); change(life);
    const before = structuredClone(life);
    assert.equal(normalizeLife(life), null);
    assert.deepEqual(life, before);
  }
  const life = createLife(8);
  life.world.camps[0].reward = 99999;
  assert.equal(normalizeLife(life).world.camps[0].reward, 90);
});

test('load preserves simulation time and all live projectiles up to the pool limit', () => {
  const life = createLife(9);
  life.simTime = 87.5;
  life.projectiles = Array.from({ length: 60 }, (_, i) => ({ x: i, z: 12, dx: 0.6, dz: 0.8, speed: 40, dmg: 10, left: 32.5 }));
  assert.deepEqual(normalizeLife(life), life);
  life.projectiles.push({ ...life.projectiles[0] });
  assert.equal(normalizeLife(life), null);
  for (const change of [
    (life) => { life.simTime = -1; },
    (life) => { life.projectiles[0].x = WORLD_HALF + 1; },
    (life) => { life.projectiles[0].dx = NaN; },
    (life) => { life.projectiles[0].dx = 0; life.projectiles[0].dz = 0; },
    (life) => { life.projectiles[0].speed = 0; },
    (life) => { life.projectiles[0].dmg = -10; },
    (life) => { life.projectiles[0].left = 0; },
    (life) => { life.projectiles[0].left = WORLD_HALF * 3; },
  ]) {
    const saved = createLife(9);
    saved.projectiles = [{ x: 5, z: 12, dx: 0, dz: 1, speed: 40, dmg: 10, left: 32.5 }];
    change(saved);
    assert.equal(normalizeLife(saved), null);
  }
});

test('load requires complete body state and a unit quaternion before physics restore', () => {
  const life = createLife(10);
  life.camps['camp-1'] = { cleared: false, enemies: [], props: [{ id: 'prop-1', alive: true, hp: 20, x: 90, z: 10, ry: 0, fuse: -1,
    body: { position: { x: 90, y: 1, z: 10 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } } }] };
  assert.deepEqual(normalizeLife(life), life);
  for (const change of [
    (body) => { delete body.velocity; },
    (body) => { delete body.angularVelocity.z; },
    (body) => { delete body.position.y; },
    (body) => { body.velocity.x = 'fast'; },
    (body) => { body.angularVelocity.y = Infinity; },
    (body) => { body.rotation.w = 0; },
    (body) => { body.rotation.x = 3; },
    (body) => { body.position.x = WORLD_HALF + 1; },
  ]) {
    const saved = structuredClone(life); change(saved.camps['camp-1'].props[0].body);
    assert.equal(normalizeLife(saved), null);
  }
});

test('load accepts elapsed negative cooldown but rejects an invalid active reload', () => {
  const life = createLife(11);
  life.guns.revolver.cooldown = -120;
  assert.notEqual(normalizeLife(life), null);
  for (const change of [
    (gun) => { gun.cooldown = 'ready'; },
    (gun) => { gun.reloading = true; gun.reloadTotal = 0; },
    (gun) => { gun.reloading = true; gun.ammo = 2; gun.reloadTotal = 1; gun.reloadT = 2; },
    (gun) => { gun.reloading = true; gun.ammo = 2; gun.reserve = 0; gun.reloadTotal = 1; },
    (gun) => { gun.reloadT = -1; },
  ]) {
    const saved = structuredClone(life); change(saved.guns.revolver);
    assert.equal(normalizeLife(saved), null);
  }
});
