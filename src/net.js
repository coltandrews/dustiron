// The browser side of the shared server: connecting, sending the rider's
// position and shots, saving the life, and handing server messages to the
// world sync (net-world.js) and the online interface (net-ui.js).
import { PROTOCOL_VERSION, STATE_HZ, PF, GUN_CODES, ROOMS, q2, q3 } from './protocol.js';
import { T } from './tuning.js';

const TOKEN_KEY = 'dustiron.online.token';
const NAME_KEY = 'dustiron.online.name';

function storage() { try { return globalThis.localStorage ?? null; } catch { return null; } }

/** Where the game server lives: ?server=, a page global, or the page's own host. */
export function serverUrl(loc = globalThis.location) {
  const param = loc ? new URLSearchParams(loc.search).get('server') : null;
  const base = param || globalThis.DUSTIRON_SERVER || (loc ? `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}` : 'ws://127.0.0.1:8080');
  return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
}

export function savedIdentity() {
  const s = storage();
  return { token: s?.getItem(TOKEN_KEY) ?? null, name: s?.getItem(NAME_KEY) ?? null };
}

export function forgetIdentity() {
  const s = storage();
  try { s?.removeItem(TOKEN_KEY); s?.removeItem(NAME_KEY); } catch { /* storage blocked */ }
}

export class Net {
  constructor(game, { url = serverUrl(), WebSocketImpl = globalThis.WebSocket } = {}) {
    this.game = game;
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.ws = null;
    this.id = null;
    this.name = null;
    this.open = false;
    this.stateT = 0;
    this.saveT = 0;
    this.lifeDirty = true;
    this.lastLife = '';
    this.ack = 0;
    this.pendingHits = [];
    this.roster = new Map();
    this.duel = null;
    this.ping = 0;
    this.pingT = 0;
    this.handlers = new Map();
  }

  on(type, fn) { this.handlers.set(type, fn); }

