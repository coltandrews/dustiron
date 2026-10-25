// An animated horse: the body is one mesh, each leg is a thigh and a shin that
// bend at the knee. animateHorse() picks a gait from the ground speed (walk,
// trot or gallop), sets each leg's place in the stride, and bobs and rocks the
// body to match. Used by the player's horse, other riders' horses and the
// riders and wagon teams on the roads.
import * as THREE from 'three';
import { MAT, PAL, Shape } from './models.js';
import { horse as horseShape } from './interior-social.js';
import { T } from './tuning.js';

const HIP_Y = 1.1, KNEE = 0.54;
/** [x, z, hind] for left fore, right fore, left hind, right hind. */
const LEGS = [[-0.22, 0.62, false], [0.22, 0.62, false], [-0.22, -0.68, true], [0.22, -0.68, true]];
/**
 * Where in the stride each foot lands (fraction of a cycle), how long it stays
 * down (duty), how far it swings (radians), how much the knee folds and how
 * long one stride is in metres.
 *   walk: four beats, LH LF RH RF       trot: diagonal pairs together
 *   gallop: RH LH RF LF, one leading leg after the other
 */
const GAITS = {
  walk: { feet: [0.25, 0.75, 0, 0.5], duty: 0.62, swing: 0.32, knee: 0.75, stride: 1.7, bob: 0.025, pitch: 0.015 },
  trot: { feet: [0, 0.5, 0.5, 0], duty: 0.46, swing: 0.48, knee: 1.1, stride: 2.6, bob: 0.06, pitch: 0.02 },
  gallop: { feet: [0.6, 0.5, 0.1, 0], duty: 0.36, swing: 0.72, knee: 1.35, stride: 4.6, bob: 0.1, pitch: 0.07 },
};

const legGeometry = new Map();
function legParts(coat) {
  let parts = legGeometry.get(coat);
  if (parts) return parts;
  const dark = new THREE.Color(coat).multiplyScalar(0.62).getHex();
  const thigh = new Shape(), shin = new Shape();
  thigh.cyl(0.1, 0.075, 0.56, 6, coat, 0, -KNEE / 2, 0);
  shin.cyl(0.055, 0.06, 0.48, 5, dark, 0, -0.24, 0);
  shin.box(0.13, 0.1, 0.16, PAL.black, 0, -0.51, 0.02);
  parts = { thigh: thigh.build(), shin: shin.build() };
  legGeometry.set(coat, parts);
  return parts;
}

const mesh = (geometry) => { const m = new THREE.Mesh(geometry, MAT.solid); m.castShadow = true; m.receiveShadow = true; return m; };

/** Builds a horse facing +z. `root` goes in the scene; `body.position.y` is the saddle's rise and fall. */
export function horseRig(coat = 0x704631, mane = 0x2a211c, tack = true) {
  const root = new THREE.Group(), body = new THREE.Group();
  const s = new Shape();
  horseShape(s, coat, mane, tack, false);
  body.add(mesh(s.build()));
  root.add(body);
  const parts = legParts(coat), legs = [];
  for (const [x, z, hind] of LEGS) {
    const hip = new THREE.Group(), knee = new THREE.Group();
    hip.position.set(x, HIP_Y, z);
    knee.position.y = -KNEE;
    hip.add(mesh(parts.thigh)); knee.add(mesh(parts.shin)); hip.add(knee);
    body.add(hip);
    legs.push({ hip, knee, hind });
  }
  return { root, body, legs, cycle: 0, gait: 0, speed: 0 };
}

const smooth = (t) => t * t * (3 - 2 * t);

/** One leg's swing angle and knee bend at stride phase `p` (0..1, landing at 0). */
function legPose(g, p, hind, out) {
  if (p < g.duty) {
    // Planted: the body passes over the hoof, so the leg sweeps from reaching (-) to pushing (+).
    out.hip = -g.swing + (2 * g.swing * p) / g.duty;
    out.knee = 0;
  } else {
    // In the air: the knee folds and the leg reaches forward for the next step.
    const q = (p - g.duty) / (1 - g.duty);
    out.hip = g.swing - 2 * g.swing * smooth(q);
    out.knee = Math.sin(q * Math.PI) * g.knee * (hind ? 0.85 : 1);
  }
  return out;
}

const _pose = { hip: 0, knee: 0 };

/**
 * Moves the legs and body for a horse travelling at `speed` m/s. Call once a frame.
 * Positive x rotation swings a hoof backward, so a leg reaching forward is negative;
 * fore knees fold the shin back, hocks fold it forward.
 */
export function animateHorse(rig, speed, dt) {
  const A = T.horseGait;
  rig.speed += (speed - rig.speed) * Math.min(1, dt * 6);
  const v = rig.speed, moving = v > A.still;
  const g = v < A.trot ? GAITS.walk : v < A.gallop ? GAITS.trot : GAITS.gallop;
  if (moving) rig.cycle = (rig.cycle + (dt * v) / g.stride) % 1;
  const ease = Math.min(1, dt * 18);
  for (let i = 0; i < 4; i++) {
    const leg = rig.legs[i];
    let hip = 0, knee = 0;
    if (moving) {
      legPose(g, (rig.cycle - g.feet[i] + 1) % 1, leg.hind, _pose);
      hip = _pose.hip; knee = leg.hind ? -_pose.knee * 0.6 : _pose.knee;
    }
    leg.hip.rotation.x += (hip - leg.hip.rotation.x) * ease;
    leg.knee.rotation.x += (knee - leg.knee.rotation.x) * ease;
  }
  // Two bounces a stride at the walk and trot, one big rock at the gallop.
  const beat = g === GAITS.gallop ? rig.cycle : rig.cycle * 2;
  const amount = moving ? Math.min(1, v / A.trot) : 0;
  rig.body.position.y = Math.abs(Math.sin(beat * Math.PI * 2)) * g.bob * amount;
  rig.body.rotation.x = Math.sin(rig.cycle * Math.PI * 2) * g.pitch * amount;
}
