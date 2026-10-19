// Angled follow camera: spring follow, look-ahead toward the cursor, trauma shake.
import * as THREE from 'three';
import { T } from './tuning.js';

const DEG = Math.PI / 180;

export class CameraRig {
  constructor() {
    const c = T.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, 16 / 9, 0.5, 140);
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.trauma = 0;
    this.distance = c.distance;
    this.targetDistance = c.distance;
    this.time = 0;
    this.phase = [Math.random() * 100, Math.random() * 100, Math.random() * 100];
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -T.player.gunHeight);
    this.aim = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
  }

  offset() {
    const c = T.camera;
    const p = c.pitchDeg * DEG;
    return { y: Math.sin(p) * this.distance, z: Math.cos(p) * this.distance };
  }

  zoom(steps) {
    const c = T.camera;
    this.targetDistance = Math.max(c.minDistance, Math.min(c.maxDistance, this.targetDistance + steps * c.zoomStep));
  }

  snap(x, z) {
    this.target.set(x, 0, z);
    this.place(0);
  }

  addTrauma(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  /** Projects the cursor onto the gun-height plane using the unshaken camera. */
  projectCursor(ndcX, ndcY) {
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -T.player.gunHeight;
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.aim);
    return hit ? this.aim : null;
  }

  place(roll) {
    const o = this.offset();
    this.camera.position.set(this.target.x, o.y, this.target.z + o.z);
    this.camera.lookAt(this.target.x, 0, this.target.z);
    if (roll) this.camera.rotateZ(roll);
    this.camera.updateMatrixWorld();
  }

  /**
   * @param {number} dt real seconds
   * @param {{x:number,z:number}} focus player position
   * @param {{x:number,z:number}|null} aim aim point
   * @param {() => void} beforeShake called with the unshaken camera (for cursor projection)
   */
  update(dt, focus, aim, beforeShake) {
    const c = T.camera;
    this.targetDistance = Math.max(c.minDistance, Math.min(c.maxDistance, this.targetDistance));
    if (c.fov !== this.camera.fov) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    this.time += dt;
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 10);
    this.desired.set(focus.x, 0, focus.z);
    if (aim) {
      let dx = (aim.x - focus.x) * c.lookAheadFactor, dz = (aim.z - focus.z) * c.lookAheadFactor;
      const len = Math.hypot(dx, dz);
      if (len > c.lookAhead) { dx *= c.lookAhead / len; dz *= c.lookAhead / len; }
      this.desired.x += dx;
      this.desired.z += dz;
    }
    const k = 1 - Math.pow(2, -dt / c.followHalfLife);
    this.target.lerp(this.desired, k);
    this.place(0);
    if (beforeShake) beforeShake();

    this.trauma = Math.max(0, this.trauma - c.shakeDecay * dt);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.time * c.shakeFreq;
      const n = (i) => Math.sin(t + this.phase[i]) * 0.6 + Math.sin(t * 2.17 + this.phase[i] * 1.3) * 0.4;
      this.camera.position.x += n(0) * c.shakeMaxOffset * s;
      this.camera.position.z += n(1) * c.shakeMaxOffset * s;
      this.camera.rotateZ(n(2) * c.shakeMaxRollDeg * DEG * s);
      this.camera.updateMatrixWorld();
    }
  }
}
