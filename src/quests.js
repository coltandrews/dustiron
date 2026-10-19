// Quests for one life. Definitions are rebuilt from the world seed; only each
// quest's state is saved. Every change goes through the functions here, so a
// reward can be paid once and a failed quest stays failed.
import { THREATS } from './world-gen.js';

export const STATUS = ['offered', 'active', 'complete', 'turnedIn', 'failed'];
export const NPCS = {
  sheriff: 'Sheriff Boone', doctor: 'Doctor Finch', maps: 'Elias Ward', silas: 'Silas Reed', martha: 'Martha Bell',
  clara: 'Clara Finch', nora: 'Nora Pike', mae: 'Mae Sullivan', amos: 'Amos Hollis', eli: 'Eli Watts', juan: 'Juan Ortega',
};
const DELIVERY_LIMIT = 600;

export function direction(x, z) {
  const ns = z < -25 ? 'north' : z > 25 ? 'south' : '', ew = x < -25 ? 'west' : x > 25 ? 'east' : '';
  return ns + ew || 'near town';
}

/** A broad search circle that contains the place but does not center on it. */
function searchArea(x, z, r, salt) {
  const a = (Math.sin(x * 12.9898 + z * 78.233 + salt) * 43758.5453 % 1) * Math.PI * 2, off = r * 0.45;
  return { x: Math.round(x + Math.cos(a) * off), z: Math.round(z + Math.sin(a) * off), r };
}

export function makeQuests(world) {
  const quests = [], camps = world.camps, sites = world.sites ?? [];
  for (const wanted of world.wanted ?? []) {
    const camp = camps.find((c) => c.id === wanted.campId);
    if (!camp) continue;
    quests.push({
      id: `bounty-${camp.id}`, type: 'bounty', giver: 'sheriff', turnIn: 'sheriff', campId: camp.id, targetId: camp.targetId,
      title: `Wanted: ${wanted.name}`, want: wanted.want, threat: wanted.threat,
      summary: `${wanted.name} is wanted for ${wanted.crime}. Last seen ${direction(camp.x, camp.z)} of town. Carries a ${wanted.weapon.toLowerCase()}. Wears a red hat.`,
      reward: { money: wanted.want === 'alive' ? wanted.aliveReward : wanted.reward }, aliveReward: wanted.aliveReward,
      area: searchArea(camp.x, camp.z, 55, 1), leadArea: searchArea(camp.x, camp.z, 26, 2),
      fail: wanted.want === 'alive' ? `The sheriff needs ${wanted.name} alive. Killing the target fails the job.` : null,
    });
  }
  const byThreat = (d) => camps.find((c) => c.difficulty === d);
  const medium = byThreat(1), low = byThreat(0);
  if (medium) quests.push({
    id: 'clear-camp', type: 'clear', giver: 'silas', turnIn: 'silas', campId: medium.id, title: `Clear ${medium.name}`,
    summary: `Outlaws at ${medium.name} keep running off Silas Reed's cattle. Drive out or put down every one of them.`,
    reward: { money: 45, items: { bandage: 1 } }, area: searchArea(medium.x, medium.z, 50, 3), threat: THREATS[1], fail: null,
  });
  if (low) quests.push({
    id: 'medicine', type: 'medicine', giver: 'doctor', turnIn: 'doctor', campId: low.id, title: 'Stolen medicine',
    summary: `Bandits from ${low.name} took the doctor's medicine chest off the stage. Bring it back to Doctor Finch.`,
    reward: { money: 30, items: { bandage: 2 } }, area: searchArea(low.x, low.z, 45, 4), threat: THREATS[0],
    fail: 'Selling the chest to anyone else ends the job.',
  });
  const landmark = sites.find((s) => s.kind === 'landmark');
  if (landmark) quests.push({
    id: 'survey', type: 'survey', giver: 'maps', turnIn: 'maps', siteId: landmark.id, title: `Survey ${landmark.name}`,
    summary: `Elias Ward needs a bearing on ${landmark.name}, a tall rock ${direction(landmark.x, landmark.z)} of town. Stand at its foot and come back.`,
    reward: { money: 25 }, area: searchArea(landmark.x, landmark.z, 40, 5), threat: 'Low', fail: null,
  });
  const traveler = sites.find((s) => s.kind === 'traveler');
  if (traveler) quests.push({
    id: 'traveler', type: 'traveler', giver: 'clara', turnIn: 'clara', siteId: traveler.id, title: 'The missing traveler',
    summary: `Clara Finch's cousin Eli Watts never arrived from the ${direction(traveler.x, traveler.z)} road. Find him and tell her what happened.`,
    reward: { money: 15 }, bonus: 25, area: searchArea(traveler.x, traveler.z, 40, 6), threat: 'Low', fail: null,
  });
  const home = sites.find((s) => s.kind === 'homestead');
  if (home) quests.push({
    id: 'delivery', type: 'delivery', giver: 'nora', turnIn: 'nora', siteId: home.id, title: 'A parcel for the Hollis place',
    summary: `Nora Pike has medicine and letters for Amos Hollis at the homestead ${direction(home.x, home.z)} of town. It must arrive within ten minutes on the trail.`,
    reward: { money: 25 }, area: searchArea(home.x, home.z, 30, 7), threat: 'Low', limit: DELIVERY_LIMIT,
    fail: 'The parcel is late after ten minutes of trail time.',
  });
  return quests;
}

