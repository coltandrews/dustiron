// Back streets, yards and street furniture: the buildings behind the main row,
// the corral, the graveyard, work yards, hitching rails and the telegraph line.
import * as THREE from 'three';
import { PAL, Shape, barrelShape, crateShape, meshOf, wagonShape } from './models.js';
import { GROUPS } from './physics.js';
import { createRng } from './rng.js';
import { blot, blotMesh } from './decals.js';
import { window } from './facade.js';
import { horse } from './interior-social.js';
import { place } from './furniture.js';

function rearDoor(s, z, double = false) {
  const xs = double ? [-0.55, 0.55] : [0];
  s.box(double ? 2.3 : 1.45, 2.55, 0.1, PAL.woodLight, 0, 1.28, z - 0.02);
  for (const x of xs) {
    s.box(double ? 1.0 : 1.15, 2.3, 0.14, PAL.woodDark, x, 1.15, z);
    for (const y of [0.5, 1.2, 1.9]) s.box(double ? 0.8 : 0.95, 0.07, 0.17, PAL.wood, x, y, z + 0.06);
    s.cyl(0.06, 0.06, 0.08, 6, PAL.brass, x + (double ? (x < 0 ? 0.32 : -0.32) : 0.4), 1.15, z + 0.1, Math.PI / 2);
  }
  s.box(double ? 2.6 : 1.8, 0.16, 0.9, PAL.plank, 0, 0.08, z + 0.5);
}

function roof(s, w, d, eave, rise, color, fill) {
  const angle = Math.atan2(rise, d / 2), slope = Math.hypot(d / 2, rise) + 0.45;
  for (const side of [-1, 1]) {
    s.box(w + 0.7, 0.2, slope, color, 0, eave + rise / 2, side * d / 4, side * angle);
    for (let x = -w / 2; x <= w / 2; x += 0.65) s.box(0.04, 0.22, slope - 0.06, PAL.woodDark, x, eave + rise / 2 + 0.02, side * d / 4, side * angle);
  }
  const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const geo = new THREE.ExtrudeGeometry(tri, { depth: w - 0.02, bevelEnabled: false }); geo.translate(0, 0, -(w - 0.02) / 2);
  s.add(geo, fill, 0, eave, 0, 0, Math.PI / 2, 0);
  s.cyl(0.11, 0.11, w + 0.9, 6, PAL.woodLight, 0, eave + rise + 0.05, 0, 0, 0, Math.PI / 2);
}

