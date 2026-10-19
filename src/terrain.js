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