  /** Opens the connection and resolves with the welcome message (or rejects with the server's reason). */
  connect(name) {
    const { token } = savedIdentity();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new this.WebSocketImpl(this.url);
      this.ws = ws;
      const fail = (text) => { if (!settled) { settled = true; reject(new Error(text)); } };
      ws.onopen = () => { this.open = true; this.send({ t: 'hello', v: PROTOCOL_VERSION, name, token }); };
      ws.onerror = () => fail('Cannot reach the frontier server.');
      ws.onclose = () => {
        const was = this.open;
        this.open = false;
        fail('The server closed the connection.');
        if (was && settled) this.handlers.get('disconnect')?.();
      };
      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.t === 'err') { this.lastError = msg.text; if (msg.text.includes('Pick') || msg.text.includes('already rides')) forgetIdentity(); fail(msg.text); return; }
        if (msg.t === 'welcome') {
          this.id = msg.id;
          this.name = msg.name;
          const s = storage();
          try { if (msg.token) s?.setItem(TOKEN_KEY, msg.token); s?.setItem(NAME_KEY, msg.name); } catch { /* storage blocked */ }
          for (const [id, rname, coat] of msg.roster) this.roster.set(id, { name: rname, coat });
          settled = true;
          resolve(msg);
          return;
        }
        this.receive(msg);
      };
    });
  }

  close() {
    this.open = false;
    this.handlers.clear();
    try { this.ws?.close(); } catch { /* already closed */ }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  receive(msg) {
    if (msg.t === 'roster') {
      this.roster.clear();
      for (const [id, name, coat] of msg.list) this.roster.set(id, { name, coat });
    }
    if (msg.t === 'pong') { this.ping = Math.round(performance.now() - msg.c); return; }
    if (msg.t === 'adj') { this.ack = Math.max(this.ack, msg.rev); this.lifeDirty = true; }
    if (msg.t === 'duel') {
      if (msg.phase === 'start') this.duel = { a: msg.a, b: msg.b, names: msg.names, mode: msg.mode, wager: msg.wager, drawn: false };
      else if (msg.phase === 'draw' && this.duel) this.duel.drawn = true;
      else if (msg.phase === 'end') this.duel = null;
    }
    this.handlers.get(msg.t)?.(msg);
  }

  /** The other rider in my duel, once the count has finished. */
  get dueling() { return this.duel?.drawn ? (this.duel.a === this.id ? this.duel.b : this.duel.a) : null; }

  // ---------- outgoing ----------

  /** Sends position and pose at 20 Hz and a copy of the life every few seconds. */
  tick(dt) {
    if (!this.open) return;
    const g = this.game, p = g.player;
    this.stateT -= dt;
    if (p?.alive && this.stateT <= 0) {
      this.stateT = 1 / STATE_HZ;
      const room = g.frontier?.inside ? g.run.interior?.id ?? '' : '';
      const armed = !g.inTown() || !!this.dueling;
      const flags = (armed ? PF.ARMED | PF.AIM : 0) | (p.rolling ? PF.ROLL : 0) | (g.horse?.mounted ? PF.MOUNT : 0)
        | (g.frontier?.seated ? PF.SEAT : 0) | (p.bandaging ? PF.BANDAGE : 0) | (p.sneaking ? PF.SNEAK : 0)
        | (g.run.gear?.coat ? PF.COAT : 0) | (p.invulnerable ? PF.IFRAME : 0)
        | (p.smokeT > 0 ? PF.SMOKE : 0) | ((g.run.drunk ?? 0) > 0.5 ? PF.DRUNK : 0);
      this.send({
        t: 'st', x: q2(p.x), z: q2(p.z), yaw: q3(p.yaw), vx: q2(p.vx), vz: q2(p.vz), sp: q2(p.speedNow),
        f: flags, g: Math.max(0, GUN_CODES.indexOf(p.gun.def.key)), r: Math.max(0, ROOMS.indexOf(room)),
        rf: p.rolling ? q2(p.rollT / T.dodge.duration) : -1,
        // A horse left standing is shown to everyone nearby.
        h: g.horse && !g.horse.mounted && !g.horse.away ? [q2(g.horse.x), q2(g.horse.z), q3(g.horse.yaw), g.horse.data.owned ? 1 : 0] : 0,
      });
    }
    this.saveT -= dt;
    if (this.saveT <= 0 && this.lifeDirty && g.run?.status === 'alive') {
      this.saveT = 2;
      this.lifeDirty = false;
      this.send({ t: 'life', life: lifeForServer(g.run), ack: this.ack });
    }
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 5; this.send({ t: 'ping', c: performance.now() }); }
    // On Cloudflare an ordinary request now and then tells the host the server is still in use.
    this.aliveT = (this.aliveT ?? 240) - dt;
    if (this.aliveT <= 0) {
      this.aliveT = 240;
      try { globalThis.fetch?.(this.url.replace(/^ws/, 'http').replace(/\/ws$/, '/health'), { cache: 'no-store' }).catch(() => {}); } catch { /* offline */ }
    }
  }

  markLife() { this.lifeDirty = true; }

  /** Hits found while tracing a shot wait until the shot itself has been sent. */
  queueHit(kind, id, zone, dx, dz) {
    this.pendingHits.push({ t: 'hit', k: kind, id, z: zone, dx: q3(dx), dz: q3(dz), de: this.game.deadEye.active ? 1 : 0 });
  }

  shot(x, z, gunKey, ends) {
    this.send({ t: 'shot', x: q2(x), z: q2(z), g: Math.max(0, GUN_CODES.indexOf(gunKey)), e: ends.map(q2) });
    for (const hit of this.pendingHits) this.send(hit);
    this.pendingHits.length = 0;
  }

  act(a, extra = {}) { this.send({ t: 'act', a, ...extra }); }
  chat(text) { this.send({ t: 'chat', text }); }
}

/** A copy of the life without the parts the server keeps itself. */
export function lifeForServer(run) {
  const copy = { ...run, camps: {}, projectiles: [] };
  for (const id of Object.keys(run.camps ?? {})) copy.camps[id] = {};
  delete copy.migrated;
  delete copy.world; // rebuilt from the world seed on the server
  return copy;
}