function rearBuilding(game, group, spec) {
  const s = new Shape(), front = spec.depth / 2 + 0.02, back = -spec.depth / 2 - 0.02;
  s.box(spec.width, spec.height, spec.depth, spec.color, 0, spec.height / 2, 0);
  s.box(spec.width + 0.16, 0.32, spec.depth + 0.16, PAL.rockDark, 0, 0.16, 0);
  for (const z of [front, back]) for (let y = 0.45; y < spec.height - 0.1; y += 0.44) s.box(spec.width - 0.25, 0.035, 0.06, PAL.woodDark, 0, y, z + Math.sign(z) * 0.03);
  for (const x of [-spec.width / 2 + 0.1, spec.width / 2 - 0.1]) for (const z of [front, back]) s.box(0.22, spec.height, 0.2, spec.trim, x, spec.height / 2, z);
  window(s, spec.width * 0.25, 2, back - 0.06, 0x3f5558, 1.1, 1.2);
  if (spec.type === 'hotel') {
    rearDoor(s, front + 0.08, true);
    for (const y of [2.1, 4.8]) for (const x of [-3.1, 3.1]) window(s, x, y, front + 0.1, 0x4f6a6e);
    s.box(spec.width + 0.4, 0.2, 1.6, PAL.plank, 0, 3.45, front + 0.8);
    for (let x = -4.6; x <= 4.6; x += 0.46) s.box(0.06, 0.8, 0.06, PAL.woodDark, x, 3.95, front + 1.5);
    s.box(spec.width + 0.4, 0.1, 0.12, PAL.woodLight, 0, 4.36, front + 1.5);
    for (const x of [-4.6, 0, 4.6]) s.box(0.2, 3.4, 0.2, PAL.woodLight, x, 1.7, front + 1.5);
    roof(s, spec.width, spec.depth, spec.height - 0.05, 1.4, spec.roof, spec.color);
  } else if (spec.type === 'chapel') {
    rearDoor(s, front + 0.08, true);
    for (const x of [-2.1, 2.1]) window(s, x, 2.4, front + 0.1, 0x8aa4a8, 0.8, 1.9);
    roof(s, spec.width, spec.depth, spec.height - 0.05, 2.4, spec.roof, spec.color);
    s.box(1.7, 2.4, 1.7, spec.trim, 0, spec.height + 2.0, front - 0.9);
    s.box(0.9, 0.9, 0.1, PAL.woodDark, 0, spec.height + 2.4, front - 0.02);
    s.cyl(0.26, 0.34, 0.42, 8, PAL.brass, 0, spec.height + 2.25, front - 0.4);
    s.add(new THREE.ConeGeometry(1.45, 2.4, 4), spec.roof, 0, spec.height + 4.4, front - 0.9, 0, Math.PI / 4);
    s.box(0.1, 0.9, 0.1, PAL.woodLight, 0, spec.height + 6.0, front - 0.9); s.box(0.5, 0.1, 0.1, PAL.woodLight, 0, spec.height + 6.15, front - 0.9);
  } else if (spec.type === 'forge') {
    roof(s, spec.width, spec.depth, spec.height - 0.05, 1.3, spec.roof, spec.color);
    s.box(3.6, 2.8, 0.16, 0x2d2723, 1.6, 1.4, front + 0.06);
    s.box(3.9, 0.2, 0.24, PAL.woodDark, 1.6, 2.9, front + 0.1);
    const side = new Shape(); rearDoor(side, front + 0.08); place(s, side, -2.7, 0, 0);
    s.box(1.6, 2.8, 1.6, PAL.rockDark, -2.6, spec.height + 0.6, -1.2);
    s.box(1.9, 0.22, 1.9, PAL.iron, -2.6, spec.height + 2.05, -1.2);
    s.box(spec.width + 0.4, 0.16, 2.2, PAL.plank, 0, 0.08, front + 1.1);
    s.box(2.2, 0.16, 2.6, PAL.woodDark, 0, 2.6, front + 1.2, -0.1);
  } else {
    rearDoor(s, front + 0.08, spec.type === 'freight');
    const windowX = spec.type === 'freight' ? [-3.3, 3.3] : [-1.9, 1.9];
    for (const x of windowX) window(s, x, 1.9, front + 0.1, 0x526a6b, 1.1, 1.2);
    roof(s, spec.width, spec.depth, spec.height - 0.05, spec.type === 'freight' ? 1.3 : 1.15, spec.roof, spec.color);
    if (spec.type === 'cabin') {
      s.box(spec.width + 0.3, 0.14, 1.6, PAL.plank, 0, 0.07, front + 0.8);
      for (const x of [-spec.width / 2 + 0.25, spec.width / 2 - 0.25]) s.cyl(0.09, 0.12, 2.6, 6, PAL.woodLight, x, 1.3, front + 1.5);
      s.box(spec.width + 0.6, 0.12, 1.9, spec.roof, 0, 2.6, front + 0.9, -0.15);
      s.box(0.7, 1.6, 0.7, PAL.rockDark, -spec.width * 0.3, spec.height + 0.5, -spec.depth * 0.2);
    } else {
      s.box(spec.width - 1, 0.8, 2.2, PAL.woodDark, 0, 0.4, front + 1.1);
      for (let i = 0; i < 4; i++) s.box(0.8, 0.12, 2.2, PAL.plank, -2.4 + i * 1.6, 0.82, front + 1.1);
    }
  }
  const object = new THREE.Group();
  object.position.set(spec.x, 0, spec.z); object.rotation.y = spec.ry;
  object.add(meshOf(s)); group.add(object);
  game.physics.fixedBox(spec.x, spec.height / 2, spec.z, spec.width / 2, spec.height / 2, spec.depth / 2, spec.ry, GROUPS.world);
  if (spec.type === 'freight') {
    const dock = spec.depth / 2 + 1.1;
    game.physics.fixedBox(spec.x + Math.sin(spec.ry) * dock, 0.45, spec.z + Math.cos(spec.ry) * dock, (spec.width - 1) / 2, 0.45, 1.1, spec.ry, GROUPS.world);
  }
}

