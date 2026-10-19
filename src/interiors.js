// Cutaway interiors keep the room in view while the player walks inside it.
// Rooms sit beyond the edge of the playable land so they never share space
// (or colliders) with the desert, camps or bandits.
import * as THREE from 'three';
import { PAL, Shape, meshOf } from './models.js';
import { animateCharacter, poseSeated, turnToward } from './character.js';
import { GROUPS } from './physics.js';
import { WORLD_HALF } from './life.js';
import { FLOOR, place } from './furniture.js';
import { townsperson } from './townsfolk.js';
import { SHOP_ROOMS } from './interior-shops.js';
import { SOCIAL_ROOMS } from './interior-social.js';

export const ROOM_X = WORLD_HALF + 90;
const ROOM_SPACING = 36;
const HALF_W = 9.25, HALF_D = 7.25, WALL_H = 4.6, FRONT_H = 1.35;

const tint = (color, toward, amount) => new THREE.Color(color).lerp(new THREE.Color(toward), amount).getHex();

/** Shared helpers for one room: local placement, colliders and the merged mesh. */
function roomKit(game, room) {
  const s = new Shape(), c = room.center;
  return {
    s, room,
    put(build, x, z, ry = 0, y = 0) { const piece = new Shape(); build(piece); place(s, piece, c.x + x, y, c.z + z, ry); },
    solid(x, z, hx, hz, ry = 0, h = 1.2) { game.physics.fixedBox(c.x + x, h / 2, c.z + z, hx, h / 2, hz, ry, GROUPS.world); },
    finish() { const mesh = meshOf(s); room.root.add(mesh); return mesh; },
  };
}

