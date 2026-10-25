// Town safety rules shared by the browser and the server. A player inside a
// town (or inside any shop room) cannot be hurt by outlaws or other players,
// except by an accepted duel partner.

/** All towns in a world. Older worlds have a single `town` field. */
export function townsOf(world) {
  return world.towns ?? [world.town];
}

/** The town that contains a point, or null. */
export function townAt(world, x, z) {
  for (const town of townsOf(world)) if (Math.hypot(x - town.x, z - town.z) < town.radius) return town;
  return null;
}

/** True when the position is protected: inside a shop room or within a town. */
export function inSafeZone(world, x, z, room = null) {
  return !!room || !!townAt(world, x, z);
}
