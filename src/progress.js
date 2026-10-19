// Run events that change saved progress: quest steps, discoveries, site loot,
// timed effects and the first-life tips. The game object calls these; the
// rules themselves live in quests.js, items.js and life.js.
import { questEvent as applyQuestEvent } from './quests.js';
import { effectActive, AMMO, ammoMax } from './items.js';

/** Applies a quest event, then shows what changed and saves. */
export function questEvent(game, event) {
  const notes = applyQuestEvent(game.run, game.questDefs, event);
  for (const note of notes) game.ui.questNote(note);
  if (notes.length) { game.audio.play('reloadDone', { bus: 'ui', vol: 0.7, pitch: 1.5 }); game.save(); }
  return notes;
}

/** True when the active bounty for this target allows a live capture. */
export function wantsAlive(game, enemy) {
  const def = game.questDefs.find((q) => q.type === 'bounty' && q.targetId === enemy.id);
  return !!def && def.want !== 'dead' && game.run.quests[def.id]?.status === 'active';
}

export function enemyKilled(game, e) {
  const run = game.run, camp = e.encounter;
  const cleared = camp.enemies.every((x) => !x.alive) && !run.camps[camp.id].cleared;
  if (cleared) { run.camps[camp.id].cleared = true; run.camp++; }
  questEvent(game, { type: 'kill', targetId: e.isTarget ? e.id : null, campId: camp.id, cleared });
  if (e.isTarget) {
    const def = game.questDefs.find((q) => q.type === 'bounty' && q.targetId === e.id);
    if (def && def.want !== 'alive' && !run.questFlags[`${e.id}:proof`]) game.worldPoints.addProof(e);
  }
  return cleared;
}

/** Loot from caches and wrecks. Each place pays out once per life. */
export function lootSite(game, point) {
  const run = game.run, site = point.site;
  if (run.known[site.id] === 'looted') return 'Nothing left here.';
  run.known[site.id] = 'looted';
  game.worldPoints.remove(point);
  if (site.kind === 'cache') {
    run.bounty += site.money;
    const type = run.unlocked.map((k) => game.player.guns.find((g) => g.def.key === k)?.def.ammoType).find(Boolean) ?? 'pistol';
    run.ammo[type] = Math.min(ammoMax(run, type), run.ammo[type] + site.rounds);
    return `Strongbox: $${site.money} and ${site.rounds} ${AMMO[type].name.toLowerCase()}.`;
  }
  if (site.loot === 'bandage') { run.items.bandage = Math.min(5, run.items.bandage + 1); return 'You find a clean bandage in a crate.'; }
  run.ammo.pistol = Math.min(ammoMax(run, 'pistol'), run.ammo.pistol + 8);
  return 'You find 8 revolver rounds under the seat.';
}

const GRAVE_LINES = [
  'Here lies Wm. Tate. Shot for cheating at cards. The rest of his winnings are under the cairn by %.',
  'J. Ruiz, surveyor. "He marked the land and the land kept him." Someone has scratched an arrow toward %.',
];

/** Reading a grave turns a buried cache into a rumor on the map. */
export function readGrave(game, point) {
  const run = game.run, caches = run.world.sites.filter((s) => s.kind === 'cache');
  const index = run.world.sites.filter((s) => s.kind === 'grave').indexOf(point.site), cache = caches[index % caches.length];
  if (!cache) return 'The words have worn away.';
  if (!run.known[cache.id]) run.known[cache.id] = 'rumor';
  const where = `${Math.round(Math.hypot(cache.x - point.x, cache.z - point.z) / 10) * 10} paces ${bearing(point, cache)}`;
  return GRAVE_LINES[index % GRAVE_LINES.length].replace('%', where);
}

export function bearing(from, to) {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((a + 360) % 360) / 45) % 8];
}

/** Per-second checks: landmark visits, quest timers, new places and tips. */
export function tickProgress(game) {
  const run = game.run, p = game.player;
  if (!p?.alive) return;
  if (!game.frontier.inside) {
    for (const site of run.world.sites) {
      if (site.kind !== 'landmark' || Math.hypot(site.x - p.x, site.z - p.z) > 14) continue;
      questEvent(game, { type: 'visit', siteId: site.id });
    }
  }
  questEvent(game, { type: 'tick' });
  if (run.newlyFound?.length) {
    for (const name of run.newlyFound) game.ui.questNote(`Discovered: ${name}`);
    run.newlyFound = [];
  }
  for (const [id, until] of Object.entries(run.effects)) if (until <= run.time) delete run.effects[id];
  if (!effectActive(run, 'meal')) run.mealHeal = 0;
  game.tips.tick();
}

/** Medicine chest pickup. */
export function takeMedicine(game, point) {
  game.worldPoints.remove(point);
  questEvent(game, { type: 'pickup', what: 'medicine' });
  return 'You lift the medicine chest onto your shoulder.';
}

