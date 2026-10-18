// A 0.5 m navigation grid with A* and path smoothing. Static walls are baked
// once per camp; movable props are re-stamped whenever something breaks or moves.

const SQRT2 = Math.SQRT2;

export class NavGrid {
  constructor(half = 22, cell = 0.5, inflate = 0.45) {
    this.half = half;
    this.cell = cell;
    this.inflate = inflate;
    this.n = Math.round((half * 2) / cell);
    const size = this.n * this.n;
    this.staticBlocked = new Uint8Array(size);
    this.blocked = new Uint8Array(size);
    this.g = new Float32Array(size);
    this.f = new Float32Array(size);
    this.parent = new Int32Array(size);
    this.state = new Uint8Array(size); // 0 new, 1 open, 2 closed
    this.heap = [];
  }

  toCell(v) { return Math.floor((v + this.half) / this.cell); }
  center(c) { return -this.half + (c + 0.5) * this.cell; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.n && cz < this.n; }

  isFree(x, z) {
    const cx = this.toCell(x), cz = this.toCell(z);
    return this.inside(cx, cz) && !this.blocked[cz * this.n + cx];
  }

  stamp(arr, fp, inflate = this.inflate) {
    const reach = fp.r !== undefined ? fp.r + inflate : Math.hypot(fp.hx, fp.hz) + inflate;
    const x0 = Math.max(0, this.toCell(fp.x - reach)), x1 = Math.min(this.n - 1, this.toCell(fp.x + reach));
    const z0 = Math.max(0, this.toCell(fp.z - reach)), z1 = Math.min(this.n - 1, this.toCell(fp.z + reach));
    const c = fp.ry !== undefined ? Math.cos(fp.ry) : 1, s = fp.ry !== undefined ? Math.sin(fp.ry) : 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = this.center(cx) - fp.x, dz = this.center(cz) - fp.z;
        let hit;
        if (fp.r !== undefined) hit = dx * dx + dz * dz <= (fp.r + inflate) ** 2;
        else {
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          hit = Math.abs(lx) <= fp.hx + inflate && Math.abs(lz) <= fp.hz + inflate;
        }
        if (hit) arr[cz * this.n + cx] = 1;
      }
    }
  }

  setStatic(footprints) {
    this.staticBlocked.fill(0);
    // The outer ring of cells is a wall.
    const n = this.n;
    for (let i = 0; i < n; i++) {
      this.staticBlocked[i] = this.staticBlocked[(n - 1) * n + i] = 1;
      this.staticBlocked[i * n] = this.staticBlocked[i * n + n - 1] = 1;
    }
    for (const fp of footprints) this.stamp(this.staticBlocked, fp);
  }

  rebuild(dynamicFootprints) {
    this.blocked.set(this.staticBlocked);
    for (const fp of dynamicFootprints) this.stamp(this.blocked, fp);
  }

  nearestFree(cx, cz, maxR = 8) {
    const n = this.n;
    if (this.inside(cx, cz) && !this.blocked[cz * n + cx]) return cz * n + cx;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const x = cx + dx, z = cz + dz;
          if (this.inside(x, z) && !this.blocked[z * n + x]) return z * n + x;
        }
      }
    }
    return -1;
  }

  /** True if a straight walk between two points crosses no blocked cell. */
  lineFree(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  push(i) {
    const h = this.heap, f = this.f;
    h.push(i);
    let k = h.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[h[p]] <= f[h[k]]) break;
      [h[p], h[k]] = [h[k], h[p]];
      k = p;
    }
  }

  pop() {
    const h = this.heap, f = this.f;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < h.length && f[h[l]] < f[h[m]]) m = l;
        if (r < h.length && f[h[r]] < f[h[m]]) m = r;
        if (m === k) break;
        [h[m], h[k]] = [h[k], h[m]];
        k = m;
      }
    }
    return top;
  }

  /** @returns {{x:number,z:number}[] | null} waypoints after the start */
  findPath(sx, sz, tx, tz, maxIter = 5000) {
    const n = this.n;
    const start = this.nearestFree(this.toCell(sx), this.toCell(sz), 4);
    const goal = this.nearestFree(this.toCell(tx), this.toCell(tz), 8);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: tx, z: tz }];
    const gx = goal % n, gz = (goal / n) | 0;
    const H = (i) => { const dx = Math.abs((i % n) - gx), dz = Math.abs(((i / n) | 0) - gz); return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)); };

    this.state.fill(0);
    this.heap.length = 0;
    this.g[start] = 0;
    this.f[start] = H(start);
    this.parent[start] = -1;
    this.state[start] = 1;
    this.push(start);
    let found = false, iter = 0;
    while (this.heap.length && iter++ < maxIter) {
      const cur = this.pop();
      if (this.state[cur] === 2) continue;
      if (cur === goal) { found = true; break; }
      this.state[cur] = 2;
      const cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx, z = cz + dz;
          if (!this.inside(x, z)) continue;
          const ni = z * n + x;
          if (this.blocked[ni] || this.state[ni] === 2) continue;
          if (dx && dz && (this.blocked[cz * n + x] || this.blocked[z * n + cx])) continue; // no corner cutting
          const g = this.g[cur] + (dx && dz ? SQRT2 : 1);
          if (this.state[ni] === 1 && g >= this.g[ni]) continue;
          this.g[ni] = g;
          this.f[ni] = g + H(ni);
          this.parent[ni] = cur;
          this.state[ni] = 1;
          this.push(ni);
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let i = goal; i !== -1; i = this.parent[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => ({ x: this.center(i % n), z: this.center((i / n) | 0) }));
    pts[pts.length - 1] = this.isFree(tx, tz) ? { x: tx, z: tz } : pts[pts.length - 1];

    // String-pull: keep only waypoints needed to stay on free cells.
    const out = [];
    let from = { x: sx, z: sz };
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineFree(from.x, from.z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      from = pts[j];
      i = j + 1;
    }
    return out;
  }
}
