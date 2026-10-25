// Seeded world layout for one life: camps, ambush sites, landmarks and the
// small places between them. Pure data, so quests, the map and the renderer
// all read the same positions.
import { createRng } from './rng.js';
import { campTrailPoints, forestAt, inRiver, MERCY, PINE_HOLLOW, pineRoadPoints, distanceToTrail } from './terrain.js';

const CAMP_NAMES = ['Coyote Wash', 'Dry Gulch', 'Rattler Flats', 'Buzzard Mesa', 'Red Hollow', 'Cinder Draw'];
const FAR_NAMES = ['Bone Creek', "Dead Man's Bend", 'Copper Notch', 'Sidewinder Pass', 'Vulture Roost', 'Salt Lick'];
const PINE_NAMES = ['Timber Cut', 'Blackwater Mill', 'Wolf Den', 'Hemlock Ridge'];
const DEADLY_NAMES = ['Old Bonanza Mine', 'Hangman Quarry', 'Black Hole Diggings'];
const TARGET_NAMES = ['Silas Crow', 'Ada Flint', 'Jed Mercer', 'Ruth Voss', 'Cal Rusk', 'Mae Talbot', 'Hob Garrity', 'Lem Stroud', 'Eb Tanner', 'Kit Malone', 'Dutch Varga', 'Nell Crane'];
/** The boss of the pine country and the hideout he runs. */
export const BOSS = { name: 'Iron Jack Kell', camp: 'The Iron Gang Hideout' };
const LANDMARK_NAMES = ['Needle Rock', 'Twin Spires', 'Broken Chimney', "Widow's Finger", 'Saddle Stone', 'Preacher Rock', 'Anvil Butte', 'Sleeping Indian', 'Devil Chair'];
const CRIMES = ['wagon robbery', 'cattle theft', 'a stage holdup', 'arson at the depot', 'murder of a surveyor', 'a bank job in Larkin'];
const AMBUSH_NAMES = ['Dead Man Rocks', 'Snake Bend', 'Gallows Cut', 'Cutthroat Rise'];
export const THREATS = ['Low', 'Medium', 'High', 'Deadly', 'Legendary'];
const TARGET_WEAPONS = ['Revolver', 'Shotgun', 'Rifle', 'Twin revolvers', 'Iron-plated coat and a heavy revolver'];

/** Bounty values by threat. Wanted-alive work pays more because it is harder. */
export const BOUNTY_BASE = [25, 50, 85, 140, 260];

function spread(rng, taken, minGap, half, test, tries = 200) {
  const ox = test.from?.x ?? 0, oz = test.from?.z ?? 0;
  for (let i = 0; i < tries; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(test.min, test.max);
    const x = Math.round(ox + Math.cos(a) * d), z = Math.round(oz + Math.sin(a) * d);
    if (Math.abs(x) > half - 24 || Math.abs(z) > half - 24 || inRiver(x, z, 10)) continue;
    if (test.where && !test.where(x, z)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r ?? minGap))) continue;
    return { x, z };
  }
  return null;
}

/** Camps keep the original layout rules; a fourth, deadly site sits farther out. */
export function makeCamps(seed, half) {
  const rng = createRng(seed), angle = rng.range(0, Math.PI * 2), names = rng.int(0, CAMP_NAMES.length - 1);
  const camps = [];
  for (let i = 0; i < 3; i++) {
    let spot = null;
    for (let attempt = 0; attempt < 40 && !spot; attempt++) {
      const a = angle + i * Math.PI * 2 / 3 + rng.range(-0.2, 0.2);
      const distance = rng.range(90 + i * 15, 120 + i * 20);
      const candidate = { x: Math.round(Math.cos(a) * distance), z: Math.round(Math.sin(a) * distance) };
      if (inRiver(candidate.x, candidate.z, 10)) continue;
      if (camps.some((camp) => Math.hypot(camp.x - candidate.x, camp.z - candidate.z) < 65)) continue;
      spot = candidate;
    }
    spot ??= spread(rng, camps.map((camp) => ({ ...camp, r: 65 })), 65, half, { min: 90 + i * 15, max: 120 + i * 20 });
    if (!spot) continue;
    camps.push({ id: `camp-${i + 1}`, name: CAMP_NAMES[(names + i) % CAMP_NAMES.length], ...spot, difficulty: i,
      targetId: `target-${i + 1}`, targetName: TARGET_NAMES[(names + i * 2) % TARGET_NAMES.length], reward: 90 + i * 40 });
  }
  const extra = createRng(seed ^ 0x6465616c);
  const spot = spread(extra, camps.map((c) => ({ ...c, r: 80 })), 80, half, { min: 160, max: half - 30 });
  const desert = (x, z) => forestAt(x, z) < 0.3 && Math.hypot(x - PINE_HOLLOW.x, z - PINE_HOLLOW.z) > 120;
  const deadly = spread(extra, camps.map((c) => ({ ...c, r: 80 })), 80, 210, { min: 160, max: 180, where: desert })
    ?? spread(extra, camps.map((c) => ({ ...c, r: 80 })), 80, 210, { min: 150, max: 185 });
  if (deadly) {
    camps.push({ id: 'camp-4', name: DEADLY_NAMES[extra.int(0, DEADLY_NAMES.length - 1)], ...deadly, difficulty: 3,
      targetId: 'target-4', targetName: TARGET_NAMES[(names + 7) % TARGET_NAMES.length], reward: 0 });
  }
  addFarCamps(seed, half, camps, names);
  return camps;
}

