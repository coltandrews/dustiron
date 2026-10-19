// The player's shot: spread from the gun state, light aim assist, then a ray
// that can hit a head, the body or only graze a limb.
import { T } from './tuning.js';
import { GROUPS } from './physics.js';
import { angleDelta } from './character.js';
import { randSpread } from './rng.js';

const DEG = Math.PI / 180;
/** Distance from a bandit's center line that counts as a head shot or a graze. */
export const HEAD_LINE = 0.13;
export const GRAZE_LINE = 0.3;

/** Classifies a hit by how far the ray passes from the target's center line. */
export function hitZone(ox, oz, rx, rz, tx, tz, precise) {
  const perp = Math.abs((tx - ox) * rz - (tz - oz) * rx);
  if (precise && perp < HEAD_LINE) return 'head';
  return perp > GRAZE_LINE ? 'limb' : 'body';
}
export const ZONE_DAMAGE = { head: 2.2, body: 1, limb: 0.7 };

export function fireShot(player) {
  const g = player.game, gun = player.gun, def = gun.def;
  if (g.inTown()) return;
  const steady = player.steady;
  const spreadDeg = gun.fire(player.moveFraction, steady, player.sway);
  player.steadyT = 0;
  const aim = g.intent.aim;
  let dx = Math.sin(player.yaw), dz = Math.cos(player.yaw);
  if (aim) {
    const ax = aim.x - player.x, az = aim.z - player.z, l = Math.hypot(ax, az);
    if (l > 1.2) { dx = ax / l; dz = az / l; }
  }
  // Aim assist bends up to a few degrees toward a bandit near the line.
  let baseA = Math.atan2(dx, dz), best = T.aimAssist.angleDeg * DEG;
  for (const e of g.enemies) {
    if (!e.alive || e.surrendered) continue;
    const ex = e.x - player.x, ez = e.z - player.z, d = Math.hypot(ex, ez);
    if (d > T.aimAssist.range || d < 0.5) continue;
    const off = Math.abs(angleDelta(baseA, Math.atan2(ex, ez)));
    if (off < best && g.physics.los(player.x, player.z, e.x, e.z)) { best = off; baseA = Math.atan2(ex, ez); }
  }

  const mz = player.muzzle(), y = T.player.gunHeight;
  const mult = g.deadEye.active ? T.deadEye.damageMult : 1;
  const precise = steady || g.deadEye.active;
  let anyHit = false, anyKill = false, anyCrit = false, head = false;
  for (let i = 0; i < def.pellets; i++) {
    const a = baseA + randSpread((spreadDeg * DEG) / 2);
    const rx = Math.sin(a), rz = Math.cos(a);
    const max = def.range * (def.pellets > 1 ? 1.35 : 1.8);
    let ox = player.x, oz = player.z, traveled = 0, pierce = def.pierce, exclude = player.collider;
    let endX = ox + rx * max, endZ = oz + rz * max;
    for (let guard = 0; guard < 4; guard++) {
      const hit = g.physics.castRay(ox, y, oz, rx, 0, rz, max - traveled, GROUPS.playerShot, exclude);
      if (!hit) { endX = ox + rx * (max - traveled); endZ = oz + rz * (max - traveled); break; }
      const d = traveled + hit.dist;
      const fall = d <= def.range ? 1 : Math.max(0.5, 1 - (d - def.range) / def.range);
      const owner = hit.owner;
      endX = hit.x; endZ = hit.z;
      if (owner && owner.onHit) {
        const zone = def.pellets > 1 ? 'body' : hitZone(ox, oz, rx, rz, owner.x, owner.z, precise);
        const res = owner.onHit(def.damage * fall * mult * ZONE_DAMAGE[zone], rx, rz, def.knockback, zone);
        anyHit = true; anyKill ||= res.killed; anyCrit ||= res.crit || zone === 'head'; head ||= zone === 'head';
        g.fx.impact('flesh', hit.x, hit.y, hit.z, hit.nx, hit.nz, rx, rz);
        g.audio.at('hitFlesh', hit.x, hit.z, { vol: 0.8 });
        if (res.killed) g.onEnemyKilled(owner, res.crit || zone === 'head');
        else g.deadEye.add(T.deadEye.fillHit);
        if (pierce > 0) { pierce--; traveled = d + 0.05; ox = hit.x + rx * 0.05; oz = hit.z + rz * 0.05; exclude = hit.collider; continue; }
      } else if (owner && owner.damage) {
        const surface = owner.damage(def.damage * fall * mult, hit.x, hit.y, hit.z, rx, rz, def.impulse, 'player');
        g.fx.impact(surface === 'cloth' || surface === 'plant' ? 'dirt' : surface, hit.x, hit.y, hit.z, hit.nx, hit.nz, rx, rz);
        g.audio.at(surface === 'wood' || surface === 'water' ? 'hitWood' : 'hitDirt', hit.x, hit.z, { vol: 0.6 });
      } else {
        g.fx.impact('dirt', hit.x, hit.y, hit.z, hit.nx, hit.nz, rx, rz);
        g.audio.at('hitDirt', hit.x, hit.z, { vol: 0.5 });
      }
      break;
    }
    g.fx.tracer(mz.x, mz.y, mz.z, endX, y, endZ, g.deadEye.active ? 0xffb070 : 0xffe7b0);
  }

  g.fx.muzzle(mz.x, mz.y, mz.z, dx, dz, def.pellets > 1);
  if (def.key !== 'shotgun') g.fx.casing(player.x, 1.0, player.z, dx, dz);
  g.audio.play(def.sound, { vol: 1, vary: 0.06, pitch: def.pitch });
  g.addTrauma(def.trauma);
  g.noise(player.x, player.z, T.enemy.hearRange);
  g.stats.shots++;
  if (anyHit) { g.stats.hits++; g.ui.hitMarker(anyKill, head); }
  if (anyCrit && !anyKill) g.hitStop(T.hitStop.crit);
  // Recoil pushes the shooter back a little and kicks the aim line for heavy guns.
  player.vx -= dx * 0.6; player.vz -= dz * 0.6;
  player.recoil = Math.min(1, player.recoil + def.trauma);
}