const REAR = [
  { type: 'forge', x: -25, z: -19, ry: Math.PI / 2, width: 8.2, depth: 7, height: 3.8, color: 0x73513a, trim: 0x9d7148, roof: 0x443832 },
  { type: 'cabin', x: -26, z: 1, ry: Math.PI / 2 + 0.05, width: 6.6, depth: 6.2, height: 3.6, color: 0x806342, trim: 0xae8250, roof: 0x51402f },
  { type: 'freight', x: -25, z: 12, ry: Math.PI / 2 - 0.03, width: 9.4, depth: 7.4, height: 4.3, color: 0x6b533d, trim: 0x9d7951, roof: 0x453b35 },
  { type: 'hotel', x: 25, z: -18, ry: -Math.PI / 2 - 0.03, width: 10, depth: 7.4, height: 6.4, color: 0x926243, trim: 0xc08b58, roof: 0x594034 },
  { type: 'chapel', x: 27, z: 2, ry: -Math.PI / 2 + 0.04, width: 6.8, depth: 8.2, height: 4.6, color: 0xc8b98d, trim: 0xe0d3ab, roof: 0x5b4a3b },
  { type: 'cabin', x: 25, z: 15, ry: -Math.PI / 2, width: 6.5, depth: 6, height: 3.5, color: 0x725841, trim: 0xa57a4c, roof: 0x48372c },
];

function fenceRun(s, points, posts = 1.8, rails = 2, color = PAL.woodLight) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / posts));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < points.length - 2) continue;
      const t = k / n, lean = Math.sin(a.x * 3 + k * 1.7) * 0.05;
      s.box(0.14, 1.2, 0.14, PAL.woodDark, a.x + (b.x - a.x) * t, 0.6, a.z + (b.z - a.z) * t, lean, 0, lean * 0.6);
    }
    for (let r = 0; r < rails; r++) s.box(0.08, 0.12, len, color, (a.x + b.x) / 2, 0.42 + r * 0.42, (a.z + b.z) / 2, 0, yaw, 0);
  }
}

function fenceSolids(game, points) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    game.physics.fixedBox((a.x + b.x) / 2, 0.6, (a.z + b.z) / 2, 0.08, 0.6, len / 2, Math.atan2(b.x - a.x, b.z - a.z), GROUPS.world);
  }
}

