// Players on the shared server: joining, accounts, the authoritative health
// of every rider, shots and hits, duels, chat and snapshots. Each life's
// inventory and quests are kept by the browser and checked here on save;
// health, death and money moved between players belong to the server.
import { T } from '../src/tuning.js';
import { WEAPONS } from '../src/weapons.js';
import { createLife, makeWorld, normalizeLife, WORLD_HALF } from '../src/life.js';
import { randomSeed } from '../src/rng.js';
import { inSafeZone } from '../src/towns.js';
import { ROOM_X } from '../src/interiors.js';
import { ZONE_DAMAGE } from '../src/player-fire.js';
import {
  PROTOCOL_VERSION, MAX_PLAYERS, PLAYER_VIEW, EVENT_VIEW, GUN_CODES, ROOMS, ENEMY_STATES, PF, q2, q3, cleanName, cleanChat,
} from '../src/protocol.js';
import { Sim } from './sim.js';
import { Duels } from './duels.js';
import { Dice } from './dice.js';
import { restrain } from '../src/enemy-captive.js';

const START = { x: 0, z: 12 };
/** Fastest legal travel (a rolling rider is quicker than a sprinting horse), with slack for jitter. */
const MAX_SPEED = 22;
/** Largest money gain accepted between two saves of a life. */
const MAX_GAIN_PER_SAVE = 400;
const KILL_CREDIT_RANGE = 80;

const finite = (...values) => values.every(Number.isFinite);

export class Hub {
  constructor(store, { now = () => Date.now() } = {}) {
    this.store = store;
    this.now = now;
    this.world = makeWorld(store.worldSeed);
    this.sessions = new Map();
    this.events = [];
    this.sim = new Sim(this.world, {
      emit: (event, x, z) => this.events.push([event, x, z]),
      toast: (text, seconds, player) => player && this.sendTo(player.id, { t: 'toast', text, s: seconds ?? 3 }),
      questEvent: (event, player) => player && this.sendTo(player.id, { t: 'quest', event }),
      enemyKilled: (e, killer, cleared) => this.enemyKilled(e, killer, cleared),
      playerDamage: (player, amount, dx, dz, source) => this.damagePlayer(player, amount, dx, dz, source),
      wantsAlive: (enemy) => this.wantsAlive(enemy),
      campReset: (encounter) => this.broadcast({ t: 'camp', id: encounter.id, state: this.sim.campState(encounter) }),
    });
    this.sim.time = store.data.time ?? 0;
    this.duels = new Duels(this);
    this.dice = new Dice(this);
  }

  get playerCount() { let n = 0; for (const s of this.sessions.values()) if (s.ready) n++; return n; }

  // ---------- connections ----------

  connect(conn) {
    const session = { conn, ready: false, msgT: 0, msgs: 0, lastChat: -9, shotBudget: 0, shotUntil: 0, lastShot: {}, adj: [], adjRev: 0, strikes: 0 };
    conn.onmessage = (text) => this.receive(session, text);
    conn.onclose = () => this.leave(session);
    return session;
  }

  receive(session, text) {
    const now = this.now();
    if (now - session.msgT > 1000) { session.msgT = now; session.msgs = 0; }
    if (++session.msgs > 120) { session.conn.close(1008, 'Too many messages'); return; }
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (!session.ready) { if (msg.t === 'hello') this.hello(session, msg); return; }
    const handler = {
      st: this.onState, life: this.onLife, shot: this.onShot, hit: this.onHit, act: this.onAct, chat: this.onChat, ping: this.onPing,
    }[msg.t];
    handler?.call(this, session, msg);
  }

