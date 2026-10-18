// Cover selection: score every cover point, then confirm the best few with a
// line-of-sight ray. A point hidden from the player is worth far more than any
// other factor.
import { T } from './tuning.js';

/**
 * @param {object} game
 * @param {object} bandit
 * @param {{range:[number,number], fromX?:number, fromZ?:number}} opts
 * @returns {{x:number,z:number,prop:object}|null}
 */
export function chooseCover(game, bandit, opts) {
  const P = game.player;
  const px = opts.fromX ?? P.x, pz = opts.fromZ ?? P.z;
  const [minD, maxD] = opts.range;
  const candidates = [];
  for (const prop of bandit.encounter.props) {
    if (!prop.isCover()) continue;
    const propX = prop.x, propZ = prop.z;
    for (const pt of prop.coverPoints()) {
      if (!bandit.encounter.nav.isFree(pt.x, pt.z)) continue;
      if (game.coverClaimed(pt.x, pt.z, bandit)) continue;
      const dpx = px - pt.x, dpz = pz - pt.z;
      const dp = Math.hypot(dpx, dpz);
      if (dp < 3.5) continue;
      const db = Math.hypot(pt.x - bandit.x, pt.z - bandit.z);
      // Is the prop roughly between this point and the player?
      const tpx = propX - pt.x, tpz = propZ - pt.z;
      const tl = Math.hypot(tpx, tpz) || 1;
      const between = (tpx * dpx + tpz * dpz) / (tl * dp);
      let score = -db * 0.22 - Math.max(0, minD - dp) * 0.9 - Math.max(0, dp - maxD) * 0.6 + between * 3;
      candidates.push({ x: pt.x, z: pt.z, prop, score });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  let best = null, bestScore = -Infinity;
  const n = Math.min(10, candidates.length);
  for (let i = 0; i < n; i++) {
    const c = candidates[i];
    const hidden = !game.physics.los(c.x, c.z, px, pz, T.player.gunHeight);
    const s = c.score + (hidden ? 10 : 0);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}
