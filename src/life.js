// Saved data for one life. This module has no browser state.
// Version 3 adds ammo pools, carried supplies, gear, horses, quests and known places.
import { createRng } from './rng.js';
import { WEAPONS } from './weapons.js';
import { emptyBlackjack, validBlackjack } from './blackjack.js';
import { CATALOGUE, START_MONEY, START_ROUNDS, AMMO, PELTS } from './items.js';
import { makeAmbushes, makeCamps, makeSites, makeTowns, makeWanted } from './world-gen.js';
import { emptyQuestState, makeQuests, validQuestState } from './quests.js';

export const WORLD_HALF = 420;
export const MAP_CELL = 16;
export const LIFE_VERSION = 3;
const STAT_KEYS = ['camp', 'bounty', 'kills', 'shots', 'hits', 'time', 'damageTaken'];
const INTERIOR_IDS = new Set(['guns', 'doctor', 'sheriff', 'maps', 'clothes', 'saloon', 'stable']);
const ITEM_KEYS = ['bandage', 'meal', 'coffee', 'whiskey', 'oil', 'feed', 'beer', 'cigarette', 'cigar', ...Object.keys(PELTS)];
const GEAR_KEYS = ['belt', 'coat', 'map'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const position = (value) => object(value) && Number.isFinite(value.x) && Number.isFinite(value.z)
  && Math.abs(value.x) <= WORLD_HALF && Math.abs(value.z) <= WORLD_HALF;
const vector = (value) => object(value) && ['x', 'y', 'z'].every((key) => Number.isFinite(value[key]));

export function gunState(key) {
  return { ammo: WEAPONS[key].mag, cooldown: 0, bloom: 0, reloading: false, reloadT: 0, reloadTotal: 0, condition: 1 };
}

/** The world is rebuilt from the seed on every load, so saves stay small. */
export function makeWorld(seed) {
  const camps = makeCamps(seed, WORLD_HALF), sites = makeSites(seed, WORLD_HALF, camps);
  const ambushes = makeAmbushes(seed, WORLD_HALF, camps, sites);
  const towns = makeTowns();
  return { seed, half: WORLD_HALF, town: towns[0], towns, camps, ambushes, sites, wanted: makeWanted(seed, camps),
    roads: camps.map(({ x, z }) => ({ from: { x: 0, z: 0 }, to: { x, z } })) };
}

/** Every quest definition for a world. */
export function questDefs(world) { return makeQuests(world); }

/**
 * A fresh life. Offline, every life gets its own world from its seed. On a
 * shared server every life uses the server's world seed instead.
 */
export function createLife(seed, worldSeed = seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid life seed');
  if (!Number.isInteger(worldSeed) || worldSeed < 0 || worldSeed > 0xffffffff) throw new RangeError('Invalid world seed');
  const world = makeWorld(worldSeed);
  const life = {
    version: LIFE_VERSION, status: 'alive', seed, worldSeed, camp: 0, bounty: START_MONEY, kills: 0, shots: 0, hits: 0, time: 0, damageTaken: 0,
    simTime: 0, projectiles: [],
    hp: 100, unlocked: ['revolver'], weapon: 0, deadEye: 0,
    ammo: { pistol: START_ROUNDS, heavy: 0, rifle: 0, shells: 0 },
    items: Object.fromEntries(ITEM_KEYS.map((key) => [key, key === 'bandage' ? 1 : 0])), drunk: 0,
    gear: { belt: false, coat: false, map: false }, horse: null, effects: {}, mealHeal: 0,
    interior: null, blackjack: emptyBlackjack(),
    player: { x: 0, z: 12, yaw: 0, sinceHit: 99, rollT: -1, rollCooldown: 0, rollX: 0, rollZ: 1 },
    guns: { revolver: gunState('revolver') }, discovered: {}, known: {}, marker: null,
    world, quests: emptyQuestState(questDefs(world)), questFlags: {}, met: {}, rumors: [], tips: {}, completed: 0,
    camps: Object.fromEntries([...world.camps, ...world.ambushes].map(({ id }) => [id, {}])),
  };
  reveal(life, 0, 0, life.world.town.radius + MAP_CELL);
  return life;
}

function cellKey(x, z) {
  return `${Math.floor((x + WORLD_HALF) / MAP_CELL)}:${Math.floor((z + WORLD_HALF) / MAP_CELL)}`;
}

function reveal(life, x, z, radius) {
  let changed = false;
  const edge = Math.ceil(WORLD_HALF * 2 / MAP_CELL) - 1;
  const cx = Math.floor((x + WORLD_HALF) / MAP_CELL), cz = Math.floor((z + WORLD_HALF) / MAP_CELL);
  const steps = Math.ceil(radius / MAP_CELL);
  for (let iz = Math.max(0, cz - steps); iz <= Math.min(edge, cz + steps); iz++) {
    for (let ix = Math.max(0, cx - steps); ix <= Math.min(edge, cx + steps); ix++) {
      const px = -WORLD_HALF + (ix + 0.5) * MAP_CELL, pz = -WORLD_HALF + (iz + 0.5) * MAP_CELL;
      if (Math.hypot(px - x, pz - z) > radius + MAP_CELL / 2) continue;
      const key = `${ix}:${iz}`;
      if (!life.discovered[key]) { life.discovered[key] = true; changed = true; }
    }
  }
  return changed;
}

/** Reveals land near a point. Returns the names of places found for the first time. */
export function discover(life, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return false;
  const changed = reveal(life, x, z, 24);
  if (changed && life.world.sites) {
    for (const site of life.world.sites) {
      if ((life.known[site.id] && life.known[site.id] !== 'rumor') || site.kind === 'cache' || Math.hypot(site.x - x, site.z - z) > 30) continue;
      life.known[site.id] = 'found';
      (life.newlyFound ??= []).push(site.name);
    }
  }
  return changed;
}

export function isDiscovered(life, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return false;
  return life.discovered[cellKey(Math.min(x, WORLD_HALF - 0.001), Math.min(z, WORLD_HALF - 0.001))] === true;
}

function validJson(value, depth = 0) {
  if (depth > 12) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!object(value) && !Array.isArray(value)) return false;
  return Object.values(value).every((item) => validJson(item, depth + 1));
}

