// Saved, deterministic blackjack. Money changes as soon as a hand starts or ends.
import { createRng } from './rng.js';

export const BLACKJACK_BET = 5;
/** Table limits keep cards a small gamble, never the safest way to earn. */
export const BETS = [5, 10, 20];

export function emptyBlackjack() {
  return {
    hand: 0, phase: 'idle', deck: [], player: [], dealer: [], result: '', bet: BLACKJACK_BET,
    split: null, splitBet: 0, activeHand: 0, outcome: '', net: 0,
  };
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

function settle(life, message, payout, outcome, stake) {
  const state = life.blackjack;
  state.phase = 'done';
  state.result = message;
  state.outcome = outcome;
  state.net = payout - stake;
  life.bounty += payout;
  return { ok: true, message };
}

function naturals(life) {
  const state = life.blackjack;
  const player = handValue(state.player), dealer = handValue(state.dealer), bet = state.bet ?? BLACKJACK_BET;
  if (player !== 21 && dealer !== 21) return null;
  if (player === 21 && dealer === 21) return settle(life, 'Push.', bet, 'push', bet);
  if (player === 21) return settle(life, 'Blackjack!', bet + Math.floor(bet * 1.5), 'blackjack', bet);
  return settle(life, 'Dealer blackjack.', 0, 'lose', bet);
}

function activeCards(state) { return state.activeHand === 1 && state.split ? state.split : state.player; }
function activeBet(state) { return state.activeHand === 1 && state.split ? state.splitBet : state.bet; }

export function canDoubleBlackjack(life) {
  const state = life.blackjack;
  return state.phase === 'playing' && activeCards(state).length === 2 && life.bounty >= activeBet(state);
}

export function canSplitBlackjack(life) {
  const state = life.blackjack;
  return state.phase === 'playing' && !state.split && state.player.length === 2
    && Math.min(state.player[0], 10) === Math.min(state.player[1], 10) && life.bounty >= state.bet;
}

export function startBlackjack(life, bet = BLACKJACK_BET) {
  if (life.status !== 'alive') return { ok: false, message: 'This life has ended.' };
  if (life.blackjack.phase === 'playing') return { ok: false, message: 'Finish the current hand.' };
  if (!BETS.includes(bet)) return { ok: false, message: 'The table takes $5, $10 or $20.' };
  if (life.bounty < bet) return { ok: false, message: `You need $${bet}.` };
  const hand = life.blackjack.hand + 1, deck = deckFor(life.seed, hand);
  life.bounty -= bet;
  life.blackjack = {
    hand, phase: 'playing', deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], result: '', bet,
    split: null, splitBet: 0, activeHand: 0, outcome: '', net: 0,
  };
  return naturals(life) ?? { ok: true, message: 'Cards dealt.' };
}

function settleHands(life) {
  const state = life.blackjack, hands = state.split ? [state.player, state.split] : [state.player];
  const bets = state.split ? [state.bet, state.splitBet] : [state.bet];
  const liveHand = hands.some((cards) => handValue(cards) <= 21);
  if (liveHand) while (handValue(state.dealer) < 17) state.dealer.push(state.deck.pop());
  const dealer = handValue(state.dealer);
  let payout = 0;
  const results = hands.map((cards, index) => {
    const value = handValue(cards), bet = bets[index];
    if (value > 21) return 'lose';
    if (dealer > 21 || value > dealer) { payout += bet * 2; return 'win'; }
    if (value === dealer) { payout += bet; return 'push'; }
    return 'lose';
  });
  const stake = bets.reduce((sum, bet) => sum + bet, 0);
  const outcome = results.every((result) => result === 'win') ? 'win'
    : results.every((result) => result === 'lose') ? 'lose'
      : results.every((result) => result === 'push') ? 'push' : 'mixed';
  const net = payout - stake;
  const message = outcome === 'win' ? `You win $${net}.`
    : outcome === 'lose' ? 'Dealer wins.'
      : outcome === 'push' ? 'Push.' : `Split result: ${net > 0 ? '+' : ''}$${net}.`;
  return settle(life, message, payout, outcome, stake);
}

function finishActiveHand(life) {
  const state = life.blackjack;
  if (state.split && state.activeHand === 0) {
    state.activeHand = 1;
    return { ok: true, message: 'Second hand.' };
  }
  return settleHands(life);
}

export function hitBlackjack(life) {
  const state = life.blackjack;
  if (state.phase !== 'playing') return { ok: false, message: 'Deal a new hand first.' };
  const cards = activeCards(state);
  cards.push(state.deck.pop());
  const value = handValue(cards);
  if (value >= 21) return finishActiveHand(life);
  return { ok: true, message: 'Card dealt.' };
}

export function standBlackjack(life) {
  if (life.blackjack.phase !== 'playing') return { ok: false, message: 'Deal a new hand first.' };
  return finishActiveHand(life);
}

export function doubleBlackjack(life) {
  if (!canDoubleBlackjack(life)) return { ok: false, message: 'You cannot double this hand.' };
  const state = life.blackjack, bet = activeBet(state), cards = activeCards(state);
  life.bounty -= bet;
  if (state.activeHand === 1 && state.split) state.splitBet *= 2;
  else state.bet *= 2;
  cards.push(state.deck.pop());
  return finishActiveHand(life);
}

export function splitBlackjack(life) {
  if (!canSplitBlackjack(life)) return { ok: false, message: 'You cannot split this hand.' };
  const state = life.blackjack, second = state.player.pop();
  life.bounty -= state.bet;
  state.player.push(state.deck.pop());
  state.split = [second, state.deck.pop()];
  state.splitBet = state.bet;
  state.activeHand = 0;
  return { ok: true, message: 'Hand split.' };
}

export function cardName(rank) {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
}

function validCards(cards) {
  return Array.isArray(cards) && cards.every((rank) => Number.isSafeInteger(rank) && rank >= 1 && rank <= 13);
}

export function validBlackjack(value) {
  if (!value || typeof value !== 'object' || !Number.isSafeInteger(value.hand) || value.hand < 0) return false;
  if (!['idle', 'playing', 'done'].includes(value.phase) || !validCards(value.deck) || !validCards(value.player) || !validCards(value.dealer)) return false;
  if (value.split !== undefined && value.split !== null && !validCards(value.split)) return false;
  const cards = [...value.deck, ...value.player, ...value.dealer, ...(value.split ?? [])];
  return cards.length <= 52 && typeof value.result === 'string' && value.result.length < 180
    && (value.bet === undefined || BETS.includes(value.bet) || BETS.includes(value.bet / 2))
    && (value.splitBet === undefined || value.splitBet === 0 || BETS.includes(value.splitBet) || BETS.includes(value.splitBet / 2))
    && (value.activeHand === undefined || value.activeHand === 0 || value.activeHand === 1)
    && (value.outcome === undefined || ['', 'win', 'lose', 'push', 'blackjack', 'mixed'].includes(value.outcome))
    && (value.net === undefined || Number.isFinite(value.net));
}
