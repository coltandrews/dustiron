import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { startServer } from '../server/index.js';
import { PROTOCOL_VERSION, GUN_CODES, ROOMS } from '../src/protocol.js';
import { WEAPONS } from '../src/weapons.js';

/** A tiny test rider: collects messages and waits for one that matches. */
function rider(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [], waiters = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    inbox.push(msg);
    for (const w of [...waiters]) if (w.match(msg)) { waiters.splice(waiters.indexOf(w), 1); w.done(msg); }
  };
  const opened = new Promise((done, fail) => { ws.onopen = done; ws.onerror = fail; });
  return {
    ws, inbox,
    async send(msg) { await opened; ws.send(JSON.stringify(msg)); },
    wait(match, ms = 3000) {
      const found = inbox.find(match);
      if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
      return new Promise((done, fail) => {
        const w = { match, done: (m) => { clearTimeout(timer); inbox.splice(inbox.indexOf(m), 1); done(m); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); fail(new Error('timed out waiting')); }, ms);
        waiters.push(w);
      });
    },
    close() { ws.close(); },
  };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function withServer(t) {
  const dir = mkdtempSync(pathJoin(tmpdir(), 'dustiron-'));
  const running = await startServer({ port: 0, dataDir: dir, quiet: true });
  t.after(async () => { await running.stop(); rmSync(dir, { recursive: true, force: true }); });
  return { ...running, dir };
}

async function enter(port, name, token) {
  const r = rider(port);
  await r.send({ t: 'hello', v: PROTOCOL_VERSION, name, token });
  const welcome = await r.wait((m) => m.t === 'welcome' || m.t === 'err');
  return { r, welcome };
}

test('riders join one shared world, see each other and chat', async (t) => {
  const { port } = await withServer(t);
  const { r: a, welcome: wa } = await enter(port, 'Ada');
  assert.equal(wa.t, 'welcome');
  assert.equal(wa.life.worldSeed, wa.worldSeed);
  assert.equal(wa.life.bounty, 15);
  assert.equal(typeof wa.token, 'string');
  const { r: b, welcome: wb } = await enter(port, 'Bo');
  assert.equal(wb.worldSeed, wa.worldSeed, 'one world for everyone');
  assert.notEqual(wb.life.seed, wa.life.seed, 'each rider has their own life');
  await a.send({ t: 'st', x: 2, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: 0 });
  await b.send({ t: 'st', x: 3, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: 0 });
  const snap = await a.wait((m) => m.t === 's' && m.p.some((row) => row[0] === wb.id && row[1] === 3));
  const row = snap.p.find((r) => r[0] === wb.id);
  assert.equal(row[2], 12);
  await a.send({ t: 'chat', text: 'Howdy' });
  const line = await b.wait((m) => m.t === 'chat' && m.from === wa.id);
  assert.equal(line.text, 'Howdy');
  assert.equal(line.name, 'Ada');
  const taken = await enter(port, 'ada');
  assert.equal(taken.welcome.t, 'err', 'names are unique');
  a.close(); b.close();
});

test('a returning rider keeps their life by token; moves that are too fast are refused', async (t) => {
  const { port, hub } = await withServer(t);
  const { r, welcome } = await enter(port, 'Cal');
  await r.send({ t: 'st', x: 3, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: 0 });
  await sleep(80);
  await r.send({ t: 'st', x: 150, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: 0 });
  const back = await r.wait((m) => m.t === 'pos');
  assert.equal(back.x, 3);
  const life = structuredClone(welcome.life);
  life.bounty += 5000;
  await r.send({ t: 'life', life, ack: 0 });
  const reset = await r.wait((m) => m.t === 'life');
  assert.equal(reset.why, 'money');
  const honest = structuredClone(welcome.life);
  honest.bounty = 10; honest.items.coffee = 1;
  await r.send({ t: 'life', life: honest, ack: 0 });
  await sleep(80);
  assert.equal(hub.sessions.get(welcome.id).account.life.items.coffee, 1);
  r.close();
  await sleep(80);
  const again = await enter(port, null, welcome.token);
  assert.equal(again.welcome.id, welcome.id);
  assert.equal(again.welcome.name, 'Cal');
  assert.equal(again.welcome.life.seed, welcome.life.seed);
  assert.equal(again.welcome.life.bounty, 10);
  again.r.close();
});

