// Cloudflare front door for Dust & Iron. Static game files are served from
// Workers assets (instant, and they never wake the game server). /ws and
// /health go to one Durable Object, which runs the game server container and
// passes requests to it. The same Durable Object keeps the saved world in its
// own storage, because the container's disk is wiped whenever it sleeps.
//
// Everyone joins the same world: there is exactly one GameServer, named "world".
import { DurableObject } from 'cloudflare:workers';

const PORT = 8080;
/** The container shuts itself down after this long with nobody online. */
const IDLE_MINUTES = 15;
/** A safety net in case the server process hangs: stop after this long without requests. */
const HOST_IDLE_MS = 60 * 60 * 1000;
/** Storage values are capped at about 2 MB, so the world is saved in pieces. */
const CHUNK = 500_000;

export class GameServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.booting = null;
    this.ready = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__world') return this.world(request);
    try {
      await this.boot(url.origin);
    } catch (error) {
      return new Response(`The game server could not start: ${error.message}`, { status: 503 });
    }
    const target = new Request(`http://container${url.pathname}${url.search}`, request);
    return this.ctx.container.getTcpPort(PORT).fetch(target);
  }

  /** Starts the container if it is not running, then waits until it answers /health. */
  async boot(origin) {
    if (this.ready && this.ctx.container.running) return;
    this.booting ??= this.start(origin).finally(() => { this.booting = null; });
    await this.booting;
  }

  async start(origin) {
    const container = this.ctx.container;
    if (!container.running) {
      this.ready = false;
      container.start({
        enableInternet: true,
        env: { PORT: String(PORT), WORLD_URL: `${origin}/__world`, WORLD_KEY: await this.key(), IDLE_EXIT_MINUTES: String(IDLE_MINUTES) },
      });
      // When the server exits (idle, or a crash) the next visitor starts a fresh one.
      container.monitor().catch((error) => console.error('Game server stopped', error)).finally(() => { this.ready = false; });
      await container.setInactivityTimeout(HOST_IDLE_MS);
    }
    const port = container.getTcpPort(PORT);
    let last = null;
    for (let i = 0; i < 150; i++) {
      try {
        const res = await port.fetch('http://container/health');
        if (res.ok) { this.ready = true; return; }
        last = new Error(`health ${res.status}`);
      } catch (error) { last = error; }
      await new Promise((done) => setTimeout(done, 200));
    }
    throw new Error(`no answer from the server (${last?.message ?? 'unknown'})`);
  }

  /** A random key, made once, that only this object and its container know. */
  async key() {
    let key = await this.ctx.storage.get('worldKey');
    if (!key) {
      key = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
      await this.ctx.storage.put('worldKey', key);
    }
    return key;
  }

  /** The saved world: GET returns it (404 before the first save), PUT replaces it. */
  async world(request) {
    const key = await this.ctx.storage.get('worldKey');
    if (!key || request.headers.get('x-world-key') !== key) return new Response('Forbidden', { status: 403 });
    const storage = this.ctx.storage;
    if (request.method === 'GET') {
      const count = await storage.get('world:count');
      if (!count) return new Response('No world yet', { status: 404 });
      const parts = await storage.get(Array.from({ length: count }, (_, i) => `world:${i}`));
      let text = '';
      for (let i = 0; i < count; i++) text += parts.get(`world:${i}`) ?? '';
      return new Response(text, { headers: { 'content-type': 'application/json' } });
    }
    if (request.method === 'PUT') {
      const text = await request.text();
      try { JSON.parse(text); } catch { return new Response('Not JSON', { status: 400 }); }
      const old = (await storage.get('world:count')) ?? 0, count = Math.max(1, Math.ceil(text.length / CHUNK));
      const entries = { 'world:count': count, 'world:savedAt': Date.now() };
      for (let i = 0; i < count; i++) entries[`world:${i}`] = text.slice(i * CHUNK, (i + 1) * CHUNK);
      await storage.transaction(async (txn) => {
        for (const [k, v] of Object.entries(entries)) await txn.put(k, v);
        for (let i = count; i < old; i++) await txn.delete(`world:${i}`);
      });
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/ws' || pathname === '/health' || pathname === '/__world') {
      return env.GAME_SERVER.get(env.GAME_SERVER.idFromName('world')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
