import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife, normalizeLife } from '../src/life.js';
import {
  BLACKJACK_BET, canDoubleBlackjack, canSplitBlackjack, doubleBlackjack, handValue, hitBlackjack,
  splitBlackjack, standBlackjack, startBlackjack,
} from '../src/blackjack.js';

test('aces change from eleven to one when the hand needs it', () => {
  assert.equal(handValue([1, 9]), 20);
  assert.equal(handValue([1, 9, 8]), 18);
  assert.equal(handValue([1, 1, 9]), 21);
});

test('a blackjack hand charges once and survives a save without changing its deck', () => {
  let life = createLife(4421);
  life.bounty = 40;
  const result = startBlackjack(life);
  assert.equal(result.ok, true);
  if (life.blackjack.phase === 'playing') assert.equal(life.bounty, 40 - BLACKJACK_BET);
  else assert.ok([35, 40, 48].includes(life.bounty));
  const money = life.bounty, state = structuredClone(life.blackjack);
  life = normalizeLife(JSON.parse(JSON.stringify(life)));
  assert.deepEqual(life.blackjack, state);
  assert.equal(life.bounty, money);
  if (life.blackjack.phase === 'playing') {
    assert.equal(startBlackjack(life).ok, false);
    assert.equal(life.bounty, money);
  }
});

test('hit and stand finish a hand once and cannot pay it twice', () => {
  const life = createLife(785);
  life.bounty = 30;
  startBlackjack(life);
  if (life.blackjack.phase === 'playing' && handValue(life.blackjack.player) < 12) hitBlackjack(life);
  if (life.blackjack.phase === 'playing') standBlackjack(life);
  assert.equal(life.blackjack.phase, 'done');
  const money = life.bounty;
  assert.equal(standBlackjack(life).ok, false);
  assert.equal(hitBlackjack(life).ok, false);
  assert.equal(life.bounty, money);
});

test('double charges one more bet, draws one card, and ends that hand', () => {
  const life = createLife(91);
  life.bounty = 25;
  life.blackjack = {
    hand: 1, phase: 'playing', deck: [5], player: [10, 3], dealer: [10, 7], result: '', bet: 5,
    split: null, splitBet: 0, activeHand: 0, outcome: '', net: 0,
  };
  assert.equal(canDoubleBlackjack(life), true);
  assert.equal(doubleBlackjack(life).ok, true);
  assert.deepEqual(life.blackjack.player, [10, 3, 5]);
  assert.equal(life.blackjack.bet, 10);
  assert.equal(life.blackjack.phase, 'done');
  assert.equal(life.bounty, 40);
  assert.equal(doubleBlackjack(life).ok, false);
  assert.equal(life.bounty, 40);
});

test('split makes two hands, charges once, and settles both together', () => {
  const life = createLife(92);
  life.bounty = 25;
  life.blackjack = {
    hand: 1, phase: 'playing', deck: [5, 10, 2, 10], player: [8, 8], dealer: [10, 7], result: '', bet: 5,
    split: null, splitBet: 0, activeHand: 0, outcome: '', net: 0,
  };
  assert.equal(canSplitBlackjack(life), true);
  assert.equal(splitBlackjack(life).ok, true);
  assert.deepEqual(life.blackjack.player, [8, 10]);
  assert.deepEqual(life.blackjack.split, [8, 2]);
  assert.equal(life.bounty, 20);
  assert.deepEqual(normalizeLife(JSON.parse(JSON.stringify(life))).blackjack, life.blackjack);
  assert.equal(standBlackjack(life).ok, true);
  assert.equal(life.blackjack.activeHand, 1);
  assert.equal(hitBlackjack(life).ok, true);
  assert.equal(standBlackjack(life).ok, true);
  assert.equal(life.blackjack.phase, 'done');
  assert.equal(life.blackjack.outcome, 'win');
  assert.equal(life.blackjack.net, 10);
  assert.equal(life.bounty, 40);
});