  hello(session, msg) {
    const fail = (text) => { session.conn.send(JSON.stringify({ t: 'err', text })); session.conn.close(1008, 'Refused'); };
    if (msg.v !== PROTOCOL_VERSION) return fail('The game has been updated. Reload the page.');
    let account = this.store.accountByToken(msg.token), token = null;
    if (!account) {
      const name = cleanName(msg.name);
      if (!name) return fail('Pick a name of 2 to 16 letters.');
      if (this.store.nameTaken(name)) return fail(`Someone already rides as ${name}. Pick another name.`);
      ({ account, token } = this.store.createAccount(name));
    }
    const old = this.sessions.get(account.id);
    if (old) { old.conn.send(JSON.stringify({ t: 'err', text: 'You joined from another window.' })); old.conn.close(1000, 'Replaced'); this.leave(old); }
    if (this.playerCount >= MAX_PLAYERS) return fail(`The frontier is full (${MAX_PLAYERS} riders). Try again soon.`);
    let ended = null;
    if (account.life && account.life.status === 'dead') ended = account.life;
    if (!account.life || account.life.status !== 'alive' || account.life.worldSeed !== this.store.worldSeed) this.newLife(account);
    session.account = account;
    session.id = account.id;
    session.ready = true;
    const life = account.life;
    session.state = {
      id: account.id, name: account.name, x: life.player.x, z: life.player.z, px: life.player.x, pz: life.player.z,
      vx: 0, vz: 0, yaw: life.player.yaw ?? 0, alive: true, hp: life.hp, room: null, flags: 0, gun: 0, rollF: -1, speed: 0,
      moveFraction: 0, sneaking: false, iframe: false, campX: 0, campZ: 0, campT: 0, flanker: null,
      sinceHit: 99, lastBigHit: -99, lastHeal: -99, lastStateAt: this.now(), coat: !!life.gear.coat,
    };
    this.sim.addPlayer(session.state);
    this.sessions.set(account.id, session);
    this.send(session, {
      t: 'welcome', id: account.id, name: account.name, token, worldSeed: this.store.worldSeed, life,
      ended: ended ? { kills: ended.kills, bounty: ended.bounty, time: ended.time } : null,
      camps: this.sim.allCampStates(), roster: this.roster(), time: q2(this.sim.time), max: MAX_PLAYERS,
    });
    this.broadcast({ t: 'roster', list: this.roster() });
    this.broadcast({ t: 'chat', from: null, text: `${account.name} rides in.` });
    this.store.touch();
  }

  leave(session) {
    if (!session.ready || this.sessions.get(session.id) !== session) return;
    this.sessions.delete(session.id);
    this.duels.forfeit(session.id, 'left');
    this.sim.removePlayer(session.state);
    if (session.account.life?.status === 'alive') {
      session.account.life.hp = Math.max(1, session.state.hp);
      if (finite(session.state.x, session.state.z) && !session.state.room) {
        session.account.life.player.x = q2(session.state.x);
        session.account.life.player.z = q2(session.state.z);
      }
    }
    this.store.touch();
    this.broadcast({ t: 'roster', list: this.roster() });
    this.broadcast({ t: 'chat', from: null, text: `${session.account.name} rides off.` });
  }

  roster() {
    return [...this.sessions.values()].filter((s) => s.ready).map((s) => [s.id, s.account.name, s.state.coat ? 1 : 0]);
  }

  newLife(account) {
    account.life = createLife(randomSeed(), this.store.worldSeed);
    account.lifeNo = (account.lifeNo ?? 0) + 1;
    for (const id of Object.keys(account.life.camps)) account.life.camps[id] = {};
    this.store.touch();
    return account.life;
  }

  // ---------- messages from players ----------

  onState(session, m) {
    const s = session.state;
    if (!s.alive) return;
    if (!finite(m.x, m.z, m.yaw, m.vx, m.vz, m.sp)) return;
    const room = typeof m.r === 'number' && ROOMS[m.r] ? ROOMS[m.r] : null;
    const now = this.now(), dt = Math.max(0.05, (now - s.lastStateAt) / 1000);
    const inBounds = room
      ? Math.abs(m.x - ROOM_X) < 20 && Math.abs(m.z) < 200
      : Math.abs(m.x) <= WORLD_HALF + 2 && Math.abs(m.z) <= WORLD_HALF + 2;
    const moved = Math.hypot(m.x - s.x, m.z - s.z);
    const roomChange = room !== s.room;
    if (!inBounds || (!roomChange && moved > MAX_SPEED * dt + 3)) {
      // Snap the rider back to the last good position.
      if (++session.strikes > 40) { session.conn.close(1008, 'Movement rejected'); return; }
      this.send(session, { t: 'pos', x: q2(s.x), z: q2(s.z) });
      s.lastStateAt = now;
      return;
    }
    session.strikes = Math.max(0, session.strikes - 0.05);
    s.lastStateAt = now;
    s.x = m.x; s.z = m.z; s.yaw = m.yaw; s.vx = m.vx; s.vz = m.vz; s.room = room;
    s.speed = Math.max(0, Math.min(30, m.sp));
    s.moveFraction = Math.min(1, s.speed / T.player.speed);
    s.flags = (m.f | 0) & 0xffff;
    s.sneaking = !!(s.flags & PF.SNEAK);
    s.iframe = !!(s.flags & PF.IFRAME);
    const h = m.h;
    s.horse = Array.isArray(h) && h.length === 4 && h.every(Number.isFinite) && Math.abs(h[0]) <= WORLD_HALF && Math.abs(h[1]) <= WORLD_HALF
      ? [q2(h[0]), q2(h[1]), q3(h[2]), h[3] ? 1 : 0] : null;
    s.gun = GUN_CODES[m.g] ? m.g : 0;
    s.rollF = Number.isFinite(m.rf) ? Math.max(-1, Math.min(1, m.rf)) : -1;
    this.sim.movePlayer(s);
  }

