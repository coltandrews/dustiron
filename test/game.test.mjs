import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { CameraRig } from '../src/camera.js';
import { initPhysics } from '../src/physics.js';
import { loadSave, SAVE_KEY } from '../src/storage.js';
import { CATALOGUE } from '../src/life.js';

await initPhysics();

function makeGame(t) {
  const oldDocument = globalThis.document, oldStorage = globalThis.localStorage;
  const context = {
    createRadialGradient() { return { addColorStop() {} }; },
    fillRect() {}, strokeRect() {}, fillText() {},
  };
  const canvas = () => ({ width: 0, height: 0, getContext: () => context });
  const elements = new Map();
  globalThis.document = {
    createElement: canvas,
    getElementById(id) { if (!elements.has(id)) elements.set(id, canvas()); return elements.get(id); },
  };
  const records = new Map();
  globalThis.localStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, String(value)),
    removeItem: (key) => records.delete(key),
  };
  const ui = {
    el: { app: { classList: { remove() {}, toggle() {} } } },
    show(screen) { this.screen = screen; }, toast() {}, setContinue() {}, setSaveStatus() {}, hitMarker() {}, hurt() {}, update() {}, showDead() {},
    showInteraction(menu, action) { this.menu = menu; this.action = action; },
  };
  const audio = { setDeadEye() {}, setAmbience() {}, play() {}, at() {}, setListener() {} };
  const input = { clear() {}, pressed: () => false, held: () => false, takeWheel: () => 0,
    moveAxis: () => ({ x: 0, z: 0 }), mouse: { ndcX: 0, ndcY: 0 } };
  const render = { scene: new THREE.Scene(), flash: new THREE.PointLight(), focusShadow() {}, renderer: { render() {} } };
  const game = new Game({ render, rig: new CameraRig(), input, audio, ui });
  t.after(() => {
    game.unload();
    globalThis.document = oldDocument;
    globalThis.localStorage = oldStorage;
  });
  return game;
}

function startLife(game, random = 0.12345) {
  const original = Math.random;
  Math.random = () => random;
  try { game.newRun(); } finally { Math.random = original; }
}

function place(game, x, z) {
  const p = game.player;
  p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0;
  p.body.setTranslation({ x, y: p.bodyY, z }, true);
}

function openAt(game, point) {
  place(game, point.x, point.z);
  game.townActions.open();
  assert.equal(game.state, 'interaction');
  assert.equal(game.townActions.current.id, point.id);
}

function enterStore(game, id) {
  assert.equal(game.frontier.enter(id), true);
  assert.equal(game.frontier.inside, true);
  assert.equal(game.run.interior.id, id);
  return game.frontier.rooms.get(id).points.find((point) => point.id === `${id}-keeper`);
}

function choose(game, id) {
  const action = game.ui.menu.actions.find((item) => item.id === id);
  assert.ok(action, `menu has no ${id} action`);
  assert.equal(Boolean(action.disabled), false, `${id} is disabled`);
  game.ui.action(id);
}

function close(game) { game.townActions.close(); assert.equal(game.state, 'playing'); }