function yards(game, group) {
  const rng = createRng(0x79617264), s = new Shape(), shade = [];
  // Corral beside the freight barn, with a gate gap facing town and a horse inside.
  const corral = [{ x: -34, z: 14 }, { x: -39, z: 14 }, { x: -39, z: 0 }, { x: -30.5, z: 0 }, { x: -30.5, z: 14 }];
  fenceRun(s, corral, 2.1, 3); fenceSolids(game, corral);
  place(s, horse(new Shape(), 0x5a3a28, 0x1e1712, false), -34.5, 0, 5.5, 0.6);
  place(s, horse(new Shape(), 0xb39274, 0xefe4cf, false), -36, 0, 10, 2.4);
  game.physics.fixedCylinder(-34.5, 1, 5.5, 1, 1.1, GROUPS.world); game.physics.fixedCylinder(-36, 1, 10, 1, 1.1, GROUPS.world);
  s.box(0.9, 0.6, 2.6, PAL.woodDark, -31.4, 0.3, 3); s.box(0.7, 0.08, 2.3, PAL.water, -31.4, 0.58, 3);
  game.physics.fixedBox(-31.4, 0.3, 3, 0.45, 0.3, 1.3, 0, GROUPS.world);
  shade.push(blot(-34.7, 7, 4.5, 7.5, 0x9a6f48, 0.55));
  // Water tower on four legs behind the forge yard.
  s.cyl(2.1, 1.95, 3, 12, PAL.wood, -33, 7.6, -9);
  for (const y of [6.4, 7.6, 8.8]) s.cyl(2.14, 2.14, 0.08, 12, PAL.iron, -33, y, -9);
  for (const x of [-34.6, -31.4]) for (const z of [-10.6, -7.4]) s.box(0.26, 6.2, 0.26, PAL.woodDark, x, 3.1, z, (z + 9) * 0.03, 0, -(x + 33) * 0.03);
  for (const y of [1.8, 4]) { s.box(3.4, 0.12, 0.12, PAL.woodDark, -33, y, -10.6); s.box(3.4, 0.12, 0.12, PAL.woodDark, -33, y, -7.4); }
  s.cone(2.3, 1.2, 12, PAL.iron, -33, 9.7, -9);
  s.cyl(0.12, 0.12, 5, 6, PAL.iron, -31, 4, -9, 0, 0, 0.3);
  for (const x of [-34.6, -31.4]) for (const z of [-10.6, -7.4]) game.physics.fixedCylinder(x, 1.5, z, 1.5, 0.2, GROUPS.world);
  // Woodpile and chopping block by the forge, with an outhouse behind the sheriff.
  for (let i = 0; i < 14; i++) s.cyl(0.13, 0.15, 1.1, 6, i % 3 ? PAL.wood : PAL.woodLight, -20.6 + (i % 5) * 0.03, 0.14 + Math.floor(i / 5) * 0.26, -12.5 + (i % 5) * 0.28, Math.PI / 2, 0, 0);
  s.cyl(0.35, 0.4, 0.6, 8, PAL.woodDark, -19.6, 0.3, -10.6); s.box(0.06, 0.5, 0.06, PAL.woodLight, -19.6, 0.85, -10.6, 0, 0, 0.5);
  game.physics.fixedBox(-20.6, 0.5, -11.9, 0.6, 0.5, 0.8, 0, GROUPS.world);
  s.box(1.3, 2.3, 1.3, 0x7a6040, -21.5, 1.15, -5); s.box(1.5, 0.12, 1.6, 0x51402f, -21.5, 2.4, -5, -0.15); s.box(0.7, 1.9, 0.06, PAL.woodDark, -20.83, 1.0, -5, 0, Math.PI / 2);
  s.box(0.2, 0.2, 0.04, PAL.bone, -20.8, 1.85, -5, 0, Math.PI / 2);
  game.physics.fixedBox(-21.5, 1.1, -5, 0.65, 1.1, 0.65, 0, GROUPS.world);
  // Graveyard behind the chapel: a picket fence, crosses and headstones.
  const yard = [{ x: 34, z: -4 }, { x: 34, z: 8 }, { x: 41, z: 8 }, { x: 41, z: -4 }, { x: 36.5, z: -4 }];
  for (let i = 0; i < yard.length - 1; i++) {
    const a = yard[i], b = yard[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= len; t += 0.32) s.box(0.08, 0.8, 0.04, 0xe6dcc0, a.x + (b.x - a.x) * t / len, 0.4, a.z + (b.z - a.z) * t / len, 0, yaw, 0);
    s.box(0.05, 0.08, len, 0xe6dcc0, (a.x + b.x) / 2, 0.55, (a.z + b.z) / 2, 0, yaw, 0);
  }
  fenceSolids(game, yard);
  for (let i = 0; i < 9; i++) {
    const x = 35.6 + (i % 3) * 1.9 + rng.range(-0.2, 0.2), z = -2.2 + Math.floor(i / 3) * 3.4 + rng.range(-0.3, 0.3), tilt = rng.range(-0.12, 0.12);
    if (i % 3 === 1 && i !== 4) { s.box(0.55, 0.75, 0.16, 0x9a958a, x, 0.37, z, tilt, Math.PI / 2, 0); s.cyl(0.27, 0.27, 0.16, 8, 0x9a958a, x, 0.75, z, Math.PI / 2, Math.PI / 2, 0); }
    else { s.box(0.1, 1.0, 0.1, 0x8a6a48, x, 0.5, z, tilt); s.box(0.1, 0.1, 0.5, 0x8a6a48, x, 0.72, z, tilt); }
    s.box(0.7, 0.08, 1.5, 0x9a7650, x - 0.75, 0.04, z);
  }
  // Laundry line between the hotel and the chapel.
  for (const z of [-11, -6]) s.box(0.1, 2.2, 0.1, PAL.woodDark, 23.4, 1.1, z);
  s.box(0.02, 0.02, 5, PAL.canvas, 23.4, 2.1, -8.5);
  for (const [z, color] of [[-10, 0xe4d7b9], [-9, 0x8e3f39], [-7.8, 0x3f5470], [-6.9, 0xe4d7b9]]) s.box(0.04, 0.7, 0.6, color, 23.4, 1.7, z);
  // Wagon yard at the empty lot by the creek, and a broken wheel against the cabin.
  const wagon = meshOf(wagonShape()); wagon.position.set(11, 0, 19.5); wagon.rotation.y = 0.35; group.add(wagon);
  game.physics.fixedBox(11, 0.8, 19.5, 1.15, 0.8, 1.7, 0.35, GROUPS.world);
  s.cyl(0.55, 0.55, 0.1, 12, PAL.woodDark, 13.6, 0.55, 17.8, 0.25, 0, Math.PI / 2 - 0.25);
  s.box(1.2, 0.85, 0.12, PAL.woodDark, 13.2, 0.42, 22.2, 0, 0.5, 0);
  shade.push(blot(11.5, 19.5, 4.5, 3, 0x9a6f48, 0.45, 0.014, 0.35));
  for (const [x, z, size, ry] of [[-20.2, -15.5, 1, 0.1], [-21.3, -16, 0.75, -0.3], [-20.4, -16.4, 0.7, 0.5], [20.6, -11.2, 0.9, 0.2], [19.8, 9.8, 0.8, 0.6], [-18.6, 6.5, 1, -0.2]]) {
    const crate = meshOf(crateShape(size)); crate.position.set(x, size / 2, z); crate.rotation.y = ry; group.add(crate);
    game.physics.fixedBox(x, size / 2, z, size / 2, size / 2, size / 2, ry, GROUPS.world);
  }
  for (const [x, z] of [[20.2, 8.6], [20.9, 9.4], [-20.4, 18.6]]) {
    const barrel = meshOf(barrelShape()); barrel.position.set(x, 0.58, z); group.add(barrel);
    game.physics.fixedCylinder(x, 0.58, z, 0.58, 0.42, GROUPS.world);
  }
  group.add(meshOf(s));
  group.add(blotMesh(shade));
}

