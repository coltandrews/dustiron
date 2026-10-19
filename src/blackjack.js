// Saved, deterministic blackjack. Money changes as soon as a hand starts or ends.
import { createRng } from './rng.js';

export const BLACKJACK_BET = 5;
/** Table limits keep cards a small gamble, never the safest way to earn. */
export const BETS = [5, 10, 20];

export function emptyBlackjack() {
  return { hand: 0, phase: 'idle', deck: [], player: [], dealer: [], result: '', bet: BLACKJACK_BET };
}

export function handValue(cards) {
  let value = 0, aces = 0;
  for (const rank of cards) {
    if (rank === 1) { value += 11; aces++; }
    else value += Math.min(rank, 10);
  }
  while (value > 21 && aces) { value -= 10; aces--; }
  return value;
}

function deckFor(seed, hand) {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) deck.push(rank);
  const rng = createRng((seed ^ Math.imul(hand + 1, 0x9e3779b9)) >>> 0);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function settle(life, message, payout) {
  life.blackjack.phase = 'done';
  life.blackjack.result = message;
  life.bounty += payout;
  return { ok: true, message };
}

function naturals(life) {
  const state = life.blackjack;
  const player = handValue(state.player), dealer = handValue(state.dealer);
  if (player !== 21 && dealer !== 21) return null;
  const bet = state.bet ?? BLACKJACK_BET;
  if (player === 21 && dealer === 21) return settle(life, `Both have blackjack. Your $${bet} bet is returned.`, bet);
  if (player === 21) return settle(life, `Blackjack. You win $${Math.floor(bet * 1.5)} plus your bet.`, bet + Math.floor(bet * 1.5));
  return settle(life, 'The dealer has blackjack.', 0);
}

export function startBlackjack(life, bet = BLACKJACK_BET) {
  if (life.status !== 'alive') return { ok: false, message: 'This life has ended.' };
  if (life.blackjack.phase === 'playing') return { ok: false, message: 'Finish the current hand.' };
  if (!BETS.includes(bet)) return { ok: false, message: 'The table takes $5, $10 or $20.' };
  if (life.bounty < bet) return { ok: false, message: `You need $${bet} to bet that.` };
  const hand = life.blackjack.hand + 1, deck = deckFor(life.seed, hand);
  life.bounty -= bet;
  life.blackjack = { hand, phase: 'playing', deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], result: '', bet };
  return naturals(life) ?? { ok: true, message: 'The cards are dealt.' };
}

export function hitBlackjack(life) {
  const state = life.blackjack;
  if (state.phase !== 'playing') return { ok: false, message: 'Deal a new hand first.' };
  state.player.push(state.deck.pop());
  const value = handValue(state.player);
  if (value > 21) return settle(life, `You have ${value}. Bust.`, 0);
  if (value === 21) return standBlackjack(life);
  return { ok: true, message: `You draw. Your hand is ${value}.` };
}

export function standBlackjack(life) {
  const state = life.blackjack;
  if (state.phase !== 'playing') return { ok: false, message: 'Deal a new hand first.' };
  while (handValue(state.dealer) < 17) state.dealer.push(state.deck.pop());
  const player = handValue(state.player), dealer = handValue(state.dealer), bet = state.bet ?? BLACKJACK_BET;
  if (dealer > 21) return settle(life, `Dealer busts with ${dealer}. You win $${bet} plus your bet.`, bet * 2);
  if (player > dealer) return settle(life, `You win ${player} to ${dealer}. You get $${bet} plus your bet.`, bet * 2);
  if (player === dealer) return settle(life, `Push at ${player}. Your bet is returned.`, bet);
  return settle(life, `Dealer wins ${dealer} to ${player}.`, 0);
}

export function cardName(rank) {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
}

export function blackjackText(life) {
  const state = life.blackjack;
  if (state.phase === 'idle') return 'Bets are $5, $10 or $20. Blackjack pays 3 to 2. The dealer stands on 17.';
  const player = state.player.map(cardName).join('  ');
  const dealerCards = state.phase === 'playing' ? `${cardName(state.dealer[0])}  ?` : state.dealer.map(cardName).join('  ');
  const dealerValue = state.phase === 'playing' ? '?' : handValue(state.dealer);
  return `Dealer: ${dealerCards} (${dealerValue})\nYou: ${player} (${handValue(state.player)})\nBet on the table: $${state.bet ?? BLACKJACK_BET}${state.result ? `\n\n${state.result}` : ''}`;
}

export function validBlackjack(value) {
  if (!value || typeof value !== 'object' || !Number.isSafeInteger(value.hand) || value.hand < 0) return false;
  if (!['idle', 'playing', 'done'].includes(value.phase) || !Array.isArray(value.deck) || !Array.isArray(value.player) || !Array.isArray(value.dealer)) return false;
  const cards = [...value.deck, ...value.player, ...value.dealer];
  return cards.length <= 52 && cards.every((rank) => Number.isSafeInteger(rank) && rank >= 1 && rank <= 13)
    && typeof value.result === 'string' && value.result.length < 180
    && (value.bet === undefined || BETS.includes(value.bet));
}
