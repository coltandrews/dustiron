import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics, initPhysics } from '../src/physics.js';
import { buildEncounters, captureEncounters, rebuildCampNav } from '../src/encounters.js';
import { createLife, normalizeLife } from '../src/life.js';
import { NavGrid } from '../src/nav.js';

await initPhysics();

function gameFor(t, run = createLife(1234)) {
  const game = {
    run, physics: new Physics(), levelGroup: new THREE.Group(),
    fx: { emit() {} }, audio: { at() {} }, debris: { spawn() {} },
    addTrauma() {}, spawnCorpse(mesh) { return { mesh }; },
    tokens: { holders: new Set(), release(enemy) { this.holders.delete(enemy); } },
  };
  t.after(() => game.physics.free());
  game.encounters = buildEncounters(game);
  return game;
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.0001, `${message}: ${actual} != ${expected}`);
}

function vectorNear(actual, expected, keys = ['x', 'y', 'z']) {
  for (const key of keys) near(actual[key], expected[key], key);
}

function savedLife(game) {
  captureEncounters(game);
  const saved = normalizeLife(JSON.parse(JSON.stringify(game.run)));
  assert.ok(saved, 'captured encounter state must pass the save validator');
  return saved;
}

test('camps place actors and navigation at their separate world positions', (t) => {
  const game = gameFor(t);
  assert.equal(game.encounters.length, 3);
  for (const camp of game.encounters) {
    assert.ok(Math.hypot(camp.x, camp.z) > 80);
    assert.ok(camp.enemies.length > 0);
    assert.ok(camp.props.length > 0);
    assert.ok(camp.props.filter((prop) => prop.kind === 'supply').length >= 2);
    for (const actor of [...camp.enemies, ...camp.props]) {
      assert.ok(Math.abs(actor.x - camp.x) <= 23, `${actor.id} x is outside its camp`);
      assert.ok(Math.abs(actor.z - camp.z) <= 23, `${actor.id} z is outside its camp`);
    }
    assert.equal(camp.nav.isFree(0, 0), false);
    const start = { x: camp.x - 25, z: camp.z - 25 };
    const goal = { x: camp.x + 25, z: camp.z - 25 };
    assert.equal(camp.nav.isFree(start.x, start.z), true);
    const path = camp.nav.findPath(start.x, start.z, goal.x, goal.z);
    assert.ok(path?.length);
    assert.deepEqual(path.at(-1), goal);
    assert.ok(camp.nav.lineFree(start.x, start.z, path[0].x, path[0].z));
    for (const enemy of camp.enemies) assert.equal(enemy.encounter, camp);
  }
});

test('dead enemies and broken props stay absent through repeated save and reload', (t) => {
  const first = gameFor(t), camp = first.encounters[0];
  const enemy = camp.enemies[1], prop = camp.props.find((item) => item.kind === 'crate');
  assert.ok(prop);
  enemy.hp = 0; enemy.die(1, 0, 1);
  prop.damage(1000, prop.x, 0.5, prop.z, 1, 0, 0);
  assert.equal(enemy.alive, false);
  assert.equal(prop.alive, false);
  const game = gameFor(t, savedLife(first));
  const restored = game.encounters.find((item) => item.id === camp.id);
  assert.equal(restored.enemies.some((item) => item.id === enemy.id), false);
  assert.equal(restored.props.some((item) => item.id === prop.id), false);
  assert.equal(restored.enemies.length, camp.enemies.length - 1);
  assert.equal(restored.props.length, camp.props.length - 1);
  const saved = savedLife(game);
  assert.equal(saved.camps[camp.id].enemies.find((item) => item.id === enemy.id).alive, false);
  assert.equal(saved.camps[camp.id].props.find((item) => item.id === prop.id).alive, false);
  const again = gameFor(t, saved).encounters.find((item) => item.id === camp.id);
  assert.equal(again.enemies.some((item) => item.id === enemy.id), false);
  assert.equal(again.props.some((item) => item.id === prop.id), false);
});

test('opened supply chests keep their state after save and reload', (t) => {
  const first = gameFor(t), camp = first.encounters[0];
  const chest = camp.props.find((prop) => prop.kind === 'supply');
  assert.ok(chest);
  assert.equal(chest.looted, false);
  chest.setLooted(true, true);
  const restored = gameFor(t, savedLife(first)).encounters.find((item) => item.id === camp.id);
  const after = restored.props.find((prop) => prop.id === chest.id);
  assert.ok(after);
  assert.equal(after.looted, true);
  assert.equal(after.lid.rotation.x, -1.15);
});

