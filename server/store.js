// The persistent world on disk: one JSON file with the world seed, every
// account and its current life, and camp respawn state. Writes go to a
// temporary file first and are then renamed, so a crash never leaves half a file.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const STORE_VERSION = 1;

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const newToken = () => randomBytes(24).toString('hex');
export const newId = () => randomBytes(6).toString('hex');

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, 'world.json');
    this.dirty = false;
    mkdirSync(dir, { recursive: true });
    this.data = this.load();
  }

  load() {
    if (existsSync(this.file)) {
      try {
        const data = JSON.parse(readFileSync(this.file, 'utf8'));
        if (data && data.version === STORE_VERSION && Number.isInteger(data.worldSeed)) {
          data.accounts ??= {};
          data.camps ??= {};
          data.time ??= 0;
          return data;
        }
        console.warn('world.json has an unknown format; keeping a copy and starting a new world');
        renameSync(this.file, `${this.file}.${Date.now()}.bak`);
      } catch (error) {
        console.warn('world.json could not be read; keeping a copy and starting a new world', error.message);
        try { renameSync(this.file, `${this.file}.${Date.now()}.bak`); } catch { /* nothing to keep */ }
      }
    }
    const data = { version: STORE_VERSION, worldSeed: randomBytes(4).readUInt32BE(0), createdAt: Date.now(), time: 0, accounts: {}, camps: {} };
    this.dirty = true;
    return data;
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
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
    this.dirty = false;
    return true;
  }
}