test('towns are safe from other riders unless both accept a duel', async (t) => {
  const { port, hub } = await withServer(t);
  const { r: a, welcome: wa } = await enter(port, 'Amos');
  const { r: b, welcome: wb } = await enter(port, 'Bea');
  const g = GUN_CODES.indexOf('revolver');
  const stand = (r, x) => r.send({ t: 'st', x, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g, r: 0 });
  await stand(a, 0); await stand(b, 4);
  await sleep(60);
  const shoot = async () => {
    await a.send({ t: 'shot', x: 0, z: 12, g, e: [4, 12] });
    await a.send({ t: 'hit', k: 'p', id: wb.id, z: 'body', dx: 1, dz: 0 });
    await sleep(80);
  };
  await shoot();
  assert.equal(hub.sessions.get(wb.id).state.hp, 100, 'town shots do nothing');
  await a.send({ t: 'act', a: 'duel', to: wb.id, mode: 'blood', wager: 5 });
  const ask = await b.wait((m) => m.t === 'duelAsk');
  assert.equal(ask.from, wa.id);
  await b.send({ t: 'act', a: 'duelAnswer', from: wa.id, yes: true });
  await a.wait((m) => m.t === 'duel' && m.phase === 'start');
  await a.wait((m) => m.t === 'adj' && m.money === -5);
  await a.wait((m) => m.t === 'duel' && m.phase === 'draw', 5000);
  for (let i = 0; i < 3; i++) { await shoot(); await sleep(WEAPONS.revolver.interval * 1000); }
  const end = await b.wait((m) => m.t === 'duel' && m.phase === 'end');
  assert.equal(end.winner, wa.id);
  assert.ok(hub.sessions.get(wb.id).state.hp >= 1, 'first blood never kills');
  assert.equal(hub.sessions.get(wb.id).state.alive, true);
  const prize = await a.wait((m) => m.t === 'adj' && m.money === 10);
  assert.equal(prize.reason, 'Duel winnings');
  assert.equal(hub.sessions.get(wa.id).account.life.bounty, 20);
  a.close(); b.close();
});

test('outside town a rider can be shot dead, and that life is over for good', async (t) => {
  const { port, hub, store } = await withServer(t);
  const { r: a, welcome: wa } = await enter(port, 'Dee');
  const { r: b, welcome: wb } = await enter(port, 'Eli');
  const g = GUN_CODES.indexOf('revolver');
  // Walk both riders out of town in legal steps.
  for (let x = 0; x <= 60; x += 1) {
    await a.send({ t: 'st', x, z: 12, yaw: 0, vx: 0, vz: 0, sp: 5, f: 0, g, r: 0 });
    await b.send({ t: 'st', x: x + 3, z: 12, yaw: 0, vx: 0, vz: 0, sp: 5, f: 0, g, r: 0 });
    await sleep(55);
  }
  for (let i = 0; i < 6 && hub.sessions.get(wb.id).state.alive; i++) {
    await a.send({ t: 'shot', x: 60, z: 12, g, e: [63, 12] });
    await a.send({ t: 'hit', k: 'p', id: wb.id, z: 'head', dx: 1, dz: 0 });
    await sleep(WEAPONS.revolver.interval * 1000 + 20);
  }
  const died = await b.wait((m) => m.t === 'died');
  assert.equal(died.by, 'Dee');
  assert.equal(store.account(wb.id).life.status, 'dead');
  await b.send({ t: 'act', a: 'newLife' });
  const fresh = await b.wait((m) => m.t === 'life' && m.fresh);
  assert.notEqual(fresh.life.seed, wb.life.seed);
  assert.equal(fresh.life.bounty, 15);
  assert.equal(fresh.life.worldSeed, wb.worldSeed, 'the world itself carries on');
  await hub.persist();
  const disk = JSON.parse(readFileSync(pathJoin(store.dir, 'world.json'), 'utf8'));
  assert.equal(disk.accounts[wb.id].deaths, 1);
  a.close(); b.close();
});

