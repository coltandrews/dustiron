// Outlaw bullets on the server. They fly the same way as in the browser, but
// test every player instead of one. Browsers draw their own copies from the
// 'proj' event and never apply damage themselves.
import { T } from '../src/tuning.js';
import { GROUPS } from '../src/physics.js';
import { inSafeZone } from '../src/towns.js';
import { q2, q3 } from '../src/protocol.js';

export class ServerProjectiles {
  constructor(sim) {
    this.sim = sim;
    this.items = [];
  }

  spawn(x, z, dx, dz, speed, dmg, maxDist) {
    if (this.items.length > 400) return;
    this.items.push({ x, z, dx, dz, speed, dmg, left: maxDist });
    this.sim.emit(['proj', q2(x), q2(z), q3(dx), q3(dz), speed, q2(maxDist)], x, z);
  }

  tick(dt) {
    const sim = this.sim, y = T.player.gunHeight, world = sim.run.world;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      const step = Math.min(p.speed * dt, p.left);
      const hit = sim.physics.castRay(p.x, y, p.z, p.dx, 0, p.dz, step, GROUPS.blockers);
      const segLen = hit ? hit.dist : step;
      let struck = null, nearest = Infinity;
      for (const player of sim.players.values()) {
        if (!player.alive || player.iframe || inSafeZone(world, player.x, player.z, player.room)) continue;
        const rx = player.x - p.x, rz = player.z - p.z;
        const t = Math.max(0, Math.min(segLen, rx * p.dx + rz * p.dz));
        const miss = Math.hypot(player.x - (p.x + p.dx * t), player.z - (p.z + p.dz * t));
        if (miss < T.player.hitRadius && t < nearest) { struck = player; nearest = t; }
      }
      if (struck) {
        sim.hooks.playerDamage(struck, p.dmg, p.dx, p.dz, { kind: 'outlaw' });
        this.items.splice(i, 1);
        continue;
      }
      if (hit) {
        if (hit.owner?.damage) hit.owner.damage(p.dmg * 0.5, hit.x, hit.y, hit.z, p.dx, p.dz, 0.5, 'enemy');
        this.items.splice(i, 1);
        continue;
      }
      p.x += p.dx * step; p.z += p.dz * step; p.left -= step;
      if (p.left <= 0) this.items.splice(i, 1);
    }
  }

  clear() { this.items.length = 0; }
}