/**
 * The wider frontier: desert camps far from Mercy Crossing, pine camps around
 * Pine Hollow and the Iron Gang's hideout deep in the forest.
 */
function addFarCamps(seed, half, camps, names) {
  const rng = createRng(seed ^ 0x66617221);
  const road = pineRoadPoints();
  const taken = () => [{ x: 0, z: 0, r: 120 }, { x: PINE_HOLLOW.x, z: PINE_HOLLOW.z, r: 85 }, ...camps.map((c) => ({ ...c, r: 75 }))];
  const offRoad = (x, z) => distanceToTrail(x, z, road) > 30;
  const desert = (x, z) => forestAt(x, z) < 0.25 && offRoad(x, z);
  const pine = (x, z) => forestAt(x, z) > 0.7 && offRoad(x, z) && z < 0;
  let n = camps.length;
  const add = (camp) => { n++; camps.push({ id: `camp-${n}`, targetId: `target-${n}`, reward: 0, ...camp }); };
  for (let i = 0; i < 4; i++) {
    const spot = spread(rng, taken(), 75, half, { min: 200, max: half - 40, where: desert });
    if (spot) add({ name: FAR_NAMES[(names + i) % FAR_NAMES.length], ...spot, difficulty: 1 + (i % 3), targetName: TARGET_NAMES[(names + 8 + i) % TARGET_NAMES.length] });
  }
  for (let i = 0; i < 2; i++) {
    const spot = spread(rng, taken(), 75, half, { from: PINE_HOLLOW, min: 85, max: 150, where: pine });
    if (spot) add({ name: PINE_NAMES[(names + i) % PINE_NAMES.length], ...spot, difficulty: 2 + i, home: 'pine', targetName: TARGET_NAMES[(names + 3 + i * 5) % TARGET_NAMES.length] });
  }
  const lair = spread(rng, taken(), 80, half, { from: PINE_HOLLOW, min: 130, max: 175, where: pine })
    ?? spread(rng, taken(), 60, half, { from: PINE_HOLLOW, min: 110, max: 190 });
  if (lair) camps.push({ id: 'camp-boss', name: BOSS.camp, ...lair, difficulty: 4, boss: true, home: 'pine', targetId: 'target-boss', targetName: BOSS.name, reward: 0 });
}

/** The towns of a world. Both are fixed; only the land around them is seeded. */
export function makeTowns() {
  return [{ ...MERCY }, { ...PINE_HOLLOW }];
}

/** Wanted-poster data for each camp target. */
export function makeWanted(seed, camps) {
  const rng = createRng(seed ^ 0x77616e74);
  return camps.map((camp, i) => {
    const want = i === 0 || camp.boss ? 'either' : rng.pick(['either', 'either', 'alive', 'dead']);
    const base = BOUNTY_BASE[Math.min(4, camp.difficulty)];
    return {
      campId: camp.id, targetId: camp.targetId, name: camp.targetName, crime: camp.boss ? 'the Larkin train robbery and six killings' : rng.pick(CRIMES),
      threat: THREATS[Math.min(4, camp.difficulty)], weapon: TARGET_WEAPONS[Math.min(4, camp.difficulty)], office: camp.home === 'pine' ? 'deputy' : 'sheriff',
      want, reward: base, aliveReward: Math.round(base * 1.6 / 5) * 5,
      face: { hat: rng.pick([0x9d302b, 0x5a2a20, 0x3a2a24]), scarf: rng.pick([0xa8322a, 0x26201d, 0x4b5a4a]), beard: rng.chance(0.6) },
    };
  });
}

