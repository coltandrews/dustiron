// The first frontier: a safe street, local services, civilians, and open desert.
import * as THREE from 'three';
import { MAT, PAL, Shape, makeCharacter, meshOf } from './models.js';
import { addRollPivot, animateCharacter, angleDelta, showGun, turnToward } from './character.js';
import { createRng } from './rng.js';
import { GROUPS } from './physics.js';

const STORES = [
  { id: 'guns', label: 'Guns & Ammo', kind: 'guns', side: -1, z: -18, color: 0x754333 },
  { id: 'doctor', label: 'Doctor', kind: 'doctor', side: 1, z: -18, color: 0xd7c6a1 },
  { id: 'sheriff', label: 'Sheriff', kind: 'sheriff', side: -1, z: -6, color: 0x76654a },
  { id: 'maps', label: 'Maps & Trails', kind: 'maps', side: 1, z: -6, color: 0x526d67 },
  { id: 'clothes', label: 'Clothier', kind: 'clothes', side: -1, z: 6, color: 0x8b6570 },
  { id: 'saloon', label: 'The Last Drop', kind: 'saloon', side: 1, z: 6, color: 0x9c593d },
  { id: 'stable', label: 'Livery Stable', kind: 'stable', side: -1, z: 18, color: 0x9c8357 },
];

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

function sign(group, label, x, y, z, width, signs) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#31271f'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#bf985b'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#f3dfb4'; ctx.font = 'bold 46px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label.toUpperCase(), 256, 66, 468);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map, toneMapped: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z); sprite.scale.set(width, width / 4, 1);
  group.add(sprite); signs.push(sprite);
}

function building(game, spec, signs) {
  const x = spec.side * 13, ry = -spec.side * Math.PI / 2;
  const group = new THREE.Group(), s = new Shape();
  const height = spec.kind === 'saloon' ? 5.4 : 4;
  group.position.set(x, 0, spec.z); group.rotation.y = ry;
  s.box(8.8, height, 7.2, spec.color, 0, height / 2, 0);
  s.box(9.2, 0.24, 7.7, PAL.woodDark, 0, height + 0.12, 0);
  // False front, pale trim, door, and four windows.
  s.box(9.15, 1.1, 0.28, spec.color, 0, height + 0.45, 3.62);
  s.box(9.4, 0.17, 0.5, PAL.canvas, 0, height + 1, 3.65);
  for (let u = -4.2; u <= 4.2; u += 1.4) s.box(0.055, height, 0.06, PAL.woodDark, u, height / 2, 3.64);
  s.box(1.3, 2.6, 0.14, PAL.woodDark, 0, 1.3, 3.68);
  s.box(0.9, 1.55, 0.16, PAL.wood, 0, 1.15, 3.75);
  s.box(0.07, 0.07, 0.18, PAL.brass, 0.31, 1.2, 3.87);
  for (const u of [-3, -1.8, 1.8, 3]) {
    s.box(1, 1.5, 0.15, PAL.canvas, u, 2.25, 3.72);
    s.box(0.8, 1.25, 0.17, 0x4e6463, u, 2.25, 3.8);
    s.box(0.055, 1.3, 0.19, PAL.woodLight, u, 2.25, 3.82);
    s.box(0.9, 0.055, 0.19, PAL.woodLight, u, 2.25, 3.82);
  }
  s.box(9.3, 0.12, 2.1, PAL.plank, 0, 0.045, 4.65);
  s.box(9.5, 0.17, 2.3, PAL.woodDark, 0, 3.15, 4.8, -0.06);
  for (const u of [-4.2, 4.2]) s.box(0.18, 3.1, 0.18, PAL.woodLight, u, 1.55, 5.65);
  // A bench and hitching rail leave the door clear.
  s.box(1.55, 0.15, 0.55, PAL.wood, -2.8, 0.48, 4.6);
  for (const u of [-3.4, -2.2]) s.box(0.1, 0.48, 0.4, PAL.woodDark, u, 0.24, 4.6);
  for (const u of [-3.7, -1.7]) s.box(0.13, 0.9, 0.13, PAL.woodDark, u, 0.45, 6.3);
  s.box(2.2, 0.12, 0.12, PAL.wood, -2.7, 0.8, 6.3);
  group.add(meshOf(s)); game.levelGroup.add(group);
  game.physics.fixedBox(x, height / 2, spec.z, 4.4, height / 2, 3.6, ry, GROUPS.world);
  sign(game.levelGroup, spec.label, spec.side * 8.7, height + 1.3, spec.z, 6.8, signs);
  return { id: spec.id, label: spec.label, kind: spec.kind, x: spec.side * 6.2, z: spec.z };
}

