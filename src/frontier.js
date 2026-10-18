// The frontier: a detailed safe town, walkable interiors, and open desert.
import * as THREE from 'three';
import { MAT, PAL, Shape, makeCharacter, meshOf } from './models.js';
import { addRollPivot, animateCharacter, angleDelta, showGun, turnToward } from './character.js';
import { createRng } from './rng.js';
import { GROUPS } from './physics.js';
import { buildTown } from './town-buildings.js';
import { buildInteriors, updateInteriorNpcs } from './interiors.js';

function ground(group, half, seed) {
  const geo = new THREE.PlaneGeometry(half * 2 + 30, half * 2 + 30, 80, 80).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PAL.sand), shade = new THREE.Color(PAL.sandDark), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.09 + seed) * Math.cos(z * 0.07) * 0.15 + 0.18;
    c.copy(base).lerp(shade, n);
    for (let j = 0; j < 3; j++) { colors[(i + j) * 3] = c.r; colors[(i + j) * 3 + 1] = c.g; colors[(i + j) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(meshOf(geo, MAT.solid, false));
}

function road(shape, ax, az, bx, bz, width) {
  const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
  shape.box(width, 0.025, length, 0xc79c68, (ax + bx) / 2, 0.005, (az + bz) / 2, 0, Math.atan2(dx, dz));
}

function paths(group, world) {
  const s = new Shape();
  s.cyl(33, 33, 0.02, 32, 0xc9a275, 0, 0.005, 0);
  road(s, 0, -34, 0, 40, 10);
  road(s, -34, 0, 34, 0, 7);
  for (const c of world.camps ?? []) {
    const length = Math.hypot(c.x, c.z);
    if (length <= 60) continue;
    const x = c.x / length, z = c.z / length;
    road(s, x * 31, z * 31, c.x - x * 25, c.z - z * 25, 5);
  }
  group.add(meshOf(s, MAT.solid, false));
}

function desert(game, group, world, rng) {
  const half = world.half ?? 210, camps = world.camps ?? [], s = new Shape();
  const clear = (x, z, margin = 0) => Math.hypot(x, z) > 40 + margin
    && camps.every((c) => Math.hypot(x - c.x, z - c.z) > 34 + margin);
  const besideRoad = (x, z, clearance = 4) => camps.every((c) => {
    const length = c.x * c.x + c.z * c.z;
    const t = Math.max(0, Math.min(1, (x * c.x + z * c.z) / length));
    return Math.hypot(x - c.x * t, z - c.z * t) > clearance;
  });
  for (let i = 0; i < 850; i++) {
    const x = rng.range(-half + 8, half - 8), z = rng.range(-half + 8, half - 8);
    if (!clear(x, z) || !besideRoad(x, z)) continue;
    const kind = rng.next();
    if (kind < 0.22) {
      const h = rng.range(1.3, 3.2), r = rng.range(0.16, 0.3), side = rng.chance(0.5) ? 1 : -1;
      s.cyl(r, r * 1.1, h, 7, PAL.cactus, x, h / 2, z);
      s.cyl(r * 0.65, r * 0.65, h * 0.42, 6, PAL.cactusDark, x + side * 0.45, h * 0.58, z);
      s.box(0.5, r * 1.5, r * 1.5, PAL.cactus, x + side * 0.23, h * 0.4, z);
      if (rng.chance(0.35)) s.cone(r * 0.55, 0.25, 6, 0xb85c56, x, h + 0.12, z);
    } else if (kind < 0.5) {
      const r = rng.range(0.25, 1.1);
      s.rock(r, PAL.rock, x, r * 0.3, z, 0.65, 0.25, rng.int(1, 999), rng.range(0, 6));
    } else {
      for (let j = 0; j < 4; j++) s.cone(0.12, rng.range(0.3, 0.7), 3, j % 2 ? 0x9a9059 : 0x817b4b, x + j * 0.13, 0.2, z, 0, j * 2);
    }
  }
  for (let i = 0; i < 28; i++) {
    const x = rng.range(-half + 12, half - 12), z = rng.range(-half + 12, half - 12), r = rng.range(2, 4.5);
    if (!clear(x, z, 8) || !besideRoad(x, z, r + 3.5)) continue;
    s.rock(r, PAL.cliff, x, r * 0.65, z, 1.3, 0.22, rng.int(1, 999));
    game.physics.fixedCylinder(x, r * 0.65, z, r * 0.65, r * 0.8, GROUPS.world);
  }
  for (let i = 0; i < 96; i++) {
    const side = i % 4, a = -half + (Math.floor(i / 4) / 23) * half * 2;
    const x = side < 2 ? a : (side === 2 ? -half - 5 : half + 5);
    const z = side >= 2 ? a : (side === 0 ? -half - 5 : half + 5);
    s.rock(rng.range(7, 11), PAL.cliff, x, 3.5, z, rng.range(1, 1.6), 0.25, rng.int(1, 999));
  }
  group.add(meshOf(s));
}

function civilians(group, rng) {
  const specs = [
    ['martha', 'Martha Bell', 'bounty', [[-3.6, -10], [-3.6, 3], [-1, 3], [-1, -10]], 0x706c85],
    ['silas', 'Silas Reed', 'bounty', [[3.6, 17], [3.6, 9], [1.8, 9], [1.8, 17]], 0x527d70],
    ['clara', 'Clara Finch', 'resident', [[3.4, -22], [3.4, -12], [1.4, -12], [1.4, -22]], 0xb58e58],
    ['nora', 'Nora Pike', 'resident', [[-2, -2], [2, -2], [2, -5], [-2, -5]], 0x9e6971],
  ];
  return specs.map(([id, name, kind, route, shirt]) => {
    const model = addRollPivot(makeCharacter({ shirt, vest: shirt, hat: 0xb79b70, band: PAL.woodDark, pants: 0x53514c }));
    showGun(model, null); model.arm.rotation.x = 1.1;
    const x = route[0][0], z = route[0][1]; model.root.position.set(x, 0, z); group.add(model.root);
    return { id, name, kind, x, z, px: x, pz: z, yaw: 0, prevYaw: 0, route, next: 1,
      wait: rng.range(0, 3), speed: rng.range(0.75, 1.1), model,
      animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
  });
}

function movePlayer(game, x, z, yaw) {
  const p = game.player;
  p.x = p.px = x; p.z = p.pz = z; p.vx = p.vz = 0; p.yaw = p.prevYaw = yaw;
  p.body.setTranslation({ x, y: p.bodyY, z }, true);
  p.body.setNextKinematicTranslation({ x, y: p.bodyY, z });
}

/** World contains { half, seed, camps: [{ id, name, x, z }] }. */
export function buildFrontier(game, world) {
  const half = world.half ?? 210, seed = world.seed ?? game.run.seed;
  const rng = createRng(seed ^ 0x746f776e), outdoor = new THREE.Group(), interiorRoot = new THREE.Group();
  game.levelGroup.add(outdoor, interiorRoot);
  ground(outdoor, half, seed);
  game.physics.fixedBox(0, -0.5, 0, half + 15, 0.5, half + 15, 0, GROUPS.ground);
  for (const side of [-1, 1]) {
    game.physics.fixedBox(side * (half + 0.5), 2, 0, 0.5, 2, half + 1, 0, GROUPS.world);
    game.physics.fixedBox(0, 2, side * (half + 0.5), half + 1, 2, 0.5, 0, GROUPS.world);
  }
  paths(outdoor, world);
  desert(game, outdoor, world, rng);
  const sites = buildTown(game, outdoor), npcs = civilians(outdoor, rng), rooms = buildInteriors(game, interiorRoot, sites);
  let active = null, seated = null, doorCooldown = 0;

  const enter = (site, saved = null) => {
    const room = rooms.get(site.id);
    if (!room || !game.player) return false;
    active = room; seated = null; outdoor.visible = false; room.root.visible = true;
    game.projectiles?.clear();
    for (const enemy of game.enemies) {
      if (enemy.token) enemy.releaseToken();
      enemy.hideAimLine();
    }
    const outside = saved?.outside ?? { x: site.outsideX, z: site.outsideZ };
    game.run.interior = { id: site.id, outside };
    movePlayer(game, saved ? game.run.player.x : room.center.x, saved ? game.run.player.z : room.center.z + 5.2, Math.PI);
    game.rig.targetDistance = 23; game.rig.snap(room.center.x, room.center.z);
    doorCooldown = 0.8; game.saveT = 0;
    return true;
  };
  const leave = () => {
    if (!active) return;
    const outside = game.run.interior?.outside ?? { x: active.site.outsideX, z: active.site.outsideZ };
    active.root.visible = false; active = null; seated = null; outdoor.visible = true;
    game.run.interior = null; movePlayer(game, outside.x, outside.z, outside.x < 0 ? Math.PI / 2 : -Math.PI / 2);
    game.rig.targetDistance = 28; game.rig.snap(outside.x, outside.z); doorCooldown = 1; game.saveT = 0;
  };

  return {
    sites, npcs, rooms,
    get inside() { return !!active; },
    get seated() { return seated; },
    locationLabel() { return active?.label ?? 'Mercy Crossing'; },
    interactions() { return active ? active.points : npcs; },
    cameraFocus() { return active?.center ?? null; },
    restore(saved) {
      if (!saved) return false;
      const site = sites.find((item) => item.id === saved.id);
      return site ? enter(site, saved) : false;
    },
    enter(id) {
      const site = sites.find((item) => item.id === id);
      return site ? enter(site) : false;
    },
    exit: leave,
    sit(point) {
      if (!active || point.kind !== 'seat') return false;
      seated = point; movePlayer(game, point.x, point.z, point.yaw ?? 0); return true;
    },
    stand() { seated = null; },
    beforePlayer(intent) {
      if (!seated) return;
      if (Math.hypot(intent.move.x, intent.move.z) > 0.05) { seated = null; return; }
      intent.move = { x: 0, z: 0 }; intent.aim = null; intent.fireHeld = intent.firePressed = false;
    },
    tick(dt) {
      doorCooldown = Math.max(0, doorCooldown - dt);
      if (active) {
        updateInteriorNpcs(active, game.player, dt);
        if (!seated && doorCooldown <= 0 && game.player.z > active.center.z + 6.9) leave();
        return;
      }
      for (const npc of npcs) {
        npc.px = npc.x; npc.pz = npc.z; npc.prevYaw = npc.yaw;
        const player = game.player, near = player && Math.hypot(player.x - npc.x, player.z - npc.z) < 2.3;
        let speed = 0;
        if (near) npc.yaw = turnToward(npc.yaw, Math.atan2(player.x - npc.x, player.z - npc.z), dt * 4);
        else if (npc.wait > 0) npc.wait -= dt;
        else {
          const point = npc.route[npc.next], dx = point[0] - npc.x, dz = point[1] - npc.z;
          const distance = Math.hypot(dx, dz), step = Math.min(distance, npc.speed * dt);
          if (distance > 0.01) { npc.x += dx / distance * step; npc.z += dz / distance * step; npc.yaw = turnToward(npc.yaw, Math.atan2(dx, dz), dt * 4); speed = npc.speed; }
          if (distance <= npc.speed * dt + 0.01) { npc.next = (npc.next + 1) % npc.route.length; npc.wait = 2.5; }
        }
        npc.animation.speed = speed; npc.animation.dt = dt; animateCharacter(npc.model, npc.animation); npc.model.arm.rotation.x = 1.1;
      }
      if (doorCooldown <= 0 && game.player) {
        const site = sites.find((point) => Math.hypot(point.x - game.player.x, point.z - game.player.z) < 1.05);
        if (site) enter(site);
      }
    },
    render(alpha) {
      if (active) return;
      for (const npc of npcs) {
        npc.model.root.position.set(npc.px + (npc.x - npc.px) * alpha, 0, npc.pz + (npc.z - npc.pz) * alpha);
        npc.model.root.rotation.y = npc.prevYaw + angleDelta(npc.prevYaw, npc.yaw) * alpha;
      }
    },
    dispose() {},
  };
}