/** Places between town and the camps. Each kind supports exploration or a quest. */
export function makeSites(seed, half, camps) {
  const rng = createRng(seed ^ 0x73697465), sites = [];
  const taken = [{ x: 0, z: 0, r: 70 }, { x: PINE_HOLLOW.x, z: PINE_HOLLOW.z, r: 60 }, ...camps.map((c) => ({ x: c.x, z: c.z, r: 45 }))];
  const add = (kind, name, test, gap = 32, extra = {}) => {
    const spot = spread(rng, taken, gap, half, test);
    if (!spot) return null;
    const site = { id: `${kind}-${sites.filter((s) => s.kind === kind).length + 1}`, kind, name, ...spot, ...extra };
    sites.push(site); taken.push({ ...spot, r: gap });
    return site;
  };
  const marks = [...LANDMARK_NAMES].sort(() => rng.next() - 0.5);
  for (let i = 0; i < 4; i++) add('landmark', marks[i], { min: 75, max: 180 }, 60, { height: Math.round(rng.range(9, 14)) });
  add('tree', 'Hanging Tree', { min: 70, max: 150 }, 40);
  add('homestead', 'Hollis Homestead', { min: 85, max: 140 }, 45, { npc: 'Amos Hollis' });
  add('traveler', 'Wounded traveler', { min: 60, max: 120 }, 35, { npc: 'Eli Watts' });
  add('merchant', 'Trail merchant', { min: 55, max: 110 }, 35, { npc: 'Juan Ortega' });
  for (let i = 0; i < 2; i++) add('cache', 'Buried strongbox', { min: 90, max: half - 30 }, 35, { money: 20 + rng.int(0, 3) * 5, rounds: 12 });
  for (let i = 0; i < 2; i++) add('wreck', 'Abandoned wagon', { min: 50, max: 160 }, 30, { loot: i ? 'bandage' : 'rounds' });
  for (let i = 0; i < 2; i++) add('grave', 'Lone grave', { min: 60, max: 170 }, 25);
  // The wider land beyond the first ring.
  const open = (x, z) => forestAt(x, z) < 0.4;
  for (let i = 4; i < 8; i++) add('landmark', marks[i], { min: 200, max: half - 30, where: open }, 70, { height: Math.round(rng.range(11, 17)) });
  for (let i = 0; i < 3; i++) add('cache', 'Buried strongbox', { min: 200, max: half - 30 }, 40, { money: 35 + rng.int(0, 4) * 5, rounds: 16 });
  for (let i = 0; i < 3; i++) add('wreck', 'Abandoned wagon', { min: 180, max: half - 40 }, 35, { loot: i % 2 ? 'bandage' : 'rounds' });
  add('grave', 'Lone grave', { min: 200, max: half - 40 }, 30);
  add('mill', 'Burned sawmill', { from: PINE_HOLLOW, min: 55, max: 95, where: (x, z) => forestAt(x, z) > 0.6 }, 40);
  add('den', "Old Scar's den", { from: PINE_HOLLOW, min: 110, max: 190, where: (x, z) => forestAt(x, z) > 0.75 }, 50);
  add('lodge', 'Trapper lodge', { from: PINE_HOLLOW, min: 60, max: 120, where: (x, z) => forestAt(x, z) > 0.5 }, 40, { npc: 'Otto Brandt' });
  return sites;
}

/** Two roadside ambush spots beside camp trails, small enough to escape and clear of town. */
export function makeAmbushes(seed, half, camps, sites) {
  const rng = createRng(seed ^ 0x616d6275), out = [];
  const taken = [{ x: 0, z: 0, r: 75 }, { x: PINE_HOLLOW.x, z: PINE_HOLLOW.z, r: 70 }, ...camps.map((c) => ({ x: c.x, z: c.z, r: 55 })), ...sites.map((s) => ({ x: s.x, z: s.z, r: 30 }))];
  const order = camps.map((_, i) => i).sort(() => rng.next() - 0.5);
  for (const index of order) {
    if (out.length >= 4) break;
    const trail = campTrailPoints(camps[index], index);
    for (let tries = 0; tries < 12; tries++) {
      const k = Math.floor(trail.length * rng.range(0.35, 0.7)), a = trail[k], b = trail[Math.min(trail.length - 1, k + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1, side = rng.chance(0.5) ? 1 : -1, off = rng.range(9, 13);
      const x = Math.round(a.x - (b.z - a.z) / len * off * side), z = Math.round(a.z + (b.x - a.x) / len * off * side);
      if (Math.abs(x) > half - 24 || Math.abs(z) > half - 24 || inRiver(x, z, 8)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r)) continue;
      out.push({ id: `ambush-${out.length + 1}`, name: AMBUSH_NAMES[out.length], x, z, difficulty: 0, ambush: true, along: index });
      taken.push({ x, z, r: 50 });
      break;
    }
  }
  return out;
}
