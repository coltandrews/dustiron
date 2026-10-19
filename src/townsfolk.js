// Townspeople models: shopkeepers and seated saloon patrons.
import { PAL, Shape, makeCharacter, meshOf } from './models.js';
import { addRollPivot, showGun } from './character.js';
import { mug } from './furniture.js';

/** Builds a townsperson model. Extra details give each shopkeeper a distinct silhouette. */
export function townsperson(look) {
  const model = addRollPivot(makeCharacter(look));
  showGun(model, null);
  const extra = new Shape(), t = model.tall;
  if (look.apron) { extra.box(0.4, 0.62, 0.03, look.apron, 0, 0.98 * t, 0.15); extra.box(0.46, 0.05, 0.31, look.apron, 0, 1.24 * t, 0); }
  if (look.star) { extra.cyl(0.07, 0.07, 0.02, 5, PAL.brass, -0.12, 1.3 * t, 0.15, Math.PI / 2); }
  if (extra.parts.length) model.body.add(meshOf(extra, model.material));
  return model;
}

/** A seated patron who holds a mug and takes a sip now and then. */
export function patron(room, name, look, x, z, yaw, phase = 0) {
  const model = townsperson(look);
  const drink = new Shape();
  mug(drink, 0, -0.1, 0.05, PAL.brass, Math.PI / 2);
  const cup = meshOf(drink, model.material, false, false);
  cup.position.set(0, 0, 0.44); model.arm.add(cup);
  const c = room.center;
  const npc = { id: `saloon-patron-${name.toLowerCase().replace(/\s+/g, '-')}`, name, x: c.x + x, z: c.z + z, yaw, seated: true,
    model, cup, sipT: phase, animation: { speed: 0, dt: 0, aiming: false, flash: 0 } };
  model.root.position.set(npc.x, 0, npc.z);
  model.root.rotation.y = yaw;
  room.root.add(model.root);
  room.npcs.push(npc);
  return npc;
}