function shell(game, kit, spec, windows) {
  const s = kit.s, c = kit.room.center;
  const wall = tint(spec.color, 0x8f6c4b, spec.kind === 'doctor' ? 0.05 : 0.38);
  const wainscot = tint(spec.color, PAL.woodDark, 0.55), trim = PAL.woodLight;
  // Plank floor with staggered joints and three close shades.
  const shades = [0x9a693e, 0x8f6139, 0xa27245];
  for (let i = 0, x = -HALF_W; x < HALF_W - 0.01; i++, x += 0.62) {
    let z = -HALF_D, k = (i * 7) % 5;
    while (z < HALF_D) {
      const len = Math.min(HALF_D - z, 2.4 + ((i * 3 + k) % 4) * 1.1);
      s.box(0.6, 0.2, len - 0.03, shades[(i + k) % 3], c.x + x + 0.31, FLOOR - 0.1, c.z + z + len / 2);
      z += len; k++;
    }
  }
  // Back wall: plaster or boards above a dark wainscot, a chair rail, crown trim and a few posts.
  s.box(HALF_W * 2, WALL_H, 0.3, wall, c.x, WALL_H / 2, c.z - HALF_D + 0.15);
  s.box(HALF_W * 2, 1.1, 0.06, wainscot, c.x, FLOOR + 0.55, c.z - HALF_D + 0.32);
  s.box(HALF_W * 2, 0.08, 0.1, trim, c.x, FLOOR + 1.12, c.z - HALF_D + 0.34);
  s.box(HALF_W * 2, 0.18, 0.12, PAL.woodDark, c.x, WALL_H - 0.09, c.z - HALF_D + 0.34);
  for (const x of [-HALF_W + 0.12, -4.6, 4.6, HALF_W - 0.12]) s.box(0.2, WALL_H, 0.12, PAL.woodDark, c.x + x, WALL_H / 2, c.z - HALF_D + 0.36);
  // Side walls slope down toward the camera.
  for (const side of [-1, 1]) {
    const outline = new THREE.Shape();
    outline.moveTo(-HALF_D, 0); outline.lineTo(-HALF_D, WALL_H); outline.lineTo(HALF_D, FRONT_H); outline.lineTo(HALF_D, 0); outline.closePath();
    const geo = new THREE.ExtrudeGeometry(outline, { depth: 0.3, bevelEnabled: false });
    geo.translate(0, 0, -0.15);
    s.add(geo, wall, c.x + side * (HALF_W - 0.15), 0, c.z, 0, -Math.PI / 2, 0);
    s.box(0.06, 1.1, HALF_D * 2 - 0.3, wainscot, c.x + side * (HALF_W - 0.32), FLOOR + 0.55, c.z);
    s.box(0.1, 0.08, HALF_D * 2 - 0.3, trim, c.x + side * (HALF_W - 0.34), FLOOR + 1.12, c.z);
    const slope = Math.atan2(WALL_H - FRONT_H, HALF_D * 2), length = Math.hypot(WALL_H - FRONT_H, HALF_D * 2);
    s.box(0.36, 0.14, length, PAL.woodDark, c.x + side * (HALF_W - 0.15), (WALL_H + FRONT_H) / 2 + 0.05, c.z, slope);
    for (const z of [-2.4, 2.4]) {
      const h = WALL_H - (z + HALF_D) / (HALF_D * 2) * (WALL_H - FRONT_H);
      s.box(0.12, h, 0.2, PAL.woodDark, c.x + side * (HALF_W - 0.34), h / 2, c.z + z);
    }
    // Low front stubs frame the doorway, which matches the street door.
    s.box(HALF_W - 1.25, 0.5, 0.3, wainscot, c.x + side * (HALF_W + 1.25) / 2, 0.25, c.z + HALF_D - 0.15);
    s.box(HALF_W - 1.15, 0.08, 0.36, trim, c.x + side * (HALF_W + 1.25) / 2, 0.53, c.z + HALF_D - 0.15);
    s.box(0.24, 2.6, 0.3, PAL.woodDark, c.x + side * 1.25, 1.3, c.z + HALF_D - 0.15);
    game.physics.fixedBox(c.x + side * (HALF_W + 1.25) / 2, 1.2, c.z + HALF_D - 0.15, (HALF_W - 1.25) / 2, 1.2, 0.15, 0, GROUPS.world);
  }
  s.box(2.74, 0.2, 0.34, PAL.woodDark, c.x, 2.6, c.z + HALF_D - 0.15);
  s.box(2.1, 0.02, 1.0, 0x6e4a2b, c.x, FLOOR + 0.012, c.z + HALF_D - 0.85);
  s.box(1.8, 0.025, 0.75, 0x8a5b38, c.x, FLOOR + 0.02, c.z + HALF_D - 0.85);
  // Windows let light in without hiding furniture.
  for (const w of windows) {
    const back = w.wall === 'back';
    const x = back ? c.x + w.at : c.x + (w.wall === 'left' ? -1 : 1) * (HALF_W - 0.32);
    const z = back ? c.z - HALF_D + 0.32 : c.z + w.at, ry = back ? 0 : (w.wall === 'left' ? Math.PI / 2 : -Math.PI / 2);
    const win = new Shape(), y = w.y ?? 2.45;
    win.box(1.9, 1.5, 0.08, PAL.woodDark, 0, y, 0);
    win.box(1.62, 1.22, 0.1, 0x6f9aa0, 0, y, 0.01);
    win.box(0.06, 1.22, 0.13, trim, 0, y, 0.03);
    win.box(1.62, 0.06, 0.13, trim, 0, y, 0.03);
    win.box(2.05, 0.1, 0.22, trim, 0, y - 0.8, 0.07);
    place(s, win, x, 0, z, ry);
  }
  game.physics.fixedBox(c.x, -0.5, c.z, HALF_W + 1, 0.5, HALF_D + 1, 0, GROUPS.ground);
  game.physics.fixedBox(c.x, 2.4, c.z - HALF_D + 0.15, HALF_W, 2.4, 0.15, 0, GROUPS.world);
  for (const side of [-1, 1]) game.physics.fixedBox(c.x + side * (HALF_W - 0.15), 2.4, c.z, 0.15, 2.4, HALF_D, 0, GROUPS.world);
}

