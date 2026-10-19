// The frontier: a detailed safe town, walkable interiors, and open desert.
import * as THREE from 'three';
import { PAL } from './models.js';
import { animateCharacter, angleDelta, turnToward } from './character.js';
import { townsperson } from './townsfolk.js';
import { createRng } from './rng.js';
import { GROUPS } from './physics.js';
import { buildTown } from './town-buildings.js';
import { buildInteriors, updateInteriorNpcs } from './interiors.js';
import { desert, ground, roads } from './land.js';

function civilians(group, rng) {
  const specs = [
    ['martha', 'Martha Bell', 'bounty', [[-3.6, -10], [-3.6, 3], [-1, 3], [-1, -10]], { shirt: 0x706c85, vest: 0x3d3346, hat: 0x2f2a33, band: 0x9e6971, pants: 0x3a3540, scarf: 0xd9c9a6 }],
    ['silas', 'Silas Reed', 'bounty', [[3.6, 17], [3.6, 9], [1.8, 9], [1.8, 17]], { shirt: 0x527d70, vest: 0x5b4127, hat: 0x8a6a42, band: PAL.woodDark, pants: 0x4a4740 }],
    ['clara', 'Clara Finch', 'resident', [[3.4, -22], [3.4, -12], [1.4, -12], [1.4, -22]], { shirt: 0xd9c9a6, vest: 0xb58e58, hat: 0xc7a983, band: 0x8e3f39, pants: 0x5f4b3b, apron: 0xece1c4 }],
    ['nora', 'Nora Pike', 'resident', [[-2, -2], [2, -2], [2, -5], [-2, -5]], { shirt: 0x9e6971, vest: 0x56394d, hat: 0xb79b70, band: 0x56394d, pants: 0x53514c }],
  ];
  return specs.map(([id, name, kind, route, look]) => {
    const model = townsperson(look);
    model.arm.rotation.x = 1.1;
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
  // The controller reads collider positions, so move the collider now rather than on the next step.
  game.physics.world.propagateModifiedBodyPositionsToColliders();
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
  const sites = buildTown(game, outdoor, world), npcs = civilians(outdoor, rng), rooms = buildInteriors(game, interiorRoot, sites);
  roads(outdoor, sites);
  desert(game, outdoor, world, rng);
  const doors = sites.map((site) => ({
    id: `door-${site.id}`, siteId: site.id, kind: 'door', label: site.label, x: site.x, z: site.z,
  }));
  let active = null, seated = null, doorCooldown = 0, focusOverride = null;

  const enter = (site, saved = null) => {
    const room = rooms.get(site.id);
    if (!room || !game.player) return false;
    active = room; seated = null; focusOverride = null; outdoor.visible = false; room.root.visible = true;
    game.projectiles?.clear();
    for (const enemy of game.enemies) {
      if (enemy.token) enemy.releaseToken();
      enemy.hideAimLine();
    }
    const outside = saved?.outside ?? { x: site.outsideX, z: site.outsideZ };
    game.run.interior = { id: site.id, outside };
    const local = saved?.local;
    movePlayer(game, room.center.x + (local?.x ?? 0), room.center.z + (local?.z ?? 5.2), Math.PI);
    game.rig.targetDistance = 23; game.rig.snap(room.center.x, room.center.z);
    game.render?.setInterior?.(room.center);
    doorCooldown = 0.8; game.saveT = 0;
    return true;
  };
  const leave = () => {
    if (!active) return;
    const outside = game.run.interior?.outside ?? { x: active.site.outsideX, z: active.site.outsideZ };
    active.root.visible = false; active = null; seated = null; focusOverride = null; outdoor.visible = true;
    game.run.interior = null; movePlayer(game, outside.x, outside.z, outside.x < 0 ? Math.PI / 2 : -Math.PI / 2);
    game.rig.targetDistance = 28; game.rig.snap(outside.x, outside.z); doorCooldown = 1; game.saveT = 0;
    game.render?.setInterior?.(null);
  };

  return {
    sites, npcs, rooms,
    get inside() { return !!active; },
    get seated() { return seated; },
    locationLabel() { return active?.label ?? 'Mercy Crossing'; },
    interactions() { return active ? active.points : [...doors, ...npcs]; },
    cameraFocus() { return active?.center ?? null; },
    viewFocus() { return focusOverride ?? active?.center ?? null; },
    setCameraFocus(point) { focusOverride = point; },
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
      if (!active || !['seat', 'blackjack'].includes(point.kind)) return false;
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
    },
    render(alpha) {
      if (active) return;
      for (const npc of npcs) {
        npc.model.root.position.set(npc.px + (npc.x - npc.px) * alpha, 0, npc.pz + (npc.z - npc.pz) * alpha);
        npc.model.root.rotation.y = npc.prevYaw + angleDelta(npc.prevYaw, npc.yaw) * alpha;
      }
    },
    dispose() { game.render?.setInterior?.(null); },
  };
}