function desert(game, world, rng) {
  const half = world.half ?? 210, camps = world.camps ?? [], s = new Shape();
  const clear = (x, z, margin = 0) => Math.hypot(x, z) > 36 + margin &&
    camps.every((c) => Math.hypot(x - c.x, z - c.z) > 34 + margin);
  const besideRoad = (x, z, clearance = 4) => camps.every((c) => {
    const length = c.x * c.x + c.z * c.z;
    const t = Math.max(0, Math.min(1, (x * c.x + z * c.z) / length));
    return Math.hypot(x - c.x * t, z - c.z * t) > clearance;
  });
  for (let i = 0; i < 750; i++) {
    const x = rng.range(-half + 8, half - 8), z = rng.range(-half + 8, half - 8);
    if (!clear(x, z) || !besideRoad(x, z)) continue;
    const kind = rng.next();
    if (kind < 0.16) {
      const h = rng.range(1.3, 2.8), r = rng.range(0.18, 0.3);
      s.cyl(r, r * 1.1, h, 6, PAL.cactus, x, h / 2, z);
      s.cyl(r * 0.7, r * 0.7, h * 0.4, 5, PAL.cactusDark, x + 0.4, h * 0.58, z);
      s.box(0.5, r * 1.5, r * 1.5, PAL.cactus, x + 0.2, h * 0.4, z);
    } else if (kind < 0.45) {
      const r = rng.range(0.25, 1.1);
      s.rock(r, PAL.rock, x, r * 0.3, z, 0.65, 0.25, rng.int(1, 999), rng.range(0, 6));
    } else {
      for (let j = 0; j < 3; j++) s.cone(0.12, rng.range(0.3, 0.6), 3, 0x9a9059, x + j * 0.13, 0.2, z, 0, j * 2);
    }
  }
  for (let i = 0; i < 28; i++) {
    const x = rng.range(-half + 12, half - 12), z = rng.range(-half + 12, half - 12);
    const r = rng.range(2, 4.5);
    if (!clear(x, z, 8) || !besideRoad(x, z, r + 3.5)) continue;
    s.rock(r, PAL.cliff, x, r * 0.65, z, 1.3, 0.22, rng.int(1, 999));
    game.physics.fixedCylinder(x, r * 0.65, z, r * 0.65, r * 0.8, GROUPS.world);
  }
  // Rocks mark the edge; the low land inside remains fully walkable.
  for (let i = 0; i < 96; i++) {
    const side = i % 4, a = -half + (Math.floor(i / 4) / 23) * half * 2;
    const x = side < 2 ? a : (side === 2 ? -half - 5 : half + 5);
    const z = side >= 2 ? a : (side === 0 ? -half - 5 : half + 5);
    s.rock(rng.range(7, 11), PAL.cliff, x, 3.5, z, rng.range(1, 1.6), 0.25, rng.int(1, 999));
  }
  game.levelGroup.add(meshOf(s));
}