function validActors(actors, props) {
  if (!Array.isArray(actors)) return false;
  const ids = new Set();
  return actors.every((actor) => {
    if (!position(actor) || typeof actor.alive !== 'boolean' || (typeof actor.id !== 'string' && !count(actor.id)) || ids.has(actor.id)) return false;
    ids.add(actor.id);
    if (!(Number.isFinite(actor.hp) || (props && actor.hp === null))) return false;
    if (actor.alive && actor.hp !== null && actor.hp <= 0) return false;
    if (props && actor.looted !== undefined && typeof actor.looted !== 'boolean') return false;
    return actor.body === undefined || validBody(actor.body);
  });
}

function validBody(body) {
  if (!object(body) || !position(body.position) || !vector(body.position) || !vector(body.velocity) || !vector(body.angularVelocity)) return false;
  const q = body.rotation;
  return vector(q) && Number.isFinite(q.w) && Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 0.001;
}

function validProjectile(shot) {
  return position(shot) && Number.isFinite(shot.dx) && Number.isFinite(shot.dz)
    && Math.abs(Math.hypot(shot.dx, shot.dz) - 1) < 0.001
    && Number.isFinite(shot.speed) && shot.speed > 0 && Number.isFinite(shot.dmg) && shot.dmg > 0
    && Number.isFinite(shot.left) && shot.left > 0 && shot.left <= WORLD_HALF * 2;
}

