// Ambient traffic: townsfolk strolling the boardwalks, riders on the roads and
// covered wagons hauling freight between Mercy Crossing and Pine Hollow.
// Every position is a pure function of the world clock, so all players online
// see the same wagon at the same bend without any of it being networked.
import * as THREE from 'three';
import { PAL, Shape, meshOf, wagonShape } from './models.js';
import { RAPIER, GROUPS } from './physics.js';
import { horse as horseShape } from './interior-social.js';
import { townsperson } from './townsfolk.js';
import { animateCharacter, poseSeated } from './character.js';
import { MAIN_STREET, smooth } from './land.js';
import { PINE_HOLLOW, pineRoadPoints } from './terrain.js';
import { PINE_STREET } from './town-pine.js';
import { T as TUNE } from './tuning.js';

const A = TUNE.ambient;

/** A polyline walked at constant speed, there and back. */
class Path {
  constructor(points) {
    this.points = points;
    this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    this.length = this.cum[this.cum.length - 1];
  }

  /** Writes {x, z, yaw} at distance `d` along a ping-pong loop; `side` shifts it to the right of travel. */
  at(d, out, side = 0) {
    const L = this.length, loop = ((d % (2 * L)) + 2 * L) % (2 * L), back = loop > L, s = back ? 2 * L - loop : loop;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.points[i - 1], b = this.points[i], seg = this.cum[i] - this.cum[i - 1] || 1, k = (s - this.cum[i - 1]) / seg;
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    if (back) { dx = -dx; dz = -dz; }
    out.x = a.x + (b.x - a.x) * k - dz * side;
    out.z = a.z + (b.z - a.z) * k + dx * side;
    out.yaw = Math.atan2(dx, dz);
    return out;
  }
}

const LOOKS = [
  { shirt: 0x9a6a4a, vest: 0x3a3028, hat: 0x6a5238, band: PAL.woodDark, pants: 0x3a3a44 },
  { shirt: 0xd8cfb8, vest: 0x5a3a2a, hat: 0x2b2420, band: 0x8a2f3c, pants: 0x4a4038 },
  { shirt: 0x5a7a8a, vest: 0x2e2a26, hat: 0x8a7a5a, band: PAL.woodDark, pants: 0x34302c },
  { shirt: 0x8a3a2a, vest: 0x3a3a30, hat: 0x5a4a3a, band: PAL.woodDark, pants: 0x3a4250 },
  { shirt: 0x6a7a4a, vest: 0x4a3a28, hat: 0x3a2e24, band: PAL.brass, pants: 0x3f3a33, apron: 0xe8dcc0 },
  { shirt: 0xb08a6a, vest: 0x2b2026, hat: 0xc9a273, band: 0x2b2026, pants: 0x3a2f35 },
];
const COATS = [0x704631, 0x3a2a20, 0x9a8a78, 0x5a3a28, 0xc8b89a];
const smoothPts = (pts) => smooth(pts, 3);

/** Mercy's main street (south bank to the north edge) and then the stage road to Pine Hollow's chapel. */
function stageRoute() {
  const T = PINE_HOLLOW, mercy = smoothPts(MAIN_STREET).slice().reverse();
  const pine = pineRoadPoints();
  const street = [];
  for (let z = T.z + PINE_STREET.south - 6; z >= T.z + PINE_STREET.north + 10; z -= 6) street.push({ x: T.x, z });
  return [...mercy, ...pine, ...street];
}

/** Strolling routes along Pine Hollow's boardwalks and Mercy's main street. */
function walkRoutes() {
  const T = PINE_HOLLOW, routes = [];
  for (const side of [-1, 1]) routes.push([{ x: T.x + side * 8.4, z: T.z - 29 }, { x: T.x + side * 8.4, z: T.z + 23 }]);
  routes.push([{ x: T.x - 3, z: T.z + 40 }, { x: T.x - 3, z: T.z - 27 }, { x: T.x - 1.6, z: T.z - 34 }]);
  routes.push([{ x: T.x + 9.4, z: T.z - 3 }, { x: T.x + 18, z: T.z - 3 }, { x: T.x + 22, z: T.z - 8 }, { x: T.x + 22, z: T.z - 18 }]);
  routes.push([{ x: T.x - 9.4, z: T.z + 23.5 }, { x: T.x - 18, z: T.z + 23.5 }, { x: T.x - 18, z: T.z + 30 }, { x: T.x - 21, z: T.z + 33 }]);
  const mercy = smoothPts(MAIN_STREET).filter((p) => p.z > -40 && p.z < 24);
  for (const side of [-3.4, 3.4]) routes.push(mercy.map((p) => ({ x: p.x + side, z: p.z })));
  return routes;
}

