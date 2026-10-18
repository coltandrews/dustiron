// Enemy bullets travel as visible tracers so a player who sees the flash can
// roll through them. World and props block them; the player is tested directly.
import * as THREE from 'three';
import { T } from './tuning.js';
import { GROUPS } from './physics.js';

const MAX = 60;

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.items = [];
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
    for (let i = 0; i < MAX; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffcf7a, toneMapped: false }));
      mesh.scale.set(0.07, 0.07, 1.1);
      mesh.visible = false;
      mesh.frustumCulled = false;
      game.levelGroup.add(mesh);
      this.items.push({ active: false, x: 0, z: 0, px: 0, pz: 0, dx: 0, dz: 1, speed: 40, dmg: 10, left: 0, whizzed: false, mesh });
    }
  }

  spawn(x, z, dx, dz, speed, dmg, maxDist) {
    const p = this.items.find((it) => !it.active);
    if (!p) return;
    Object.assign(p, { active: true, x, z, px: x, pz: z, dx, dz, speed, dmg, left: maxDist, whizzed: false });
    p.mesh.visible = true;
    p.mesh.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  tick(dt) {
    const g = this.game, P = g.player;
    const y = T.player.gunHeight;
    for (const p of this.items) {
      if (!p.active) continue;
      p.px = p.x; p.pz = p.z;
      let step = Math.min(p.speed * dt, p.left);
      const hit = g.physics.castRay(p.x, y, p.z, p.dx, 0, p.dz, step, GROUPS.blockers);
      const segLen = hit ? hit.dist : step;

      // Closest approach to the player along this segment.
      if (P.alive) {
        const rx = P.x - p.x, rz = P.z - p.z;
        const t = Math.max(0, Math.min(segLen, rx * p.dx + rz * p.dz));
        const cx = p.x + p.dx * t, cz = p.z + p.dz * t;
        const miss = Math.hypot(P.x - cx, P.z - cz);
        if (miss < T.player.hitRadius) {
          if (P.damage(p.dmg, p.dx, p.dz)) {
            g.fx.impact('flesh', cx, y, cz, -p.dx, -p.dz, p.dx, p.dz);
            this.kill(p);
            continue;
          }
        } else if (!p.whizzed && miss < 1.8 && t > 0 && t < segLen) {
          p.whizzed = true;
          g.audio.at('whiz', cx, cz, { vol: 0.7, vary: 0.15 });
        }
      }

      if (hit) {
        const owner = hit.owner;
        let surface = 'dirt';
        if (owner && owner.damage) surface = owner.damage(p.dmg * 0.5, hit.x, hit.y, hit.z, p.dx, p.dz, 0.5, 'enemy');
        g.fx.impact(surface === 'cloth' || surface === 'plant' ? 'dirt' : surface, hit.x, hit.y, hit.z, hit.nx, hit.nz, p.dx, p.dz);
        this.kill(p);
        continue;
      }
      p.x += p.dx * step;
      p.z += p.dz * step;
      p.left -= step;
      if (p.left <= 0) this.kill(p);
    }
  }

  kill(p) { p.active = false; p.mesh.visible = false; }

  clear() { for (const p of this.items) this.kill(p); }

  render(alpha) {
    const y = T.player.gunHeight;
    for (const p of this.items) {
      if (!p.active) continue;
      p.mesh.position.set(p.px + (p.x - p.px) * alpha, y, p.pz + (p.z - p.pz) * alpha);
    }
  }
}
