// Keeps this browser's world in step with the server. Outlaws become puppets
// that ease toward server positions; props and riders are hit through the
// server; world events (shots, bullets, deaths, broken barrels) are replayed
// here as effects. The life's own quests and items stay in this browser and
// are saved to the server by net.js.
import { ENEMY_STATES, EF } from './protocol.js';
import { angleDelta, showGun } from './character.js';
import { RemotePlayers } from './remote-players.js';
import { buildEncounter, campList, disposeEncounter } from './encounters.js';
import { enemyKilled } from './progress.js';

export class NetWorld {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.remote = new RemotePlayers(game, net);
    this.enemies = new Map();
    this.props = new Map();
    this.clock = 0;
    this.index();
    const on = (type, fn) => net.on(type, fn.bind(this));
    on('s', this.onSnapshot);
    on('ev', (m) => this.events(m.list));
    on('camp', this.onCamp);
    on('hurt', this.onHurt);
    on('hp', (m) => { if (game.player?.alive) game.player.hp = m.hp; });
    on('died', this.onDied);
    on('adj', this.onAdjust);
    on('pos', (m) => game.player?.alive && game.teleportPlayer(m.x, m.z));
    on('toast', (m) => game.ui.toast(m.text, m.s ?? 3));
    on('quest', this.onQuest);
    on('roster', () => { this.remote.sync(net.roster); game.netUI?.renderRoster(); });
    on('pelt', (m) => game.wildlife?.onPelt(m));
  }

  /** Finds every outlaw and prop by id and turns them into server puppets. */
  index() {
    this.enemies.clear();
    this.props.clear();
    for (const encounter of this.game.encounters) {
      for (const e of encounter.enemies) this.puppet(e);
      for (const p of encounter.props) this.prop(p);
    }
  }

  puppet(e) {
    this.enemies.set(e.id, e);
    e.netX = e.x; e.netZ = e.z; e.netYaw = e.yaw;
    e.onHit = (dmg, dx, dz, knock, zone) => {
      this.net.queueHit('e', e.id, zone ?? 'body', dx, dz);
      e.flash = 0.06;
      return { killed: false, crit: false };
    };
  }

  prop(p) {
    this.props.set(p.id, p);
    p.damage = (amount, hx, hy, hz, dx, dz, impulse, source = 'player') => {
      if (source === 'player' && p.alive) { this.net.queueHit('o', p.id, 'body', dx, dz); p.flash = 0.05; }
      return p.def.surface;
    };
  }

  // ---------- per tick ----------

  tick(dt) {
    this.clock += dt;
    const k = Math.min(1, dt * 12);
    for (const e of this.enemies.values()) {
      e.px = e.x; e.pz = e.z; e.prevYaw = e.yaw;
      if (!e.alive) continue;
      const far = Math.hypot(e.netX - e.x, e.netZ - e.z) > 6;
      e.x = far ? e.netX : e.x + (e.netX - e.x) * k;
      e.z = far ? e.netZ : e.z + (e.netZ - e.z) * k;
      e.yaw += angleDelta(e.yaw, e.netYaw) * k;
      e.body?.setNextKinematicTranslation({ x: e.x, y: e.bodyY, z: e.z });
      if ((e.state === 'aim' || e.state === 'burst') && !this.game.frontier.inside) e.updateAimLine();
      else e.hideAimLine();
    }
    this.remote.tick(dt, this.clock);
  }

  render(alpha, dt) { this.remote.render(alpha, dt); }

  // ---------- messages ----------

  onSnapshot(m) {
    const g = this.game;
    if (g.player?.alive && Number.isFinite(m.hp)) g.player.hp = m.hp;
    if (Number.isFinite(m.time)) g.worldClock = m.time;
    this.remote.apply(m.p, this.clock);
    this.remote.horses(m.hz ?? []);
    for (const row of m.e) {
      const [id, x, z, yaw, state, aim, aimYaw, flags, speed, hp] = row;
      const e = this.enemies.get(id);
      if (!e || !e.alive) continue;
      e.netX = x; e.netZ = z; e.netYaw = yaw;
      e.state = ENEMY_STATES[state] ?? 'idle';
      e.aimT = aim * e.def.aim; e.aimYaw = aimYaw;
      e.knows = !!(flags & EF.KNOWS);
      e.moveSpeed = speed;
      if (Number.isFinite(hp)) e.hp = hp * e.maxHp;
      if (flags & EF.ENRAGED && !e.enraged) e.enrage();
      const surrendered = !!(flags & EF.SURRENDERED);
      if (surrendered && !e.surrendered) {
        showGun(e.model, null);
        if (Math.hypot(e.x - g.player.x, e.z - g.player.z) < 30) g.ui.toast(`${e.encounter.targetName ?? 'The outlaw'} gives up.`, 3);
      }
      e.surrendered = surrendered;
      e.captive = !!(flags & EF.CAPTIVE);
    }
    for (const [id, x, y, z, qx, qy, qz, qw] of m.o ?? []) {
      const p = this.props.get(id);
      if (!p?.alive || !p.body) continue;
      p.body.setTranslation({ x, y, z }, true);
      p.body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
    }
    g.wildlife?.apply(m.w, m.c);
    this.events(m.ev ?? []);
  }

  events(list) {
    const g = this.game;
    for (const ev of list) {
      switch (ev[0]) {
        case 'muz': g.fx.muzzle(ev[1], ev[2], ev[3], ev[4], ev[5], !!ev[6]); break;
        case 'imp': g.fx.impact(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], ev[7], ev[8]); break;
        case 'snd': g.audio.at(ev[1], ev[2], ev[3], { vol: ev[4], pitch: ev[5], delay: ev[6] }); break;
        case 'proj': g.projectiles.spawn(ev[1], ev[2], ev[3], ev[4], ev[5], 0, ev[6]); break;
        case 'pbreak': { const p = this.props.get(ev[1]); if (p?.alive) p.break(ev[2], ev[3]); break; }
        case 'ekill': this.onKill(ev); break;
        case 'ps': this.remote.shot(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
        case 'pdie': this.remote.die(ev[1], ev[2], ev[3]); break;
        default:
      }
    }
  }

  onKill([, id, dx, dz, force, killer, cleared, credit]) {
    const g = this.game, e = this.enemies.get(id);
    if (!e || !e.alive) return;
    e.die(dx, dz, force);
    const me = this.net.id;
    if (cleared && g.run.camps[e.encounter.id]) g.run.camps[e.encounter.id].serverCleared = true;
    if (killer === me) g.onEnemyKilled(e, false);
    else if (credit.includes(me)) { enemyKilled(g, e); g.save(); }
  }

  onCamp(m) {
    const g = this.game, list = campList(g.run.world), index = list.findIndex((c) => c.id === m.id);
    if (index < 0) return;
    const at = g.encounters.findIndex((c) => c.id === m.id);
    if (at >= 0) disposeEncounter(g, g.encounters[at]);
    g.run.camps[m.id] = m.state;
    const fresh = buildEncounter(g, list[index], index, false);
    if (at >= 0) fresh.decor = g.encounters[at].decor;
    if (at >= 0) g.encounters[at] = fresh; else g.encounters.push(fresh);
    g.props = g.encounters.flatMap((c) => c.props);
    g.enemies = g.encounters.flatMap((c) => c.enemies);
    for (const e of fresh.enemies) this.puppet(e);
    for (const p of fresh.props) this.prop(p);
    g.navDirty = true;
  }

  onHurt(m) {
    const p = this.game.player;
    if (p?.alive) p.netHurt(m.a, m.dx, m.dz, m.hp, m.by);
  }

  onDied(m) {
    const p = this.game.player;
    this.game.killedBy = m.by;
    if (p?.alive) { p.hp = 0; p.die(m.dx, m.dz); }
  }

  onAdjust(m) {
    const g = this.game;
    g.run.bounty = Math.max(0, g.run.bounty + m.money);
    g.ui.questNote(`${m.reason}: ${m.money > 0 ? '+' : '−'}$${Math.abs(m.money)}`);
    g.audio.play('coin', { bus: 'ui', vol: 0.6 });
  }

  onQuest(m) {
    const g = this.game, event = m.event;
    g.questEvent(event);
    if (event.type === 'delivered') {
      const e = this.enemies.get(event.targetId);
      if (e?.alive) {
        e.alive = false; e.jailed = true;
        if (e.body) { g.physics.removeBody(e.body); e.body = null; }
        e.model.root.visible = false;
        e.hideAimLine();
      }
    }
  }

  dispose() { this.remote.dispose(); }
}
