// Shop items as data: price, what each one does, how many you can carry and
// which shop sells it. Purchases and item use are pure functions on the life.
import { WEAPONS } from './weapons.js';

export const START_MONEY = 15;
export const START_ROUNDS = 18;

/** Ammunition types. Each gun uses one; a gun belt raises every limit. */
export const AMMO = {
  pistol: { name: 'Revolver rounds', pack: 12, max: 48 },
  heavy: { name: 'Heavy rounds', pack: 12, max: 36 },
  rifle: { name: 'Rifle cartridges', pack: 10, max: 40 },
  shells: { name: 'Shotgun shells', pack: 8, max: 32 },
};
export const BELT_BONUS = 1.5;

/** Timed effects from food and drink, in seconds of trail time. */
export const EFFECTS = {
  meal: { name: 'Well fed', seconds: 90 },
  coffee: { name: 'Coffee', seconds: 120 },
  whiskey: { name: 'Whiskey', seconds: 60 },
};

export const CATALOGUE = {
  'ammo-pistol': { name: 'Revolver rounds ×12', price: 5, kind: 'ammo', ammo: 'pistol', text: 'Twelve rounds for the revolver.' },
  'ammo-heavy': { name: 'Heavy rounds ×12', price: 7, kind: 'ammo', ammo: 'heavy', text: 'Twelve rounds for the heavy revolver.' },
  'ammo-rifle': { name: 'Rifle cartridges ×10', price: 8, kind: 'ammo', ammo: 'rifle', text: 'Ten cartridges for the repeater or the rifle.' },
  'ammo-shells': { name: 'Shotgun shells ×8', price: 7, kind: 'ammo', ammo: 'shells', text: 'Eight shells for the shotgun.' },
  heavy: { name: 'Heavy revolver', price: 55, kind: 'gun', text: 'Slow and strong. Heavy kick. Five rounds.' },
  repeater: { name: 'Repeater', price: 90, kind: 'gun', text: 'Lever rifle for middle range. Fast, but eats cartridges.' },
  shotgun: { name: 'Shotgun', price: 70, kind: 'gun', text: 'Two barrels. Deadly up close, weak past ten paces.' },
  rifle: { name: 'Rifle', price: 130, kind: 'gun', text: 'Long, accurate and slow. Poor when you move.' },
  oil: { name: 'Gun oil', price: 6, kind: 'supply', max: 3, text: 'Cleans every gun you carry. Dirty guns spread wider.' },
  belt: { name: 'Gun belt', price: 25, kind: 'gear', text: 'Carry half again as much ammunition.' },
  bandage: { name: 'Bandage', price: 8, kind: 'supply', max: 5, text: 'Press H. Takes a moment to wrap; a hard hit stops it. Heals 35.' },
  heal: { name: 'Full treatment', price: 12, kind: 'service', text: 'The doctor patches you up to full health.' },
  meal: { name: 'Hot meal', price: 4, kind: 'supply', max: 3, text: 'Slowly heals up to 30 when you are out of a fight.' },
  coffee: { name: 'Coffee', price: 2, kind: 'supply', max: 3, text: 'For two minutes your roll recovers faster.' },
  whiskey: { name: 'Whiskey', price: 3, kind: 'supply', max: 3, text: 'Fills some Dead Eye at once, but your aim wavers for a minute.' },
  coat: { name: 'Trail coat', price: 20, kind: 'gear', text: 'Thick canvas. Takes a tenth off every hit.' },
  map: { name: 'Area map', price: 30, kind: 'gear', text: 'Shows the river and the big landmarks. Not camps.' },
  rent: { name: 'Rent Old Dusty', price: 30, kind: 'horse', horse: 'rental', text: 'A steady old horse for this trip. Returns to the stable when you come home.' },
  horse: { name: 'Buy the bay mare', price: 180, kind: 'horse', horse: 'owned', text: 'Faster, stronger and calmer under fire. Yours for this life.' },
  feed: { name: 'Horse feed', price: 2, kind: 'supply', max: 3, text: 'Restores your horse when it is worn out.' },
};

export const SHOPS = {
  guns: ['ammo-pistol', 'ammo-heavy', 'ammo-rifle', 'ammo-shells', 'heavy', 'repeater', 'shotgun', 'rifle', 'oil', 'belt'],
  doctor: ['bandage', 'heal'],
  saloon: ['meal', 'coffee', 'whiskey'],
  clothes: ['coat'],
  maps: ['map'],
  stable: ['rent', 'horse', 'feed'],
  merchant: ['ammo-pistol', 'bandage', 'coffee'],
};
/** The trail merchant charges more than town. */
export const MERCHANT_MARKUP = 1.6;

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function ammoMax(life, type) {
  return Math.round(AMMO[type].max * (life.gear?.belt ? BELT_BONUS : 1));
}