export function emptyQuestState(quests) {
  return Object.fromEntries(quests.map((q) => [q.id, { status: 'offered' }]));
}

const result = (ok, message, extra = {}) => ({ ok, message, ...extra });

export function quest(defs, id) { return defs.find((q) => q.id === id) ?? null; }

export function accept(life, defs, id) {
  const def = quest(defs, id), state = life.quests[id];
  if (!def || !state) return result(false, 'There is no such job.');
  if (state.status !== 'offered') return result(false, 'You already took this job.');
  state.status = 'active';
  state.since = life.time;
  if (def.type === 'delivery') state.parcel = true;
  // A target that is already down only needs proof; a wanted-alive job is lost.
  if (def.type === 'bounty' && life.questFlags?.[def.targetId] === 'dead') {
    if (def.want === 'alive') { state.status = 'failed'; return result(true, `${def.title}: the target is already dead. The job is lost.`); }
    if (life.questFlags[`${def.targetId}:proof`]) { state.proof = true; complete(state); return result(true, `${def.title}: you already hold the proof. Collect your pay.`); }
    state.proofReady = true;
  }
  if (def.type === 'clear' && life.camps[def.campId]?.cleared) state.status = 'complete';
  return result(true, `Job taken: ${def.title}.`);
}

/** The line shown in the quest log and HUD for the current step. */
export function objective(life, def) {
  const state = life.quests[def.id], target = def.title.replace('Wanted: ', '');
  if (state.status === 'offered') return `Talk to ${NPCS[def.giver]} to take this job.`;
  if (state.status === 'failed') return 'Failed.';
  if (state.status === 'turnedIn') return 'Done.';
  if (state.status === 'complete') return `Return to ${NPCS[def.turnIn]} for payment.`;
  switch (def.type) {
    case 'bounty':
      if (state.captive) return `Bring ${target} back to town alive.`;
      if (state.proofReady) return `Take proof from ${target}'s body.`;
      return def.want === 'alive' ? `Find ${target}. Wound until they surrender, then press E.` : `Find ${target} and bring proof or a prisoner.`;
    case 'clear': return 'Clear every outlaw from the camp.';
    case 'medicine': return state.carrying ? 'Carry the chest back to Doctor Finch.' : 'Find the medicine chest in the camp.';
    case 'survey': return 'Stand at the foot of the landmark.';
    case 'traveler': return 'Find Eli Watts on the road.';
    case 'delivery': return `Deliver the parcel to Amos Hollis. ${Math.max(0, Math.ceil((def.limit - (life.time - state.since)) / 60))} min left.`;
    default: return '';
  }
}

function complete(state) { state.status = 'complete'; }

/**
 * Applies one world event to every active quest. Returns messages to show.
 * Events: kill {targetId, campId, cleared}, proof {targetId}, captive {targetId},
 * delivered {targetId}, pickup {what}, visit {siteId}, talk {npc, choice}, tick {}.
 */