test('a new world saves, town protects the player, and travel uses finite ammunition', (t) => {
  const game = makeGame(t);
  startLife(game);
  assert.equal(game.state, 'playing');
  assert.equal(game.inTown(), true);
  const initialSave = loadSave();
  assert.ok(initialSave);
  assert.equal(initialSave.seed, game.run.seed);
  assert.equal(initialSave.camps['camp-1'].enemies.length, game.encounters[0].enemies.length);
  const p = game.player, gun = p.gun;
  game.intent.fireHeld = game.intent.firePressed = true;
  p.tick(1 / 60, 1 / 60, game.intent);
  assert.equal(gun.ammo, 6);
  assert.equal(p.damage(25, 1, 0), false);
  assert.equal(p.hp, 100);
  game.intent.fireHeld = game.intent.firePressed = false;
  place(game, 0, 40);
  assert.equal(game.inTown(), false);
  assert.equal(p.damage(25, 1, 0), true);
  assert.equal(p.hp, 75);
  game.intent.aim = new THREE.Vector3(0, 1, 55);
  const shots = game.run.shots;
  game.intent.firePressed = true;
  p.tick(1 / 60, 1 / 60, game.intent);
  assert.equal(gun.ammo, 5);
  assert.equal(game.run.shots, shots + 1);
  assert.equal(gun.startReload(), true);
  const reserve = gun.reserve;
  assert.equal(gun.update(gun.reloadTotal), true);
  assert.equal(gun.ammo, 6);
  assert.equal(gun.reserve, reserve - 1);
  game.save();
  const save = loadSave();
  assert.ok(save);
  game.continueRun(save);
  assert.equal(game.player.hp, 75);
  assert.equal(game.player.gun.ammo, 6);
  assert.equal(game.player.gun.reserve, reserve - 1);
  assert.ok(Math.abs(game.player.x) < 0.01);
  assert.ok(Math.abs(game.player.z - save.player.z) < 0.01);
  game.tick(1 / 60, 1 / 60);
  game.frame(1 / 60, 0.5);
});

test('bounty, shopping, save, death, and a new life share one consistent record', (t) => {
  const game = makeGame(t);
  startLife(game, 0.23456);
  const camp = game.encounters[0], targetId = camp.targetId;
  openAt(game, game.frontier.npcs.find((npc) => npc.id === 'martha'));
  choose(game, `accept:${camp.id}`);
  assert.equal(game.run.contracts[camp.id].status, 'active');
  close(game);
  const target = camp.enemies.find((enemy) => enemy.id === targetId);
  place(game, target.x + 4, target.z + 4);
  game.player.damage(38, 1, 0);
  game.player.gun.ammo = 2; game.player.gun.reserve = 9;
  const hit = target.onHit(1000, 1, 0, 1);
  assert.equal(hit.killed, true);
  game.onEnemyKilled(target, hit.crit);
  assert.equal(game.run.contracts[camp.id].status, 'proof');
  assert.equal(game.run.bounty, 0);
  const saved = loadSave();
  assert.ok(saved);
  game.continueRun(saved);
  assert.equal(game.player.hp, 62);
  assert.equal(game.player.gun.ammo, 2);
  assert.equal(game.player.gun.reserve, 9);
  assert.equal(game.enemies.some((enemy) => enemy.id === targetId), false);
  assert.equal(game.run.contracts[camp.id].status, 'proof');

  openAt(game, enterStore(game, 'sheriff'));
  choose(game, 'claim');
  assert.equal(game.run.bounty, camp.reward);
  const paid = game.run.bounty;
  game.townActions.act('claim');
  assert.equal(game.run.bounty, paid);
  assert.equal(game.run.contracts[camp.id].status, 'paid');
  close(game);
  game.frontier.exit();

  openAt(game, enterStore(game, 'guns'));
  assert.equal(game.ui.menu.actions.find((item) => item.id === 'buy:shotgun').itemId, 'shotgun');
  choose(game, 'buy:shotgun');
  assert.equal(game.run.bounty, paid - CATALOGUE.shotgun.price);
  assert.equal(game.player.guns.length, 2);
  assert.equal(game.player.guns[0].ammo, 2);
  assert.equal(game.player.guns[0].reserve, 9);
  close(game);
  game.frontier.exit();
  game.player.switchTo(1);
  const shotgun = game.player.gun;
  shotgun.ammo = 1; shotgun.reserve = 4;
  openAt(game, enterStore(game, 'doctor'));
  choose(game, 'buy:heal');
  assert.equal(game.player.hp, 100);
  assert.equal(game.player.gunIndex, 1);
  assert.equal(game.player.gun.ammo, 1);
  assert.equal(game.player.gun.reserve, 4);
  assert.equal(game.player.guns[0].ammo, 2);
  assert.equal(game.player.guns[0].reserve, 9);
  close(game);
  const shoppingSave = loadSave();
  assert.ok(shoppingSave);
  assert.equal(shoppingSave.contracts[camp.id].status, 'paid');
  assert.equal(shoppingSave.guns.shotgun.ammo, 1);

  const oldSeed = game.run.seed;
  game.frontier.exit();
  place(game, 0, 40);
  game.player.damage(1000, 1, 0);
  assert.equal(game.state, 'dying');
  assert.equal(game.run.status, 'dead');
  assert.equal(loadSave(), null);
  assert.equal(JSON.parse(localStorage.getItem(SAVE_KEY)).status, 'dead');
  game.save();
  assert.equal(loadSave(), null);
  startLife(game, 0.34567);
  assert.notEqual(game.run.seed, oldSeed);
  assert.equal(game.run.status, 'alive');
  assert.equal(game.run.bounty, 0);
  assert.equal(game.player.hp, 100);
  assert.deepEqual(game.run.unlocked, ['revolver']);
  assert.equal(game.player.guns.length, 1);
  assert.equal(game.player.gun.ammo, 6);
  assert.equal(game.player.gun.reserve, 24);
  assert.equal(game.run.contracts[camp.id].status, 'offered');
  assert.equal(game.enemies.some((enemy) => enemy.id === targetId), true);
  assert.ok(loadSave());
});