/** Total spare ammunition of one type across the guns that share it. */
export function ammoHeld(life, type) {
  return life.ammo?.[type] ?? 0;
}

export function priceOf(itemId, shop) {
  const base = CATALOGUE[itemId].price;
  return shop === 'merchant' ? Math.ceil(base * MERCHANT_MARKUP) : base;
}

/** The reason an item cannot be bought now, or null when it can. */
export function cannotBuy(life, itemId, shop = null) {
  if (!own(CATALOGUE, itemId)) return 'That is not for sale.';
  const item = CATALOGUE[itemId], price = priceOf(itemId, shop);
  if (shop && !SHOPS[shop]?.includes(itemId)) return 'Not sold here.';
  if (item.kind === 'gun' && life.unlocked.includes(itemId)) return 'You own this.';
  if (item.kind === 'gear' && life.gear[itemId]) return 'You own this.';
  if (item.kind === 'ammo') {
    if (ammoHeld(life, item.ammo) >= ammoMax(life, item.ammo)) return 'You cannot carry more.';
  }
  if (item.kind === 'supply' && (life.items[itemId] ?? 0) >= item.max) return `You can carry ${item.max}.`;
  if (itemId === 'heal' && life.hp >= 100) return 'You are not hurt.';
  if (item.kind === 'horse') {
    if (item.horse === 'owned' && life.horse?.owned) return 'The mare is yours.';
    if (item.horse === 'rental' && life.horse) return life.horse.owned ? 'You have a horse.' : 'You rented him already.';
  }
  if (life.bounty < price) return `You need $${price}.`;
  return null;
}

/** Buys one item. The life changes only when the purchase succeeds. */
export function buy(life, itemId, shop = null) {
  if (life.status !== 'alive') return { ok: false, message: 'This life has ended.' };
  const reason = cannotBuy(life, itemId, shop);
  if (reason) return { ok: false, message: reason };
  const item = CATALOGUE[itemId], price = priceOf(itemId, shop);
  life.bounty -= price;
  if (item.kind === 'ammo') life.ammo[item.ammo] = Math.min(ammoMax(life, item.ammo), ammoHeld(life, item.ammo) + AMMO[item.ammo].pack);
  else if (item.kind === 'gun') { life.unlocked.push(itemId); life.guns[itemId] = { ammo: WEAPONS[itemId].mag, reserve: 0, condition: 1 }; }
  else if (item.kind === 'gear') life.gear[itemId] = true;
  else if (item.kind === 'supply') life.items[itemId] = (life.items[itemId] ?? 0) + 1;
  else if (itemId === 'heal') life.hp = 100;
  else if (item.kind === 'horse') life.horse = { owned: item.horse === 'owned', stamina: 1, away: false };
  return { ok: true, message: `${item.name} · $${price}.` };
}

/** Uses a carried supply. `inFight` blocks food and oil while bullets fly. */
export function useItem(life, itemId, { inFight = false, time = life.time } = {}) {
  const count = life.items[itemId] ?? 0;
  if (!count) return { ok: false, message: `You have no ${CATALOGUE[itemId]?.name.toLowerCase() ?? 'such thing'}.` };
  if (inFight && itemId !== 'whiskey') return { ok: false, message: 'Not in the middle of a fight.' };
  if (itemId === 'oil') { for (const key of life.unlocked) life.guns[key].condition = 1; }
  else if (itemId === 'feed') { if (!life.horse) return { ok: false, message: 'You have no horse.' }; life.horse.stamina = 1; }
  else if (EFFECTS[itemId]) {
    life.effects[itemId] = time + EFFECTS[itemId].seconds;
    if (itemId === 'whiskey') life.deadEye = Math.min(1, life.deadEye + 0.35);
    if (itemId === 'meal') life.mealHeal = 30;
  } else return { ok: false, message: 'You cannot use that.' };
  life.items[itemId] = count - 1;
  return { ok: true, message: `${CATALOGUE[itemId].name} used.` };
}

export function effectActive(life, id, time = life.time) {
  return (life.effects?.[id] ?? -1) > time;
}
