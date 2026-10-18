// Saved data and town transactions for one life. This module has no browser state.
import { createRng } from './rng.js';
import { WEAPONS } from './weapons.js';
import { emptyBlackjack, validBlackjack } from './blackjack.js';

export const WORLD_HALF = 210;
export const MAP_CELL = 12;
export const CATALOGUE = {
  ammo: { name: '12 rounds for your selected gun', price: 6 },
  bandage: { name: 'Bandage', price: 10 },
  heal: { name: 'Full treatment', price: 15 },
  shotgun: { name: 'Shotgun', price: 70 },
  rifle: { name: 'Rifle', price: 130 },
  map: { name: 'Road and landmark map', price: 25 },
  coat: { name: 'Trail coat', price: 20 },
  drink: { name: 'Whiskey', price: 2 },
};
const CAMP_NAMES = ['Coyote Wash', 'Dry Gulch', 'Rattler Flats', 'Buzzard Mesa', 'Red Hollow', 'Cinder Draw'];
const TARGET_NAMES = ['Silas Crow', 'Ada Flint', 'Jed Mercer', 'Ruth Voss', 'Cal Rusk', 'Mae Talbot'];
const STAT_KEYS = ['camp', 'bounty', 'kills', 'shots', 'hits', 'time', 'damageTaken'];
const CONTRACT_STATES = new Set(['offered', 'active', 'proof', 'paid']);
const INTERIOR_IDS = new Set(['guns', 'doctor', 'sheriff', 'maps', 'clothes', 'saloon', 'stable']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const position = (value) => object(value) && Number.isFinite(value.x) && Number.isFinite(value.z)
  && Math.abs(value.x) <= WORLD_HALF && Math.abs(value.z) <= WORLD_HALF;
const vector = (value) => object(value) && ['x', 'y', 'z'].every((key) => Number.isFinite(value[key]));

function gunState(key) {
  return { ammo: WEAPONS[key].mag, reserve: key === 'revolver' ? 24 : 12,
    cooldown: 0, bloom: 0, reloading: false, reloadT: 0, reloadTotal: 0 };
}

export function createLife(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid life seed');
  const rng = createRng(seed), angle = rng.range(0, Math.PI * 2), names = rng.int(0, CAMP_NAMES.length - 1);
  const camps = Array.from({ length: 3 }, (_, i) => {
    const a = angle + i * Math.PI * 2 / 3 + rng.range(-0.15, 0.15), distance = rng.range(90 + i * 15, 120 + i * 20);
    return { id: `camp-${i + 1}`, name: CAMP_NAMES[(names + i) % CAMP_NAMES.length],
      x: Math.round(Math.cos(a) * distance), z: Math.round(Math.sin(a) * distance), difficulty: i,
      targetId: `target-${i + 1}`, targetName: TARGET_NAMES[(names + i * 2) % TARGET_NAMES.length], reward: 90 + i * 40 };
  });
  const life = {
    version: 2, status: 'alive', seed, camp: 0, bounty: 0, kills: 0, shots: 0, hits: 0, time: 0, damageTaken: 0,
    simTime: 0, projectiles: [],
    hp: 100, unlocked: ['revolver'], weapon: 0, deadEye: 0, bandages: 1, hasMap: false, coat: false,
    interior: null, blackjack: emptyBlackjack(),
    player: { x: 0, z: 12, yaw: 0, sinceHit: 99, rollT: -1, rollCooldown: 0, rollX: 0, rollZ: 1 },
    guns: { revolver: gunState('revolver') }, discovered: {},
    world: { seed, half: WORLD_HALF, town: { x: 0, z: 0, radius: 32 }, camps,
      roads: camps.map(({ x, z }) => ({ from: { x: 0, z: 0 }, to: { x, z } })) },
    contracts: Object.fromEntries(camps.map(({ id }) => [id, { status: 'offered', targetDead: false }])),
    camps: Object.fromEntries(camps.map(({ id }) => [id, {}])),
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

export function discover(life, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return false;
  return reveal(life, x, z, 24);
}

export function isDiscovered(life, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return false;
  // The last world edge belongs to the final cell.
  return life.discovered[cellKey(Math.min(x, WORLD_HALF - 0.001), Math.min(z, WORLD_HALF - 0.001))] === true;
}

// Keep simulation counters and optional body state without accepting non-JSON values.
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

/** Returns a separate validated record. Version 1 saves need an explicit migration. */
export function normalizeLife(value) {
  if (!object(value) || value.version !== 2 || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff || !validJson(value)) return null;
  if (!['alive', 'dead'].includes(value.status) || !position(value.player)) return null;
  if (!STAT_KEYS.every((key) => nonnegative(value[key])) || !count(value.bandages)) return null;
  if (value.simTime !== undefined && !nonnegative(value.simTime)) return null;
  if (value.projectiles !== undefined && (!Array.isArray(value.projectiles) || value.projectiles.length > 60 || !value.projectiles.every(validProjectile))) return null;
  if (!Number.isFinite(value.hp) || value.hp < 0 || value.hp > 100 || (value.status === 'alive' && value.hp <= 0)) return null;
  if (!Number.isFinite(value.deadEye) || value.deadEye < 0 || value.deadEye > 1) return null;
  if (!Array.isArray(value.unlocked) || !value.unlocked.includes('revolver') || new Set(value.unlocked).size !== value.unlocked.length || !value.unlocked.every((key) => own(WEAPONS, key))) return null;
  if (!count(value.weapon) || value.weapon >= value.unlocked.length || !object(value.guns)) return null;
  if (!value.unlocked.every((key) => {
    const gun = value.guns[key];
    return object(gun) && count(gun.ammo) && gun.ammo <= WEAPONS[key].mag && count(gun.reserve)
      && (gun.cooldown === undefined || Number.isFinite(gun.cooldown))
      && ['bloom', 'reloadT', 'reloadTotal'].every((field) => gun[field] === undefined || nonnegative(gun[field]))
      && (gun.reloading === undefined || typeof gun.reloading === 'boolean')
      && (!gun.reloading || (gun.reloadTotal > 0 && gun.reloadT <= gun.reloadTotal && gun.reserve > 0 && gun.ammo < WEAPONS[key].mag));
  })) return null;
  if (typeof value.hasMap !== 'boolean' || typeof value.coat !== 'boolean' || !object(value.contracts) || !object(value.camps) || !object(value.discovered)) return null;
  if (value.interior !== undefined && value.interior !== null
    && (!object(value.interior) || !INTERIOR_IDS.has(value.interior.id) || !position(value.interior.outside)
      || Math.hypot(value.interior.outside.x, value.interior.outside.z) > 36)) return null;
  if (value.blackjack !== undefined && !validBlackjack(value.blackjack)) return null;
  const life = createLife(value.seed);
  for (const camp of life.world.camps) {
    const contract = value.contracts[camp.id], snapshot = value.camps[camp.id];
    if (!object(contract) || !CONTRACT_STATES.has(contract.status) || typeof contract.targetDead !== 'boolean') return null;
    if (['proof', 'paid'].includes(contract.status) && !contract.targetDead) return null;
    if (!object(snapshot)) return null;
    if (Object.keys(snapshot).length && (typeof snapshot.cleared !== 'boolean' || !validActors(snapshot.enemies, false) || !validActors(snapshot.props, true))) return null;
  }
  const edge = Math.ceil(WORLD_HALF * 2 / MAP_CELL);
  if (!Object.entries(value.discovered).every(([key, seen]) => {
    const parts = key.split(':').map(Number);
    return /^\d+:\d+$/.test(key) && parts.every((n) => count(n) && n < edge) && seen === true;
  })) return null;
  const saved = JSON.parse(JSON.stringify(value));
  for (const key of [...STAT_KEYS, 'status', 'hp', 'unlocked', 'weapon', 'deadEye', 'bandages', 'hasMap', 'coat', 'player', 'guns', 'discovered']) life[key] = saved[key];
  life.simTime = saved.simTime ?? 0;
  life.projectiles = saved.projectiles ?? [];
  life.interior = saved.interior ?? null;
  life.blackjack = saved.blackjack ?? emptyBlackjack();
  for (const camp of life.world.camps) { life.contracts[camp.id] = saved.contracts[camp.id]; life.camps[camp.id] = saved.camps[camp.id]; }
  return life;
}

function townError(life) {
  if (life.status !== 'alive') return 'This life has ended.';
  if (life.interior) return null;
  const { x, z, radius } = life.world.town;
  return Math.hypot(life.player.x - x, life.player.z - z) > radius ? 'Return to town first.' : null;
}
const result = (ok, message) => ({ ok, message });

export function purchase(life, itemId) {
  const error = townError(life);
  if (error) return result(false, error);
  if (!own(CATALOGUE, itemId)) return result(false, 'That item is not for sale.');
  const item = CATALOGUE[itemId];
  if ((own(WEAPONS, itemId) && life.unlocked.includes(itemId)) || (itemId === 'map' && life.hasMap) || (itemId === 'coat' && life.coat)) return result(false, 'You already own this.');
  if (itemId === 'heal' && life.hp >= 100) return result(false, 'You are already at full health.');
  if (life.bounty < item.price) return result(false, `You need $${item.price}.`);
  life.bounty -= item.price;
  if (itemId === 'ammo') life.guns[life.unlocked[life.weapon]].reserve += 12;
  else if (itemId === 'bandage') life.bandages++;
  else if (itemId === 'heal') life.hp = 100;
  else if (itemId === 'map') life.hasMap = true;
  else if (itemId === 'coat') life.coat = true;
  else if (itemId === 'drink') life.deadEye = Math.min(1, life.deadEye + 0.2);
  else { life.unlocked.push(itemId); life.guns[itemId] = gunState(itemId); }
  return result(true, `${item.name} purchased for $${item.price}.`);
}

export function acceptContract(life, campId) {
  const error = townError(life);
  if (error) return result(false, error);
  if (!own(life.contracts, campId) || life.contracts[campId].status !== 'offered') return result(false, 'This bounty is not available.');
  const contract = life.contracts[campId];
  contract.status = contract.targetDead ? 'proof' : 'active';
  return result(true, contract.targetDead ? 'The target is dead. Claim your payment.' : 'Bounty accepted. Check your map.');
}

export function recordTargetKill(life, targetId) {
  if (life.status !== 'alive') return false;
  const camp = life.world.camps.find((item) => item.targetId === targetId);
  if (!camp || life.contracts[camp.id].targetDead) return false;
  const contract = life.contracts[camp.id];
  contract.targetDead = true;
  if (contract.status === 'active') contract.status = 'proof';
  return true;
}

export function claimContracts(life) {
  const error = townError(life);
  if (error) return { ...result(false, error), count: 0, total: 0 };
  let total = 0, count = 0;
  for (const camp of life.world.camps) {
    const contract = life.contracts[camp.id];
    if (contract.status !== 'proof') continue;
    contract.status = 'paid'; total += camp.reward; count++;
  }
  life.bounty += total;
  return { ...result(count > 0, count ? `Collected $${total} for ${count} ${count === 1 ? 'bounty' : 'bounties'}.` : 'No bounty payment is ready.'), count, total };
}

export function work(life) {
  const error = townError(life);
  if (error) return result(false, error);
  const gun = life.guns.revolver;
  if (life.bounty >= CATALOGUE.ammo.price || gun.ammo + gun.reserve > 6) return result(false, 'You have enough money or ammunition for another trip.');
  gun.reserve += 12;
  return result(true, 'Town work earned 12 revolver rounds.');
}