test('damaged props keep health, fuse, body transform, and motion on reload', (t) => {
  const first = gameFor(t), camp = first.encounters[1];
  const crate = camp.props.find((item) => item.kind === 'crate');
  const fence = camp.props.find((item) => item.kind === 'fence');
  const tnt = camp.props.find((item) => item.kind === 'tnt');
  assert.ok(crate && fence && tnt);
  crate.damage(13, crate.x, 0.5, crate.z, 0, 1, 0);
  fence.damage(7, fence.x, 0.5, fence.z, 0, 1, 0);
  tnt.fuse = 0.08;
  const position = { x: crate.x + 2.4, y: 1.3, z: crate.z - 1.7 };
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.7, -0.3));
  const velocity = { x: 0.3, y: -0.4, z: 0.6 }, angularVelocity = { x: 0.1, y: 0.2, z: 0.3 };
  crate.body.setTranslation(position, true); crate.body.setRotation(rotation, true);
  crate.body.setLinvel(velocity, true); crate.body.setAngvel(angularVelocity, true);
  const restored = gameFor(t, savedLife(first)).encounters.find((item) => item.id === camp.id);
  const after = restored.props.find((item) => item.id === crate.id);
  assert.equal(after.hp, crate.hp);
  assert.equal(restored.props.find((item) => item.id === fence.id).hp, fence.hp);
  assert.equal(restored.props.find((item) => item.id === tnt.id).fuse, tnt.fuse);
  vectorNear(after.body.translation(), position);
  vectorNear(after.body.rotation(), rotation, ['x', 'y', 'z', 'w']);
  vectorNear(after.body.linvel(), velocity);
  vectorNear(after.body.angvel(), angularVelocity);
  vectorNear(after.mesh.position, position);
  after.physObj.render(0);
  vectorNear(after.mesh.position, position);
});

test('bounty targets keep identity and combat state after reload', (t) => {
  const first = gameFor(t), targets = first.encounters.map((camp) => {
    const target = camp.enemies.find((enemy) => enemy.id === camp.targetId);
    assert.ok(target, `missing target for ${camp.id}`);
    target.hp -= 17; target.x += 1.2; target.z -= 0.8;
    target.yaw = 1.4; target.ammo = 1; target.state = 'aim'; target.aimT = 0.2;
    target.knows = true; target.cooldown = 0.4;
    return target;
  });
  const restored = gameFor(t, savedLife(first));
  for (let i = 0; i < targets.length; i++) {
    const before = targets[i], camp = restored.encounters[i];
    const after = camp.enemies.find((enemy) => enemy.id === before.id);
    assert.ok(after);
    assert.equal(after.id, camp.targetId);
    assert.equal(after.campId, camp.id);
    assert.equal(after.model.root.userData.targetName, camp.targetName);
    for (const key of ['hp', 'x', 'z', 'yaw', 'ammo', 'state', 'aimT', 'knows', 'cooldown']) assert.equal(after[key], before[key], key);
    vectorNear(after.body.translation(), { x: before.x, y: after.bodyY, z: before.z });
    assert.equal(restored.tokens.holders.has(after), true);
  }
});

test('navigation paths avoid static and moving obstacles at positive and negative origins', () => {
  for (const origin of [{ x: 111, z: -73 }, { x: -104, z: 126 }]) {
    const nav = new NavGrid(12, 0.5, 0.45, origin);
    nav.setStatic([{ x: origin.x, z: origin.z, hx: 1, hz: 4, ry: 0.2 }]);
    nav.rebuild([{ x: origin.x - 5, z: origin.z + 5, r: 0.7 }]);
    assert.equal(nav.isFree(origin.x, origin.z), false);
    assert.equal(nav.isFree(origin.x - 5, origin.z + 5), false);
    const start = { x: origin.x - 7, z: origin.z }, goal = { x: origin.x + 7, z: origin.z };
    const path = nav.findPath(start.x, start.z, goal.x, goal.z);
    assert.ok(path?.length > 1, 'the path must go around the wall');
    assert.deepEqual(path.at(-1), goal);
    let previous = start;
    for (const point of path) {
      assert.equal(nav.isFree(point.x, point.z), true);
      assert.equal(nav.lineFree(previous.x, previous.z, point.x, point.z), true);
      previous = point;
    }
    nav.rebuild([]);
    assert.equal(nav.isFree(origin.x - 5, origin.z + 5), true);
    assert.equal(nav.isFree(origin.x, origin.z), false);
  }
});

test('camp navigation removes broken fixed cover while keeping other obstacles', (t) => {
  const game = gameFor(t), camp = game.encounters[0];
  const fence = camp.props.find((item) => item.kind === 'fence');
  const tent = camp.props.find((item) => item.kind === 'tent');
  assert.ok(fence && tent);
  assert.equal(camp.nav.isFree(fence.x, fence.z), false);
  fence.damage(1000, fence.x, 0.5, fence.z, 0, 1, 0);
  rebuildCampNav(game.encounters);
  assert.equal(camp.nav.isFree(fence.x, fence.z), true);
  assert.equal(camp.nav.isFree(tent.x, tent.z), false);
});