/** Moves a version 2 life onto the version 3 record. Jobs restart from the same seed; money and gear stay. */
export function migrateLife(value) {
  if (!object(value) || value.version !== 2 || !Number.isInteger(value.seed)) return value;
  const life = createLife(value.seed), keep = ['status', 'camp', 'bounty', 'kills', 'shots', 'hits', 'time', 'damageTaken', 'hp', 'deadEye', 'discovered', 'player', 'simTime'];
  for (const key of keep) if (value[key] !== undefined) life[key] = value[key];
  life.items.bandage = count(value.bandages) ? Math.min(5, value.bandages) : 1;
  life.gear.map = value.hasMap === true; life.gear.coat = value.coat === true;
  const guns = object(value.guns) ? value.guns : {};
  life.unlocked = (Array.isArray(value.unlocked) ? value.unlocked : ['revolver']).filter((key) => own(WEAPONS, key));
  if (!life.unlocked.includes('revolver')) life.unlocked.unshift('revolver');
  life.weapon = count(value.weapon) && value.weapon < life.unlocked.length ? value.weapon : 0;
  life.ammo = { pistol: 0, heavy: 0, rifle: 0, shells: 0 };
  for (const key of life.unlocked) {
    life.guns[key] = gunState(key);
    const old = guns[key], type = WEAPONS[key].ammoType;
    if (object(old) && count(old.ammo)) life.guns[key].ammo = Math.min(WEAPONS[key].mag, old.ammo);
    if (object(old) && count(old.reserve)) life.ammo[type] = Math.min(AMMO[type].max, life.ammo[type] + old.reserve);
  }
  // Bounties that were already paid stay paid; work in progress restarts.
  for (const [campId, contract] of Object.entries(object(value.contracts) ? value.contracts : {})) {
    const id = `bounty-${campId}`;
    if (life.quests[id] && contract?.status === 'paid') life.quests[id] = { status: 'turnedIn', paid: 0 };
  }
  // Camp rosters changed in version 3, so camps start fresh after migration.
  return life;
}

