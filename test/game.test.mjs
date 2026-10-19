import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { CameraRig } from '../src/camera.js';
import { initPhysics } from '../src/physics.js';
import { loadSave, SAVE_KEY } from '../src/storage.js';
import { CATALOGUE, START_MONEY, START_ROUNDS } from '../src/items.js';

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
    questNote(text) { this.notes = [...(this.notes ?? []), text]; }, setTip() {}, emptyClick() {}, showJournal() {},
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
  assert.equal(gun.update(gun.def.reloadPerRound + 0.001), 'done');
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

test('camp supply chests give money and selected-gun ammunition one time', (t) => {
  const game = makeGame(t);
  startLife(game, 0.19876);
  const camp = game.encounters[0];
  const chest = camp.props.find((prop) => prop.kind === 'supply');
  assert.ok(chest);
  place(game, chest.x, chest.z);
  assert.equal(game.nearestLoot(), chest);
  assert.equal(game.lootHint(), 'Press [E] to Loot Supplies');
  const money = game.run.bounty, reserve = game.player.gun.reserve;
  assert.equal(game.lootNearest(), true);
  assert.equal(game.run.bounty, money + chest.lootMoney);
  assert.equal(game.player.gun.reserve, reserve + chest.lootAmmo);
  assert.equal(game.nearestLoot(), null);
  assert.equal(game.lootNearest(), false);
  assert.equal(game.run.bounty, money + chest.lootMoney);
  assert.equal(game.player.gun.reserve, reserve + chest.lootAmmo);

  const saved = loadSave();
  assert.ok(saved);
  assert.equal(saved.camps[camp.id].props.find((prop) => prop.id === chest.id).looted, true);
  game.continueRun(saved);
  const restored = game.encounters.find((item) => item.id === camp.id).props.find((prop) => prop.id === chest.id);
  assert.ok(restored);
  assert.equal(restored.looted, true);
});

test('a bounty runs from the wanted board to proof, payment, shopping, death and a new life', (t) => {
  const game = makeGame(t);
  startLife(game, 0.23456);
  assert.equal(game.run.bounty, START_MONEY);
  const camp = game.encounters[0], targetId = camp.targetId, jobId = `bounty-${camp.id}`;
  const def = game.questDefs.find((q) => q.id === jobId);
  assert.equal(def.want, 'either');
  openAt(game, enterStore(game, 'sheriff'));
  choose(game, 'posters');
  choose(game, `offer:${jobId}`);
  choose(game, `accept:${jobId}`);
  assert.equal(game.run.quests[jobId].status, 'active');
  close(game);
  game.frontier.exit();
  const target = camp.enemies.find((enemy) => enemy.id === targetId);
  place(game, target.x + 4, target.z + 4);
  game.player.damage(38, 1, 0);
  const hit = target.onHit(1000, 1, 0, 1);
  assert.equal(hit.killed, true);
  assert.equal(game.corpses.length, 6);
  game.onEnemyKilled(target, hit.crit);
  assert.equal(game.run.quests[jobId].status, 'active', 'proof is still on the body');
  const proof = game.worldPoints.proofs.find((p) => p.enemy === target);
  assert.ok(proof);
  place(game, proof.x, proof.z);
  game.townActions.open();
  assert.equal(game.run.quests[jobId].status, 'complete');
  assert.equal(game.run.bounty, START_MONEY, 'no pay until turn-in');
  const saved = loadSave();
  game.continueRun(saved);
  assert.equal(game.player.hp, 62);
  assert.equal(game.enemies.some((enemy) => enemy.id === targetId), false);
  assert.equal(game.run.quests[jobId].status, 'complete');

  openAt(game, enterStore(game, 'sheriff'));
  choose(game, `turnin:${jobId}`);
  assert.equal(game.run.bounty, START_MONEY + def.reward.money);
  assert.equal(game.ui.menu.actions.some((item) => item.id === `turnin:${jobId}`), false, 'paid once');
  game.townActions.act(`turnin:${jobId}`);
  assert.equal(game.run.bounty, START_MONEY + def.reward.money);
  close(game);
  game.frontier.exit();

  game.run.bounty = 200;
  game.player.gun.ammo = 2;
  const pistol = game.run.ammo.pistol;
  openAt(game, enterStore(game, 'guns'));
  assert.equal(game.ui.menu.mode, 'talk');
  assert.ok(game.ui.menu.actions.some((item) => item.id === 'browse'));
  assert.equal(game.ui.menu.actions.some((item) => item.id.startsWith('buy:')), false);
  choose(game, 'browse');
  assert.equal(game.ui.menu.mode, 'shop');
  assert.equal(game.ui.menu.actions.find((item) => item.id === 'buy:shotgun').label, CATALOGUE.shotgun.name);
  assert.equal(game.ui.menu.actions.find((item) => item.id === 'buy:shotgun').price, `$${CATALOGUE.shotgun.price}`);
  choose(game, 'buy:shotgun');
  assert.equal(game.run.bounty, 200 - CATALOGUE.shotgun.price);
  assert.equal(game.player.guns.length, 2);
  assert.equal(game.player.guns[0].ammo, 2);
  choose(game, 'buy:ammo-shells');
  assert.equal(game.run.ammo.shells, 8);
  assert.equal(game.run.ammo.pistol, pistol);
  close(game);
  game.frontier.exit();
  openAt(game, enterStore(game, 'doctor'));
  choose(game, 'browse');
  choose(game, 'buy:heal');
  assert.equal(game.player.hp, 100);
  close(game);
  assert.equal(loadSave().quests[jobId].status, 'turnedIn');

  const oldSeed = game.run.seed;
  game.frontier.exit();
  place(game, 0, 40);
  game.player.damage(1000, 1, 0);
  assert.equal(game.state, 'dying');
  assert.equal(game.run.status, 'dead');
  assert.equal(loadSave(), null);
  assert.equal(JSON.parse(localStorage.getItem(SAVE_KEY)).status, 'dead');
  startLife(game, 0.34567);
  assert.notEqual(game.run.seed, oldSeed);
  assert.equal(game.run.bounty, START_MONEY);
  assert.deepEqual(game.run.unlocked, ['revolver']);
  assert.equal(game.player.gun.reserve, START_ROUNDS);
  assert.ok(Object.values(game.run.quests).every((q) => q.status === 'offered'));
  assert.ok(loadSave());
});

