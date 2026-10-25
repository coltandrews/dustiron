// Poker dice between riders in town. One calls a game with a stake, the other
// accepts, both stakes go into the pot and the server throws for both.
import { randomInt } from 'node:crypto';
import { DICE_RANGE, DICE_WAGERS, compareDice, handName } from '../src/poker-dice.js';
import { inSafeZone } from '../src/towns.js';

const ASK_TIMEOUT = 20;

export class Dice {
  constructor(hub) {
    this.hub = hub;
    this.pending = new Map();
  }

  near(a, b) {
    const s = a.state, t = b.state, world = this.hub.world;
    return s.alive && t.alive && s.room === t.room && Math.hypot(s.x - t.x, s.z - t.z) <= DICE_RANGE
      && inSafeZone(world, s.x, s.z, s.room) && inSafeZone(world, t.x, t.z, t.room);
  }

  request(session, m) {
    const hub = this.hub, target = hub.sessions.get(String(m.to));
    const say = (text) => hub.send(session, { t: 'toast', text, s: 3 });
    if (!target || target === session) return say('Nobody to play with.');
    if (!DICE_WAGERS.includes(m.wager)) return;
    if (!this.near(session, target)) return say('Dice are for town. Stand at the same table.');
    if (session.account.life.bounty < m.wager) return say(`You need $${m.wager} to play for that.`);
    this.pending.set(target.id, { from: session.id, wager: m.wager, expires: hub.sim.time + ASK_TIMEOUT });
    hub.send(target, { t: 'diceAsk', from: session.id, name: session.account.name, wager: m.wager, s: ASK_TIMEOUT });
    say(`You offer ${target.account.name} a game of dice for $${m.wager}.`);
  }

  answer(session, m) {
    const hub = this.hub, ask = this.pending.get(session.id);
    if (!ask || ask.from !== String(m.from) || hub.sim.time > ask.expires) return;
    this.pending.delete(session.id);
    const other = hub.sessions.get(ask.from);
    if (!other) return;
    if (!m.yes) { hub.send(other, { t: 'toast', text: `${session.account.name} passes on the dice.`, s: 3 }); return; }
    if (!this.near(session, other)) return;
    if (session.account.life.bounty < ask.wager || other.account.life.bounty < ask.wager) {
      for (const s of [session, other]) hub.send(s, { t: 'toast', text: 'Someone cannot cover the stake.', s: 3 });
      return;
    }
    const a = other.id, b = session.id, w = ask.wager;
    hub.adjust(a, -w, 'Dice stake');
    hub.adjust(b, -w, 'Dice stake');
    const roll = () => Array.from({ length: 5 }, () => randomInt(1, 7));
    const rolls = { [a]: roll(), [b]: roll() };
    const result = compareDice(rolls[a], rolls[b]);
    const winner = result > 0 ? a : result < 0 ? b : null;
    if (winner) hub.adjust(winner, w * 2, 'Dice winnings');
    else { hub.adjust(a, w, 'Stake returned'); hub.adjust(b, w, 'Stake returned'); }
    const names = { [a]: other.account.name, [b]: session.account.name };
    const hands = { [a]: handName(rolls[a]), [b]: handName(rolls[b]) };
    for (const s of [other, session]) hub.send(s, { t: 'dice', a, b, names, rolls, hands, winner, wager: w });
    if (winner) hub.broadcast({ t: 'chat', from: null, text: `${names[winner]} wins $${w * 2} at dice with ${hands[winner].toLowerCase()}.` });
  }

  tick() {
    for (const [id, ask] of this.pending) if (this.hub.sim.time > ask.expires) this.pending.delete(id);
  }
}