  onLife(session, m) {
    const account = session.account, current = account.life, s = session.state;
    if (!s.alive || current.status !== 'alive') return;
    const life = normalizeLife(m.life);
    const reject = (why) => {
      console.warn(`life from ${account.name} rejected: ${why}`);
      this.send(session, { t: 'life', life: current, why, camps: this.sim.allCampStates() });
    };
    if (!life) return reject('invalid');
    if (life.seed !== current.seed || life.worldSeed !== this.store.worldSeed) return reject('another life');
    const ack = Number.isInteger(m.ack) ? m.ack : 0;
    let pending = 0;
    for (const a of session.adj) if (a.rev > ack) pending += a.money;
    session.adj = session.adj.filter((a) => a.rev > ack);
    // Money the browser has not seen yet (a wager, a pot) is added on top of what it sends.
    life.bounty += pending;
    if (life.bounty - current.bounty > MAX_GAIN_PER_SAVE) return reject('money');
    life.bounty = Math.max(0, life.bounty);
    life.status = 'alive';
    life.hp = Math.max(1, Math.round(s.hp));
    for (const id of Object.keys(life.camps)) life.camps[id] = {};
    life.projectiles = [];
    account.life = life;
    s.coat = !!life.gear.coat;
    this.store.touch();
  }

  onShot(session, m) {
    const s = session.state, def = WEAPONS[GUN_CODES[m.g]];
    if (!s.alive || !def || !finite(m.x, m.z) || !session.account.life.unlocked.includes(def.key)) return;
    const now = this.now();
    if (now - (session.lastShot[def.key] ?? 0) < def.interval * 750) return;
    if (Math.hypot(m.x - s.x, m.z - s.z) > 3) return;
    session.lastShot[def.key] = now;
    session.shotBudget = def.pellets * (1 + def.pierce);
    session.shotUntil = now + 600;
    session.shotGun = def;
    session.shotFrom = { x: m.x, z: m.z };
    const ends = Array.isArray(m.e) ? m.e.slice(0, 14).filter(Number.isFinite).map(q2) : [];
    this.events.push([['ps', session.id, q2(m.x), q2(m.z), m.g, ends], m.x, m.z, session.id]);
    if (!inSafeZone(this.world, s.x, s.z, s.room)) this.sim.noise(m.x, m.z, T.enemy.hearRange);
  }

