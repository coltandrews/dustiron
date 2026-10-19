// What townspeople say. Lines change with a quest's state: a first meeting,
// work on offer, work in progress, finished work and failure.
import { NPCS, direction, objective } from './quests.js';

export const ROLES = {
  sheriff: 'Sheriff', doctor: 'Town doctor', maps: 'Map maker', guns: 'Gunsmith', clothes: 'Clothier', saloon: 'Saloon keeper',
  stable: 'Livery', silas: 'Rancher', martha: 'Hears every rumor', clara: 'Doctor Finch\'s cousin', nora: 'Postmistress',
  amos: 'Homesteader', eli: 'Wounded traveler', juan: 'Trail merchant',
};

/** Shop kinds in town map to the person behind the counter. */
export const KEEPER_NPC = { guns: 'guns', doctor: 'doctor', sheriff: 'sheriff', maps: 'maps', clothes: 'clothes', saloon: 'mae', stable: 'stable' };

const FIRST = {
  sheriff: 'Name\'s Boone. Wanted men are on the board. Bring me proof, or bring them breathing for more.',
  doctor: 'Finch. I set bones and sell bandages. If you are bleeding, sit down first and talk second.',
  maps: 'Elias Ward. Most folks get lost a mile from here. A map keeps you from being most folks.',
  guns: 'Otis Vale. I sell iron and the rounds to feed it. Pick your gun before you pick a fight.',
  clothes: 'Lena Pike. Good canvas turns a little of what the trail throws at you.',
  mae: 'Mae Sullivan. Whiskey, coffee, a hot plate, and for a few coins, whatever I overhear.',
  stable: 'Tom Reed. Old Dusty rents by the trip. The bay mare is for sale if you have the money.',
  silas: 'Silas Reed. I run cattle south of the creek, or I did before those outlaws moved in.',
  martha: 'Keep your voice down. I hear every name that rides through, and I sell the useful ones.',
  clara: 'Clara Finch. My cousin was due in from the road days ago.',
  nora: 'Nora Pike. Post and parcels. If it has to get somewhere, it comes through me.',
  amos: 'Strangers don\'t come out this far by accident. State your business.',
  eli: 'Water... and a bandage, if you have one. My horse threw me and the leg won\'t hold.',
  juan: 'Juan Ortega. Rounds, bandages, coffee. Town prices are cheaper, but town is far.',
};
const LATER = {
  sheriff: 'Back again. The board changes when men die or hang.',
  doctor: 'Still in one piece? Let me see.',
  maps: 'Seen anything worth drawing?',
  guns: 'Need rounds?',
  clothes: 'The dust finds you anyway.',
  mae: 'What\'ll it be?',
  stable: 'Horses are fed and watered.',
  silas: 'Any news from the camps?',
  martha: 'You again. Coin first, then names.',
  clara: 'Any word?',
  nora: 'Anything to send?',
  amos: 'Back again.',
  eli: 'Still here.',
  juan: 'Prices are the same as last time.',
};

/** Opening line for an NPC, with a short note for each job they are part of. */
export function greeting(life, defs, npc) {
  const met = life.met?.[npc];
  let text = met ? LATER[npc] ?? 'Howdy.' : FIRST[npc] ?? 'Howdy.';
  for (const def of defs) {
    const state = life.quests[def.id];
    if (def.turnIn !== npc && def.giver !== npc) continue;
    if (state.status === 'active' && def.turnIn === npc) text += `\n\n${def.title}: ${objective(life, def)}`;
    if (state.status === 'complete' && def.turnIn === npc) text += `\n\n${def.title}: you finished it. ${def.type === 'bounty' && state.alive ? 'Alive, too. ' : ''}Here is your pay.`;
    if (state.status === 'failed' && def.giver === npc && !state.told) { text += `\n\n${def.title}: ${failLine(def, state)}`; state.told = true; }
  }
  return text;
}

function failLine(def, state) {
  if (def.type === 'medicine' && state.sold) return 'You sold my medicine to a peddler. Don\'t come asking for favors.';
  if (def.type === 'delivery') return 'The parcel never arrived in time. Amos had to ride in himself.';
  if (def.type === 'bounty') return 'The judge wanted that one alive. The job is closed.';
  return 'That job is over.';
}

/** The pitch for a job before the player accepts it. */
export function offerText(life, def) {
  const reward = def.type === 'bounty' && def.want === 'either'
    ? `$${def.reward.money} dead, $${def.aliveReward} alive` : `$${def.reward.money}`;
  const items = Object.entries(def.reward.items ?? {}).map(([k, n]) => ` and ${n} ${k}${n > 1 ? 's' : ''}`).join('');
  const want = def.type === 'bounty' ? `\nWanted: ${def.want === 'either' ? 'dead or alive' : def.want}. Threat: ${def.threat}.` : '';
  return `${def.summary}${want}\nPay: ${reward}${items}.${def.fail ? `\nTake care: ${def.fail}` : ''}\nTurn it in to ${NPCS[def.turnIn]}.`;
}

/** Where a camp or place lies, said the way a townsperson would. */
export function rumorLine(place) {
  const where = direction(place.x, place.z), far = Math.round(Math.hypot(place.x, place.z) / 10) * 10;
  if (place.kind === 'cache') return `A drifter swore he buried a strongbox under a cairn ${where} of town, about ${far} paces out.`;
  if (place.kind === 'landmark') return `${place.name} stands ${where} of here. You can see it from a long way off.`;
  if (place.kind === 'homestead') return `The Hollis family still farms out ${where}, near ${far} paces from town.`;
  return `Riders camp at ${place.name}, ${where} of town. Smoke most nights.`;
}
