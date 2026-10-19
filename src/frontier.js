// The frontier: a detailed safe town, walkable interiors, and open desert.
import * as THREE from 'three';
import { MAT, PAL, Shape, makeCharacter, meshOf } from './models.js';
import { addRollPivot, animateCharacter, angleDelta, showGun, turnToward } from './character.js';
import { createRng } from './rng.js';
import { GROUPS } from './physics.js';
import { buildTown } from './town-buildings.js';
import { buildInteriors, updateInteriorNpcs } from './interiors.js';
import { campTrailPoints, distanceToTrail, RIVER_MAX_X, RIVER_MIN_X, riverCenter, riverWidth } from './terrain.js';

function ground(group, half, seed) {
  const geo = new THREE.PlaneGeometry(half * 2 + 30, half * 2 + 30, 80, 80).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PAL.sand), shade = new THREE.Color(PAL.sandDark);
  const light = new THREE.Color(PAL.sandLight), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i), z = pos.getZ(i);
    const broad = Math.sin(x * 0.035 + seed) * Math.cos(z * 0.027 - seed * 0.3);
    const grain = Math.sin(x * 0.19 + z * 0.13 + seed * 0.07) * 0.12;
    const n = broad * 0.34 + grain;
    c.copy(base).lerp(n < 0 ? light : shade, Math.min(0.5, Math.abs(n)));
    for (let j = 0; j < 3; j++) { colors[(i + j) * 3] = c.r; colors[(i + j) * 3 + 1] = c.g; colors[(i + j) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(meshOf(geo, MAT.solid, false));
}

function offsetPath(points, offset) {
  return points.map((point, index) => {
    const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
    return { x: point.x - dz / length * offset, z: point.z + dx / length * offset };
  });
}

function smoothPath(points, samplesPerSection = 4) {
  if (points.length < 3) return points;
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point.x, 0, point.z)), false, 'centripetal');
  return curve.getPoints((points.length - 1) * samplesPerSection).map((point) => ({ x: point.x, z: point.z }));
}

