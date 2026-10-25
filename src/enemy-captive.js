// Surrender and escort: a badly hurt bounty target drops the gun, kneels and
// waits. Once restrained (E) the prisoner walks a few steps behind the player.
import { townsOf } from './towns.js';
import { GROUPS, RAPIER } from './physics.js';
import { showGun, turnToward } from './character.js';

export const FOLLOW_GAP = 2.2;
export const LEASH = 16;

export function surrender(e) {
  const g = e.game;
  e.surrendered = true;
  e.captive = false;
  e.knows = false;
  e.releaseToken();
  e.hideAimLine();
  if (g.flanker === e) g.flanker = null;
  e.setState('surrender');
  showGun(e.model, null);
  g.audio.at('alert', e.x, e.z, { vol: 0.6, pitch: 0.7 });
  g.ui.toast(`${e.encounter.targetName ?? 'The outlaw'} gives up. Press E to restrain.`, 4);
}

/** The interaction point for a surrendered or escorted target. */
export function captivePoint(e) {
  if (!e.alive || !e.surrendered || e.captive || e.jailed) return null;
  return { id: `restrain-${e.id}`, kind: 'restrain', label: 'Restrain the outlaw', x: e.x, z: e.z, enemy: e };
}

export function restrain(e) {
  if (!e.surrendered || e.captive) return false;
  e.captive = true;
  e.setState('captive');
  e.game.questEvent({ type: 'captive', targetId: e.id });
  return true;
}

/** Moves without the camp clamp, so a prisoner can cross open country. */
function step(e, mx, mz, dt) {
  const cc = e.game.enemyController;
  cc.computeColliderMovement(e.collider, { x: mx, y: 0, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.enemyMove);
  const mv = cc.computedMovement();
  e.x += mv.x; e.z += mv.z;
  e.body.setNextKinematicTranslation({ x: e.x, y: e.bodyY, z: e.z });
  e.moveSpeed = Math.hypot(mv.x, mv.z) / dt;
}

export function teleport(e, x, z) {
  e.x = e.px = x; e.z = e.pz = z;
  e.body.setTranslation({ x, y: e.bodyY, z }, true);
  e.body.setNextKinematicTranslation({ x, y: e.bodyY, z });
}

export function tickCaptive(e, dt) {
  const P = e.game.player;
  e.moveSpeed = 0;
  if (e.jailed) return;
  if (!e.captive || !P.alive) {
    // Kneel and face whoever has the gun.
    if (P.alive) e.yaw = turnToward(e.yaw, Math.atan2(P.x - e.x, P.z - e.z), dt * 3);
    e.body.setNextKinematicTranslation({ x: e.x, y: e.bodyY, z: e.z });
    return;
  }
  const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
  if (e.game.frontier?.inside) return;
  // A prisoner left far behind is pulled back to a spot just behind the player.
  if (d > LEASH) { teleport(e, P.x - Math.sin(P.yaw) * FOLLOW_GAP, P.z - Math.cos(P.yaw) * FOLLOW_GAP); return; }
  if (d > FOLLOW_GAP) {
    const speed = Math.min(6.5, 2 + (d - FOLLOW_GAP) * 2);
    step(e, dx / d * speed * dt, dz / d * speed * dt, dt);
    e.yaw = turnToward(e.yaw, Math.atan2(dx, dz), dt * 8);
  } else e.body.setNextKinematicTranslation({ x: e.x, y: e.bodyY, z: e.z });
  // Reaching town hands the prisoner to the deputy.
  if (e.game.inTown() && townsOf(e.game.run.world).some((t) => Math.hypot(e.x - t.x, e.z - t.z) < t.radius + 4)) {
    e.jailed = true;
    e.captive = false;
    e.model.root.visible = false;
    e.game.physics.removeBody(e.body);
    e.body = null;
    e.alive = false;
    e.game.questEvent({ type: 'delivered', targetId: e.id });
    e.game.save();
  }
}
