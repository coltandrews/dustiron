// Seeded world layout for one life: camps, ambush sites, landmarks and the
// small places between them. Pure data, so quests, the map and the renderer
// all read the same positions.
import { createRng } from './rng.js';
import { campTrailPoints, inRiver } from './terrain.js';

const CAMP_NAMES = ['Coyote Wash', 'Dry Gulch', 'Rattler Flats', 'Buzzard Mesa', 'Red Hollow', 'Cinder Draw'];
const DEADLY_NAMES = ['Old Bonanza Mine', 'Hangman Quarry', 'Black Hole Diggings'];
const TARGET_NAMES = ['Silas Crow', 'Ada Flint', 'Jed Mercer', 'Ruth Voss', 'Cal Rusk', 'Mae Talbot', 'Hob Garrity', 'Lem Stroud'];
const LANDMARK_NAMES = ['Needle Rock', 'Twin Spires', 'Broken Chimney', "Widow's Finger", 'Saddle Stone', 'Preacher Rock'];
const CRIMES = ['wagon robbery', 'cattle theft', 'a stage holdup', 'arson at the depot', 'murder of a surveyor', 'a bank job in Larkin'];
export const THREATS = ['Low', 'Medium', 'High', 'Deadly'];
const TARGET_WEAPONS = ['Revolver', 'Shotgun', 'Rifle', 'Twin revolvers'];

/** Bounty values by threat. Wanted-alive work pays more because it is harder. */
export const BOUNTY_BASE = [25, 50, 85, 140];

function spread(rng, taken, minGap, half, test, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(test.min, test.max);
    const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
    if (Math.abs(x) > half - 24 || Math.abs(z) > half - 24 || inRiver(x, z, 10)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r ?? minGap))) continue;
    return { x, z };
  }
  return null;
}

/** Camps keep the original layout rules; a fourth, deadly site sits farther out. */
export function makeCamps(seed, half) {
  const rng = createRng(seed), angle = rng.range(0, Math.PI * 2), names = rng.int(0, CAMP_NAMES.length - 1);
  const camps = Array.from({ length: 3 }, (_, i) => {
    const a = angle + i * Math.PI * 2 / 3 + rng.range(-0.15, 0.15), distance = rng.range(90 + i * 15, 120 + i * 20);
    return { id: `camp-${i + 1}`, name: CAMP_NAMES[(names + i) % CAMP_NAMES.length],
      x: Math.round(Math.cos(a) * distance), z: Math.round(Math.sin(a) * distance), difficulty: i,
      targetId: `target-${i + 1}`, targetName: TARGET_NAMES[(names + i * 2) % TARGET_NAMES.length], reward: 90 + i * 40 };
  });
  const extra = createRng(seed ^ 0x6465616c);
  const spot = spread(extra, camps.map((c) => ({ ...c, r: 80 })), 80, half, { min: 160, max: half - 30 });
  if (spot) {
    camps.push({ id: 'camp-4', name: DEADLY_NAMES[extra.int(0, DEADLY_NAMES.length - 1)], ...spot, difficulty: 3,
      targetId: 'target-4', targetName: TARGET_NAMES[(names + 7) % TARGET_NAMES.length], reward: 0 });
  }
  return camps;
}

/** Wanted-poster data for each camp target. */
export function makeWanted(seed, camps) {
  const rng = createRng(seed ^ 0x77616e74);
  return camps.map((camp, i) => {
    const want = i === 0 ? 'either' : rng.pick(['either', 'either', 'alive', 'dead']);
    const base = BOUNTY_BASE[Math.min(3, camp.difficulty)];
    return {
      campId: camp.id, targetId: camp.targetId, name: camp.targetName, crime: rng.pick(CRIMES),
      threat: THREATS[Math.min(3, camp.difficulty)], weapon: TARGET_WEAPONS[Math.min(3, camp.difficulty)],
      want, reward: base, aliveReward: Math.round(base * 1.6 / 5) * 5,
      face: { hat: rng.pick([0x9d302b, 0x5a2a20, 0x3a2a24]), scarf: rng.pick([0xa8322a, 0x26201d, 0x4b5a4a]), beard: rng.chance(0.6) },
    };
  });
}

/** Places between town and the camps. Each kind supports exploration or a quest. */
export function makeSites(seed, half, camps) {
  const rng = createRng(seed ^ 0x73697465), sites = [];
  const taken = [{ x: 0, z: 0, r: 70 }, ...camps.map((c) => ({ x: c.x, z: c.z, r: 45 }))];
  const add = (kind, name, test, gap = 32, extra = {}) => {
    const spot = spread(rng, taken, gap, half, test);
    if (!spot) return null;
    const site = { id: `${kind}-${sites.filter((s) => s.kind === kind).length + 1}`, kind, name, ...spot, ...extra };
    sites.push(site); taken.push({ ...spot, r: gap });
    return site;
  };
  const marks = [...LANDMARK_NAMES].sort(() => rng.next() - 0.5);
  for (let i = 0; i < 4; i++) add('landmark', marks[i], { min: 75, max: half - 30 }, 60, { height: Math.round(rng.range(9, 14)) });
  add('tree', 'Hanging Tree', { min: 70, max: 150 }, 40);
  add('homestead', 'Hollis Homestead', { min: 85, max: 140 }, 45, { npc: 'Amos Hollis' });
  add('traveler', 'Wounded traveler', { min: 60, max: 120 }, 35, { npc: 'Eli Watts' });
  add('merchant', 'Trail merchant', { min: 55, max: 110 }, 35, { npc: 'Juan Ortega' });
  for (let i = 0; i < 2; i++) add('cache', 'Buried strongbox', { min: 90, max: half - 30 }, 35, { money: 20 + rng.int(0, 3) * 5, rounds: 12 });
  for (let i = 0; i < 2; i++) add('wreck', 'Abandoned wagon', { min: 50, max: 160 }, 30, { loot: i ? 'bandage' : 'rounds' });
  for (let i = 0; i < 2; i++) add('grave', 'Lone grave', { min: 60, max: 170 }, 25);
  return sites;
}

/** Two roadside ambush spots beside camp trails, small enough to escape and clear of town. */
export function makeAmbushes(seed, half, camps, sites) {
  const rng = createRng(seed ^ 0x616d6275), out = [];
  const taken = [{ x: 0, z: 0, r: 75 }, ...camps.map((c) => ({ x: c.x, z: c.z, r: 55 })), ...sites.map((s) => ({ x: s.x, z: s.z, r: 30 }))];
  const order = camps.map((_, i) => i).sort(() => rng.next() - 0.5);
  for (const index of order) {
    if (out.length >= 2) break;
    const trail = campTrailPoints(camps[index], index);
    for (let tries = 0; tries < 12; tries++) {
      const k = Math.floor(trail.length * rng.range(0.35, 0.7)), a = trail[k], b = trail[Math.min(trail.length - 1, k + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1, side = rng.chance(0.5) ? 1 : -1, off = rng.range(9, 13);
      const x = Math.round(a.x - (b.z - a.z) / len * off * side), z = Math.round(a.z + (b.x - a.x) / len * off * side);
      if (Math.abs(x) > half - 24 || Math.abs(z) > half - 24 || inRiver(x, z, 8)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r)) continue;
      out.push({ id: `ambush-${out.length + 1}`, name: out.length ? 'Snake Bend' : 'Dead Man Rocks', x, z, difficulty: 0, ambush: true, along: index });
      taken.push({ x, z, r: 50 });
      break;
    }
  }
  return out;
}