export function buildAmbient(game, group) {
  if (game.headless) return null;
  const root = new THREE.Group(); group.add(root);
  const stage = new Path(stageRoute()), out = { x: 0, z: 0, yaw: 0 }, ahead = { x: 0, z: 0, yaw: 0 };
  const walkers = [], riders = [], wagons = [];
  const horseMesh = (coat, tack) => { const s = new Shape(); horseShape(s, coat, 0x2a211c, tack); return meshOf(s); };

  walkRoutes().forEach((pts, i) => {
    const count = i < 2 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const model = townsperson(LOOKS[(i * 2 + k) % LOOKS.length]);
      root.add(model.root);
      walkers.push({ path: new Path(pts), model, speed: A.walkSpeed * (0.85 + ((i * 7 + k * 3) % 5) * 0.06), offset: (i * 37 + k * 61) % 97, anim: { speed: 0, dt: 0, aiming: false, flash: 0 } });
    }
  });
  for (let i = 0; i < A.riders; i++) {
    const model = townsperson(LOOKS[(i + 3) % LOOKS.length]), horse = horseMesh(COATS[i % COATS.length], true);
    root.add(model.root, horse);
    riders.push({ model, horse, speed: A.riderSpeed * (0.9 + (i % 3) * 0.1), offset: (stage.length * 2 / A.riders) * i, side: 1.4 + (i % 2) * 0.6, anim: { speed: 0, dt: 0, aiming: false, flash: 0 } });
  }
  for (let i = 0; i < A.wagons; i++) {
    const rig = new THREE.Group(), body = meshOf(wagonShape());
    rig.add(body);
    for (const x of [-0.75, 0.75]) { const h = horseMesh(COATS[(i + (x > 0 ? 1 : 2)) % COATS.length], false); h.position.set(x, 0, 3.7); h.scale.setScalar(0.95); rig.add(h); }
    const driver = townsperson(LOOKS[(i * 2 + 1) % LOOKS.length]);
    driver.root.position.set(0, 0.55, 1.7); poseSeated(driver); driver.arm.rotation.x = 1.0;
    rig.add(driver.root); root.add(rig);
    const bd = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -20, 0);
    const bodyRb = game.physics.world.createRigidBody(bd);
    game.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(1.1, 1.1, 3.2).setTranslation(0, 1.1, 1.2)
      .setCollisionGroups(GROUPS.world).setSolverGroups(GROUPS.world), bodyRb);
    wagons.push({ rig, rb: bodyRb, driver, wheel: 0, offset: stage.length * (0.3 + i * 0.85), speed: A.wagonSpeed });
  }

  let clock = null, prev = null;
  const quat = { x: 0, y: 0, z: 0, w: 1 }, pos = { x: 0, y: 0, z: 0 };
  const far = (x, z) => { const p = game.player; return !p || Math.hypot(p.x - x, p.z - z) > A.drawRange; };

  return {
    walkers, riders, wagons, stage,
    /** The shared clock, eased toward the server's so every rider sees the same traffic. */
    tick(dt) {
      const target = game.worldClock ?? game.time;
      prev = clock;
      if (clock === null || Math.abs(target - clock) > 3) clock = prev = target;
      else clock += dt + (target - clock) * Math.min(1, dt * 2);
      for (const w of wagons) {
        stage.at(clock * w.speed + w.offset, out);
        pos.x = out.x; pos.z = out.z; pos.y = 0;
        quat.y = Math.sin(out.yaw / 2); quat.w = Math.cos(out.yaw / 2);
        w.rb.setNextKinematicTranslation(pos); w.rb.setNextKinematicRotation(quat);
      }
    },
    render(alpha, dt) {
      if (clock === null) return;
      const t = prev + (clock - prev) * alpha;
      for (const w of walkers) {
        w.path.at(t * w.speed + w.offset, out);
        const hide = far(out.x, out.z);
        w.model.root.visible = !hide;
        if (hide) continue;
        w.model.root.position.set(out.x, 0, out.z); w.model.root.rotation.y = out.yaw;
        w.anim.speed = w.speed; w.anim.dt = dt; animateCharacter(w.model, w.anim); w.model.arm.rotation.x = 0.2;
      }
      for (const r of riders) {
        stage.at(t * r.speed + r.offset, out, r.side);
        const hide = far(out.x, out.z);
        r.model.root.visible = r.horse.visible = !hide;
        if (hide) continue;
        const bob = Math.abs(Math.sin(t * r.speed * 1.6 + r.offset)) * 0.08;
        r.horse.position.set(out.x, bob, out.z); r.horse.rotation.y = out.yaw;
        r.model.root.position.set(out.x, 1.18 + bob, out.z); r.model.root.rotation.y = out.yaw;
        r.anim.speed = 0; r.anim.dt = dt; animateCharacter(r.model, r.anim);
        const m = r.model;
        m.legs[0].rotation.set(-1.25, 0, -0.32); m.legs[1].rotation.set(-1.25, 0, 0.32);
        if (m.knees) m.knees[0].rotation.x = m.knees[1].rotation.x = 1.35;
        m.arm.rotation.x = 1.1;
      }
      for (const w of wagons) {
        stage.at(t * w.speed + w.offset, out);
        // Look a little ahead so the team leads the wagon round the bends.
        stage.at(t * w.speed + w.offset + 2, ahead);
        const hide = far(out.x, out.z);
        w.rig.visible = !hide;
        if (hide) continue;
        w.rig.position.set(out.x, Math.abs(Math.sin(t * 5 + w.offset)) * 0.03, out.z);
        w.rig.rotation.y = Math.atan2(ahead.x - out.x, ahead.z - out.z) || out.yaw;
      }
    },
  };
}
