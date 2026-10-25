// Duels: the only way to fight inside a town. One rider challenges another
// nearby, the other accepts, both wagers go into the pot, and after a short
// count the two may shoot each other anywhere. A duel "to first blood" ends
// without a death; a duel "to the death" is permanent like any other.
import { DUEL_MODES, DUEL_WAGERS, FIRST_BLOOD, DUEL_COUNTDOWN, DUEL_LIMIT, DUEL_RANGE } from '../src/protocol.js';

const ASK_TIMEOUT = 20;
const BREAK_DISTANCE = 100;

export class Duels {
  constructor(hub) {
    this.hub = hub;
    this.pending = new Map();
    this.list = [];
  }

  get time() { return this.hub.sim.time; }

  find(id) { return this.list.find((d) => !d.over && (d.a === id || d.b === id)) ?? null; }

  active(aId, bId) {
    const d = this.find(aId);
    return !!d && (d.a === bId || d.b === bId) && this.time >= d.start;
  }

  request(session, m) {
    const hub = this.hub, me = session.state, target = hub.sessions.get(String(m.to));
    const say = (text) => hub.send(session, { t: 'toast', text, s: 3 });
    if (!target || target === session || !me.alive || !target.state.alive) return say('Nobody to challenge.');
    if (!DUEL_MODES[m.mode] || !DUEL_WAGERS.includes(m.wager)) return;
    if (this.find(session.id) || this.find(target.id)) return say('One of you is already in a duel.');
    const t = target.state;
    if (me.room !== t.room || Math.hypot(me.x - t.x, me.z - t.z) > DUEL_RANGE) return say('Stand closer to call someone out.');
    if (session.account.life.bounty < m.wager) return say(`You need $${m.wager} for that wager.`);
    this.pending.set(target.id, { from: session.id, mode: m.mode, wager: m.wager, expires: this.time + ASK_TIMEOUT });
    hub.send(target, { t: 'duelAsk', from: session.id, name: session.account.name, mode: m.mode, wager: m.wager, s: ASK_TIMEOUT });
    say(`You call out ${target.account.name}. Waiting for an answer.`);
  }

  answer(session, m) {
    const hub = this.hub, ask = this.pending.get(session.id);
    if (!ask || ask.from !== String(m.from)) return;
    this.pending.delete(session.id);
    const challenger = hub.sessions.get(ask.from);
    if (!challenger) return;
    if (!m.yes) { hub.send(challenger, { t: 'toast', text: `${session.account.name} turns you down.`, s: 3 }); return; }
    if (this.find(session.id) || this.find(challenger.id) || !session.state.alive || !challenger.state.alive) return;
    if (session.account.life.bounty < ask.wager || challenger.account.life.bounty < ask.wager) {
      for (const s of [session, challenger]) hub.send(s, { t: 'toast', text: 'Someone cannot cover the wager.', s: 3 });
      return;
    }
    const duel = {
      a: challenger.id, b: session.id, mode: ask.mode, wager: ask.wager, lost: { [challenger.id]: 0, [session.id]: 0 },
      start: this.time + DUEL_COUNTDOWN, end: this.time + DUEL_COUNTDOWN + DUEL_LIMIT, drawn: false, over: false,
    };
    this.list.push(duel);
    if (duel.wager) { hub.adjust(duel.a, -duel.wager, 'Duel wager'); hub.adjust(duel.b, -duel.wager, 'Duel wager'); }
    const names = { [duel.a]: challenger.account.name, [duel.b]: session.account.name };
    for (const s of [challenger, session]) {
      hub.send(s, { t: 'duel', phase: 'start', a: duel.a, b: duel.b, names, mode: duel.mode, wager: duel.wager, count: DUEL_COUNTDOWN });
    }
  }

  /** Records duel damage. A duel to first blood stops before anyone dies. */
  firstBlood(target, by, amount) {
    const d = this.find(target.id);
    if (!d || d.mode !== 'blood' || !(by && (d.a === by.id || d.b === by.id))) return false;
    d.lost[target.id] += amount;
    if (d.lost[target.id] >= FIRST_BLOOD || target.hp <= 0) {
      target.hp = Math.max(target.hp, 1);
      this.end(d, by.id, 'first blood');
    }
    return false;
  }

  tick() {
    const hub = this.hub;
    for (const [id, ask] of this.pending) if (this.time > ask.expires) this.pending.delete(id);
    for (const d of this.list) {
      if (d.over) continue;
      if (!d.drawn && this.time >= d.start) {
        d.drawn = true;
        for (const id of [d.a, d.b]) hub.sendTo(id, { t: 'duel', phase: 'draw' });
      }
      const a = hub.sessions.get(d.a)?.state, b = hub.sessions.get(d.b)?.state;
      if (!a || !b) continue;
      const apart = a.room !== b.room || Math.hypot(a.x - b.x, a.z - b.z) > BREAK_DISTANCE;
      if (this.time > d.end || apart) this.end(d, null, apart ? 'the riders parted' : 'time ran out');
    }
    this.list = this.list.filter((d) => !d.over);
  }

  /** A duelist died: the other one wins. */
  ended(id) {
    const d = this.find(id);
    if (d) this.end(d, d.a === id ? d.b : d.a, 'a duelist fell');
  }

  forfeit(id, reason) {
    this.pending.delete(id);
    const d = this.find(id);
    if (d) this.end(d, d.a === id ? d.b : d.a, reason);
  }

  end(d, winner, reason) {
    if (d.over) return;
    d.over = true;
    const hub = this.hub;
    if (d.wager) {
      if (winner) hub.adjust(winner, d.wager * 2, 'Duel winnings');
      else { hub.adjust(d.a, d.wager, 'Wager returned'); hub.adjust(d.b, d.wager, 'Wager returned'); }
    }
    for (const id of [d.a, d.b]) hub.sendTo(id, { t: 'duel', phase: 'end', winner, reason });
    const name = (id) => hub.sessions.get(id)?.account.name ?? hub.store.account(id)?.name ?? 'someone';
    if (winner) hub.broadcast({ t: 'chat', from: null, text: `${name(winner)} wins a duel against ${name(winner === d.a ? d.b : d.a)}${d.wager ? ` for $${d.wager * 2}` : ''}.` });
  }
}