  onHit(session, m) {
    const s = session.state, def = session.shotGun, now = this.now();
    if (!s.alive || !def || now > session.shotUntil || session.shotBudget <= 0) return;
    if (!finite(m.dx, m.dz) || Math.abs(Math.hypot(m.dx, m.dz) - 1) > 0.05) return;
    session.shotBudget--;
    const from = session.shotFrom, zone = def.pellets > 1 ? 'body' : (ZONE_DAMAGE[m.z] ? m.z : 'body');
    const damageAt = (d) => {
      const fall = d <= def.range ? 1 : Math.max(0.5, 1 - (d - def.range) / def.range);
      return def.damage * fall * ZONE_DAMAGE[zone] * (m.de ? T.deadEye.damageMult : 1);
    };
    const reach = def.range * (def.pellets > 1 ? 1.35 : 1.8) + 2;
    if (m.k === 'e') {
      const e = this.sim.enemyById(String(m.id));
      if (!e || !e.alive || e.jailed) return;
      const d = Math.hypot(e.x - from.x, e.z - from.z);
      if (d > reach) return;
      e.lastHitDir = [m.dx, m.dz, 3 + def.knockback * 1.5];
      this.sim.ctxPlayer = s;
      this.sim.player = s;
      const res = e.onHit(damageAt(d), m.dx, m.dz, def.knockback, zone);
      if (res.killed) this.sim.onEnemyKilled(e, res.crit || zone === 'head', s);
      if (!e.targetId && e.alive) e.targetId = s.id;
      this.sim.ctxPlayer = null;
      this.sim.player = null;
    } else if (m.k === 'o') {
      const p = this.sim.propById(String(m.id));
      if (!p || !p.alive || Math.hypot(p.x - from.x, p.z - from.z) > reach) return;
      this.sim.lastPropHitter = s;
      this.sim.ctxPlayer = s;
      this.sim.player = s;
      p.damage(damageAt(Math.hypot(p.x - from.x, p.z - from.z)), p.x - m.dx * 0.4, 0.6, p.z - m.dz * 0.4, m.dx, m.dz, def.impulse, 'player');
      this.sim.ctxPlayer = null;
      this.sim.player = null;
    } else if (m.k === 'a') {
      const a = this.sim.wildlife.byId(String(m.id));
      if (!a || !a.alive) return;
      const d = Math.hypot(a.x - from.x, a.z - from.z);
      if (d > reach) return;
      const res = this.sim.wildlife.hit(a, damageAt(d) * (zone === 'head' ? 1.6 : 1), m.dx, m.dz, s);
      if (res.killed) this.events.push([['snd', 'bodyFall', q2(a.x), q2(a.z), 0.8, 1, 0.2], a.x, a.z, null]);
    } else if (m.k === 'p') {
      const target = this.sessions.get(String(m.id))?.state;
      if (!target || target === s || !target.alive) return;
      const d = Math.hypot(target.x - from.x, target.z - from.z);
      if (d > reach || !this.pvpAllowed(s, target)) return;
      if (target.room !== s.room) return;
      if (!target.room && !this.sim.physics.los(from.x, from.z, target.x, target.z)) return;
      this.damagePlayer(target, damageAt(d), m.dx, m.dz, { kind: 'player', by: s, zone });
    }
  }

  onAct(session, m) {
    const s = session.state, life = session.account.life, now = this.now();
    switch (m.a) {
      case 'heal': {
        if (!s.alive || now - s.lastHeal < 900) return;
        if (m.src === 'bandage') {
          if (!(life.items.bandage > 0) || this.sim.time - s.lastBigHit < T.player.bandageTime) return;
          life.items.bandage--;
          s.lastHeal = now;
          this.heal(s, T.player.bandageHeal);
        } else if (m.src === 'treat') {
          if (s.room !== 'doctor' && s.room !== 'pine-doctor') return;
          s.lastHeal = now;
          this.heal(s, 100);
        } else if (m.src === 'meal') {
          if (!(life.mealHeal > 0)) return;
          const amount = Math.min(3, life.mealHeal);
          life.mealHeal -= amount;
          s.lastHeal = now;
          this.heal(s, amount);
        }
        return;
      }
      case 'restrain': {
        const e = this.sim.enemyById(String(m.id));
        if (!s.alive || !e || !e.alive || !e.surrendered || e.captive || Math.hypot(e.x - s.x, e.z - s.z) > 3.5) return;
        if (!this.questFor(life, e.id, true)) { this.send(session, { t: 'toast', text: 'Only the bounty hunter on this job can take the prisoner.', s: 3 }); return; }
        this.sim.player = s;
        this.sim.ctxPlayer = s;
        if (restrain(e)) e.captorId = s.id;
        this.sim.player = null;
        this.sim.ctxPlayer = null;
        return;
      }
      case 'newLife': {
        if (s.alive && life.status === 'alive') return;
        const fresh = this.newLife(session.account);
        Object.assign(s, { alive: true, hp: 100, x: START.x, z: START.z, room: null, sinceHit: 99, lastStateAt: now });
        if (!s.body) this.sim.addPlayer(s); else this.sim.movePlayer(s);
        session.adj = [];
        this.send(session, { t: 'life', life: fresh, fresh: true, camps: this.sim.allCampStates() });
        this.broadcast({ t: 'roster', list: this.roster() });
        return;
      }
      case 'duel': this.duels.request(session, m); return;
      case 'skin': {
        const pelt = this.sim.wildlife.skin(String(m.id), s);
        if (pelt && s.alive) this.send(session, { t: 'pelt', pelt });
        return;
      }
      case 'duelAnswer': this.duels.answer(session, m); return;
      case 'dice': this.dice.request(session, m); return;
      case 'diceAnswer': this.dice.answer(session, m); return;
      default:
    }
  }