test("the server runs the outlaws: a camp fights back and its dead stay dead", { timeout: 90000 }, async (t) => {
  const { port, hub } = await withServer(t);
  const { r, welcome } = await enter(port, 'Fay');
  const camp = hub.sim.encounters[0];
  const s = hub.sessions.get(welcome.id).state;
  // Put the rider next to the camp directly; travel is tested above.
  Object.assign(s, { x: camp.x, z: camp.z + 6 });
  hub.sim.movePlayer(s);
  hub.sim.noise(s.x, s.z, 30);
  const snap = await r.wait((m) => m.t === 's' && m.e.length > 0, 15000);
  assert.ok(snap.e.length > 0, 'outlaws appear in snapshots near the rider');
  // They shoot; on a slow machine the first bullet can take a while.
  await r.wait((m) => m.t === 's' && m.ev.some((e) => e[0] === 'proj'), 30000);
  const victim = camp.enemies.find((e) => e.alive);
  const g = GUN_CODES.indexOf('revolver');
  let killed = null;
  for (let i = 0; i < 8 && victim.alive; i++) {
    s.hp = 100;
    await r.send({ t: 'shot', x: s.x, z: s.z, g, e: [victim.x, victim.z] });
    const d = Math.hypot(victim.x - s.x, victim.z - s.z) || 1;
    await r.send({ t: 'hit', k: 'e', id: victim.id, z: 'head', dx: (victim.x - s.x) / d, dz: (victim.z - s.z) / d });
    await sleep(WEAPONS.revolver.interval * 1000 + 20);
  }
  killed = await r.wait((m) => m.t === 's' && m.ev.some((e) => e[0] === 'ekill' && e[1] === victim.id));
  const row = killed.ev.find((e) => e[0] === 'ekill');
  assert.equal(row[5], welcome.id, 'the shooter gets the kill');
  assert.ok(row[7].includes(welcome.id));
  assert.equal(hub.sim.campState(camp).enemies.find((e) => e.id === victim.id).alive, false);
  r.close();
});

test('rooms are reported by name and other riders in the same shop are visible', async (t) => {
  const { port } = await withServer(t);
  const { r: a } = await enter(port, 'Gus');
  const { r: b, welcome: wb } = await enter(port, 'Hal');
  const room = ROOMS.indexOf('saloon');
  const { ROOM_X } = await import('../src/interiors.js');
  await a.send({ t: 'st', x: ROOM_X, z: 40, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: room });
  await b.send({ t: 'st', x: ROOM_X + 2, z: 41, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: room });
  const snap = await a.wait((m) => m.t === 's' && m.p.some((row) => row[0] === wb.id));
  assert.equal(snap.p.find((row) => row[0] === wb.id)[7], room);
  a.close(); b.close();
});

test('two riders in town can play poker dice for a stake', async (t) => {
  const { port, hub } = await withServer(t);
  const { r: a, welcome: wa } = await enter(port, 'Ike');
  const { r: b, welcome: wb } = await enter(port, 'Jo');
  await a.send({ t: 'st', x: 0, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: 0 });
  await b.send({ t: 'st', x: 2, z: 12, yaw: 0, vx: 0, vz: 0, sp: 0, f: 0, g: 0, r: 0 });
  await sleep(60);
  await a.send({ t: 'act', a: 'dice', to: wb.id, wager: 10 });
  const ask = await b.wait((m) => m.t === 'diceAsk');
  assert.equal(ask.wager, 10);
  await b.send({ t: 'act', a: 'diceAnswer', from: wa.id, yes: true });
  const game = await a.wait((m) => m.t === 'dice');
  assert.equal(game.rolls[wa.id].length, 5);
  await sleep(60);
  const money = (id) => hub.sessions.get(id).account.life.bounty;
  if (game.winner === wa.id) { assert.equal(money(wa.id), 25); assert.equal(money(wb.id), 5); }
  else if (game.winner === wb.id) { assert.equal(money(wb.id), 25); assert.equal(money(wa.id), 5); }
  else { assert.equal(money(wa.id), 15); assert.equal(money(wb.id), 15); }
  a.close(); b.close();
});

