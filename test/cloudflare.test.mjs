import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index.js';

register('./support/cf-hooks.mjs', import.meta.url);
const { GameServer, default: worker } = await import('../cloudflare/worker.js');

/** Durable Object storage as a Map with the calls the Worker uses. */
function storage() {
  const map = new Map();
  const api = {
    async get(key) { return Array.isArray(key) ? new Map(key.filter((k) => map.has(k)).map((k) => [k, map.get(k)])) : map.get(key); },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async transaction(fn) { await fn(api); },
  };
  return { map, api };
}

test('the Cloudflare worker starts one game server, proxies to it and keeps the world in its storage', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dustiron-cf-'));
  const { map, api } = storage();
  let running = null, starts = 0, objectRef = null;
  const container = {
    running: false,
    start({ env }) {
      starts++;
      container.running = true;
      // The real container runs this same server with these variables.
      startServer({ port: 0, dataDir: dir, quiet: true, remote: { url: env.WORLD_URL.replace('https://game.test', 'http://worker.test'), key: env.WORLD_KEY } })
        .then((r) => { running = r; });
    },
    monitor: () => new Promise(() => {}),
    async setInactivityTimeout() {},
    getTcpPort: () => ({
      async fetch(input, init) {
        if (!running) throw new Error('not listening yet');
        const req = new Request(input, init), url = new URL(req.url);
        return fetch(`http://127.0.0.1:${running.port}${url.pathname}${url.search}`, { method: req.method, headers: req.headers });
      },
    }),
  };
  const object = new GameServer({ container, storage: api }, {});
  objectRef = object;
  const env = { GAME_SERVER: { idFromName: (n) => n, get: () => objectRef }, ASSETS: { fetch: async () => new Response('page') } };
  // The container saves through the public Worker URL; route those calls back to the object.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('http://worker.test/__world')) return worker.fetch(new Request(url.replace('http://worker.test', 'https://game.test'), init), env);
    return realFetch(input, init);
  };
  t.after(async () => { globalThis.fetch = realFetch; await running?.stop(); rmSync(dir, { recursive: true, force: true }); });

  assert.equal(await (await worker.fetch(new Request('https://game.test/'), env)).text(), 'page', 'pages come from static assets');
  const health = await worker.fetch(new Request('https://game.test/health'), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  assert.equal(starts, 1);
  await worker.fetch(new Request('https://game.test/health'), env);
  assert.equal(starts, 1, 'one server for everyone');

  const denied = await worker.fetch(new Request('https://game.test/__world'), env);
  assert.equal(denied.status, 403, 'the world store needs the key');
  running.hub.store.touch();
  running.hub.store.save();
  await running.store.flush();
  assert.ok(map.get('world:count') >= 1, 'the world is saved in Durable Object storage');
  const key = map.get('worldKey');
  const back = await worker.fetch(new Request('https://game.test/__world', { headers: { 'x-world-key': key } }), env);
  assert.equal((await back.json()).worldSeed, running.store.worldSeed);
  // Large worlds are split across several storage values and come back whole.
  const big = JSON.stringify({ pad: 'x'.repeat(1_200_000) });
  const put = await worker.fetch(new Request('https://game.test/__world', { method: 'PUT', body: big, headers: { 'x-world-key': key } }), env);
  assert.equal(put.status, 204);
  assert.equal(map.get('world:count'), 3);
  const whole = await worker.fetch(new Request('https://game.test/__world', { headers: { 'x-world-key': key } }), env);
  assert.equal(await whole.text(), big);
});
