import test from 'node:test';
import assert from 'node:assert/strict';
import { greeting, offerText } from '../src/dialogue.js';
import { createLife, questDefs } from '../src/life.js';

test('active job details stay separate from NPC speech', () => {
  const life = createLife(7), defs = questDefs(life.world);
  life.met.silas = true;
  life.quests['clear-camp'].status = 'active';

  const view = greeting(life, defs, 'silas');

  assert.equal(view.speech, 'Any news from the camps?');
  assert.match(view.detail, /^Clear every outlaw from .+\.$/);
  assert.doesNotMatch(view.speech, /Clear every outlaw/);
});

test('finished work is natural NPC speech without a status line', () => {
  const life = createLife(7), defs = questDefs(life.world);
  life.met.silas = true;
  life.quests['clear-camp'].status = 'complete';

  const view = greeting(life, defs, 'silas');

  assert.match(view.speech, /Here is your pay\.$/);
  assert.equal(view.detail, '');
});

test('job offers do not repeat the person who receives the finished job', () => {
  const life = createLife(7), defs = questDefs(life.world);

  const text = offerText(life, defs.find((def) => def.id === 'clear-camp'));

  assert.doesNotMatch(text, /Turn it in to/);
});