test('animals are shared: one rider shoots a deer and skins it for a pelt', async (t) => {
  const { port, hub } = await withServer(t);
  const { r, welcome } = await enter(port, 'Kit');
  const s = hub.sessions.get(welcome.id).state;
  Object.assign(s, { x: -150, z: -150 });
  hub.sim.movePlayer(s);
  const deer = hub.sim.wildlife.spawn('deer', -146, -150);
  deer.state = 'graze'; deer.stateT = 99; deer.def = { ...deer.def, sense: 0 };
  const snap = await r.wait((m) => m.t === 's' && m.w.some((row) => row[0] === deer.id));
  assert.equal(snap.w.find((row) => row[0] === deer.id)[1], 2, 'kind index for deer');
  const g = GUN_CODES.indexOf('revolver');
  for (let i = 0; i < 6 && deer.alive; i++) {
    await r.send({ t: 'shot', x: s.x, z: s.z, g, e: [deer.x, deer.z] });
    await r.send({ t: 'hit', k: 'a', id: deer.id, z: 'head', dx: 1, dz: 0 });
    await sleep(WEAPONS.revolver.interval * 1000 + 20);
  }
  assert.equal(deer.alive, false);
  const carcass = hub.sim.wildlife.carcasses[0];
  await r.wait((m) => m.t === 's' && m.c.some((row) => row[0] === carcass.id));
  Object.assign(s, { x: carcass.x - 1, z: carcass.z });
  await r.send({ t: 'act', a: 'skin', id: carcass.id });
  const pelt = await r.wait((m) => m.t === 'pelt');
  assert.equal(pelt.pelt, 'deerHide');
  assert.equal(hub.sim.wildlife.carcasses.length, 0, 'a carcass is skinned once');
  r.close();
});

test('on Cloudflare the world is saved to remote storage and survives a restart', async (t) => {
  const { createServer } = await import('node:http');
  let saved = null, puts = 0;
  const storage = createServer((req, res) => {
    if (req.headers['x-world-key'] !== 'secret') { res.writeHead(403); res.end(); return; }
    if (req.method === 'GET') { if (!saved) { res.writeHead(404); res.end(); } else { res.writeHead(200); res.end(saved); } return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { saved = body; puts++; res.writeHead(204); res.end(); });
  });
  await new Promise((done) => storage.listen(0, done));
  t.after(() => storage.close());
  const remote = { url: `http://127.0.0.1:${storage.address().port}/__world`, key: 'secret' };
  const dir = mkdtempSync(pathJoin(tmpdir(), 'dustiron-'));
  const first = await startServer({ port: 0, dataDir: dir, quiet: true, remote });
  const { r, welcome } = await enter(first.port, 'Nell');
  r.close();
  await sleep(100);
  await first.stop();
  assert.ok(puts >= 1, 'the world was sent to storage');
  const disk = JSON.parse(saved);
  assert.equal(disk.accounts[welcome.id].name, 'Nell');
  assert.equal(disk.accounts[welcome.id].life.world, undefined, 'lives are saved without world data');
  const second = await startServer({ port: 0, dataDir: dir, quiet: true, remote });
  t.after(() => second.stop());
  assert.equal(second.store.worldSeed, welcome.worldSeed, 'the same world comes back');
  const again = await enter(second.port, null, welcome.token);
  assert.equal(again.welcome.name, 'Nell');
  assert.equal(again.welcome.life.seed, welcome.life.seed);
  assert.ok(again.welcome.life.world?.camps?.length > 0, 'world data is rebuilt on load');
  again.r.close();
  rmSync(dir, { recursive: true, force: true });
});
