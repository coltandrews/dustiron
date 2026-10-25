// Messages between the browser and the game server. Everything is JSON.
// Snapshots use short arrays so twenty players stay cheap to send.
import { WEAPONS } from './weapons.js';

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 20;
export const MAX_MESSAGE = 64 * 1024;
export const SNAPSHOT_HZ = 15;
export const STATE_HZ = 20;
/** Players farther apart than this do not receive each other's updates. */
export const PLAYER_VIEW = 200;
/** Outlaws and world events farther than this from a player are not sent to them. */
export const EVENT_VIEW = 120;

export const GUN_CODES = Object.keys(WEAPONS);
export const ROOMS = ['', 'guns', 'doctor', 'sheriff', 'maps', 'clothes', 'saloon', 'stable'];
export const ENEMY_STATES = ['idle', 'alert', 'toCover', 'hold', 'peek', 'aim', 'burst', 'open', 'flank', 'search', 'charge', 'surrender', 'captive'];

/** Player pose flags. */
export const PF = { AIM: 1, ROLL: 2, MOUNT: 4, SEAT: 8, BANDAGE: 16, SNEAK: 32, COAT: 64, IFRAME: 128, ARMED: 256, SMOKE: 512, DRUNK: 1024 };
/** Outlaw flags. */
export const EF = { SURRENDERED: 1, CAPTIVE: 2, KNOWS: 4, TARGET: 8, ENRAGED: 16 };

export const q2 = (v) => Math.round(v * 100) / 100;
export const q3 = (v) => Math.round(v * 1000) / 1000;

/** Cleans a player name: letters, digits, spaces and a few marks, 2 to 16 characters. */
export function cleanName(name) {
  const text = String(name ?? '').replace(/[^\p{L}\p{N} '._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return text.length >= 2 ? text : null;
}

/** Cleans a chat line. */
export function cleanChat(text) {
  const line = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
  return line || null;
}

export const DUEL_MODES = { blood: 'to first blood', death: 'to the death' };
export const DUEL_WAGERS = [0, 5, 10, 25, 50];
/** A duel to first blood ends when one side has lost this much health. */
export const FIRST_BLOOD = 40;
export const DUEL_COUNTDOWN = 3;
export const DUEL_LIMIT = 120;
export const DUEL_RANGE = 25;
