import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDice, handName } from '../src/poker-dice.js';

test('poker dice hands rank like poker', () => {
  assert.equal(handName([6, 6, 6, 6, 6]), 'Five of a kind');
  assert.equal(handName([2, 3, 4, 5, 6]), 'A straight');
  assert.equal(handName([3, 3, 5, 5, 5]), 'Full house');
  assert.equal(handName([1, 2, 2, 4, 6]), 'A pair');
  assert.equal(compareDice([5, 5, 5, 2, 2], [6, 6, 6, 6, 1]), -1);
  assert.equal(compareDice([2, 2, 3, 3, 6], [2, 2, 3, 3, 5]), 1);
  assert.equal(compareDice([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), 0);
  assert.equal(compareDice([2, 3, 4, 5, 6], [1, 2, 3, 4, 5]), 1);
});
