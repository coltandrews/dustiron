// Procedural animation shared by the player and bandits: leg swing, bob,
// aim pose, hit flash, and the pivot used for dodge rolls.
import * as THREE from 'three';

const PIVOT_Y = 0.85;

/** Re-parents the body under a pivot at hip height so it can roll in place. */
export function addRollPivot(model) {
  const pivot = new THREE.Group();
  pivot.position.y = PIVOT_Y;
  model.root.add(pivot);
  pivot.add(model.body);
  model.body.position.y = -PIVOT_Y;
  model.pivot = pivot;
  model.phase = Math.random() * 6;
  model.armPitch = model.arm.rotation.x;
  return model;
}

/**
 * @param {object} m model from makeCharacter + addRollPivot
 * @param {{speed:number, dt:number, aiming:boolean, flash:number, roll?:number}} s
 */
export function animateCharacter(m, s) {
  const moving = Math.min(1, s.speed / 3.2);
  m.phase += s.dt * (4 + s.speed * 1.9);
  const swing = Math.sin(m.phase) * 0.75 * moving;
  m.legs[0].rotation.x = swing;
  m.legs[1].rotation.x = -swing;
  if (m.knees) {
    m.knees[0].rotation.x = Math.max(0, swing) * 1.1 + 0.05 * moving;
    m.knees[1].rotation.x = Math.max(0, -swing) * 1.1 + 0.05 * moving;
  }
  m.body.position.y = -PIVOT_Y + Math.abs(Math.sin(m.phase)) * 0.06 * moving;
  m.body.rotation.z = Math.sin(m.phase) * 0.03 * moving;

  const targetPitch = s.aiming ? 0.12 : 0.45;
  m.armPitch += (targetPitch - m.armPitch) * Math.min(1, s.dt * 14);
  m.arm.rotation.x = m.armPitch;

  if (s.roll !== undefined && s.roll >= 0) {
    m.pivot.rotation.x = s.roll * Math.PI * 2;
    const squash = 1 - Math.sin(s.roll * Math.PI) * 0.25;
    m.pivot.scale.set(1, squash, 1);
    m.pivot.position.y = PIVOT_Y * squash * 0.8 + 0.1;
  } else {
    m.pivot.rotation.x *= 0.5;
    m.pivot.scale.set(1, 1, 1);
    m.pivot.position.y = PIVOT_Y;
  }
  m.material.emissiveIntensity = s.flash > 0 ? 0.9 : 0;
}

/** Hip height of a seated character. Chair seats are built 0.09 m below it. */
export const SEAT_HIP = 0.5;

/** Bends hips and knees so the thighs rest on a seat and the boots reach the floor. */
export function poseSeated(m) {
  const tall = m.tall ?? 1;
  m.legs[0].rotation.x = m.legs[1].rotation.x = -1.45;
  if (m.knees) m.knees[0].rotation.x = m.knees[1].rotation.x = 1.6;
  m.body.position.y = SEAT_HIP - PIVOT_Y - 0.82 * tall;
  m.body.rotation.z = 0;
}

export function showGun(m, kind) {
  for (const [k, mesh] of Object.entries(m.guns)) mesh.visible = k === kind;
}

/** Smallest signed angle from a to b. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnToward(current, target, maxStep) {
  const d = angleDelta(current, target);
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}

/** Converts a character's living model into a tumbling physics corpse. */
export function makeCorpse(game, model, x, z, yaw, dirX, dirZ, force, tall = 1) {
  const pivot = new THREE.Group();
  game.levelGroup.add(pivot);
  model.root.position.set(0, -0.92 * tall, 0);
  model.root.rotation.set(0, 0, 0);
  pivot.add(model.root);
  return game.spawnCorpse(pivot, x, z, yaw, dirX, dirZ, force, tall);
}
