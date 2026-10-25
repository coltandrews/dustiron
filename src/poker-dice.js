// Poker dice: five dice each, scored like a poker hand. Shared by the server,
// which throws the dice, and the browser, which names the hands.
export const DICE_WAGERS = [5, 10, 25, 50, 100];
export const DICE_RANGE = 8;

const NAMES = ['Nothing', 'A pair', 'Two pair', 'Three of a kind', 'A straight', 'Full house', 'Four of a kind', 'Five of a kind'];

/** Scores a throw: [rank, ...tiebreak values], higher is better. */
export function scoreDice(dice) {
  const counts = new Map();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n).join('');
  const sorted = [...dice].sort((a, b) => a - b).join('');
  let rank = 0;
  if (shape === '5') rank = 7;
  else if (shape === '41') rank = 6;
  else if (shape === '32') rank = 5;
  else if (sorted === '12345' || sorted === '23456') rank = 4;
  else if (shape === '311') rank = 3;
  else if (shape === '221') rank = 2;
  else if (shape === '2111') rank = 1;
  return [rank, ...groups.map(([v]) => v)];
}

export function handName(dice) { return NAMES[scoreDice(dice)[0]]; }

/** 1 when a beats b, -1 when b wins, 0 for a tie. */
export function compareDice(a, b) {
  const sa = scoreDice(a), sb = scoreDice(b);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const d = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