/** Returns a separate validated record, or null when the record is damaged. */
export function normalizeLife(input) {
  let value = input?.version === 2 ? migrateLife(input) : input;
  if (!object(value) || value.version !== LIFE_VERSION || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff || !validJson(value)) return null;
  if (!['alive', 'dead'].includes(value.status) || !position(value.player)) return null;
  if (!STAT_KEYS.every((key) => nonnegative(value[key]))) return null;
  if (value.simTime !== undefined && !nonnegative(value.simTime)) return null;
  if (value.projectiles !== undefined && (!Array.isArray(value.projectiles) || value.projectiles.length > 60 || !value.projectiles.every(validProjectile))) return null;
  if (!Number.isFinite(value.hp) || value.hp < 0 || value.hp > 100 || (value.status === 'alive' && value.hp <= 0)) return null;
  if (!Number.isFinite(value.deadEye) || value.deadEye < 0 || value.deadEye > 1) return null;
  if (!Array.isArray(value.unlocked) || !value.unlocked.includes('revolver') || new Set(value.unlocked).size !== value.unlocked.length || !value.unlocked.every((key) => own(WEAPONS, key))) return null;
  if (!count(value.weapon) || value.weapon >= value.unlocked.length || !object(value.guns)) return null;
  if (!value.unlocked.every((key) => {
    const gun = value.guns[key];
    return object(gun) && count(gun.ammo) && gun.ammo <= WEAPONS[key].mag
      && (gun.cooldown === undefined || Number.isFinite(gun.cooldown))
      && ['bloom', 'reloadT', 'reloadTotal'].every((field) => gun[field] === undefined || nonnegative(gun[field]))
      && (gun.condition === undefined || (Number.isFinite(gun.condition) && gun.condition >= 0 && gun.condition <= 1))
      && (gun.reloading === undefined || typeof gun.reloading === 'boolean');
  })) return null;
  if (!object(value.ammo) || !Object.keys(AMMO).every((type) => count(value.ammo[type]) && value.ammo[type] <= AMMO[type].max * 2)) return null;
  if (object(value.items)) value = { ...value, items: { ...Object.fromEntries(ITEM_KEYS.map((key) => [key, 0])), ...value.items } };
  if (!object(value.items) || !ITEM_KEYS.every((key) => count(value.items[key]) && value.items[key] <= 9)) return null;
  if (!object(value.gear) || !GEAR_KEYS.every((key) => typeof value.gear[key] === 'boolean')) return null;
  if (value.horse !== null && !(object(value.horse) && typeof value.horse.owned === 'boolean' && Number.isFinite(value.horse.stamina))) return null;
  if (!object(value.effects) || !Object.values(value.effects).every(Number.isFinite)) return null;
  if (!object(value.camps) || !object(value.discovered) || !object(value.known)) return null;
  if (value.marker !== null && value.marker !== undefined && !position(value.marker)) return null;
  if (value.interior !== undefined && value.interior !== null
    && (!object(value.interior) || !INTERIOR_IDS.has(value.interior.id) || !position(value.interior.outside)
      || Math.hypot(value.interior.outside.x, value.interior.outside.z) > 36
      || (value.interior.local !== undefined && !(object(value.interior.local) && Math.abs(value.interior.local.x) < 10 && Math.abs(value.interior.local.z) < 8)))) return null;
  if (value.blackjack !== undefined && !validBlackjack(value.blackjack)) return null;
  const worldSeed = value.worldSeed ?? value.seed;
  if (!Number.isInteger(worldSeed) || worldSeed < 0 || worldSeed > 0xffffffff) return null;
  const life = createLife(value.seed, worldSeed);
  // A save from before the frontier grew lacks the newer jobs and camps; they start fresh.
  const defs = questDefs(life.world);
  if (object(value.quests)) value = { ...value, quests: { ...emptyQuestState(defs), ...value.quests } };
  if (!validQuestState(value.quests, defs)) return null;
  value = { ...value, camps: { ...value.camps } };
  for (const camp of [...life.world.camps, ...life.world.ambushes]) {
    value.camps[camp.id] ??= {};
    const snapshot = value.camps[camp.id];
    if (!object(snapshot)) return null;
    if (Object.keys(snapshot).length && (typeof snapshot.cleared !== 'boolean' || !validActors(snapshot.enemies, false) || !validActors(snapshot.props, true))) return null;
  }
  const edge = Math.ceil(WORLD_HALF * 2 / MAP_CELL);
  if (!Object.entries(value.discovered).every(([key, seen]) => {
    const parts = key.split(':').map(Number);
    return /^\d+:\d+$/.test(key) && parts.every((n) => count(n) && n < edge) && seen === true;
  })) return null;
  const saved = JSON.parse(JSON.stringify(value));
  for (const key of [...STAT_KEYS, 'status', 'hp', 'unlocked', 'weapon', 'deadEye', 'player', 'guns', 'discovered', 'ammo', 'items', 'gear', 'horse', 'effects', 'known', 'quests']) life[key] = saved[key];
  for (const key of ['questFlags', 'met', 'tips']) if (object(saved[key])) life[key] = saved[key];
  if (Array.isArray(saved.rumors)) life.rumors = saved.rumors.filter((id) => typeof id === 'string');
  life.marker = saved.marker ?? null;
  life.mealHeal = nonnegative(saved.mealHeal) ? Math.min(30, saved.mealHeal) : 0;
  life.drunk = nonnegative(saved.drunk) ? Math.min(1.5, saved.drunk) : 0;
  life.completed = count(saved.completed) ? saved.completed : 0;
  life.simTime = saved.simTime ?? 0;
  life.projectiles = saved.projectiles ?? [];
  life.interior = saved.interior ?? null;
  life.blackjack = saved.blackjack ?? emptyBlackjack();
  for (const camp of [...life.world.camps, ...life.world.ambushes]) life.camps[camp.id] = saved.camps[camp.id];
  return life;
}

function townError(life) {
  if (life.status !== 'alive') return 'This life has ended.';
  if (life.interior) return null;
  const home = (life.world.towns ?? [life.world.town]).some(({ x, z, radius }) => Math.hypot(life.player.x - x, life.player.z - z) <= radius);
  return home ? null : 'Return to town first.';
}

/** Emergency work when a life has no money and almost no rounds. */
export function work(life) {
  const error = townError(life);
  if (error) return { ok: false, message: error };
  const loaded = life.guns.revolver?.ammo ?? 0;
  if (life.bounty >= CATALOGUE['ammo-pistol'].price || loaded + life.ammo.pistol > 6) return { ok: false, message: 'You have enough money or rounds for another trip.' };
  life.ammo.pistol += 12;
  return { ok: true, message: 'A day of hauling freight earns 12 revolver rounds.' };
}

/** A random-looking but fixed rumor order for this life. */
export function rumorOrder(life) {
  const rng = createRng(life.seed ^ 0x72756d6f);
  return [...life.world.sites.filter((s) => s.kind === 'cache' || s.kind === 'landmark' || s.kind === 'homestead'), ...life.world.camps]
    .map((place) => ({ place, k: rng.next() })).sort((a, b) => a.k - b.k).map(({ place }) => place);
}
