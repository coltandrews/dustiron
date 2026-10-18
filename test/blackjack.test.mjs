import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife, normalizeLife } from '../src/life.js';
import { BLACKJACK_BET, handValue, hitBlackjack, standBlackjack, startBlackjack } from '../src/blackjack.js';

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
