import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife, questDefs, normalizeLife } from '../src/life.js';
import { accept, questEvent, turnIn, sellMedicine, objective } from '../src/quests.js';

const setup = (seed = 7) => { const life = createLife(seed); return { life, defs: questDefs(life.world) }; };

test('every life offers valid jobs that point at real places', () => {
  for (const seed of [1, 2, 3, 99, 1234, 4242]) {
    const { life, defs } = setup(seed);
    assert.ok(defs.length >= 6, `seed ${seed} has ${defs.length} jobs`);
    for (const def of defs) {
      assert.equal(life.quests[def.id].status, 'offered');
      if (def.campId) assert.ok(life.world.camps.some((c) => c.id === def.campId));
      if (def.siteId) assert.ok(life.world.sites.some((s) => s.id === def.siteId));
      assert.ok(def.reward.money > 0);
    }
  }
});

test('a bounty goes through accept, kill, proof and one payment at the sheriff', () => {
  const { life, defs } = setup(11), def = defs.find((d) => d.type === 'bounty' && d.want !== 'alive');
  assert.equal(turnIn(life, defs, def.id, 'sheriff').ok, false);
  assert.equal(accept(life, defs, def.id).ok, true);
  assert.equal(accept(life, defs, def.id).ok, false);
  questEvent(life, defs, { type: 'kill', targetId: def.targetId, campId: def.campId });
  assert.equal(life.quests[def.id].status, 'active');
  assert.match(objective(life, def), /proof/);
  questEvent(life, defs, { type: 'proof', targetId: def.targetId });
  assert.equal(life.quests[def.id].status, 'complete');
  assert.equal(turnIn(life, defs, def.id, 'doctor').ok, false, 'only the right person pays');
  const before = life.bounty;
  assert.equal(turnIn(life, defs, def.id, 'sheriff').ok, true);
  assert.equal(life.bounty, before + def.reward.money);
  assert.equal(turnIn(life, defs, def.id, 'sheriff').ok, false);
  assert.equal(life.bounty, before + def.reward.money);
});

test('a live capture pays the higher reward; killing a wanted-alive target fails the job', () => {
  for (const seed of [3, 5, 8, 13, 21, 34, 55, 89]) {
    const { life, defs } = setup(seed);
    for (const def of defs.filter((d) => d.type === 'bounty')) {
      if (def.want === 'dead') continue;
      const copy = structuredClone(life);
      accept(copy, defs, def.id);
      questEvent(copy, defs, { type: 'captive', targetId: def.targetId });
      questEvent(copy, defs, { type: 'delivered', targetId: def.targetId });
      assert.equal(copy.quests[def.id].status, 'complete');
      const before = copy.bounty;
      turnIn(copy, defs, def.id, def.turnIn);
      assert.equal(copy.bounty, before + def.aliveReward);
      assert.ok(def.aliveReward > def.reward.money || def.want === 'alive');
      if (def.want === 'alive') {
        const lost = structuredClone(life);
        accept(lost, defs, def.id);
        questEvent(lost, defs, { type: 'kill', targetId: def.targetId });
        assert.equal(lost.quests[def.id].status, 'failed');
      }
    }
  }
});

test('the delivery fails when it is late and survives save validation', () => {
  const { life, defs } = setup(17), def = defs.find((d) => d.type === 'delivery');
  accept(life, defs, def.id);
  life.time += def.limit + 1;
  questEvent(life, defs, { type: 'tick' });
  assert.equal(life.quests[def.id].status, 'failed');
  assert.equal(normalizeLife(JSON.parse(JSON.stringify(life))).quests[def.id].status, 'failed');
});

test('selling the medicine chest ends the doctor job and pays once', () => {
  const { life, defs } = setup(19);
  accept(life, defs, 'medicine');
  questEvent(life, defs, { type: 'pickup', what: 'medicine' });
  assert.equal(life.quests.medicine.status, 'complete');
  const before = life.bounty;
  assert.equal(sellMedicine(life, defs).ok, true);
  assert.equal(sellMedicine(life, defs).ok, false);
  assert.equal(life.bounty, before + 40);
  assert.equal(life.quests.medicine.status, 'failed');
  assert.equal(turnIn(life, defs, 'medicine', 'doctor').ok, false);
});

test('a target killed before the job was taken still needs proof, once', () => {
  const { life, defs } = setup(23), def = defs.find((d) => d.type === 'bounty' && d.want !== 'alive');
  questEvent(life, defs, { type: 'kill', targetId: def.targetId });
  questEvent(life, defs, { type: 'proof', targetId: def.targetId });
  accept(life, defs, def.id);
  assert.equal(life.quests[def.id].status, 'complete');
});
