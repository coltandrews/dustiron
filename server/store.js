// The persistent world: the world seed, every account and its current life,
// and the world clock. Saved either to one JSON file (tmp file, then rename,
// so a crash never leaves half a file) or, on Cloudflare, sent to a small
// storage endpoint because the container's own disk is wiped when it sleeps.
// Lives are saved without their world data, which is rebuilt from the seed.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { makeWorld } from '../src/life.js';

const worlds = new Map();
const worldFor = (seed) => { if (!worlds.has(seed)) worlds.set(seed, makeWorld(seed)); return worlds.get(seed); };
const withoutWorld = (key, value) => (key === 'world' ? undefined : value);

export const STORE_VERSION = 1;

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const newToken = () => randomBytes(24).toString('hex');
export const newId = () => randomBytes(6).toString('hex');

export class Store {
  /**
   * @param {string} dir folder for world.json (local mode)
   * @param {{url:string, key:string}|null} remote storage endpoint (Cloudflare mode); load with Store.open()
   */
  constructor(dir, remote = null, preloaded = undefined) {
    this.dir = dir;
    this.remote = remote;
    this.file = join(dir, 'world.json');
    this.dirty = false;
    this.saving = null;
    this.again = false;
    if (!remote) mkdirSync(dir, { recursive: true });
    this.data = this.accept(remote ? preloaded : this.read());
  }

  /** Opens a store, fetching the saved world first when it lives remotely. */
  static async open(dir, remote = null) {
    if (!remote) return new Store(dir);
    let saved = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(remote.url, { headers: { 'x-world-key': remote.key } });
        if (res.status === 404) break;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        saved = await res.json();
        break;
      } catch (error) {
        // Never start a fresh world just because storage was briefly unreachable.
        if (attempt === 4) throw new Error(`Could not load the saved world: ${error.message}`);
        await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
      }
    }
    return new Store(dir, remote, saved);
  }

  read() {
    if (!existsSync(this.file)) return null;
    try { return JSON.parse(readFileSync(this.file, 'utf8')); } catch (error) {
      console.warn('world.json could not be read; keeping a copy and starting a new world', error.message);
      try { renameSync(this.file, `${this.file}.${Date.now()}.bak`); } catch { /* nothing to keep */ }
      return null;
    }
  }

  accept(saved) {
    if (saved) {
      if (saved.version === STORE_VERSION && Number.isInteger(saved.worldSeed)) {
        saved.accounts ??= {};
        saved.camps ??= {};
        saved.time ??= 0;
        for (const account of Object.values(saved.accounts)) {
          if (account.life && !account.life.world) account.life.world = worldFor(account.life.worldSeed ?? account.life.seed);
        }
        return saved;
      }
      // Remote saves are never replaced blindly; a person should look first.
      if (this.remote) throw new Error('The saved world has an unknown format');
      console.warn('world.json has an unknown format; keeping a copy and starting a new world');
      renameSync(this.file, `${this.file}.${Date.now()}.bak`);
    }
    this.dirty = true;
    return { version: STORE_VERSION, worldSeed: randomBytes(4).readUInt32BE(0), createdAt: Date.now(), time: 0, accounts: {}, camps: {} };
  }

  get worldSeed() { return this.data.worldSeed; }

  account(id) { return this.data.accounts[id] ?? null; }

  /** Finds the account for a login token, comparing hashes in constant time. */
  accountByToken(token) {
    if (typeof token !== 'string' || token.length !== 48) return null;
    const wanted = Buffer.from(hashToken(token), 'hex');
    for (const account of Object.values(this.data.accounts)) {
      const have = Buffer.from(account.tokenHash, 'hex');
      if (have.length === wanted.length && timingSafeEqual(have, wanted)) return account;
    }
    return null;
  }

  nameTaken(name, exceptId = null) {
    const wanted = name.toLowerCase();
    return Object.values(this.data.accounts).some((a) => a.id !== exceptId && a.name.toLowerCase() === wanted);
  }

  createAccount(name) {
    const token = newToken();
    const account = { id: newId(), name, tokenHash: hashToken(token), createdAt: Date.now(), lifeNo: 0, deaths: 0, life: null, best: null };
    this.data.accounts[account.id] = account;
    this.dirty = true;
    return { account, token };
  }

  touch() { this.dirty = true; }

  save(force = false) {
    if (!this.dirty && !force) return false;
    const text = JSON.stringify(this.data, withoutWorld);
    this.dirty = false;
    if (this.remote) { this.push(text); return true; }
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, this.file);
    return true;
  }

  /** Sends one save at a time; a save asked for meanwhile goes right after with the newest data. */
  push(text) {
    if (this.saving) { this.again = true; return; }
    this.saving = (async () => {
      try {
        const res = await fetch(this.remote.url, { method: 'PUT', headers: { 'x-world-key': this.remote.key, 'content-type': 'application/json' }, body: text });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (error) {
        console.warn('Saving the world failed; will retry', error.message);
        this.dirty = true;
      } finally {
        this.saving = null;
        if (this.again) { this.again = false; this.save(true); }
      }
    })();
  }

  /** Waits until every save sent so far has landed. */
  async flush() {
    while (this.saving) await this.saving;
  }
}
