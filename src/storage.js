// One atomic record holds a life. A dead record prevents an old save from returning.
import { createLife, gunState, normalizeLife } from './life.js';
import { AMMO } from './items.js';
import { WEAPONS } from './weapons.js';

export const SAVE_KEY = 'dustiron.run.v2';
const LEGACY_KEY = 'dustiron.run.v1';

export function loadSave(storage) {
  try {
    storage ??= globalThis.localStorage;
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const life = normalizeLife(JSON.parse(raw));
      return life?.status === 'alive' ? life : null;
    }
    const old = JSON.parse(storage.getItem(LEGACY_KEY));
    if (!old || old.status === 'dead' || !Number.isInteger(old.seed) || !Array.isArray(old.unlocked) || !(old.hp > 0)) return null;
    // Preserve a living prototype run once. New lives still start with nothing earned.
    const life = createLife(old.seed);
    for (const key of ['bounty', 'kills', 'shots', 'hits', 'time', 'damageTaken', 'hp', 'deadEye']) {
      if (Number.isFinite(old[key]) && old[key] >= 0) life[key] = old[key];
    }
    life.hp = Math.min(100, life.hp);
    life.deadEye = Math.min(1, life.deadEye);
    for (const key of old.unlocked) {
      if (!Object.prototype.hasOwnProperty.call(WEAPONS, key)) continue;
      if (!life.unlocked.includes(key)) life.unlocked.push(key);
      life.guns[key] = gunState(key);
      const type = WEAPONS[key].ammoType;
      life.ammo[type] = Math.min(AMMO[type].max, life.ammo[type] + WEAPONS[key].mag * 3);
    }
    life.weapon = Math.max(0, life.unlocked.indexOf(old.unlocked[old.weapon]));
    const checked = normalizeLife(life);
    if (checked) checked.migrated = true;
    return checked;
  } catch { return null; }
}

export function writeLife(life, storage, force = false) {
  try {
    storage ??= globalThis.localStorage;
    const raw = storage.getItem(SAVE_KEY);
    if (!force && raw) {
      const current = JSON.parse(raw);
      if (current.seed !== life.seed || (current.status === 'dead' && life.status !== 'dead')) return false;
    }
    storage.setItem(SAVE_KEY, JSON.stringify(life));
    return true;
  }
  catch { return false; }
}

export function endLife(life, storage) {
  life.status = 'dead';
  try {
    storage ??= globalThis.localStorage;
    const current = JSON.parse(storage.getItem(SAVE_KEY));
    if (current && current.seed !== life.seed) return false;
  } catch { /* Try to replace a damaged record with the death record. */ }
  const stored = writeLife(life, storage);
  try {
    storage.removeItem(LEGACY_KEY);
    if (!stored) storage.removeItem(SAVE_KEY);
  } catch { /* The game reports a save error to the player. */ }
  return stored;
}