test('a wounded wanted target surrenders, follows and is jailed for the live reward', (t) => {
  const game = makeGame(t);
  startLife(game, 0.6789);
  const camp = game.encounters[0], jobId = `bounty-${camp.id}`, def = game.questDefs.find((q) => q.id === jobId);
  game.run.quests[jobId].status = 'active';
  const target = camp.enemies.find((e) => e.id === camp.targetId);
  place(game, target.x + 3, target.z + 3);
  target.knows = true;
  const hit = target.onHit(target.hp - 10, 1, 0, 1);
  assert.equal(hit.killed, false);
  assert.equal(target.surrendered, true);
  const point = game.townActions.points().find((p) => p.kind === 'restrain');
  assert.ok(point);
  place(game, point.x, point.z);
  game.townActions.open();
  assert.equal(target.captive, true);
  place(game, 0, 20);
  for (let i = 0; i < 5; i++) target.tick(1 / 60);
  assert.equal(target.jailed, true);
  assert.equal(game.run.quests[jobId].status, 'complete');
  openAt(game, enterStore(game, 'sheriff'));
  choose(game, `turnin:${jobId}`);
  assert.equal(game.run.bounty, START_MONEY + def.aliveReward);
});

test('bandages take time and a hard hit stops them', (t) => {
  const game = makeGame(t);
  startLife(game, 0.789);
  place(game, 0, 60);
  const p = game.player;
  p.damage(50, 1, 0);
  p.startBandage();
  assert.equal(p.bandaging, true);
  p.damage(10, 1, 0);
  assert.equal(p.bandaging, false);
  assert.equal(game.run.items.bandage, 1, 'an interrupted bandage is not used up');
  p.startBandage();
  for (let i = 0; i < 120; i++) p.tick(1 / 60, 1 / 60, game.intent);
  assert.equal(game.run.items.bandage, 0);
  assert.ok(p.hp > 40);
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
  assert.equal(game.frontier.inside, false);
  assert.equal(game.townActions.nearest().kind, 'door');
  assert.equal(game.townActions.hint(), 'Press [E] to Enter');
  game.townActions.open();
  assert.equal(game.frontier.inside, true);
  assert.equal(game.locationName, 'Mercy Crossing');
  const room = game.frontier.rooms.get('saloon');
  const blackjack = room.points.find((point) => point.kind === 'blackjack');
  place(game, blackjack.x, blackjack.z);
  assert.equal(game.townActions.nearest().kind, 'blackjack');
  game.townActions.open();
  assert.equal(game.state, 'interaction');
  assert.equal(game.frontier.seated, blackjack);
  assert.equal(game.rig.targetDistance, 14);
  game.townActions.close();
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

test('holding interact dismounts a horse and releasing it cancels the hold', (t) => {
  const game = makeGame(t);
  startLife(game, 0.34567);
  game.run.horse = { owned: false, stamina: 0.7, away: false };
  game.spawnHorse();
  game.horse.mount();

  let held = true;
  game.input.held = (action) => action === 'interact' && held;
  game.updateIntent();
  game.realTime = 0.4;
  game.updateIntent();
  assert.equal(game.horse.mounted, true);

  held = false;
  game.updateIntent();
  assert.equal(game.horse.dismountHoldStart, null);

  held = true;
  game.realTime = 1;
  game.updateIntent();
  game.realTime = 1.64;
  game.updateIntent();
  assert.equal(game.horse.mounted, true);
  game.realTime = 1.66;
  game.updateIntent();
  assert.equal(game.horse.mounted, false);
  assert.equal(game.rig.ride, 0);
});