  onChat(session, m) {
    const text = cleanChat(m.text), now = this.now();
    if (!text || now - session.lastChat < 900) return;
    session.lastChat = now;
    this.broadcast({ t: 'chat', from: session.id, name: session.account.name, text });
  }

  onPing(session, m) {
    if (Number.isFinite(m.c)) this.send(session, { t: 'pong', c: m.c });
  }

  // ---------- rules ----------

  pvpAllowed(a, b) {
    if (this.duels.active(a.id, b.id)) return true;
    return !inSafeZone(this.world, a.x, a.z, a.room) && !inSafeZone(this.world, b.x, b.z, b.room);
  }

  /** The active bounty on this target in a life, if any. */
  questFor(life, targetId, alive = false) {
    const def = this.sim.questDefs.find((q) => q.type === 'bounty' && q.targetId === targetId);
    if (!def || life.quests[def.id]?.status !== 'active') return null;
    if (alive && def.want === 'dead') return null;
    return def;
  }

  wantsAlive(enemy) {
    for (const session of this.sessions.values()) {
      const s = session.state;
      if (!s?.alive || Math.hypot(s.x - enemy.x, s.z - enemy.z) > 70) continue;
      if (this.questFor(session.account.life, enemy.id, true)) return true;
    }
    return false;
  }

  heal(s, amount) {
    s.hp = Math.min(T.player.hp, s.hp + amount);
    this.sendTo(s.id, { t: 'hp', hp: q2(s.hp) });
  }

  damagePlayer(s, amount, dx, dz, source = {}) {
    if (!s.alive || amount <= 0) return;
    const session = this.sessions.get(s.id);
    if (!session) return;
    const dueling = source.by && this.duels.active(s.id, source.by.id);
    if (!dueling && inSafeZone(this.world, s.x, s.z, s.room)) return;
    if (source.kind !== 'blast' && s.iframe) return;
    if (session.account.life.gear.coat) amount *= 0.9;
    s.hp -= amount;
    s.sinceHit = 0;
    if (amount >= T.player.bandageBreak) s.lastBigHit = this.sim.time;
    if (dueling && this.duels.firstBlood(s, source.by, amount)) return;
    this.send(session, { t: 'hurt', a: q2(amount), dx: q3(dx), dz: q3(dz), hp: q2(Math.max(0, s.hp)), by: source.by?.name ?? null });
    if (s.hp <= 0) this.kill(s, dx, dz, source);
  }

  kill(s, dx, dz, source) {
    const session = this.sessions.get(s.id);
    s.alive = false;
    s.hp = 0;
    const life = session.account.life;
    life.status = 'dead';
    life.hp = 0;
    session.account.deaths = (session.account.deaths ?? 0) + 1;
    const record = { kills: life.kills, bounty: life.bounty, time: Math.round(life.time), at: Date.now() };
    if (!session.account.best || record.time > session.account.best.time) session.account.best = record;
    this.store.touch();
    const by = source.by?.name ?? ({ outlaw: 'an outlaw', blast: 'a blast', animal: 'a wild animal' })[source.kind] ?? null;
    this.send(session, { t: 'died', by, dx: q3(dx), dz: q3(dz) });
    this.events.push([['pdie', s.id, q3(dx), q3(dz)], s.x, s.z, s.id]);
    this.duels.ended(s.id);
    if (source.by) this.broadcast({ t: 'chat', from: null, text: `${source.by.name} shot ${s.name}.` });
    for (const e of this.sim.enemies) if (e.targetId === s.id && e.token) e.releaseToken();
  }

