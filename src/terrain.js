// Shared river shape for the world and the paper map.
export const RIVER_MIN_X = -82;
export const RIVER_MAX_X = 82;

export function riverCenter(x) {
  const bend = 1 - Math.exp(-(x * x) / 900);
  return 30 + bend * (12 * Math.sin(x / 50) + 4 * Math.sin(x / 18));
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

/** The two ends of the town bridge, on the town side and the far side. */
export const BRIDGE = { x: 0, north: riverCenter(0) - 8.5, south: riverCenter(0) + 8.5 };

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
 * river: a camp across the water is reached over the town bridge.
 */
export function campTrailPoints(camp, index = 0, segments = 18) {
  const distance = Math.hypot(camp.x, camp.z);
  if (distance < 1) return [];
  const dx = camp.x / distance, dz = camp.z / distance;
  const end = { x: camp.x - dx * 25, z: camp.z - dz * 25 };
  const farSide = camp.z > riverCenter(Math.max(RIVER_MIN_X, Math.min(RIVER_MAX_X, camp.x))) && Math.abs(camp.x) < RIVER_MAX_X + 30;
  const start = farSide ? { x: BRIDGE.x, z: BRIDGE.south + 4 } : { x: dx * 44, z: dz * 44 };
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