function pathMesh(points, width, colors, y = 0.018) {
  const positions = [], normals = [], vertexColors = [];
  const shades = colors.map((color) => new THREE.Color(color));
  const edges = points.map((point, index) => {
    const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
    const halfWidth = (typeof width === 'function' ? width(index / (points.length - 1)) : width) / 2;
    const nx = -dz / length, nz = dx / length;
    return {
      left: { x: point.x + nx * halfWidth, z: point.z + nz * halfWidth },
      right: { x: point.x - nx * halfWidth, z: point.z - nz * halfWidth },
    };
  });
  const addColor = (color) => vertexColors.push(color.r, color.g, color.b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    const vertices = [
      a.left.x, y, a.left.z, b.left.x, y, b.left.z, b.right.x, y, b.right.z,
      a.left.x, y, a.left.z, b.right.x, y, b.right.z, a.right.x, y, a.right.z,
    ];
    positions.push(...vertices);
    const colorA = shades[i % shades.length], colorB = shades[(i + 1) % shades.length];
    addColor(colorA); addColor(colorB); addColor(colorB);
    addColor(colorA); addColor(colorB); addColor(colorA);
    for (let j = 0; j < 6; j++) normals.push(0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.computeBoundingSphere();
  return meshOf(geometry, MAT.solid, false);
}

function addRoad(group, points, width, withRuts = true) {
  const edgeWidth = typeof width === 'function' ? (t) => width(t) + 0.9 : width + 0.9;
  group.add(pathMesh(points, edgeWidth, [0x9f6843, 0xaa7248, 0x95613f], 0.012));
  group.add(pathMesh(points, width, [0xb57a4a, 0xc08752, 0xaa7044, 0xbd8554]));
  if (!withRuts) return;
  const baseWidth = typeof width === 'function' ? width(0.5) : width;
  const track = Math.min(1.5, baseWidth * 0.22);
  group.add(pathMesh(offsetPath(points, track), 0.18, [0x95613f, 0xa36c46], 0.026));
  group.add(pathMesh(offsetPath(points, -track), 0.18, [0x95613f, 0xa36c46], 0.026));
}

function paths(group, world) {
  const tapered = (base, variation = 0) => (t) => {
    const endScale = Math.min(1, 0.35 + t * 3.2, 0.35 + (1 - t) * 3.2);
    return (base + Math.sin(t * Math.PI * 3) * variation) * endScale;
  };
  const mainStreet = [
    { x: -3.5, z: -54 }, { x: -2.5, z: -45 }, { x: 0.8, z: -34 }, { x: -1.1, z: -23 }, { x: 0.7, z: -11 },
    { x: -0.6, z: 1 }, { x: 0.8, z: 13 }, { x: 1.2, z: 22 }, { x: 0, z: 30 }, { x: -1.8, z: 43 },
    { x: -3.8, z: 53 }, { x: -1.2, z: 62 },
  ];
  addRoad(group, smoothPath(mainStreet), tapered(7.2, 0.65));
  for (const [side, z] of [[-1, -18], [1, -18], [-1, -6], [1, -6], [-1, 6], [1, 6], [-1, 16]]) {
    const x = side * 7.4;
    const porchPath = smoothPath([
      { x: side * 1.8, z: z + side * 0.25 },
      { x: side * 4.2, z: z - side * 0.35 },
      { x, z },
    ], 5);
    addRoad(group, porchPath, (t) => 2.4 - t * 0.8 + Math.sin(t * Math.PI) * 0.14, false);
  }
  for (const [index, camp] of (world.camps ?? []).entries()) {
    const points = campTrailPoints(camp, index);
    if (points.length) addRoad(group, points, (t) => 4.6 + Math.sin(t * Math.PI * 4 + index) * 0.45);
  }
}

function cactusPatch(shape, rng, x, z) {
  const style = rng.int(0, 2);
  if (style === 0) {
    const h = rng.range(1.5, 4.2), r = rng.range(0.16, 0.28), side = rng.chance(0.5) ? 1 : -1;
    shape.cyl(r, r * 1.12, h, 7, PAL.cactus, x, h / 2, z);
    shape.cone(r, r * 1.1, 7, 0x789750, x, h + r * 0.5, z);
    shape.cyl(r * 0.62, r * 0.62, h * 0.3, 6, PAL.cactusDark, x + side * 0.43, h * 0.53, z, 0, 0, Math.PI / 2);
    shape.cyl(r * 0.68, r * 0.68, h * 0.38, 6, PAL.cactus, x + side * 0.62, h * 0.68, z);
    if (h > 2.5 && rng.chance(0.55)) {
      shape.cyl(r * 0.52, r * 0.52, h * 0.24, 6, PAL.cactusDark, x - side * 0.36, h * 0.7, z, 0, 0, Math.PI / 2);
      shape.cyl(r * 0.56, r * 0.56, h * 0.28, 6, PAL.cactus, x - side * 0.5, h * 0.81, z);
    }
    if (rng.chance(0.3)) shape.cone(r * 0.55, 0.24, 6, 0xb85c56, x, h + 0.28, z);
  } else if (style === 1) {
    const count = rng.int(3, 6), yaw = rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const a = yaw + i * 1.55, d = i ? rng.range(0.18, 0.6) : 0, h = rng.range(0.45, 0.95);
      shape.add(new THREE.IcosahedronGeometry(1, 0), i % 2 ? PAL.cactusDark : PAL.cactus,
        x + Math.cos(a) * d, h * 0.58, z + Math.sin(a) * d, 0, a, rng.range(-0.18, 0.18), 0.34, h * 0.58, 0.16);
      if (i > 1 && rng.chance(0.28)) shape.cone(0.1, 0.22, 6, i % 2 ? 0xd4a54e : 0xb85c56,
        x + Math.cos(a) * d, h + 0.12, z + Math.sin(a) * d);
    }
  } else {
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i++) {
      const r = rng.range(0.22, 0.38), dx = (i - (count - 1) / 2) * 0.42;
      shape.cyl(r, r * 1.08, rng.range(0.45, 0.8), 9, i % 2 ? PAL.cactusDark : PAL.cactus, x + dx, 0.3, z + rng.range(-0.2, 0.2));
      shape.cone(r * 0.82, 0.22, 9, 0x789750, x + dx, 0.69, z);
      if (rng.chance(0.35)) shape.cone(0.1, 0.2, 6, 0xc46555, x + dx, 0.86, z);
    }
  }
}

function scrubPatch(shape, rng, x, z) {
  const color = rng.chance(0.5) ? 0x8d8952 : 0x707747;
  const count = rng.int(4, 7);
  for (let j = 0; j < count; j++) {
    const a = j * Math.PI * 2 / count + rng.range(-0.25, 0.25), d = rng.range(0.05, 0.42);
    shape.cone(rng.range(0.08, 0.16), rng.range(0.35, 0.8), 3, j % 2 ? color : PAL.cactusDark,
      x + Math.cos(a) * d, 0.22, z + Math.sin(a) * d, rng.range(-0.35, 0.35), a, rng.range(-0.25, 0.25));
  }
}