  enemyKilled(e, killer, cleared) {
    const [dx, dz, force] = e.lastHitDir ?? [0, 1, 4];
    const credit = [];
    for (const session of this.sessions.values()) {
      const s = session.state;
      if (s?.alive && (s === killer || Math.hypot(s.x - e.x, s.z - e.z) < KILL_CREDIT_RANGE)) credit.push(s.id);
    }
    const row = ['ekill', e.id, q3(dx), q3(dz), q2(force), killer?.id ?? null, cleared ? 1 : 0, credit];
    this.events.push([row, e.x, e.z]);
    // Riders with credit who are too far to receive local events still need the quest update.
    for (const id of credit) {
      const s = this.sessions.get(id)?.state;
      if (s && Math.hypot(s.x - e.x, s.z - e.z) > EVENT_VIEW) this.sendTo(id, { t: 'ev', list: [row] });
    }
  }

  // ---------- ticking and sending ----------

  tick(dt) {
    this.sim.tick(dt);
    const P = T.player;
    for (const session of this.sessions.values()) {
      const s = session.state;
      if (!s?.alive) continue;
      s.sinceHit += dt;
      if (s.sinceHit >= P.regenDelay && s.hp < P.hp) {
        const cap = Math.min(P.hp, Math.ceil(s.hp / P.regenStep - 1e-6) * P.regenStep);
        if (s.hp < cap) s.hp = Math.min(cap, s.hp + P.regenRate * dt);
      }
    }
    this.duels.tick();
    this.dice.tick();
    this.sim.respawnCamps();
  }

  /** Sends each player what is near them, then clears the event queue. */
  snapshot() {
    const events = this.events;
    this.events = [];
    for (const session of this.sessions.values()) {
      if (!session.ready) continue;
      const me = session.state, players = [];
      for (const other of this.sessions.values()) {
        const o = other.state;
        if (!other.ready || o === me || !o.alive) continue;
        const near = o.room ? o.room === me.room : !me.room && Math.hypot(o.x - me.x, o.z - me.z) < PLAYER_VIEW;
        if (!near) continue;
        players.push([o.id, q2(o.x), q2(o.z), q3(o.yaw), q2(o.speed), o.flags, o.gun, ROOMS.indexOf(o.room ?? ''), q2(o.rollF), Math.round(o.hp)]);
      }
      const horses = [];
      if (!me.room) for (const other of this.sessions.values()) {
        const h = other.state.horse;
        if (other.ready && other !== session && h && Math.hypot(h[0] - me.x, h[1] - me.z) < PLAYER_VIEW) horses.push([other.id, ...h]);
      }
      const ev = [];
      for (const [row, x, z, skip] of events) {
        if (skip === me.id) continue;
        if (x === null || Math.hypot(x - me.x, z - me.z) < EVENT_VIEW) ev.push(row);
      }
      const view = me.room ? null : me;
      this.send(session, {
        t: 's', hp: q2(Math.max(0, me.hp)), time: q2(this.sim.time),
        p: players, hz: horses,
        e: view ? this.sim.enemyRows(view.x, view.z, EVENT_VIEW, ENEMY_STATES) : [],
        o: view ? this.sim.propRows(view.x, view.z, EVENT_VIEW) : [],
        w: view ? this.sim.animalRows(view.x, view.z, EVENT_VIEW) : [],
        c: view ? this.sim.carcassRows(view.x, view.z, EVENT_VIEW) : [],
        ev,
      });
    }
  }

  send(session, message) { if (session.conn.open !== false) session.conn.send(JSON.stringify(message)); }
  sendTo(id, message) { const session = this.sessions.get(id); if (session) this.send(session, message); }
  broadcast(message) {
    const text = JSON.stringify(message);
    for (const session of this.sessions.values()) if (session.ready) session.conn.send(text);
  }

  /** Moves money into a player's life and tells their browser. */
  adjust(id, money, reason) {
    const session = this.sessions.get(id);
    const account = session?.account ?? this.store.account(id);
    if (!account?.life || !money) return;
    account.life.bounty = Math.max(0, account.life.bounty + money);
    this.store.touch();
    if (!session) return;
    const rev = ++session.adjRev;
    session.adj.push({ rev, money });
    this.send(session, { t: 'adj', rev, money, reason });
  }

  persist() {
    this.store.data.time = this.sim.time;
    for (const session of this.sessions.values()) {
      const s = session.state, life = session.account.life;
      if (!s?.alive || life.status !== 'alive') continue;
      life.hp = Math.max(1, Math.round(s.hp));
      if (!s.room) { life.player.x = q2(s.x); life.player.z = q2(s.z); }
    }
    this.store.touch();
    return this.store.save();
  }
}

