// Rapier world wrapper: collision groups, body helpers, ray casts, interpolation.
import * as THREE from 'three';
import * as RAPIER_NS from '@dimforge/rapier3d-compat';
import { T } from './tuning.js';

export const RAPIER = RAPIER_NS.default ?? RAPIER_NS;

export async function initPhysics() {
  await RAPIER.init();
}

// Collision group bits. Interaction needs (A.member & B.filter) && (B.member & A.filter).
export const G = { GROUND: 1, WORLD: 2, PROP: 4, DEBRIS: 8, PLAYER: 16, ENEMY: 32, CORPSE: 64, SHOT: 128 };
const ALL = 0xffff;
const groups = (member, filter) => ((member << 16) | filter) >>> 0;

export const GROUPS = {
  ground: groups(G.GROUND, G.PROP | G.DEBRIS | G.CORPSE),
  world: groups(G.WORLD, ALL),
  prop: groups(G.PROP, G.GROUND | G.WORLD | G.PROP | G.DEBRIS | G.PLAYER | G.ENEMY | G.CORPSE | G.SHOT),
  debris: groups(G.DEBRIS, G.GROUND | G.WORLD | G.PROP),
  player: groups(G.PLAYER, G.WORLD | G.PROP | G.ENEMY | G.SHOT),
  enemy: groups(G.ENEMY, G.WORLD | G.PROP | G.PLAYER | G.ENEMY | G.SHOT),
  // Joined body parts must not collide with each other.
  corpse: groups(G.CORPSE, G.GROUND | G.WORLD | G.PROP),
  // Query groups
  playerMove: groups(G.PLAYER, G.WORLD | G.PROP | G.ENEMY),
  enemyMove: groups(G.ENEMY, G.WORLD | G.PROP | G.PLAYER | G.ENEMY),
  playerShot: groups(G.SHOT, G.WORLD | G.PROP | G.ENEMY),
  blockers: groups(G.SHOT, G.WORLD | G.PROP),
};

const yawQuat = (ry) => ({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) });

/** Keeps a mesh in step with a dynamic body, interpolated between ticks. */
export class PhysObj {
  constructor(body, mesh) {
    this.body = body;
    this.mesh = mesh;
    this.prevP = new THREE.Vector3();
    this.currP = new THREE.Vector3();
    this.prevQ = new THREE.Quaternion();
    this.currQ = new THREE.Quaternion();
    this.capture();
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
  }

  capture() {
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
    const t = this.body.translation(), r = this.body.rotation();
    this.currP.set(t.x, t.y, t.z);
    this.currQ.set(r.x, r.y, r.z, r.w);
  }

  render(alpha) {
    this.mesh.position.lerpVectors(this.prevP, this.currP, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQ, this.currQ, alpha);
  }
}

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = 1 / T.sim.hz;
    this.owners = new Map();
    this.tracked = new Set();
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  setOwner(collider, owner) { if (owner) this.owners.set(collider.handle, owner); }
  ownerOf(collider) { return this.owners.get(collider.handle) ?? null; }

  fixedBox(x, y, z, hx, hy, hz, ry = 0, group = GROUPS.world, owner = null) {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z).setRotation(yawQuat(ry))
      .setCollisionGroups(group).setSolverGroups(group);
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  fixedCylinder(x, y, z, halfH, r, group = GROUPS.world, owner = null) {
    const desc = RAPIER.ColliderDesc.cylinder(halfH, r).setTranslation(x, y, z)
      .setCollisionGroups(group).setSolverGroups(group);
    const c = this.world.createCollider(desc);
    this.setOwner(c, owner);
    return c;
  }

  /**
   * @param {{x:number,y:number,z:number,ry?:number,rot?:{x,y,z,w},shape:{type:string,hx?,hy?,hz?,r?,halfH?},
   *   density?:number,friction?:number,restitution?:number,group:number,linDamp?:number,angDamp?:number,owner?:any}} o
   */
  dynamic(o) {
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, o.y, o.z)
      .setRotation(o.rot ?? yawQuat(o.ry ?? 0))
      .setLinearDamping(o.linDamp ?? 0.4).setAngularDamping(o.angDamp ?? 0.6).setCanSleep(true);
    const body = this.world.createRigidBody(bd);
    const s = o.shape;
    let cd;
    if (s.type === 'box') cd = RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
    else if (s.type === 'cylinder') cd = RAPIER.ColliderDesc.cylinder(s.halfH, s.r);
    else cd = RAPIER.ColliderDesc.ball(s.r);
    cd.setDensity(o.density ?? 1).setFriction(o.friction ?? 0.7).setRestitution(o.restitution ?? 0.1)
      .setCollisionGroups(o.group).setSolverGroups(o.group);
    const collider = this.world.createCollider(cd, body);
    this.setOwner(collider, o.owner);
    return { body, collider };
  }

  kinematicCapsule(x, z, halfHeight, radius, group, owner) {
    const y = halfHeight + radius + 0.02;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(group).setSolverGroups(group), body);
    this.setOwner(collider, owner);
    return { body, collider, y };
  }

  characterController() {
    const cc = this.world.createCharacterController(0.02);
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass?.(70);
    cc.setSlideEnabled?.(true);
    return cc;
  }

  track(obj) { this.tracked.add(obj); return obj; }
  untrack(obj) { this.tracked.delete(obj); }

  /** Returns {dist,x,y,z,nx,ny,nz,collider,owner} or null. Direction must be normalized. */
  castRay(ox, oy, oz, dx, dy, dz, max, group, exclude = undefined) {
    const r = this.ray;
    r.origin = { x: ox, y: oy, z: oz };
    r.dir = { x: dx, y: dy, z: dz };
    const hit = this.world.castRayAndGetNormal(r, max, true, undefined, group, exclude);
    if (!hit) return null;
    const t = hit.timeOfImpact ?? hit.toi;
    return {
      dist: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t,
      nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z,
      collider: hit.collider, owner: this.ownerOf(hit.collider),
    };
  }

  /** True if nothing solid (world or props) blocks the straight line at height y. */
  los(ax, az, bx, bz, y = T.player.gunHeight) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return !this.castRay(ax, y, az, dx / d, 0, dz / d, d, GROUPS.blockers);
  }

  removeBody(body) {
    if (!body) return;
    for (let i = 0; i < body.numColliders(); i++) this.owners.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  removeCollider(collider) {
    this.owners.delete(collider.handle);
    this.world.removeCollider(collider, false);
  }

  step() {
    this.world.step();
    for (const o of this.tracked) o.capture();
  }

  free() {
    this.tracked.clear();
    this.owners.clear();
    this.world.free();
  }
}
