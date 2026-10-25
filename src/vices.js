// Drinking and smoking. Drink makes the rider sway, walk a little crooked and
// blurs the world; tobacco restores Dead Eye and steadies the hands. Both show
// on other riders online through their pose flags.
import { SMOKES, effectActive, useItem } from './items.js';

/** Drunkenness fades by itself over about three minutes. */
const SOBER_RATE = 0.008;

export function drunkness(run) { return run?.drunk ?? 0; }

/** Extra aim sway from drink, on top of the whiskey shakes. */
export function drinkSway(run) {
  return (effectActive(run, 'whiskey') ? 1.4 : 0) + drunkness(run) * 2.2;
}

/** Aim spread multiplier: tobacco calms the hands. */
export function calmFactor(run) {
  return effectActive(run, 'smoke') ? 0.82 : 1;
}

/** Bends the walking direction from side to side while drunk. */
export function staggerMove(run, time, move) {
  const d = drunkness(run);
  if (d < 0.05 || (!move.x && !move.z)) return move;
  const a = (Math.sin(time * 1.3) + Math.sin(time * 2.9) * 0.5) * d * 0.42, c = Math.cos(a), s = Math.sin(a);
  return { x: move.x * c - move.z * s, z: move.x * s + move.z * c };
}

/** Per-tick upkeep: sobering up and smoke puffs. */
export function tickVices(player, dt) {
  const g = player.game, run = player.run;
  if (run.drunk > 0) run.drunk = Math.max(0, run.drunk - dt * SOBER_RATE);
  if (player.smokeT > 0) {
    player.smokeT -= dt;
    player.puffT = (player.puffT ?? 0) - dt;
    if (player.puffT <= 0) { player.puffT = 1.1; puff(g, player.x, player.z, player.yaw); }
  } else if (effectActive(run, 'smoke')) {
    player.puffT = (player.puffT ?? 2) - dt;
    if (player.puffT <= 0) { player.puffT = 2.6; puff(g, player.x, player.z, player.yaw, 0.5); }
  }
}

/** A small curl of smoke at the mouth. */
export function puff(g, x, z, yaw, size = 1) {
  g.fx.emit('dust', x + Math.sin(yaw) * 0.25, 1.75, z + Math.cos(yaw) * 0.25, Math.max(1, Math.round(3 * size)), Math.sin(yaw) * 0.2, Math.cos(yaw) * 0.2, 0.35);
}

/** Lights a cigarette, or a cigar when there are no cigarettes left. */
export function smoke(player) {
  const g = player.game, run = player.run;
  if (!player.alive || player.rolling || player.bandaging || player.smokeT > 0) return;
  const id = run.items.cigarette > 0 ? 'cigarette' : run.items.cigar > 0 ? 'cigar' : null;
  if (!id) { g.ui.toast('Nothing to smoke. The saloon sells cigarettes.'); return; }
  const res = useItem(run, id, { inFight: true });
  if (!res.ok) { g.ui.toast(res.message); return; }
  player.smokeT = 5;
  g.deadEye.meter = run.deadEye;
  g.audio.play('match', { vol: 0.6 });
  g.ui.toast(id === 'cigar' ? `A slow cigar · calm for ${SMOKES.cigar.seconds}s` : 'You light a cigarette.', 2.5);
  g.save();
}

/** Drinks one carried or freshly bought drink right away. */
export function drink(game, id) {
  const run = game.run, res = useItem(run, id, { inFight: true });
  if (res.ok) {
    game.deadEye.meter = run.deadEye;
    game.audio.play('gulp', { vol: 0.7 });
    const d = run.drunk;
    game.ui.toast(d > 1.1 ? 'The floor tilts. Maybe that was enough.' : d > 0.6 ? 'Warm in the chest and loose in the knees.' : 'That hits the spot.', 3);
  }
  return res;
}

/** Screen effects from drink: a soft blur and warm wash that grow with each glass. */
export function drunkScreen(app, run, time) {
  const d = drunkness(run);
  const blur = d > 0.45 ? (d - 0.45) * 1.6 * (0.75 + Math.sin(time * 0.9) * 0.25) : 0;
  const filter = d > 0.05 ? `blur(${blur.toFixed(2)}px) saturate(${(1 + d * 0.35).toFixed(2)}) sepia(${(d * 0.15).toFixed(2)})` : '';
  if (!app?.style || !app.dataset) return;
  if (app.dataset.vice !== filter) { app.dataset.vice = filter; app.style.setProperty('--vice-filter', filter || 'none'); }
}
