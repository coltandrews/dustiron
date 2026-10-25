// Dust & Iron game server: serves the game files, accepts riders over a
// WebSocket at /ws, runs the shared world at 60 Hz and saves it to disk.
//
//   node server/index.js            (PORT=8080, DATA_DIR=./data)
//
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPhysics } from '../src/physics.js';
import { MAX_MESSAGE, SNAPSHOT_HZ } from '../src/protocol.js';
import { acceptUpgrade } from './ws.js';
import { Store } from './store.js';
import { Hub } from './hub.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? join(root, 'data');
const built = existsSync(join(root, 'dist', 'index.html'));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/** Maps a URL path to a file the server is allowed to send, or null. */
function fileFor(urlPath) {
  let path;
  try { path = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (path === '/' || path === '') path = '/index.html';
  const base = built ? join(root, 'dist') : root;
  const file = normalize(join(base, path));
  if (!file.startsWith(base + sep)) return null;
  if (!built) {
    const rel = file.slice(root.length + 1);
    if (!(rel === 'index.html' || rel === 'favicon.svg' || rel.startsWith(`src${sep}`))) return null;
  }
  try { return statSync(file).isFile() ? file : null; } catch { return null; }
}

export async function startServer({ port = PORT, dataDir = DATA_DIR, quiet = false } = {}) {
  await initPhysics();
  const store = new Store(dataDir);
  const hub = new Hub(store);
  const log = (...args) => { if (!quiet) console.log(...args); };

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, players: hub.playerCount }));
      return;
    }
    const file = req.method === 'GET' || req.method === 'HEAD' ? fileFor(req.url ?? '/') : null;
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) { socket.destroy(); return; }
    const conn = acceptUpgrade(req, socket, head, { maxMessage: MAX_MESSAGE });
    if (conn) hub.connect(conn);
  });

  // Fixed 60 Hz world; snapshots at 15 Hz; the world file is saved every 10 seconds.
  const step = 1 / 60;
  let last = performance.now(), acc = 0, snapAcc = 0, saveAcc = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    let dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (hub.playerCount === 0) { saveAcc += dt; if (saveAcc > 10) { saveAcc = 0; hub.persist(); } return; }
    acc += dt;
    let n = 0;
    while (acc >= step && n < 8) { hub.tick(step); acc -= step; n++; }
    if (n === 8) acc = 0;
    snapAcc += dt;
    if (snapAcc >= 1 / SNAPSHOT_HZ) { snapAcc = 0; hub.snapshot(); }
    saveAcc += dt;
    if (saveAcc > 10) { saveAcc = 0; hub.persist(); }
  }, 1000 / 60);

  await new Promise((done) => server.listen(port, done));
  const address = server.address();
  log(`Dust & Iron server on port ${address.port} · world ${store.worldSeed} · data ${dataDir}${built ? ' · serving dist/' : ''}`);

  const stop = async () => {
    clearInterval(loop);
    hub.persist();
    for (const session of hub.sessions.values()) session.conn.close(1001, 'Server stopping');
    await new Promise((done) => server.close(done));
  };
  return { server, hub, store, port: address.port, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer();
  const shutdown = async (signal) => {
    console.log(`${signal}: saving the world`);
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