function desert(game, group, world, rng) {
  const half = world.half ?? 210, camps = world.camps ?? [], s = new Shape();
  const clear = (x, z, margin = 0) => Math.hypot(x, z) > 40 + margin
    && camps.every((c) => Math.hypot(x - c.x, z - c.z) > 34 + margin);
  const trails = camps.map((camp, index) => campTrailPoints(camp, index));
  const besideRoad = (x, z, clearance = 4) => trails.every((trail) => distanceToTrail(x, z, trail) > clearance);
  const dry = (x, z, margin = 0) => x < RIVER_MIN_X || x > RIVER_MAX_X
    || Math.abs(z - riverCenter(x)) > riverWidth(x) / 2 + margin;

  // Broad color patches break up the flat sand without adding collision or draw calls.
  for (let i = 0; i < 95; i++) {
    const x = rng.range(-half + 10, half - 10), z = rng.range(-half + 10, half - 10), r = rng.range(3, 8);
    if (!clear(x, z, 2) || !dry(x, z, r * 0.55)) continue;
    s.add(new THREE.CircleGeometry(1, 9), rng.chance(0.5) ? 0xc5945f : 0xb98655,
      x, 0.012, z, -Math.PI / 2, 0, rng.range(0, Math.PI), r, r * rng.range(0.38, 0.72), 1);
  }

  for (let i = 0; i < 1900; i++) {
    const x = rng.range(-half + 8, half - 8), z = rng.range(-half + 8, half - 8);
    if (!clear(x, z) || !besideRoad(x, z) || !dry(x, z, 1)) continue;
    const kind = rng.next();
    if (kind < 0.46) cactusPatch(s, rng, x, z);
    else if (kind < 0.67) {
      const r = rng.range(0.25, 1.1);
      s.rock(r, rng.chance(0.35) ? PAL.rockLight : PAL.rock, x, r * 0.3, z, 0.65, 0.25, rng.int(1, 999), rng.range(0, 6));
      if (r > 0.7) s.rock(r * 0.42, PAL.rockDark, x + r * 0.65, r * 0.18, z - r * 0.2, 0.55, 0.2, rng.int(1, 999));
    } else if (kind < 0.95) scrubPatch(s, rng, x, z);
    else if (kind < 0.985) {
      s.box(0.28, 0.18, 0.32, PAL.bone, x, 0.1, z, 0, rng.range(0, 6), 0);
      for (const side of [-1, 1]) s.box(0.07, 0.07, rng.range(0.35, 0.55), PAL.bone, x + side * 0.28, 0.05, z + side * 0.08, 0, rng.range(0, 6), 0);
    } else {
      const yaw = rng.range(0, Math.PI * 2);
      s.cyl(0.1, 0.16, 1.8, 6, PAL.woodDark, x, 0.82, z, 0.35, 0, yaw);
      s.cyl(0.06, 0.09, 1.0, 5, PAL.wood, x + Math.cos(yaw) * 0.35, 1.15, z + Math.sin(yaw) * 0.35, -0.8, yaw);
    }
  }

  // Reeds and cottonwood trees follow the river banks outside town.
  for (let i = 0; i < 150; i++) {
    const x = rng.range(RIVER_MIN_X + 5, RIVER_MAX_X - 5), side = rng.chance(0.5) ? 1 : -1;
    const z = riverCenter(x) + side * (riverWidth(x) / 2 + rng.range(1.5, 6));
    if (!clear(x, z) || !besideRoad(x, z, 3)) continue;
    if (rng.chance(0.13)) {
      const h = rng.range(2.8, 4.8);
      s.cyl(0.16, 0.28, h, 7, PAL.woodDark, x, h / 2, z);
      for (const [dx, dy, dz, scale, color] of [[0, h, 0, 1.5, 0x697849], [-0.8, h * 0.9, 0.2, 1.05, 0x7f874f], [0.65, h * 0.86, -0.35, 1.15, 0x596b3f]]) {
        s.add(new THREE.IcosahedronGeometry(1, 1), color, x + dx, dy, z + dz, 0, rng.range(0, 6), 0, scale, scale * 0.75, scale);
      }
    } else {
      for (let j = 0; j < rng.int(3, 7); j++) {
        const dx = rng.range(-0.5, 0.5), dz = rng.range(-0.5, 0.5), h = rng.range(0.5, 1.25);
        s.cone(0.07, h, 5, j % 2 ? 0x768151 : 0x9a9059, x + dx, h / 2, z + dz, rng.range(-0.12, 0.12), 0, rng.range(-0.12, 0.12));
      }
    }
  }

  // Large formations work as distant landmarks and physical cover.
  for (let i = 0; i < 72; i++) {
    const x = rng.range(-half + 12, half - 12), z = rng.range(-half + 12, half - 12), r = rng.range(2.6, 6.4);
    if (!clear(x, z, 8) || !besideRoad(x, z, r + 3.5) || !dry(x, z, r + 2)) continue;
    s.rock(r, PAL.cliff, x, r * 0.65, z, 1.3, 0.22, rng.int(1, 999));
    const side = rng.chance(0.5) ? 1 : -1;
    s.rock(r * rng.range(0.38, 0.62), PAL.rockLight, x + side * r * 0.72, r * 0.36, z + r * 0.28, 0.8, 0.2, rng.int(1, 999));
    if (r > 4.3 && rng.chance(0.65)) s.rock(r * 0.58, PAL.rock, x - side * r * 0.18, r * 1.45, z - r * 0.08, 0.82, 0.18, rng.int(1, 999));
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
  const doors = sites.map((site) => ({
    id: `door-${site.id}`, siteId: site.id, kind: 'door', label: site.label, x: site.x, z: site.z,
  }));
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
    interactions() { return active ? active.points : [...doors, ...npcs]; },
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