test('clearing one camp does not end the world or count the camp twice', (t) => {
  const game = makeGame(t);
  startLife(game, 0.45678);
  const camp = game.encounters[1], other = game.encounters[2];
  for (const enemy of camp.enemies) {
    place(game, enemy.x + 3, enemy.z + 3);
    const hit = enemy.onHit(1000, 1, 0, 1);
    assert.equal(hit.killed, true);
    game.onEnemyKilled(enemy, hit.crit);
  }
  assert.equal(game.state, 'playing');
  assert.equal(game.run.camp, 1);
  assert.equal(game.run.camps[camp.id].cleared, true);
  assert.equal(other.enemies.every((enemy) => enemy.alive), true);
  const save = loadSave();
  assert.ok(save);
  game.continueRun(save);
  assert.equal(game.encounters.find((item) => item.id === camp.id).enemies.length, 0);
  assert.equal(game.run.camp, 1);
  game.tick(1 / 60, 1 / 60);
  assert.equal(game.run.camp, 1);
});

test('store doors, room saves, seats, and the walk-out exit keep one player state', (t) => {
  const game = makeGame(t);
  startLife(game, 0.56789);
  const site = game.frontier.sites.find((item) => item.id === 'saloon');
  place(game, site.x, site.z);
  game.frontier.tick(1 / 60);
  assert.equal(game.frontier.inside, true);
  assert.equal(game.locationName, 'Mercy Crossing');
  const room = game.frontier.rooms.get('saloon');
  const blackjack = room.points.find((point) => point.id === 'blackjack');
  place(game, blackjack.x, blackjack.z);
  assert.equal(game.townActions.nearest().id, 'blackjack');
  const seat = room.points.find((point) => point.kind === 'seat');
  assert.equal(game.frontier.sit(seat), true);
  assert.equal(game.frontier.seated, seat);
  game.player.render(1, 1 / 60);
  assert.ok(game.player.model.body.position.y < -0.9);
  game.frontier.beforePlayer({ move: { x: 1, z: 0 } });
  assert.equal(game.frontier.seated, null);
  game.player.rollT = 0.1;
  game.player.render(1, 1 / 60);
  assert.ok(Math.abs(game.player.model.pivot.rotation.x) > 1);
  assert.ok(game.player.model.body.position.y < -0.7);
  game.player.rollT = -1;
  game.save();
  const saved = loadSave();
  assert.equal(saved.interior.id, 'saloon');
  game.continueRun(saved);
  assert.equal(game.frontier.inside, true);
  assert.equal(game.frontier.locationLabel(), 'The Last Drop');
  const restored = game.frontier.rooms.get('saloon');
  place(game, restored.center.x, restored.center.z + 7.1);
  game.frontier.tick(1);
  assert.equal(game.frontier.inside, false);
  assert.equal(game.run.interior, null);
  assert.ok(Math.abs(game.player.x - site.outsideX) < 0.01);
});