function civilians(group, rng) {
  const specs = [
    ['martha', 'Martha Bell', 'bounty', [[-3.6, -10], [-3.6, 3], [-1, 3], [-1, -10]], 0x706c85],
    ['silas', 'Silas Reed', 'bounty', [[3.6, 17], [3.6, 8], [1.8, 8], [1.8, 17]], 0x527d70],
    ['clara', 'Clara Finch', 'resident', [[3.4, -22], [3.4, -12], [1.4, -12], [1.4, -22]], 0xb58e58],
    ['elias', 'Elias Ward', 'resident', [[-3.4, 10], [-3.4, 23], [-1.2, 23], [-1.2, 10]], 0x87634f],
    ['nora', 'Nora Pike', 'resident', [[-2, -2], [2, -2], [2, -5], [-2, -5]], 0x9e6971],
  ];
  return specs.map(([id, name, kind, route, shirt]) => {
    const model = addRollPivot(makeCharacter({ shirt, vest: shirt, hat: 0xb79b70, band: PAL.woodDark, pants: 0x53514c }));
    showGun(model, null); model.arm.rotation.x = 1.1; model.armPitch = 1.1;
    const x = route[0][0], z = route[0][1];
    model.root.position.set(x, 0, z); group.add(model.root);
    return { id, name, kind, x, z, px: x, pz: z, yaw: 0, prevYaw: 0, route, next: 1,
      wait: rng.range(0, 3), speed: rng.range(0.75, 1.1), model,
      animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
  });
}

/** World contains { half, seed, camps: [{ id, name, x, z }] }. */
export function buildFrontier(game, world) {
  const half = world.half ?? 210, seed = world.seed ?? game.run.seed;
  const rng = createRng(seed ^ 0x746f776e), group = game.levelGroup, signs = [];
  ground(group, half, seed);
  game.physics.fixedBox(0, -0.5, 0, half + 15, 0.5, half + 15, 0, GROUPS.ground);
  for (const side of [-1, 1]) {
    game.physics.fixedBox(side * (half + 0.5), 2, 0, 0.5, 2, half + 1, 0, GROUPS.world);
    game.physics.fixedBox(0, 2, side * (half + 0.5), half + 1, 2, 0.5, 0, GROUPS.world);
  }
  const paths = new Shape();
  paths.cyl(32, 32, 0.02, 32, 0xc9a275, 0, 0.005, 0);
  road(paths, 0, -32, 0, 32, 11);
  road(paths, -32, 0, 32, 0, 8);
  for (const c of world.camps ?? []) {
    const length = Math.hypot(c.x, c.z);
    if (length <= 60) continue;
    const x = c.x / length, z = c.z / length;
    road(paths, x * 30, z * 30, c.x - x * 25, c.z - z * 25, 5);
  }
  group.add(meshOf(paths, MAT.solid, false));
  desert(game, world, rng);
  const sites = STORES.map((spec) => building(game, spec, signs));
  const trim = new Shape();
  for (const x of [-7, 7]) for (const z of [-25, -12, 0, 12, 25]) {
    trim.box(0.13, 3, 0.13, PAL.woodDark, x, 1.5, z);
    trim.box(0.4, 0.55, 0.4, PAL.iron, x, 3.1, z);
    trim.box(0.28, 0.36, 0.42, 0xe3b65f, x, 3.1, z);
    trim.cone(0.35, 0.25, 4, PAL.iron, x, 3.5, z, 0, Math.PI / 4);
  }
  // A shaded well and water trough give the south square a clear landmark.
  trim.cyl(1, 1.1, 0.85, 10, PAL.rock, 10, 0.425, 20);
  trim.cyl(0.75, 0.75, 0.04, 10, PAL.water, 10, 0.87, 20);
  for (const x of [8.7, 11.3]) trim.box(0.16, 2.8, 0.16, PAL.woodDark, x, 1.4, 20);
  trim.box(3.2, 0.2, 2.6, PAL.wood, 10, 2.9, 20);
  game.physics.fixedCylinder(10, 0.45, 20, 0.45, 1.1, GROUPS.world);
  group.add(meshOf(trim));
  const npcs = civilians(group, rng);
  return {
    sites, npcs,
    tick(dt) {
      for (const npc of npcs) {
        npc.px = npc.x; npc.pz = npc.z; npc.prevYaw = npc.yaw;
        const player = game.player, near = player && Math.hypot(player.x - npc.x, player.z - npc.z) < 2.3;
        let speed = 0;
        if (near) npc.yaw = turnToward(npc.yaw, Math.atan2(player.x - npc.x, player.z - npc.z), dt * 4);
        else if (npc.wait > 0) npc.wait -= dt;
        else {
          const point = npc.route[npc.next], dx = point[0] - npc.x, dz = point[1] - npc.z;
          const distance = Math.hypot(dx, dz), step = Math.min(distance, npc.speed * dt);
          if (distance > 0.01) {
            npc.x += dx / distance * step; npc.z += dz / distance * step;
            npc.yaw = turnToward(npc.yaw, Math.atan2(dx, dz), dt * 4); speed = npc.speed;
          }
          if (distance <= npc.speed * dt + 0.01) { npc.next = (npc.next + 1) % npc.route.length; npc.wait = 2.5; }
        }
        npc.animation.speed = speed; npc.animation.dt = dt;
        animateCharacter(npc.model, npc.animation);
        npc.model.arm.rotation.x = 1.1;
      }
    },
    render(alpha) {
      for (const npc of npcs) {
        npc.model.root.position.set(npc.px + (npc.x - npc.px) * alpha, 0, npc.pz + (npc.z - npc.pz) * alpha);
        npc.model.root.rotation.y = npc.prevYaw + angleDelta(npc.prevYaw, npc.yaw) * alpha;
      }
    },
    dispose() {
      for (const sprite of signs) { sprite.material.map.dispose(); sprite.material.dispose(); group.remove(sprite); }
    },
  };
}