const names = { guns: 'Otis Vale', doctor: 'Doctor Finch', sheriff: 'Sheriff Boone', maps: 'Elias Ward', clothes: 'Lena Pike', saloon: 'Mae Sullivan', stable: 'Tom Reed' };
const looks = {
  guns: { shirt: 0x6f3a2d, vest: 0x2f2a27, hat: 0x3b2f27, band: PAL.brass, pants: 0x403d3a, apron: 0x6b4a2f },
  doctor: { shirt: 0xe3dccb, vest: 0x2f3a3c, hat: 0x2b2a2a, band: PAL.black, pants: 0x34383d },
  sheriff: { shirt: 0x8a7148, vest: 0x4b3523, hat: 0x7a5a36, band: PAL.woodDark, pants: 0x3f3a34, star: true },
  maps: { shirt: 0x5f8682, vest: 0x5a4632, hat: 0x9c8461, band: 0x3c5e5a, pants: 0x4a4740 },
  clothes: { shirt: 0x8c5f79, vest: 0x56394d, hat: 0xc7a983, band: 0x8c5f79, pants: 0x4b4146 },
  saloon: { shirt: 0xd8c8a4, vest: 0x8f3a2f, hat: 0x3a2a24, band: PAL.brass, pants: 0x3a3330, apron: 0xe5d8bb },
  stable: { shirt: 0x7e6a42, vest: 0x5b4127, hat: 0xb08a59, band: PAL.woodDark, pants: 0x4a5160 },
};

function shopkeeper(room, spec, at) {
  const model = townsperson(looks[spec.kind]);
  model.arm.rotation.x = 1.1;
  const npc = { id: `${spec.id}-keeper`, name: names[spec.kind], label: names[spec.kind], kind: spec.kind,
    x: room.center.x + at.x, z: room.center.z + at.z, yaw: 0, model, animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
  model.root.position.set(npc.x, 0, npc.z); room.root.add(model.root);
  room.points.push(npc);
  room.npcs.push(npc);
}

const builders = { ...SHOP_ROOMS, ...SOCIAL_ROOMS };

export function buildInteriors(game, parent, sites) {
  const rooms = new Map();
  sites.forEach((spec, index) => {
    const root = new THREE.Group(), center = { x: ROOM_X, z: (index - (sites.length - 1) / 2) * ROOM_SPACING };
    root.visible = false; parent.add(root);
    const room = { id: spec.id, label: spec.label, center, root, points: [], npcs: [], site: spec };
    const kit = roomKit(game, room), plan = builders[spec.kind];
    shell(game, kit, spec, plan.windows);
    plan.build(kit, game);
    kit.finish();
    shopkeeper(room, spec, plan.keeper);
    rooms.set(spec.id, room);
  });
  return rooms;
}

export function updateInteriorNpcs(room, player, dt) {
  if (!room) return;
  for (const npc of room.npcs) {
    if (!npc.seated && player && Math.hypot(player.x - npc.x, player.z - npc.z) < 4) {
      npc.yaw = turnToward(npc.yaw, Math.atan2(player.x - npc.x, player.z - npc.z), dt * 4);
    }
    npc.model.root.rotation.y = npc.yaw;
    npc.animation.dt = dt;
    animateCharacter(npc.model, npc.animation);
    if (npc.seated) {
      poseSeated(npc.model);
      // Rest the mug on the table, then lift it to the mouth for a moment.
      npc.sipT = (npc.sipT + dt) % 7;
      const lift = npc.sipT > 5.6 ? Math.sin((npc.sipT - 5.6) / 1.4 * Math.PI) : 0;
      npc.model.arm.rotation.x = 0.62 - lift * 1.32;
      if (npc.cup) npc.cup.rotation.x = -npc.model.arm.rotation.x;
    } else npc.model.arm.rotation.x = 1.1;
  }
}