export function questEvent(life, defs, event) {
  const notes = [];
  life.questFlags ??= {};
  if (event.type === 'kill' && event.targetId) life.questFlags[event.targetId] = 'dead';
  if (event.type === 'proof' && event.targetId) life.questFlags[`${event.targetId}:proof`] = true;
  for (const def of defs) {
    const state = life.quests[def.id];
    if (!state || (state.status !== 'active' && !(state.status === 'offered' && def.type === 'bounty'))) continue;
    const active = state.status === 'active';
    if (def.type === 'bounty' && event.targetId === def.targetId) {
      if (event.type === 'kill') {
        state.captive = false;
        if (def.want === 'alive') {
          if (active) { state.status = 'failed'; notes.push(`${def.title} failed. The target had to be taken alive.`); }
        } else if (active) { state.proofReady = true; notes.push('Target down. Take proof from the body.'); }
      } else if (event.type === 'proof' && active) {
        state.proofReady = false; state.proof = true; complete(state); notes.push(`Proof taken. Return to ${NPCS[def.turnIn]}.`);
      } else if (event.type === 'captive' && active) {
        state.captive = true; notes.push('Prisoner restrained. Walk them back to town.');
      } else if (event.type === 'delivered' && active && state.captive) {
        state.captive = false; state.alive = true; complete(state); notes.push('The deputy locks up your prisoner. See the sheriff for payment.');
      }
    }
    if (!active) continue;
    if (def.type === 'clear' && event.type === 'kill' && event.campId === def.campId && event.cleared) {
      complete(state); notes.push(`${def.title}: done. Tell Silas Reed.`);
    }
    if (def.type === 'medicine' && event.type === 'pickup' && event.what === 'medicine') {
      state.carrying = true; complete(state); notes.push('Medicine chest recovered. Bring it to Doctor Finch.');
    }
    if (def.type === 'survey' && event.type === 'visit' && event.siteId === def.siteId) {
      complete(state); notes.push('Bearing taken. Report to Elias Ward.');
    }
    if (def.type === 'traveler' && event.type === 'talk' && event.npc === 'eli') {
      state.choice = event.choice; complete(state);
      notes.push(event.choice === 'bandage' ? 'Eli heads for town on his own feet. Tell Clara.' : 'You take Eli\'s letter. Clara should hear it from you.');
    }
    if (def.type === 'delivery' && event.type === 'talk' && event.npc === 'amos' && state.parcel) {
      state.parcel = false; complete(state); notes.push('Parcel delivered. Nora will want to know.');
    }
    if (def.type === 'delivery' && state.status === 'active' && life.time - state.since > def.limit) {
      state.status = 'failed'; state.parcel = false; notes.push(`${def.title} failed. The parcel is late.`);
    }
  }
  return notes;
}

/** Sells the stolen chest to the trail merchant: money now, the doctor's job ends. */
export function sellMedicine(life, defs) {
  const def = quest(defs, 'medicine'), state = def && life.quests[def.id];
  if (!state || !state.carrying || state.status !== 'complete') return result(false, 'You have nothing he wants.');
  state.carrying = false; state.status = 'failed'; state.sold = true;
  life.bounty += 40;
  return result(true, 'Juan pays $40 for the chest. The doctor will not see it now.');
}

/** Pays a finished job once. Items are added within carry limits. */
export function turnIn(life, defs, id, npc) {
  const def = quest(defs, id), state = life.quests[id];
  if (!def || !state) return result(false, 'There is no such job.');
  if (def.turnIn !== npc) return result(false, `${NPCS[def.turnIn]} pays for this job.`);
  if (state.status === 'turnedIn') return result(false, 'You were already paid.');
  if (state.status !== 'complete') return result(false, 'The job is not finished.');
  let money = def.reward.money;
  if (def.type === 'bounty' && state.alive) money = def.aliveReward;
  if (def.type === 'traveler' && state.choice === 'bandage') money += def.bonus;
  state.status = 'turnedIn';
  state.paid = money;
  state.carrying = false;
  life.bounty += money;
  for (const [item, count] of Object.entries(def.reward.items ?? {})) life.items[item] = Math.min(5, (life.items[item] ?? 0) + count);
  life.completed = (life.completed ?? 0) + 1;
  return result(true, `Paid $${money} for ${def.title.replace('Wanted: ', '')}.`, { money });
}

/** Quests this NPC can offer, take in, or talk about right now. */
export function questsFor(life, defs, npc) {
  return defs.filter((def) => {
    const s = life.quests[def.id]?.status;
    return (def.giver === npc && s === 'offered') || (def.turnIn === npc && (s === 'complete' || s === 'active'));
  });
}

export function validQuestState(value, defs) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return defs.every((def) => {
    const s = value[def.id];
    return s && typeof s === 'object' && STATUS.includes(s.status) && (s.since === undefined || Number.isFinite(s.since));
  }) && Object.keys(value).every((id) => defs.some((d) => d.id === id));
}
