// Shared river shape for the world and the paper map. The channel starts and
// ends beyond the playable land, so it always reads as part of a larger river.
export const RIVER_MIN_X = -440;
export const RIVER_MAX_X = 440;

/** The second town sits in the pine country to the northwest. */
export const PINE_HOLLOW = { id: 'pine', name: 'Pine Hollow', x: -262, z: -250, radius: 30 };
export const MERCY = { id: 'mercy', name: 'Mercy Crossing', x: 0, z: 0, radius: 32 };

/**
 * How green the land is at a point, 0 (desert) to 1 (pine forest). The forest
 * fills the northwest with a ragged, noisy edge and thins near the river.
 */
export function forestAt(x, z) {
  const dx = x - PINE_HOLLOW.x - 20, dz = z - PINE_HOLLOW.z - 10;
  const wobble = Math.sin(x * 0.021 + 1.3) * 22 + Math.sin(z * 0.017 - 0.4) * 26 + Math.sin((x - z) * 0.009) * 30;
  const d = Math.hypot(dx * 0.92, dz) - 205 - wobble;
  const t = Math.max(0, Math.min(1, 0.5 - d / 70));
  return t * t * (3 - 2 * t);
}

export function riverCenter(x) {
  return 30
    + 12 * Math.sin(x / 72) ** 3
    + 5 * Math.sin(x / 31) ** 3
    + 2.5 * Math.sin(x / 15) ** 3;
}

export function riverWidth(x) {
  return 9.5 + Math.sin(x / 28 + 0.4) * 1.3;
}

export function riverTangent(x) {
  const step = 0.1;
  return Math.atan2(riverCenter(x + step) - riverCenter(x - step), step * 2);
}

function trailBend(camp, index) {
  const value = Math.sin(camp.x * 12.9898 + camp.z * 78.233 + index * 31.17) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

/** True when the point lies in the river or on its near bank. */
export function inRiver(x, z, margin = 1.5) {
  return x >= RIVER_MIN_X - margin && x <= RIVER_MAX_X + margin && Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + margin;
}

function bridgeAt(x) {
  const reach = riverWidth(x) / 2 + 3.75;
  return { x, north: riverCenter(x) - reach, south: riverCenter(x) + reach };
}

/** Three crossings join the north and south sides of the frontier. */
export const BRIDGES = [bridgeAt(-310), bridgeAt(-125), bridgeAt(0), bridgeAt(125), bridgeAt(310)];
/** The center crossing carries Main Street and remains the town bridge. */
export const BRIDGE = BRIDGES[2];

function curve(start, end, bend, segments) {
  const dx = end.x - start.x, dz = end.z - start.z, distance = Math.hypot(dx, dz) || 1;
  const control = { x: (start.x + end.x) / 2 - dz / distance * bend, z: (start.z + end.z) / 2 + dx / distance * bend };
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, u = 1 - t;
    points.push({
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      z: u * u * start.z + 2 * u * t * control.z + t * t * end.z,
    });
  }
  return points;
}

const crosses = (points) => points.some((p) => inRiver(p.x, p.z, 0.5));

/**
 * A stable curved trail from the town edge to one camp. Trails never ford the
 * river: a camp across the water is reached over its nearest bridge.
 */
export function campTrailPoints(camp, index = 0, segments = 18) {
  // Camps in the pine country are reached from Pine Hollow, on the same bank.
  const home = camp.home === 'pine' ? PINE_HOLLOW : MERCY;
  const rx = camp.x - home.x, rz = camp.z - home.z;
  const distance = Math.hypot(rx, rz);
  if (distance < 1) return [];
  const dx = rx / distance, dz = rz / distance;
  const end = { x: camp.x - dx * 25, z: camp.z - dz * 25 };
  if (home !== MERCY) {
    const start = { x: home.x + dx * (home.radius + 10), z: home.z + dz * (home.radius + 10) };
    const span = Math.hypot(end.x - start.x, end.z - start.z);
    return curve(start, end, trailBend(camp, index) * Math.min(26, span * 0.18), segments);
  }
  const farSide = camp.z > riverCenter(camp.x);
  const crossing = BRIDGES.reduce((best, bridge) => Math.abs(camp.x - bridge.x) < Math.abs(camp.x - best.x) ? bridge : best);
  const start = farSide ? { x: crossing.x, z: crossing.south + 4 } : { x: dx * 44, z: dz * 44 };
  const span = Math.hypot(end.x - start.x, end.z - start.z);
  const bend = trailBend(camp, index) * Math.min(26, span * 0.18);
  for (const scale of [1, 0.5, 0, -0.5, -1]) {
    const points = curve(start, end, bend * scale, segments);
    if (!crosses(points)) return points;
  }
  return curve(start, end, 0, segments);
}

export function distanceToTrail(x, z, points) {
  let nearest = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return nearest;
}

/** The stage road from Mercy Crossing's north end up to Pine Hollow. */
export function pineRoadPoints(segments = 40) {
  const start = { x: -3.5, z: -62 };
  const end = { x: PINE_HOLLOW.x, z: PINE_HOLLOW.z + 46 };
  return curve(start, end, 60, segments);
}