function street(game, group, doors) {
  const s = new Shape(), shade = [];
  // The telegraph line runs along the west edge of the street, clear of porch steps and the bridge.
  const poleX = -5.6, poles = [-40, -26, -12, 0.5, 13];
  poles.forEach((z, i) => {
    const lean = Math.sin(i * 2.3) * 0.03;
    s.box(0.18, 4.4, 0.18, PAL.woodDark, poleX, 2.2, z, lean, 0, -lean);
    s.box(1.3, 0.12, 0.12, PAL.woodLight, poleX, 3.95, z);
    for (const u of [-0.5, 0.5]) s.cyl(0.06, 0.08, 0.16, 6, 0x7d9a9a, poleX + u, 4.08, z);
  });
  for (let i = 0; i < poles.length - 1; i++) {
    const z = (poles[i] + poles[i + 1]) / 2, len = poles[i + 1] - poles[i];
    for (const x of [poleX - 0.5, poleX + 0.5]) {
      s.cyl(0.02, 0.02, len / 2 + 0.05, 4, PAL.iron, x, 4.02, z - len / 4, Math.PI / 2 + 0.04);
      s.cyl(0.02, 0.02, len / 2 + 0.05, 4, PAL.iron, x, 4.02, z + len / 4, Math.PI / 2 - 0.04);
    }
  }
  for (const z of poles) game.physics.fixedCylinder(poleX, 1, z, 1, 0.14, GROUPS.world);
  // Hitching rails stand at the edge of the street between doors, never in a doorway.
  for (const door of doors) {
    if (door.kind === 'stable') continue;
    const x = Math.sign(door.x) * 6.1, z = door.z + (door.z < 0 ? 3.4 : -3.4);
    for (const dz of [-1.3, 1.3]) s.cyl(0.1, 0.13, 1.2, 6, PAL.woodDark, x, 0.6, z + dz);
    s.cyl(0.08, 0.08, 2.9, 6, PAL.woodLight, x, 1.0, z, Math.PI / 2);
    game.physics.fixedBox(x, 0.6, z, 0.12, 0.6, 1.4, 0, GROUPS.world);
    shade.push(blot(x, z, 0.8, 1.9, 0x8a5a36, 0.3));
  }
  // Water troughs by the saloon and the livery.
  for (const [x, z] of [[6.0, 13.2], [-6.0, 10.4]]) {
    s.box(1.0, 0.7, 2.6, PAL.woodDark, x, 0.35, z); s.box(0.8, 0.08, 2.4, PAL.water, x, 0.66, z);
    for (const dz of [-1, 1]) s.box(1.1, 0.12, 0.14, PAL.iron, x, 0.5, z + dz);
    game.physics.fixedBox(x, 0.35, z, 0.5, 0.35, 1.3, 0, GROUPS.world);
  }
  // Barrels and a bench under a porch, a few sacks by the stable.
  for (const [x, z, y] of [[-8.0, -21.6, 0.24], [8.0, 1.7, 0.24], [-7.6, 20.4, 0]]) {
    const barrel = meshOf(barrelShape(0.36, 1.0)); barrel.position.set(x, 0.5 + y, z); group.add(barrel);
    game.physics.fixedCylinder(x, 0.5, z, 0.5, 0.36, GROUPS.world);
  }
  for (const [x, z] of [[-7.9, 21.5], [-8.4, 21.9]]) s.add(new THREE.SphereGeometry(0.34, 7, 5), PAL.canvasDark, x, 0.36, z, 0, x, 0, 1, 1.1, 0.8);
  // Cactus and stones at the town edges keep the corners from looking cut off.
  for (const [x, z, h] of [[-15, -33, 2.4], [16, -31, 1.9], [-36, -22, 2.8], [33, 21, 2.2]]) {
    s.cyl(0.2, 0.24, h, 8, PAL.cactus, x, h / 2, z);
    s.cone(0.2, 0.2, 8, PAL.cactus, x, h + 0.1, z);
    s.cyl(0.12, 0.12, 0.4, 6, PAL.cactusDark, x + 0.3, h * 0.5, z, 0, 0, Math.PI / 2);
    s.cyl(0.13, 0.13, 0.7, 6, PAL.cactus, x + 0.5, h * 0.5 + 0.32, z);
    game.physics.fixedCylinder(x, h / 2, z, h / 2, 0.26, GROUPS.world);
  }
  group.add(meshOf(s));
  group.add(blotMesh(shade));
}

export function buildBacklots(game, group, doors) {
  for (const building of REAR) rearBuilding(game, group, building);
  yards(game, group);
  street(game, group, doors);
}
